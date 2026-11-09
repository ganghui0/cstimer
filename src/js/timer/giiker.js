execMain(function(timer) {
	var enable = false;
	var enableVRC = false;
	var waitReadyTid = 0;
	var moveReadyTid = 0;
	var insTime = 0;
	var div = $('<div />');
	var totPhases = 1;
	var currentFacelet = mathlib.SOLVED_FACELET;
	var rawMoves = [];

	var giikerVRC = (function() {
		var isReseted = false;
		var curVRCCubie = new mathlib.CubieCube();
		var tmpCubie1 = new mathlib.CubieCube();
		var puzzleObj;
		var curOri = -1;

		// Gyro orientation. Quaternions are [w, x, y, z] in the virtual cube's axes (x: R, y: U, z: F).
		var gyroQuat = null; // the physical cube's orientation, world y axis pointing up
		var gyroRef = null; // rotation from world coordinates to the view
		var oriQuat = [1, 0, 0, 0]; // whole cube rotation applied to the virtual cube by pre-scramble and giiOri

		function qMul(a, b) {
			return [
				a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
				a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
				a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
				a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]
			];
		}

		function qConj(q) {
			return [q[0], -q[1], -q[2], -q[3]];
		}

		function qRot(q, v) {
			return qMul(qMul(q, [0, v[0], v[1], v[2]]), qConj(q)).slice(1);
		}

		function rotQuat(move) { // x, y or z: clockwise quarter turns seen from R, U or F
			var pow = /2/.exec(move) ? 2 : /'/.exec(move) ? 3 : 1;
			var half = -pow * Math.PI / 4;
			var q = [Math.cos(half), 0, 0, 0];
			q['xyz'.indexOf(move[0]) + 1] = Math.sin(half);
			return q;
		}

		// assume the face shown at the front of the virtual cube faces the user,
		// or the one shown at the right when the front face points up or down
		function calcHeading(quat) {
			var inv = qConj(oriQuat);
			var f = qRot(quat, qRot(inv, [0, 0, 1]));
			var r = qRot(quat, qRot(inv, [1, 0, 0]));
			var ang = Math.hypot(f[0], f[2]) >= Math.hypot(r[0], r[2]) ?
				Math.atan2(f[0], f[2]) : Math.atan2(r[0], r[2]) - Math.PI / 2;
			return [Math.cos(ang / 2), 0, -Math.sin(ang / 2), 0];
		}

		// The gyro reports about 20 times a second, so ease the drawn orientation toward the latest
		// report on every animation frame instead of jumping to it.
		var GYRO_EASE_MS = 40;
		var targetQuat = null;
		var shownQuat = null;
		var easeFrame = 0;
		var easeTime = 0;

		function easeGyro(now) {
			easeFrame = 0;
			if (!targetQuat || !shownQuat || !puzzleObj || !enableVRC) {
				return;
			}
			var t = 1 - Math.exp(-Math.max(now - easeTime, 0) / GYRO_EASE_MS);
			easeTime = now;
			var sign = qMul(qConj(shownQuat), targetQuat)[0] < 0 ? -1 : 1;
			var q = [];
			for (var i = 0; i < 4; i++) {
				q[i] = shownQuat[i] * (1 - t) + targetQuat[i] * sign * t;
			}
			var len = Math.hypot(q[0], q[1], q[2], q[3]);
			shownQuat = q.map(function(v) { return v / len; });
			showOrientation();
			if (Math.abs(qMul(qConj(shownQuat), targetQuat)[0]) < 0.9999999) {
				easeFrame = requestAnimationFrame(easeGyro);
			}
		}

		function applyGyro(immediate) {
			if (!puzzleObj || !enableVRC) {
				return;
			}
			// the virtual cube already shows oriQuat, so undo it and turn it to the physical orientation
			targetQuat = gyroQuat && qMul(qMul(gyroRef, gyroQuat), qConj(oriQuat));
			if (immediate || !targetQuat || !shownQuat) {
				shownQuat = targetQuat;
				showOrientation();
			} else if (!easeFrame) {
				easeTime = performance.now();
				easeFrame = requestAnimationFrame(easeGyro);
			}
		}

		function qAngle(a, b) { // degrees between two orientations
			return Math.acos(Math.min(1, Math.abs(qMul(qConj(a), b)[0]))) * 360 / Math.PI;
		}

		// While holding, the view stays in the virtual cube's own orientation, whatever the hands do
		// (settling after the last move, a regrip), until a face is turned or the whole cube is turned
		// quickly. Then it follows the gyro from the last steady orientation, so that a slice move or
		// a cube rotation is shown completely.
		var HOLD_STEP = 6; // at most this many degrees between two reports (about 100 deg/s) is steady
		var HOLD_TURN = 75; // a whole cube rotation turns at least this far from the steady orientation
		var holdBase = null; // the last steady orientation while holding

		// recenter: 0 follows the gyro, 1 turns the view about the vertical axis only (on connect),
		// 2 shows the cube in the virtual cube's own orientation once (on reset), 3 starts holding
		// (after each scramble), 4 keeps holding until a face is turned.
		// Returns how to treat the next report.
		function setGyro(quat, recenter) {
			var last = gyroQuat;
			gyroQuat = quat;
			var jump = false;
			var next = 0;
			if (!quat) {
				gyroRef = null;
				holdBase = null;
				next = recenter;
			} else if (recenter == 2) {
				holdBase = null;
				gyroRef = qMul(oriQuat, qConj(quat));
				jump = true;
			} else if (recenter == 3 || recenter == 4 && !holdBase) {
				holdBase = quat;
				gyroRef = qMul(oriQuat, qConj(quat));
				jump = true;
				next = 4;
			} else if (holdBase) {
				if (qAngle(last, quat) < HOLD_STEP) {
					holdBase = quat;
				}
				if (recenter == 4 && qAngle(holdBase, quat) <= HOLD_TURN) {
					gyroRef = qMul(oriQuat, qConj(quat));
					next = 4;
				} else {
					gyroRef = qMul(oriQuat, qConj(holdBase));
					holdBase = null;
				}
			} else if (recenter || !gyroRef) {
				gyroRef = calcHeading(quat);
				jump = true;
			}
			applyGyro(jump);
			return next;
		}

		function resetVRC(temp, force) {
			if ((isReseted && !force) || !enableVRC) {
				return;
			}
			var options = {
				puzzle: "cube3",
				style: kernel.getProp('giiVRC')
			};
			puzzleFactory.init(options, $.noop, div, function(ret, isInit) {
				puzzleObj = ret;
				if (isInit && !puzzleObj) {
					div.css('height', '');
					div.html('--:--');
				}
				if (!temp || isInit) {
					timer.lcd.fixDisplay(false, true);
					setSize(kernel.getProp('timerSize'));
				}
				curVRCCubie.fromFacelet(mathlib.SOLVED_FACELET);
				if (!puzzleObj) {
					return;
				}
				var preScramble = puzzleObj.parseScramble('U2 U2', true);
				curVRCCubie.ori = 0;
				oriQuat = [1, 0, 0, 0];
				for (var i = 0; i < preScramble.length; i++) {
					var move = puzzleObj.move2str(preScramble[i]);
					curVRCCubie.selfMoveStr(move);
					if (puzzleObj.isRotation(preScramble[i])) {
						oriQuat = qMul(rotQuat(move), oriQuat);
					}
				}
				puzzleObj.applyMoves(preScramble); // process pre scramble (cube orientation)
				loadView();
				var targetOri = kernel.getProp('giiOri');
				targetOri = targetOri == 'auto' ? -1 : ~~targetOri;
				setOri(targetOri);
				applyGyro(true); // the virtual cube was rebuilt without rotation
			});
			isReseted = true;
		}

		// Drag the virtual cube to turn it, double click to undo. Like cube rotations, dragging sideways
		// turns it about the face shown on top (y) and dragging up or down about the face shown at the
		// right (x), without any limit, so a quarter turn always ends with a face exactly on top.
		// The turn is kept in giiCam as "w,x,y,z" and shown on top of the gyro.
		var viewQuat = null;
		var drag = null; // [last x, last y, screen axes, pixels for a half turn]

		function showOrientation() {
			puzzleObj.setOrientation(viewQuat ? qMul(viewQuat, shownQuat || [1, 0, 0, 0]) : shownQuat);
		}

		function loadView() {
			var v = String(kernel.getProp('giiCam', '')).split(',').map(Number);
			var len = Math.hypot(v[0], v[1], v[2], v[3]);
			viewQuat = v.length == 4 && len > 0.5 ? v.map(function(x) { return x / len; }) : null;
		}

		function resetView() {
			kernel.setProp('giiCam', '');
			viewQuat = null;
			puzzleObj && enableVRC && showOrientation();
		}

		// [the axis among axes (but not axes[skip]) closest to dir, pointing along it; its index]
		function closestAxis(axes, dir, skip) {
			var best = -1;
			var bestDot = 0;
			for (var i = 0; i < axes.length; i++) {
				var dot = axes[i][0] * dir[0] + axes[i][1] * dir[1] + axes[i][2] * dir[2];
				if (i != skip && (best == -1 || Math.abs(dot) > Math.abs(bestDot))) {
					best = i;
					bestDot = dot;
				}
			}
			var axis = axes[best];
			return [bestDot < 0 ? [-axis[0], -axis[1], -axis[2]] : axis, best];
		}

		function axisTurn(axis, angle) {
			var s = Math.sin(angle / 2);
			return [Math.cos(angle / 2), axis[0] * s, axis[1] * s, axis[2] * s];
		}

		// right, up and toward the viewer, in the cube's coordinates (x: R, y: U, z: F)
		function screenAxes() {
			var cam = puzzleObj.getCamera();
			var t = cam[0] * Math.PI / 24;
			var p = cam[1] * Math.PI / 24;
			var z = [Math.cos(p) * Math.sin(t), Math.sin(p), Math.cos(p) * Math.cos(t)];
			var len = Math.hypot(z[0], z[2]);
			var x = [z[2] / len, 0, -z[0] / len];
			var y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
			return [x, y, z];
		}

		// The timer text (#lcd) lies over the virtual cube, so catch presses on the page before the
		// timer area handles them, and only take those on the timer area over the cube drawing.
		function onCube(e) {
			if (!enableVRC || !puzzleObj || !puzzleObj.getCamera() || !(div[0].contains(e.target) || $(e.target).closest('#lcd').length)) {
				return false;
			}
			var rect = $(puzzleObj.getCanvas())[0].getBoundingClientRect();
			return e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
		}

		document.addEventListener('mousedown', function(e) {
			if (e.button != 0 || !onCube(e)) {
				return;
			}
			var rect = $(puzzleObj.getCanvas())[0].getBoundingClientRect();
			drag = [e.pageX, e.pageY, screenAxes(), Math.min(rect.width, rect.height)];
			document.body.style.cursor = 'grabbing';
			e.preventDefault();
			e.stopPropagation(); // dragging the cube should not start the timer
		}, true);
		$(document).on('mousemove', function(e) {
			if (!drag || !puzzleObj) {
				return;
			}
			if (!(e.originalEvent.buttons & 1)) { // released outside the window
				$(document).trigger('mouseup');
				return;
			}
			var dx = e.pageX - drag[0];
			var dy = e.pageY - drag[1];
			if (!dx && !dy) {
				return;
			}
			drag[0] = e.pageX;
			drag[1] = e.pageY;
			var q = viewQuat || [1, 0, 0, 0];
			var rate = Math.PI / drag[3]; // dragging across the whole drawing turns half way round
			var shown = qMul(q, shownQuat || [1, 0, 0, 0]);
			var axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(function(v) { return qRot(shown, v); });
			var up = closestAxis(axes, [0, 1, 0], -1);
			var right = closestAxis(axes, drag[2][0], up[1]);
			// the side facing the viewer follows the mouse
			q = qMul(axisTurn(up[0], dx * rate), q);
			q = qMul(axisTurn(right[0], dy * rate), q);
			var len = Math.hypot(q[0], q[1], q[2], q[3]);
			viewQuat = q.map(function(x) { return x / len; });
			showOrientation();
		});
		$(document).on('mouseup', function() {
			if (!drag) {
				return;
			}
			drag = null;
			document.body.style.cursor = '';
			if (viewQuat) {
				kernel.setProp('giiCam', viewQuat.map(function(x) { return x.toFixed(4); }).join(','));
			}
		});
		document.addEventListener('dblclick', function(e) {
			if (onCube(e)) {
				resetView();
				e.stopPropagation();
			}
		}, true);

		function setSize(value) {
			div.css('height', value * $('#logo').width() / 9 + 'px');
			puzzleObj && puzzleObj.resize();
		}

		function setState(state, prevMoves, isFast) {
			if (puzzleObj == undefined || !enableVRC) {
				return;
			}
			tmpCubie1.fromFacelet(state);
			var todoMoves = [];
			var shouldReset = true;
			for (var i = 0; i < prevMoves.length; i++) {
				todoMoves.push(prevMoves[i]);
				tmpCubie1.selfMoveStr(prevMoves[i], true);
				if (tmpCubie1.isEqual(curVRCCubie)) {
					shouldReset = false;
					break;
				}
			}
			if (shouldReset) { //cannot get current state according to prevMoves
				resetVRC(false);
				curVRCCubie.fromFacelet(mathlib.SOLVED_FACELET);
				todoMoves = scramble_333.genFacelet(state);
			} else {
				todoMoves = todoMoves.reverse().join(' ');
			}
			var scramble;
			if (todoMoves.match(/^\s*$/) || !puzzleObj) {
				scramble = [];
			} else {
				scramble = puzzleObj.parseScramble(cubeutil.getConjMoves(todoMoves, true, curVRCCubie.ori));
			}
			if (scramble.length < 5) {
				puzzleObj.addMoves(scramble);
			} else {
				puzzleObj.applyMoves(scramble);
			}
			isReseted = false;
			curVRCCubie.fromFacelet(state);
		}

		function setOri(ori) {
			curOri = ori;
			if (curOri == -1 || curVRCCubie.ori == curOri) {
				return;
			}
			var todoRot = mathlib.CubieCube.rotMulI[curOri][curVRCCubie.ori];
			var todoMoves = mathlib.CubieCube.rot2str[todoRot].split(/\s+/);
			for (var i = 0; i < todoMoves.length; i++) {
				curVRCCubie.selfMoveStr(todoMoves[i]);
				if (todoMoves[i]) {
					oriQuat = qMul(rotQuat(todoMoves[i]), oriQuat);
				}
			}
			puzzleObj.applyMoves(puzzleObj.parseScramble(todoMoves.join(' ')));
			applyGyro(true);
		}

		return {
			resetVRC: resetVRC, //reset to solved
			setState: setState,
			setOri: setOri,
			setSize: setSize,
			setGyro: setGyro,
			resetView: resetView
		}
	})();

	// continuous training: the next case is shown once the cube has been left alone for a moment,
	// so that a turn right after the solve (e.g. a mispredicted AUF) does not lose it
	var nextCasePending = false;

	function scheduleNextCase() {
		clearReadyTid();
		nextCasePending = true;
		waitReadyTid = setTimeout(function() {
			markScrambled($.now());
		}, 500);
	}

	function clearReadyTid() {
		if (waitReadyTid) {
			clearTimeout(waitReadyTid);
			waitReadyTid = 0;
		}
		if (moveReadyTid) {
			clearTimeout(moveReadyTid);
			moveReadyTid = 0;
		}
	}

	function giikerCallback(facelet, prevMoves, lastTs) {
		var locTime = lastTs[1] || $.now();
		var prevFacelet = currentFacelet;
		currentFacelet = facelet;
		if (!enable) {
			return;
		}
		if (enableVRC) {
			giikerVRC.setState(facelet, prevMoves, false);
		}
		clearReadyTid();
		var solvingMethod = kernel.getProp('vrcMP', 'n');
		if (timer.status() == -1) {
			if (nextCasePending && kernel.getProp('giiMode') == 'at') {
				scheduleNextCase();
			} else if (canStart(currentFacelet)) {
				var delayStart = kernel.getProp('giiSD');
				if (delayStart == 's') {
					//according to scramble
					if (giikerutil.checkScramble()) {
						markScrambled(locTime);
					}
				} else if (delayStart != 'n') {
					waitReadyTid = setTimeout(function() {
						markScrambled(locTime);
					}, ~~delayStart * 1000);
				}
				var moveStart = kernel.getProp('giiSM');
				if (moveStart != 'n') {
					var movere = {
						'x4': /^([URFDLB][ '])\1\1\1/,
						'xi2': /^([URFDLB])( \1'\1 \1'|'\1 \1'\1 )/
					} [moveStart];
					if (movere.exec(prevMoves.join(''))) {
						moveReadyTid = setTimeout(function() {
							markScrambled(locTime);
						}, 1000);
					}
				}
			}
		} else if (timer.status() == -3 || timer.status() == -2) {
			if (timer.checkUseIns()) {
				insTime = locTime - timer.startTime();
			} else {
				insTime = 0;
			}
			startSolve(locTime, prevFacelet, false);
		}
		if (timer.status() >= 1) {
			if (solveTid) {
				if (prevMoves.length == 0) { // nothing was turned, keep waiting
					return;
				}
				clearTimeout(solveTid); // turned again right after the solved state, go on solving
				solveTid = 0;
				timer.lcd.fixDisplay(false, true);
			}
			if (prevMoves.length > 0)
				rawMoves[timer.status() - 1].push([prevMoves[0], lastTs[0], lastTs[1]]);
			var curProgress = cubeutil.getProgress(facelet, solvingMethod);
			timer.updateMulPhase(totPhases, curProgress, locTime);

			if (isGiiSolved(currentFacelet)) {
				if (kernel.getProp('giiMode') == 'at') {
					// show the time already, but only count it if the cube is not turned again right away
					timer.lcd.setRunning(false);
					timer.lcd.val(locTime - timer.startTime());
					solveTime = locTime;
					solveTid = setTimeout(confirmSolve, SOLVE_CONFIRM_MS);
				} else {
					finishSolve(locTime);
				}
			}
		}
	}

	var timedFromCase = null; // when the case was shown, if the solve is timed from then instead of the first turn

	function startSolve(startTime, facelet, fromCase) {
		var solvingMethod = kernel.getProp('vrcMP', 'n');
		timedFromCase = fromCase ? startTime : null;
		timer.startTime(startTime);
		timer.curTime([insTime > 17000 ? -1 : (insTime > 15000 ? 2000 : 0)]);
		timer.status(cubeutil.getStepCount(solvingMethod));
		rawMoves = [];
		for (var i = 0; i < timer.status(); i++) {
			rawMoves[i] = [];
		}
		totPhases = timer.status();
		var initialProgress = cubeutil.getProgress(facelet, solvingMethod);
		timer.updateMulPhase(totPhases, initialProgress, startTime);
		timer.lcd.reset(enableVRC);
		timer.lcd.fixDisplay(false, true);
	}

	// continuous training: a solve only ends when the solved cube is not turned again right away
	// (most turns within an alg follow each other faster), so that solving the case and then doing
	// a mispredicted AUF does not count, and the AUF has to be fixed
	var SOLVE_CONFIRM_MS = 400;
	var solveTid = 0;
	var solveTime = 0;

	function confirmSolve() {
		if (solveTid) {
			clearTimeout(solveTid);
			solveTid = 0;
			finishSolve(solveTime);
		}
	}

	function finishSolve(locTime) {
		var solvingMethod = kernel.getProp('vrcMP', 'n');
		rawMoves.reverse();
		var pretty = cubeutil.getPrettyReconstruction(rawMoves, solvingMethod);
		var moveCnt = pretty.totalMoves;
		giikerutil.setLastSolve(pretty.prettySolve);
		timer.curTime()[1] = locTime - timer.startTime();
		timer.status(-1);
		giikerutil.reSync();
		timer.lcd.fixDisplay(false, true);
		if (timer.curTime()[1] != 0) {
			var sol = giikerutil.tsLinearFix(rawMoves.flat(), timedFromCase); // fit deviceTime to locTime
			var cnt = 0;
			DEBUG && console.log('time fit, old=', timer.curTime());
			for (var i = 0; i < rawMoves.length; i++) {
				cnt += rawMoves[i].length;
				timer.curTime()[rawMoves.length - i] = cnt == 0 ? 0 : sol[cnt - 1][1];
			}
			DEBUG && console.log('time fit, new=', timer.curTime());
			sol = cubeutil.getConjMoves(cubeutil.moveSeq2str(sol), true);
			kernel.pushSignal('time', ["", 0, timer.curTime(), 0, [sol, '333']]);
		} else if (kernel.getProp('giiMode') != 'n') {
			kernel.pushSignal('ctrl', ['scramble', 'next']);
		}
	}

	function canStart(facelet) {
		return facelet != mathlib.SOLVED_FACELET || kernel.getProp('giiMode') != 'n';
	}

	function isGiiSolved(facelet) {
		if (kernel.getProp('giiMode') != 'n') {
			var curScrType = (tools.getCurScramble() || [])[0];
			var chkstep = {
				'coll': 'cpll',
				'cmll': 'cmll',
				'oll': 'oll',
				'eols': 'oll',
				'wvls': 'oll',
				'zbls': 'eoll',
				'f2l': 'f2l',
				'lsll2': 'f2l'
			}[curScrType];
			if (chkstep) {
				return cubeutil.getStepProgress(chkstep, facelet) == 0;
			}
		}
		return facelet == mathlib.SOLVED_FACELET;
	}

	function markScrambled(now) {
		clearReadyTid();
		nextCasePending = false;
		if (timer.status() == -1) {
			if (kernel.getProp('giiMode') == 'n') {
				if (!giikerutil.checkScramble()) {
					var gen = scramble_333.genFacelet(currentFacelet);
					kernel.pushSignal('scramble', ['333', cubeutil.getConjMoves(gen, true), 0]);
				}
				giikerutil.markScrambled();
			} else {
				giikerutil.markScrambled(true);
			}
			if (kernel.getProp('giiMode') == 'at' && kernel.getProp('giiRT')) { // time recognition too
				insTime = 0;
				startSolve(now, currentFacelet, true);
			} else {
				timer.status(-2);
				timer.startTime(now);
				timer.lcd.reset(enableVRC);
				timer.lcd.fixDisplay(true, true);
			}
			if (kernel.getProp('giiBS')) {
				metronome.playTick();
			}
		}
	}

	function setVRC(enable) {
		enableVRC = enable;
		enable ? div.show() : div.hide();
		if (enable) {
			giikerVRC.resetVRC(true, true);
		}
	}

	$(function() {
		div.appendTo("#container");
		kernel.regListener('giikerVRC', 'property', function(signal, value) {
			if (enableVRC) {
				giikerVRC.resetVRC(true, true);
				giikerVRC.setState(currentFacelet, ['U2', 'U2'], false);
			}
		}, /^(?:preScrT?|isTrainScr|giiOri)$/);
		kernel.regListener('giikerVRC', 'property', function(signal, value) {
			if (value[2] != 'set') { // the camera angle setting was changed, drop the dragged turn
				giikerVRC.resetView();
			}
		}, /^vrcOri$/);
		kernel.regListener('giikerVRC', 'scramble', function(signal, value) {
			if (enableVRC && timer.status() == -1 && kernel.getProp('giiMode') == 'at' && GiikerCube.isConnected()) {
				scheduleNextCase();
			}
		});
	});

	function startConnect() {
		giikerutil.setCallback(giikerCallback);
		kernel.showDialog([$('<div>Press OK To Connect To Bluetooth Cube</div>').append(timer.getBTDiv()), function () {
			giikerutil.init().catch(function(error) {
				giikerutil.log('[giiker] init failed', error);
				alert(error);
			});
		}, 0, 0], 'share', 'Bluetooth Connect');
	}

	timer.giiker = {
		setEnable: function(input) { //s: stackmat, m: moyu
			enable = input == 'g';
			giikerutil.setGyroCallback(enable ? giikerVRC.setGyro : null);
			if (enable && !GiikerCube.isConnected()) {
				startConnect();
			} else if (!enable) {
				giikerutil.stop();
			}
			setVRC(enable && kernel.getProp('giiVRC') != 'n');
		},
		onkeydown: function(keyCode) {
			var now = $.now();
			if (keyCode == 27 || keyCode == 28) {
				confirmSolve(); // a solve waiting to be counted is finished, not a DNF
				// not turned yet (when timing from the shown case): stop without recording a DNF
				var recordDNF = timer.status() >= 1 && rawMoves.flat().length > 0;
				clearReadyTid();
				nextCasePending = false;
				timer.status(-1);
				giikerutil.reSync();
				timer.lcd.fixDisplay(false, true);
				if (recordDNF) {
					timer.curTime()[0] = -1;
					rawMoves.reverse();
					var sol = giikerutil.tsLinearFix(rawMoves.flat(), timedFromCase); // fit deviceTime to locTime
					var cnt = 0;
					DEBUG && console.log('time fit, old=', timer.curTime());
					for (var i = 0; i < rawMoves.length; i++) {
						cnt += rawMoves[i].length;
						timer.curTime()[rawMoves.length - i] = cnt == 0 ? 0 : sol[cnt - 1][1];
					}
					DEBUG && console.log('time fit, new=', timer.curTime());
					sol = cubeutil.getConjMoves(cubeutil.moveSeq2str(sol), true);
					kernel.pushSignal('time', ["", 0, timer.curTime(), 0, [sol, '333']]);
				}
			} else if (keyCode == 32 && timer.status() == -1 && kernel.getProp('giiSK') && canStart(currentFacelet)) {
				markScrambled($.now());
			}
		},
		onkeyup: function(keyCode) {
			if (enable && keyCode == 32 && !GiikerCube.isConnected()) {
				startConnect();
			}
		},
		setVRC: setVRC,
		setSize: giikerVRC.setSize
	};
}, [timer]);
