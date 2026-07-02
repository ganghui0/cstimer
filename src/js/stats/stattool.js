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
			var size = Math.abs(avgSizes[j]);
			if (times_stats_table.timesLen >= size) {
				hasTable || (hasTable = true, s.push(tableHead));
				s.push('<tr><td>' + hlstr[7 - (avgSizes[j] >>> 31)].replace("%mk", size));
				s.push('<td><span class="click" data="c' + 'am' [avgSizes[j] >>> 31] + j + '">' + prettyFunc[1](times_stats_table.lastAvg[j][0]) + " (σ=" + stats.trim(times_stats_table.lastAvg[j][1], 2) +
					')</span></td>');
				s.push('<td><span class="click" data="b' + 'am' [avgSizes[j] >>> 31] + j + '">' + prettyFunc[1](times_stats_table.bestAvg(j, 0)) + " (σ=" + stats.trim(times_stats_table.bestAvg(j, 1), 2) +
					')</span></td></tr>');
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
		var isEnable = false;

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

			table.empty().append($('<tr>')
				.append($('<th>').text(STATS_COMMENT))
				.append($('<th>').text('N'))
				.append($('<th>').text(STATS_SOLVE))
				.append($('<th>').text(hlstr[0]))
				.append($('<th>').text(STATS_AVG))
			);

			if (timesLen == 0) {
				table.append($('<tr>').append($('<td colspan="5">').text('No solves')));
				return;
			}

			for (var i = 0; i < list.length; i++) {
				var group = list[i];
				var statObj = new TimeStat([], group.idxs.length, groupTimeAt.bind(null, group.idxs));
				var statRet = statObj.getAllStats();
				var solved = group.idxs.length - statRet[0];
				var share = stats.trim(group.idxs.length / timesLen * 100, 1) + '%';
				table.append($('<tr>')
					.append($('<td>').text(group.key || '(blank)'))
					.append($('<td>').text(group.idxs.length + ' (' + share + ')'))
					.append($('<td>').text(solved + '/' + group.idxs.length))
					.append($('<td>').text(solved ? kpretty(statObj.bestTime) : 'DNF'))
					.append($('<td>').text(solved ? kpround(statRet[1]) : 'N/A'))
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
			tools.regTool('commentstat', 'Comment Statistics', commentStat.execFunc);
		}
		stats.regUtil('stattool', updateInfo);
		stats.regUtil('commentstat', commentStat.update);
	});

	return {
		update: updateInfo,
		updateComment: commentStat.update
	}
}, [kernel.pretty, kernel.round, kernel.pround]);
