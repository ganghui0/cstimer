var stattool = execMain(function(kpretty, round, kpround) {

	var infoDiv = $('<div />').css('text-align', 'center').css('font-size', '0.7em');

	var hlstr = STATS_STRING.split('|');
	for (var i = 0; i < 13; i++) {
		hlstr[i] = hlstr[i] || '';
	}

	function updateInfo() {
		if (!isEnable) {
			return;
		}

		var times_stats_table = stats.getTimesStatsTable();
		var avgSizes = times_stats_table.avgSizes;
		var theStats = times_stats_table.getAllStats();
		var numdnf = theStats[0];
		var sessionmean = theStats[1];

		var totalTime = 0;
		for (var i = 0; i < times_stats_table.timesLen; i++) {
			totalTime += stats.timesAt(i)[0][1];
		}
		var prettyFunc = times_stats_table.prettyFunc || [kpretty, kpround];
		var s = [];
		s.push('<span class="click" data="tt">' + hlstr[4].replace("%d", (times_stats_table.timesLen - numdnf) + "/" + times_stats_table.timesLen) + ', ' + hlstr[9].replace("%v", prettyFunc[1](sessionmean)) + '</span>\n');
		s.push('<span>' + hlstr[12].replace("%d", kpretty(totalTime)) + '</span>\n');
		s.push(hlstr[0] + ": " + '<span class="click" data="bs">' + prettyFunc[0](times_stats_table.bestTime) + '</span>');
		s.push(' | ' + hlstr[2] + ": " + '<span class="click" data="ws">' + prettyFunc[0](times_stats_table.worstTime) + "</span>\n");
		var hasTable = false;
		var tableHead = '<table class="table"><tr><td></td><td>' + hlstr[1] + '</td><td>' + hlstr[0] + '</td></tr>';
		for (var j = 0; j < avgSizes.length; j++) {
			var spec = avgSizes[j];
			if (spec.session) {
				if (times_stats_table.timesLen != 0) {
					hasTable || (hasTable = true, s.push(tableHead));
					s.push('<tr><td>' + TimeStat.specName(spec));
					s.push('<td><span class="click" data="ps' + j + '">' + prettyFunc[0](times_stats_table.sessionStat(spec)) + '</span></td>');
					s.push('<td>-</td></tr>');
				}
				continue;
			}
			if (times_stats_table.timesLen >= spec.size) {
				hasTable || (hasTable = true, s.push(tableHead));
				s.push('<tr><td>' + (spec.kind == 'p' ? TimeStat.specName(spec) : hlstr[spec.kind == 'm' ? 6 : 7].replace("%mk", spec.size)));
				s.push('<td><span class="click" data="c' + spec.kind + j + '">' + prettyFunc[1](times_stats_table.lastAvg[j][0]) +
					(spec.kind == 'p' ? '' : " (σ=" + stats.trim(times_stats_table.lastAvg[j][1], 2) + ")") + '</span></td>');
				s.push('<td><span class="click" data="b' + spec.kind + j + '">' + prettyFunc[1](times_stats_table.bestAvg(j, 0)) +
					(spec.kind == 'p' ? '' : " (σ=" + stats.trim(times_stats_table.bestAvg(j, 1), 2) + ")") + '</span></td></tr>');
			}
		}
		hasTable && s.push('</table>');
		s = s.join("");
		infoDiv.html(s.replace(/\n/g, '<br>'));
	}

	var isEnable = false;

	function execFunc(fdiv, signal) {
		if (!(isEnable = (fdiv != undefined))) {
			return;
		}
		if (/^scr/.exec(signal)) {
			return;
		}
		fdiv.empty().append(infoDiv.unbind('click').click(function(e) {
			stats.infoClick(stats.getTimesStatsTable(), stats.timesAt, e);
		}));
		updateInfo();
	}

	var commentStat = (function() {
		var div = $('<div />').css('text-align', 'center').css('font-size', '0.7em');
		var editDiv = $('<div />');
		var latestLabel = $('<span>');
		var commentInput = $('<input type="text">').css('width', '8em');
		var saveButton = $('<input type="button">').val(STATS_COMMENT);
		var table = $('<table class="table">');
		var statSelect = $('<select>');
		var isEnable = false;

		// options: the session mean (the original behaviour) plus every configured indicator
		function genStatSelect() {
			var avgSizes = stats.getTimesStatsTable().avgSizes;
			var cur = statSelect.val();
			statSelect.empty().append($('<option>').val('m').html(STATS_AVG));
			for (var j = 0; j < avgSizes.length; j++) {
				statSelect.append($('<option>').val('i' + j).html(TimeStat.specName(avgSizes[j])));
			}
			statSelect.val(cur);
			if (statSelect.val() == null) {
				statSelect.val('m');
			}
			return avgSizes;
		}

		function normalizeComment(comment) {
			return $.trim((comment || '').replace(/\s+/g, ' ')).toLowerCase();
		}

		function groupTimeAt(idxs, idx) {
			return stats.timeAt(idxs[idx]);
		}

		function cmpLabel(a, b) {
			return a < b ? -1 : a > b ? 1 : 0;
		}

		function saveLatestComment() {
			var timesLen = stats.getTimesStatsTable().timesLen;
			if (timesLen == 0) {
				return;
			}
			stats.setComment(timesLen - 1, commentInput.val());
		}

		function procInputKey(e) {
			if (e.keyCode == 13) {
				saveLatestComment();
				kernel.blur();
			}
		}

		function updateEditor(timesLen) {
			if (timesLen == 0) {
				latestLabel.text(STATS_COMMENT + ': ');
				commentInput.val('').prop('disabled', true);
				saveButton.prop('disabled', true);
				return;
			}
			latestLabel.text('#' + timesLen + ' ' + STATS_COMMENT + ': ');
			commentInput.prop('disabled', false).val(stats.timesAt(timesLen - 1)[2]);
			saveButton.prop('disabled', false);
		}

		function update() {
			if (!isEnable) {
				return;
			}

			var timesLen = stats.getTimesStatsTable().timesLen;
			updateEditor(timesLen);
			var groups = {};
			var list = [];

			for (var i = 0; i < timesLen; i++) {
				var key = normalizeComment(stats.timesAt(i)[2]);
				var mapKey = '$' + key;
				if (!groups[mapKey]) {
					groups[mapKey] = {
						key: key,
						idxs: []
					};
					list.push(groups[mapKey]);
				}
				groups[mapKey].idxs.push(i);
			}

			list.sort(function(a, b) {
				if (a.key == '') {
					return b.key == '' ? 0 : -1;
				} else if (b.key == '') {
					return 1;
				}
				return b.idxs.length - a.idxs.length || cmpLabel(a.key, b.key);
			});

			var avgSizes = genStatSelect();
			var sel = statSelect.val();
			var spec = sel == 'm' ? null : avgSizes[~~sel.slice(1)];
			var isPct = spec && spec.kind == 'p';

			table.empty().append($('<tr>')
				.append($('<th>').text(STATS_COMMENT))
				.append($('<th>').text('N'))
				.append($('<th>').text(STATS_SOLVE))
				.append($('<th>').text(hlstr[0]))
				.append($('<th style="padding:0">').append(statSelect))
			);

			if (timesLen == 0) {
				table.append($('<tr>').append($('<td colspan="5">').text('No solves')));
				return;
			}

			for (var i = 0; i < list.length; i++) {
				var group = list[i];
				var statObj = new TimeStat(spec ? [spec] : [], group.idxs.length, groupTimeAt.bind(null, group.idxs));
				var statRet = statObj.getAllStats();
				var solved = group.idxs.length - statRet[0];
				var share = stats.trim(group.idxs.length / timesLen * 100, 1) + '%';
				// whole-session indicators apply across the group, windowed ones report their best
				var val = !solved ? null :
					!spec ? statRet[1] :
					spec.session ? statObj.sessionStat(spec) : statObj.bestAvg(0, 0);
				table.append($('<tr>')
					.append($('<td>').text(group.key || '(blank)'))
					.append($('<td>').text(group.idxs.length + ' (' + share + ')'))
					.append($('<td>').text(solved + '/' + group.idxs.length))
					.append($('<td>').text(solved ? kpretty(statObj.bestTime) : 'DNF'))
					.append($('<td>').text(val == null || val < 0 ? 'N/A' : (isPct ? kpretty : kpround)(val)))
				);
			}
		}

		function execFunc(fdiv, signal) {
			if (!(isEnable = (fdiv != undefined))) {
				return;
			}
			if (/^scr/.exec(signal)) {
				return;
			}
			editDiv.empty().append(latestLabel, commentInput.unbind('change keydown').change(saveLatestComment).keydown(procInputKey), saveButton.unbind('click').click(saveLatestComment));
			statSelect.unbind('change').change(update);
			fdiv.empty().append(div.empty().append(editDiv, table));
			update();
		}

		return {
			execFunc: execFunc,
			update: update
		}
	})();

	$(function() {
		if (typeof tools != "undefined") {
			tools.regTool('stats', TOOLS_STATS, execFunc);
			tools.regTool('commentstat', 'Filter by Comment', commentStat.execFunc);
		}
		stats.regUtil('stattool', updateInfo);
		stats.regUtil('commentstat', commentStat.update);
	});

	return {
		update: updateInfo,
		updateComment: commentStat.update
	}
}, [kernel.pretty, kernel.round, kernel.pround]);
