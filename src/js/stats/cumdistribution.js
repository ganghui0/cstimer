var cumdistribution = execMain(function(kpretty) {

	var canvas = $('<canvas style="margin-bottom:-0.4em"/>'), ctx;
	var div = $('<div style="text-align:center; position:relative">');
	var tip = $('<div class="popup">').css({ 'text-align': 'left', 'white-space': 'nowrap', 'pointer-events': 'none' });
	var tipStr = (typeof TOOLS_CUMDIST_TIP == 'undefined' ? 'time|percentile' : TOOLS_CUMDIST_TIP).split('|');

	var isEnable = false;

	// margins: left fits "100%", bottom holds the time axis, right keeps the
	// last tick label from running off the canvas
	var offl = 50,
		offr = 26,
		offt = 12,
		offb = 28;
	var cw, ch;

	// state of the currently drawn curve, kept for the hover readout
	var sorted = [],
		total = 0,
		plotmin = 0,
		ploth = 1;
	var baseImage = null;

	function px(t) { // time -> canvas x
		return offl + (t - plotmin) / ploth * (cw - offl - offr);
	}

	function py(c) { // cumulative fraction -> canvas y
		return offt + (1 - c) * (ch - offt - offb);
	}

	function plot(pts, color, lineWidth) {
		ctx.strokeStyle = color;
		ctx.lineWidth = lineWidth || 2;
		ctx.beginPath();
		ctx.moveTo(pts[0][0], pts[0][1]);
		for (var i = 1; i < pts.length; i++) {
			ctx.lineTo(pts[i][0], pts[i][1]);
		}
		ctx.stroke();
		ctx.closePath();
	}

	// number of solves <= t, via binary search over the sorted times
	function countLE(t) {
		var lo = 0,
			hi = sorted.length;
		while (lo < hi) {
			var mid = (lo + hi) >> 1;
			if (sorted[mid] <= t) {
				lo = mid + 1;
			} else {
				hi = mid;
			}
		}
		return lo;
	}

	function updateCumDistribution() {
		if (!isEnable || !canvas[0].getContext) {
			return;
		}
		ctx = canvas[0].getContext('2d');
		var imgSize = kernel.getProp('imgSize') / 10;
		var unit = 50;
		canvas.width(8 * imgSize * 1.2 + 'em');
		canvas.height(5 * imgSize * 1.2 + 'em');
		canvas.attr('width', 8 * unit + 1);
		canvas.attr('height', 5 * unit + 5);
		cw = 8 * unit + 1;
		ch = 5 * unit + 5;

		baseImage = null;
		sorted = [];
		tip.hide();
		ctx.clearRect(0, 0, cw, ch);

		var times_stats = stats.getTimesStatsTable();
		var data = times_stats.getMinMaxInt();
		if (!data) {
			return;
		}
		total = times_stats.timesLen;
		for (var i = 0; i < total; i++) {
			var t = times_stats.timeAt(i);
			if (t != -1) {
				sorted.push(t);
			}
		}
		sorted.sort(function(a, b) { return a - b; });

		var diff = data[2];
		plotmin = ~~(data[1] / diff) * diff;
		var plotmax = Math.ceil(data[0] / diff) * diff;
		if (plotmax <= plotmin) { // a session with only one distinct time
			plotmax = plotmin + diff;
		}
		ploth = plotmax - plotmin;

		ctx.fillStyle = '#fff';
		ctx.fillRect(offl, offt, cw - offl - offr, ch - offt - offb);

		// gridlines: cumulative every 25%, time every `diff`
		for (var c = 0; c <= 1.0001; c += 0.25) {
			plot([[offl, py(c)], [cw - offr, py(c)]], '#ccc', 1);
		}
		for (var t = plotmin; t <= plotmax; t += diff) {
			plot([[px(t), offt], [px(t), ch - offb]], '#ccc', 1);
		}

		// the empirical CDF, drawn as the step function it actually is.
		// normalised by total solves, so DNFs hold the curve below 100% —
		// which is exactly what the pQ indicators report.
		var pts = [[px(plotmin), py(0)]];
		for (var i = 0; i < sorted.length; i++) {
			pts.push([px(sorted[i]), py(i / total)]);
			pts.push([px(sorted[i]), py((i + 1) / total)]);
		}
		pts.push([px(plotmax), py(sorted.length / total)]);
		plot(pts, '#f00', 2);

		plot([
			[offl, offt],
			[cw - offr, offt],
			[cw - offr, ch - offb],
			[offl, ch - offb],
			[offl, offt]
		], '#000', 1);

		ctx.fillStyle = kernel.getProp('col-font');
		ctx.lineWidth = 1;
		ctx.font = '12pt Arial';
		ctx.textAlign = 'right';
		for (var c = 0; c <= 1.0001; c += 0.25) {
			ctx.fillText(~~(c * 100) + '%', offl - 6, py(c) + 5);
		}
		// time axis along the bottom, ends nudged inward so they stay on canvas
		ctx.textAlign = 'center';
		var pattern = diff >= 1000 ? /[^\.]+(?=\.)/ : /[^\.]+\.[\d]/;
		for (var t = plotmin; t <= plotmax; t += diff) {
			var label = kpretty(t).match(pattern)[0];
			var half = ctx.measureText(label).width / 2;
			var lx = Math.min(Math.max(px(t), half + 1), cw - half - 1);
			ctx.fillText(label, lx, ch - offb + 20);
		}
		baseImage = ctx.getImageData(0, 0, cw, ch);
	}

	function showTip(e) {
		if (!baseImage || sorted.length == 0) {
			return;
		}
		var rect = canvas[0].getBoundingClientRect();
		var x = (e.clientX - rect.left) / rect.width * cw;
		var y = (e.clientY - rect.top) / rect.height * ch;
		if (x < offl || x > cw - offr || y < offt || y > ch - offb) {
			hideTip();
			return;
		}
		var t = plotmin + (x - offl) / (cw - offl - offr) * ploth;
		var n = countLE(t);

		ctx.putImageData(baseImage, 0, 0);
		plot([[x, offt], [x, ch - offb]], '#08f', 1);
		plot([[offl, py(n / total)], [cw - offr, py(n / total)]], '#08f', 1);

		tip.html([
			tipStr[0] + ': ' + kpretty(Math.round(t)),
			tipStr[1] + ': ' + (n / total * 100).toFixed(1) + '%'
		].join('<br>')).show();

		var off = div.offset();
		var tx = e.pageX - off.left + 14;
		var ty = e.pageY - off.top + 14;
		if (tx + tip.outerWidth() > div.width()) {
			tx = Math.max(0, tx - tip.outerWidth() - 28);
		}
		tip.css({ left: tx + 'px', top: ty + 'px' });
	}

	function hideTip() {
		tip.hide();
		baseImage && ctx.putImageData(baseImage, 0, 0);
	}

	function execFunc(fdiv, signal) {
		if (!(isEnable = (fdiv != undefined))) {
			return;
		}
		if (/^scr/.exec(signal)) {
			return;
		}
		fdiv.empty().append(div.empty().append(
			canvas.unbind('mousemove click mouseleave').bind('mousemove click', showTip).bind('mouseleave', hideTip),
			tip.hide()
		));
		updateCumDistribution();
	}

	$(function() {
		if (typeof tools != "undefined") {
			kernel.regListener('cumdistribution', 'property', function(signal, value) {
				if (value[0] == 'disPrec') {
					updateCumDistribution();
				}
			}, /^disPrec$/);
			tools.regTool('cumdistribution', typeof TOOLS_CUMDISTRIBUTION == 'undefined' ? 'cumulative time distribution' : TOOLS_CUMDISTRIBUTION, execFunc);
		}
		stats.regUtil('cumdistribution', updateCumDistribution);
	});

	return {
		update: updateCumDistribution
	}
}, [kernel.pretty]);
