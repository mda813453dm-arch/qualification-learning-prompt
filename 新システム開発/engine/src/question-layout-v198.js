// v198: 列挙（a〜e・ア〜オ・1〜5）の区切りを、読み取り時に入った空白（「b . 」「d .」）があっても段落に分ける。
// あわせて、読み取りで日本語の前後に入った半角空白を詰め、日本語に挟まれた半角の , ( ) を全角に戻して表示する。
// 表示専用で、保存している問題文・選択肢・正答には触れない。v194〜v197 の question-layout.js は変更しない。
export function compactOcrSpacesV198(input) {
  var s = String(input == null ? '' : input);
  // 半角空白の並びは、どちらか隣が日本語（全角）の字なら詰める。英数字どうしの間（例：Open Source）は残す。
  s = s.replace(/([\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff01-\uff60])[ \t]+(?=[^\s])|([^\s])[ \t]+(?=[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff01-\uff60])/g, function(m, a, b) { return a || b; });
  // 日本語に挟まれた半角の「,」「(」「)」は、読み取りで全角が半角になったもの。原本の全角（，（）に戻して表示する。
  return s.replace(/([\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff01-\uff60]),(?=[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff01-\uff60])/g, '$1，')
    .replace(/\((?=[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff01-\uff60])([^()\n]*[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff01-\uff60])\)/g, '（$1）');
}
export function splitInlineQuestionStatementsV198(input) {
  var source = compactOcrSpacesV198(input);
  var definitions = [
    { labels: 'abcde', pattern: /(^|[\s。．.!?！？、，,；;:：」）○□])([a-eA-Eａ-ｅＡ-Ｅ])[ ]?[.．)）](?![0-9０-９])/g },
    { labels: 'アイウエオ', pattern: /(^|[\s。．.!?！？、，,；;:：」）○□])([アイウエオ])[ ]?[.．)）]/g },
    { labels: '12345', pattern: /(^|[\s。．.!?！？、，,；;:：」）○□])([1-5１-５])[ ]?[.．)）](?![0-9０-９])/g },
    { labels: 'abcde', pattern: /(^|[\s。．.!?！？、，,；;:：」）○□])[（(]([a-eａ-ｅＡ-Ｅ])[）)]/g },
    { labels: 'アイウエオ', pattern: /(^|[\s。．.!?！？、，,；;:：」）○□])[（(]([アイウエオ])[）)]/g },
    { labels: '12345', pattern: /(^|[\s。．.!?！？、，,；;:：」）○□])[（(]([1-5１-５])[）)]/g },
    { labels: '12345', pattern: /(^|[\s。．.!?！？、，,；;:：」）○□])([①②③④⑤])/g },
  ];
  var breakPoints = new Set();
  function isMarkdownTableRow(position) {
    var start = source.lastIndexOf('\n', position - 1) + 1;
    var end = source.indexOf('\n', position);
    var row = source.slice(start, end < 0 ? source.length : end).trim();
    return row.charAt(0) === '|' && row.charAt(row.length - 1) === '|';
  }
  definitions.forEach(function(definition) {
    var matches = [], match;
    definition.pattern.lastIndex = 0;
    while ((match = definition.pattern.exec(source)) !== null) {
      var label = match[2].normalize('NFKC').toLowerCase();
      var number = definition.labels.indexOf(label);
      var at = match.index + match[1].length;
      if (number >= 0 && !isMarkdownTableRow(at)) matches.push({ at: at, number: number, afterStop: /[。．]$/.test(source.slice(Math.max(0, at - 2), at).trim()) });
    }
    var sequence = [];
    function keepCompleteSequence() {
      // 3項目以上、または「。」の直後に a. b. と2項目だけ並ぶもの（例：次のa及びbの各問）
      var two = sequence.length === 2 && definition.labels === 'abcde' && sequence.every(function(item) { return item.afterStop; });
      if (sequence.length >= 3 || two) sequence.forEach(function(item) { breakPoints.add(item.at); });
    }
    matches.forEach(function(item) {
      if (item.number === 0) { keepCompleteSequence(); sequence = [item]; }
      else if (sequence.length && item.number === sequence.length) sequence.push(item);
      else { keepCompleteSequence(); sequence = []; }
    });
    keepCompleteSequence();
  });
  var output = '', previous = 0;
  Array.from(breakPoints).sort(function(a, b) { return a - b; }).forEach(function(position) {
    if (position > 0 && !/[\r\n]\s*$/.test(source.slice(0, position))) {
      output += source.slice(previous, position).replace(/[ \t]+$/, '') + '\n';
      previous = position;
    }
  });
  // 段落の頭の「b . 」は「b. 」にそろえる（読み取りで入った空白だけを詰める）
  return (output + source.slice(previous)).replace(/(^|\n)([a-eａ-ｅA-E]) ?([.．]) ?(?=\S)/g, '$1$2$3 ').replace(/[ \t]+$/, '');
}
