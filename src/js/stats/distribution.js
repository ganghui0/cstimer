var distribution = execMain(function(kpretty) {

	var div = $('<div />').css('position', 'relative');
	var tip = $('<div class="popup">').css({ 'text-align': 'left', 'white-space': 'nowrap', 'pointer-events': 'none' });
	var tipStr = (typeof TOOLS_DISTRIBUTION_TIP == 'undefined' ? 'range|count|cumulative|current streak' : TOOLS_DISTRIBUTION_TIP).split('|');
	var binInfo = [];
	var tipBin = -1;

	var isEnable = false;

	function pct(n, total) {
		return total == 0 ? '0.0%' : (n / total * 100).toFixed(1) + '%';
	}

	function showTip(e) {
		var bin = ~~$(e.currentTarget).attr('data-bin');
		var info = binInfo[bin];
		if (!info) {
			return;
		}
		if (bin != tipBin) { // only rebuild when the cursor crosses into another bin
			tipBin = bin;
			tip.html([
				tipStr[0] + ': ' + info.lo + ' ~ ' + info.hi,
				tipStr[1] + ': ' + info.cnt + ' (' + pct(info.cnt, info.total) + ')',
				tipStr[2] + ': ' + info.cum + '/' + info.total + ' (' + pct(info.cum, info.total) + ')',
				tipStr[3] + ': ' + info.streak
			].join('<br>'));
		}
		tip.show();
		var off = div.offset();
		var x = e.pageX - off.left + 12;
		var y = e.pageY - off.top + 12;
		// flip back inside the panel when the tip would overflow its right edge
		if (x + tip.outerWidth() > div.width()) {
			x = Math.max(0, x - tip.outerWidth() - 24);
		}
		tip.css({ left: x + 'px', top: y + 'px' });
	}

	function hideTip() {
		tipBin = -1;
		tip.hide();
	}

	function updateDistribution() {
		if (!isEnable) {
			return;
		}
		div.empty();
		binInfo = [];
		tipBin = -1;
		var times_stats_list = stats.getTimesStatsTable();
		var data = times_stats_list.getMinMaxInt();
		if (!data) {
			return;
		}
		var timesLen = times_stats_list.timesLen;
		var max = data[0],
			min = data[1],
			diff = data[2];
		max = ~~(max / diff);
		min = ~~(min / diff);
		var dis = {};
		var keep = {};
		var cntmax = 0;
		keep[max + 1] = 0;
		for (var i = 0; i < timesLen; i++) {
			var value = times_stats_list.timeAt(i);
			if (value != -1) {
				var cur = ~~(value / diff);
				dis[cur] = (dis[cur] || 0) + 1;
				cntmax = Math.max(dis[cur], cntmax);
				keep[cur] = i + 1;
			} else {
				keep[max + 1] = i + 1;
			}
		}
		for (var i = max; i > min; i--) {
			keep[i] = Math.max(keep[i + 1], keep[i] || 0);
		}
		var str = [];
		var cumDis = 0;
		var pattern = diff >= 1000 ? /[^\.]+(?=\.)/ : /[^\.]+\.[\d]/;
		var lablen = kpretty(max * diff).match(pattern)[0].length;
		for (var i = min; i <= max; i++) {
			var label = kpretty(i * diff).match(pattern)[0];
			var label2 = kpretty((i + 1) * diff).match(pattern)[0];
			dis[i] = dis[i] || 0;
			cumDis += dis[i];
			binInfo.push({
				lo: kpretty(i * diff),
				hi: kpretty((i + 1) * diff),
				cnt: dis[i],
				cum: cumDis,
				streak: timesLen - keep[i + 1],
				total: timesLen
			});
			label = mathlib.valuedArray(lablen - label.length, '&nbsp;').join('') + label;
			label2 = mathlib.valuedArray(lablen - label2.length, '&nbsp;').join('') + label2;
			str.push('<tr class="times" data-bin="' + (binInfo.length - 1) + '"><td>' + label + '+</td><td><span class="cntbar" style="width: ' + dis[i] / cntmax * 5 + 'em;">' + dis[i] + '</span></td><td>&nbsp;&lt;' + label2 + '</td><td><span class="cntbar" style="width: ' + cumDis / timesLen * 5 + 'em; white-space: nowrap;">' + (timesLen - keep[i + 1]) + '/' + cumDis + '</span></td></tr>');
		}
		var table = $('<table style="border:none;">' + str.join('') + '</table>');
		table.find('tr[data-bin]').bind('mousemove click', showTip).bind('mouseleave', hideTip);
		div.append(table, tip.hide());
	}

	function execFunc(fdiv, signal) {
		if (!(isEnable = (fdiv != undefined))) {
			return;
		}
		if (/^scr/.exec(signal)) {
			return;
		}
		fdiv.empty().append(div);
		updateDistribution();
	}

	$(function() {
		if (typeof tools != "undefined") {
			kernel.regListener('distribution', 'property', function(signal, value) {
				if (value[0] == 'disPrec') {
					updateDistribution();
				}
			}, /^disPrec$/);
			kernel.regProp('tools', 'disPrec', 1, STATS_PREC, ['a', ['a', 0, 1, 2, 3, 4, 5, 6, 7, 8, 9], STATS_PREC_STR.split('|')], 1);
			tools.regTool('distribution', TOOLS_DISTRIBUTION, execFunc);
		}
		stats.regUtil('distribution', updateDistribution);
	});

	return {
		update: updateDistribution
	}
}, [kernel.pretty]);
