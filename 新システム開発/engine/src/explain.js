// 解説の書き方：利用者の学習段階と、エンジンが採点した成績（苦手な分野・今回の正誤）に合わせて、AIに渡す。
// 解説はAIが書くが、何を入れるか（表・図解・段階に合わせた深さ）はエンジンが決める（2026-10-18 利用者「解説は画像や図表を多く取り入れ、学習状況を加味して」）。
import { fieldStats } from './study.js';

/** master_prompt U03 の学習段階（1〜4）ごとの解説の深さ。 */
export const STAGE_GUIDES = {
  1: '未着手：専門用語は使う前にやさしく言い換え、身近なたとえを先に出す。全体像の図解から入り、要点は3つまでにしぼる。',
  2: '基礎学習中：定義→要件→例外の順に、根拠（法令・規程の名前）を添える。似た制度・用語との違いを比較表にする。',
  3: '応用学習中：例外、ひっかけ、数値の違いを比較表にする。計算は手順を1行ずつの表にし、途中の値も書く。',
  4: '過去問演習中：出題のパターンと、選択肢の見分け方を示す。選択肢ごとの○×と根拠を表にし、解く時間を縮めるコツを添える。',
};

const STAGE_WORDS = [
  [1, /未着手|^\s*1\s*$|^1[：:]/],
  [2, /基礎|^\s*2\s*$|^2[：:]/],
  [3, /応用|^\s*3\s*$|^3[：:]/],
  [4, /過去問|演習|^\s*4\s*$|^4[：:]/],
];

/** 「2」「基礎学習中」「2：基礎学習中」などを 1〜4 にする（分からなければ null）。 */
export function stageNumber(v) {
  if (Number.isInteger(v) && v >= 1 && v <= 4) return v;
  const s = String(v ?? '').normalize('NFKC').trim();
  if (!s) return null;
  for (const [n, re] of STAGE_WORDS) if (re.test(s)) return n;
  return null;
}

/** 誤答率の高い分野（2問以上答えて半分以上まちがえた分野）。誤答率の高い順。 */
export function weakFields(history, names = {}) {
  return Object.entries(fieldStats(history ?? {}))
    .filter(([, s]) => s.n >= 2 && s.w / s.n >= 0.5)
    .sort((a, b) => b[1].w / b[1].n - a[1].w / a[1].n || b[1].n - a[1].n)
    .map(([fid, s]) => `${names[fid] ?? fid}（${s.n}問中${s.w}問まちがい）`);
}

const ALWAYS = [
  '解説には、次の2つを必ず入れる。',
  '①表：要点・比較・数値・要件を、マークダウンの表で整理する（1つ以上）。',
  '②図解：流れ・関係・位置・数の大小を、小さなSVGの図で示す（svg タグで書き、コードブロックに入れない。白い背景の rect を敷き、横幅は width="100%"、文字は日本語でよい。2,000字以内）。図の下に「AIが作った図解です」と書く。公式の問題の図の代わりにはしない。',
  '問題に公式の図があるときは、その図の記号や数値を使って説明する。公式の図をもう一度見せるときは、nextQuestion の question に「〔年度〕年度 問〔番号〕の図をもう一度」と入れて呼び、付いた図のファイルだけを使う（Pythonは使わず、ウェブ検索・画像検索で探さない）。',
  '構成は「結論 → 表と図解 → 試験のポイント → 短い覚え方」。公式の解説ではないことが分かるように書く。',
].join('\n');

/**
 * 解説の書き方（AIに渡す。利用者には見せない）。
 * stage：学習段階（分からなければ、会話で利用者が答えた段階に合わせるよう書く）
 * grade：採点結果（あれば、正誤に合わせた入り方を足す）
 */
export function explainHow({ stage = null, weak = [], grade = null, fieldName = null } = {}) {
  const n = stageNumber(stage);
  const lines = [ALWAYS];
  if (n) {
    lines.push(`利用者の学習段階は「${STAGE_GUIDES[n].split('：')[0]}」。${STAGE_GUIDES[n]}`);
  } else {
    lines.push(`利用者が答えた学習段階に合わせる。${Object.values(STAGE_GUIDES).join(' ')}`);
  }
  if (weak.length) lines.push(`苦手な分野（エンジンの採点記録）：${weak.join('、')}。この分野の解説では、基礎の振り返りを1つ足す。`);
  if (grade && !grade.skipped) {
    if (grade.result === 'wrong') lines.push(`今回は不正解（選んだのは${grade.selected}、正答は${grade.correctAnswer}）。最初に、選んだ選択肢がなぜ誤りかを示してから、正答の根拠を説明する。`);
    else if (grade.result === 'guess_correct') lines.push('今回は勘で正解。正答の根拠を確かめ、ほかの選択肢がなぜ誤りかも表で示す。');
    else if (grade.result === 'confident_correct') lines.push('今回は自信をもって正解。説明は短めにし、関連して出やすい論点を1つ足す。');
    if (fieldName) lines.push(`分野：${fieldName}`);
  }
  return lines.join('\n');
}
