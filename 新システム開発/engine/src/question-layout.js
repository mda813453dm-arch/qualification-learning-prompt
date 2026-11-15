/** Display-only restoration of inline OCR substatement boundaries for all qualifications. */
export function splitInlineQuestionStatements(input) {
  var source = String(input == null ? '' : input);
  // Presentation only: do not alter stored question wording or answer mapping.
  // Split only well-formed runs of 3+ consecutive markers (a/b/c, ア/イ/ウ, 1/2/3).
  var definitions = [
    { labels: 'abcde', pattern: /(^|[\s。．.!?！？、，；;:：」）])([a-eａ-ｅＡ-Ｅ])[.．)）](?![0-9０-９])/g },
    { labels: 'アイウエオ', pattern: /(^|[\s。．.!?！？、，；;:：」）])([アイウエオ])[.．)）]/g },
    { labels: '12345', pattern: /(^|[\s。．.!?！？、，；;:：」）])([1-5１-５])[.．)）](?![0-9０-９])/g },
    { labels: 'abcde', pattern: /(^|[\s。．.!?！？、，；;:：」）])[（(]([a-eａ-ｅＡ-Ｅ])[）)]/g },
    { labels: 'アイウエオ', pattern: /(^|[\s。．.!?！？、，；;:：」）])[（(]([アイウエオ])[）)]/g },
    { labels: '12345', pattern: /(^|[\s。．.!?！？、，；;:：」）])[（(]([1-5１-５])[）)]/g },
    { labels: '12345', pattern: /(^|[\s。．.!?！？、，；;:：」）])([①②③④⑤])/g },
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
      if (number >= 0 && !isMarkdownTableRow(at)) matches.push({ at: at, number: number });
    }
    var sequence = [];
    function keepCompleteSequence() {
      if (sequence.length >= 3) sequence.forEach(function(item) { breakPoints.add(item.at); });
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
      output += source.slice(previous, position) + '\n';
      previous = position;
    }
  });
  return output + source.slice(previous);
}
