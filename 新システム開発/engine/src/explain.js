// 解説の書き方：利用者の学習段階と、エンジンが採点した成績（苦手な分野・今回の正誤）に合わせて、AIに渡す。
// 解説はAIが書くが、何を入れるか（表・図解・段階に合わせた深さ）はエンジンが決める（2026-10-18 利用者「解説は画像や図表を多く取り入れ、学習状況を加味して」）。
import { fieldStats } from './study.js';

/** master_prompt U03 の学習段階（1〜4）ごとの解説の深さ。 */
export const STAGE_GUIDES = {
  1: '未着手：専門用語は使う前にやさしく言い換え、身近なたとえを先に出す。全体像の図解から入り、要点は3つまでにしぼる。',
  2: '基礎学習中：定義→要件→例外の順に、根拠（法令・規程の名前）を添える。似た制度・用語との違いを比較表にする。',
  3: '応用学習中：例外、ひっかけ、数値の違いを比較表にする。計算を要する問題では、手順を1行ずつの表にし、途中の値も書く。',
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
  '解説には、次の2つを必ず入れる。出力はMarkdownのみ。SVG・HTML・XMLなどのタグを生成したり、そのソースを表示したりしない。',
  '①表：要点・比較・数値・要件を、マークダウンの表で整理する（1つ以上）。',
  '②図と視覚的整理：その問題に公式PDFの図・写真があり、question.figures に表示可能なURLがあればその同じ図を参照して説明する。再取得のためにnextQuestionを呼ばない。',
  '公式図がないときは、要件の関係・流れ・位置・数値をMarkdownの比較表や番号付き手順で視覚的に整理する。写真が必要なら実際に表示できる信頼できる画像だけを出典とともに使い、画像が利用できないときに架空の画像リンクや図を生成しない。',
  '解説を表示する学習画面はSVGを描画しないため、<svg>...</svg>、HTMLタグ、CSS、コードブロックに入れた図、画像生成コードを決して出力しない。図がなくても読みやすい日本語の表と文章で完結させる。',
  '問題に公式の図があるときは、その図の記号や数値を使って説明する。',
  '構成は「結論 → 表（使える公式図があればその説明） → 試験のポイント → 短い覚え方」。公式の解説ではないことが分かるように書く。',
  '解説内容は資格名で一律に決めず、取得した問題文・選択肢・図表から判断する。計算を要する設問では使用する式・数値の代入・途中過程・単位・検算を丁寧に示す。座標・面積等の計算では、その問題に適切な関数電卓の操作方法も示す。計算を要しない設問では、条文・判例・定義・要件・例外・判断過程などの根拠に集中し、「計算はありません」「計算手順は不要」などの不要な断り書きを付けない。',
].join('\n');

/**
 * 解説の書き方（AIに渡す。利用者には見せない）。
 * stage：学習段階（分からなければ、会話で利用者が答えた段階に合わせるよう書く）
 * grade：採点結果（あれば、正誤に合わせた入り方を足す）
 */
export function explainHow({ stage = null, weak = [], grade = null, fieldName = null, savedFigures = false, learning = null } = {}) {
  const n = stageNumber(stage);
  const lines = [ALWAYS];
  if (savedFigures) lines.push('この問題には保存済みの公式図がある。question.figures のURLで確認できる図だけを参照して説明する。新しい図を生成しない。図の取得のためにnextQuestionを呼ばない。');
  if (n) {
    lines.push(`利用者の学習段階は「${STAGE_GUIDES[n].split('：')[0]}」。${STAGE_GUIDES[n]}`);
  } else {
    lines.push(`利用者が答えた学習段階に合わせる。${Object.values(STAGE_GUIDES).join(' ')}`);
  }
  if (learning?.method === 'guided') lines.push('概念・判断・計算の設問。理解が未確認なら、解説付きの類題・小さな例題を最初に示し、根拠または手順を理解してから、答えを隠して再確認する。すでに正解できた場合は例題を冗長に繰り返さない。公式設問とは別の例題であることを明示し、公式の問題文・正答は書き換えない。');
  if (learning?.method === 'recall') lines.push('事実・用語・条文番号の設問。まず自力想起を促し、採点前に答えを漏らさず、回答後は短く根拠を説明する。');
  if (learning?.method === 'contrast') lines.push('検証された対比論点。混同しやすい相違を比較表で説明し、次の復習では解説を隠して想起する。');
  if (learning?.phase === 'closed_book_recall' && grade?.result !== 'wrong') lines.push('理解済みまたは期限復習の論点は例題から毎回やり直さず、想起と必要な補足を優先する。');
  if (weak.length) lines.push(`苦手な分野（エンジンの採点記録）：${weak.join('、')}。この分野の解説では、基礎の振り返りを1つ足す。`);
  if (grade && !grade.skipped) {
    if (grade.result === 'wrong') lines.push(`今回は不正解（選んだのは${grade.selected}、正答は${grade.correctAnswer}）。最初に、選んだ選択肢がなぜ誤りかを示してから、正答の根拠を説明する。`);
    else if (grade.result === 'guess_correct') lines.push('今回は勘で正解。正答の根拠を確かめ、ほかの選択肢がなぜ誤りかも表で示す。');
    else if (grade.result === 'confident_correct') lines.push('今回は自信をもって正解。説明は短めにし、関連して出やすい論点を1つ足す。');
    if (fieldName) lines.push(`分野：${fieldName}`);
  }
  return lines.join('\n');
}
