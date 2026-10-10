// Claude independent-audit fixes applied on top of apply_v19_to_v20_2026-10-10.js output.
// Input: v20 raw (script output). Output: candidate v20 final. All anchors fail closed (exactly one match).
const fs = require('node:fs');
const apply = function apply(source) {
  let s = source;
  const swap = (a, b) => {
    const n = s.split(a).length - 1;
    if (n !== 1) throw new Error('Expected one anchor (' + n + '): ' + a.slice(0, 45));
    s = s.replace(a, () => b);
  };
  // A01: literal "\n" left by the PDF image fallback insertion -> real newline
  swap('照合未確定とする。\\n　404の同じURL', '照合未確定とする。\n　404の同じURL');
  // A02: Markdown auto-numbering protection was only in the removed appendix (修正23/T12) -> move into U10
  swap('表示整形による重複番号を送信前に除去する。',
    '表示整形による重複番号を送信前に除去する。Markdownの自動番号リスト等で表示番号が書き換わる環境では、番号を保持できる表現（コードブロック等）で本文と回答選択肢一覧を表示する。');
  // A03: U21 option label consistency ("続ける" does not exist on U21)
  swap('U21で「続ける」を選んだ後の誤答も', 'U21で選択1を選んだ後の誤答も');
  // A04: wording left over from the replaced "集合切替" sentence
  swap('集合切替はB07のカウンタをリセットしない。', '年度候補の補完はB07のカウンタをリセットしない。');
  // A05: U25 followed by the next question in the same response must not violate "U10 only"
  swap('成功時はU10の完成問題のみを送信し、',
    '成功時はU10の完成問題のみを送信し（B13で確定したU25を同一応答の先頭に置く場合を除く）、');
  // A06: special-treatment next question must use the common engine (B08 entry), consistent with B15 gate
  swap('当該論点の別の問題をB08/B09で準備する。',
    '当該論点の別の問題をB08→B09の共通取得エンジン（有効なAI優先設定ならB11）で準備する。');
  // A07: same answer-page fallback at initial check (B09 d) and limited re-fetch (B13 2))
  swap('テキストの対応崩れは画像で再確認。',
    'テキストの対応崩れ、またはテキストで正答表・該当問が見つからない場合はB07の正答ページ画像確認を適用する。');
  swap('テキスト抽出で列対応が曖昧ならページ画像で確認する。',
    'テキスト抽出で列対応が曖昧、または正答表・該当問が見つからないならB07と同じ方法でページ画像を確認する。');
  // A08 (live test T1): U12 had no rule when the answer-key PDF page cannot be confirmed -> executor added free text to the fixed 4 lines
  swap('（確認済みのPDFビューア正答掲載ページへの #page=N を付す）／添付識別情報〕',
    '（確認済みのPDFビューア正答掲載ページへの #page=N を付す。掲載ページを確認できない場合は #page= を付けずURLだけとし、4行の外に説明を足さない）／添付識別情報〕');
  // A09 (live test T5): U21 option-2 destination was ambiguous when the only review unit belongs to the item being held / is not yet due
  swap('〔実在する復習単位名、なければ確認済み次項目名〕へ進む」として移動先を一つに確定する。',
    '〔期限到来済みで保留対象項目以外の実在する復習単位名、なければ確認済み次項目名〕へ進む」として移動先を一つに確定する。保留対象項目自身の復習単位や期限前の復習単位は移動先にしない。');
  // A10 (live test T8): H01 count did not say whether confirmation questions are included
  swap('正解＋不正解＝採点確定回答数をD11から検算（',
    '正解＋不正解＝採点確定回答数をD11から検算し、実践問題と確認問題の内訳を区別して記す（');
  return s;
};
const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw new Error('usage: node apply_v20_audit_fixes_2026-10-10.js <v20_raw> <v20_final>');
fs.writeFileSync(output, apply(fs.readFileSync(input, 'utf8')), 'utf8');
console.log('Created', output);
