/**
 * 図表分離（全資格共通）。
 *
 * 公式PDFから切り出した画像のうち「図表だけを写したもの」だけを本文と選択肢の間に出す。
 * 問題1問分（問番号・本文・選択肢を含む範囲）の切り出しは図の代わりにしない（原本照合用として畳んで出す）。
 *
 * 判定の根拠は data/figure-separation.json（監査ツール parser/tools/figure_separation_audit.py が
 * 公式PDFの座標・文字の位置で調べた結果と、目視で確かめた結果）。登録のない問（学習者が添付した別のPDFなど）は、
 * 保存済みの座標（図の範囲・問題の範囲）で安全側に判定する。保存済みの問題データは書き換えない。
 */
import registry from '../data/figure-separation.json' with { type: 'json' };

const QUESTIONS = registry.questions ?? {};

/** 問題1問分の範囲を切り出す解析器（図表だけを切り出さない）。登録のない問はこの資格の画像を照合用とする。 */
const WHOLE_REGION_QUALIFICATIONS = new Set(['q006', 'q090', 'q021', 'q018']);

export const SEPARATION_LABELS = {
  verified: '図表分離：確認済み',
  not_needed: '図表なし',
  unverified: '図表分離未検証',
  image_question: '本文が原本画像の問題',
  choice_image: '選択肢が原本画像の問題',
};

export const UNVERIFIED_NOTICE = '図表分離未検証：この問題の図表は、まだ図表だけを切り出せていません。図表は原本の問題画像（または公式の問題PDF）で確認してください。';
const FIGURE_REF = /(?:図|表|グラフ|地図|写真|資料)\s*[0-9０-９①-⑨]|(?:次の|下の|右の|左の|以下の|下記の|上の)\s*(?:図|表|グラフ|地図|写真|フローチャート|画面|資料)|図に示|表に示|図のよう|表のよう|フローチャート|状態遷移図|ER図|構成図/;

export function registryEntry(packet) {
  if (!packet?.questionPdfSha256 || !Number.isInteger(packet.questionNumber)) return null;
  return lookup(packet.questionPdfSha256, packet.questionNumber, packet.section);
}

/** 同じPDFでも区分ごとに分解結果が違う問は「SHA:問番号@区分」で登録してある。 */
function lookup(sha, number, section) {
  const key = `${sha}:${number}`;
  return (section != null ? QUESTIONS[`${key}@${section}`] : null) ?? QUESTIONS[key] ?? null;
}

/** 登録のない問の画像の役割（保存済みの座標で判定。迷えば照合用）。 */
function geometricRole(packet, figure) {
  if (packet.stemMode === 'official_image') return 'question_image';
  const qid = String(packet.qualificationId ?? '');
  if (WHOLE_REGION_QUALIFICATIONS.has(qid)) return 'source';
  const notes = packet.evidence?.notes ?? [];
  if (notes.some((n) => /full_official_question_crop|generic_official_question_image|official_original_image_question|question_continues_next_page/.test(n))) return 'source';
  const r = figure.rect, qr = packet.evidence?.questionRect;
  // 座標の無い古い形式は判定できないので従来どおり出す（状態は未検証のまま）
  if (!Array.isArray(r) || r.length !== 4) return 'figure';
  const h = r[3] - r[1];
  if (h >= 600) return 'source';
  const firstPage = (packet.evidence?.questionPdfPages ?? [])[0];
  if (Array.isArray(qr) && qr.length === 2 && figure.page === firstPage) {
    const span = qr[1] - qr[0];
    // 問題の範囲の上端（問番号・本文の1行目）から下端（最後の選択肢）までを覆う切り出しは問題1問分
    if (span > 0 && r[1] <= qr[0] + 12 && r[3] >= qr[1] - 12) return 'source';
    if (span > 0 && h >= 0.85 * span) return 'source';
  }
  return 'figure';
}

/**
 * 出題画面の図表の構成を決める。
 * @param packet 保存済みの出題パケット（変更しない）
 * @param urlOf (file, owner) => 画像のURL
 * @returns {{figures, sources, status, notices, overrides}}
 *   figures：本文と選択肢の間に出す画像 [{url, role, file, width, height, sha256, svgFile?}]（role: figure | question_image | choice_image | choice_source）
 *   sources：原本照合用（畳んで出す）[{url, file}]
 */
export function separateFigures(packet, urlOf) {
  let entry = registryEntry(packet);
  // 監査した分解結果と本文の形（文字か原本画像か）が違う保存データには、判定表を当てはめない
  if (entry && (entry.status === 'image_question') !== (packet.stemMode === 'official_image')) entry = null;
  const stored = packet.figures ?? [];
  const figures = [], sources = [];
  let status;
  const choiceImageNeeded = packet.choiceMode === 'official_image' && packet.stemMode !== 'official_image';
  if (entry) {
    const roles = entry.figures ?? {};
    for (const f of stored) {
      // 本文が原本画像の問は、その画像が問題そのもの（監査は画像の一覧を持たない）
      const role = roles[f.file] ?? (entry.status === 'image_question' ? 'question_image' : 'source');
      const item = { url: urlOf(f.file, null), file: f.file, width: f.width, height: f.height, sha256: f.sha256, ...(f.svgFile && role !== 'source' ? { svgFile: f.svgFile } : {}) };
      if (role === 'source') sources.push({ url: item.url, file: f.file });
      else figures.push({ ...item, role });
    }
    for (const add of entry.add ?? []) {
      figures.push({ url: urlOf(add.file, add.owner ?? '_shared', add.parserVersion), file: add.file, width: add.width, height: add.height,
        sha256: add.sha256, role: add.role ?? 'figure' });
    }
    status = entry.status;
  } else {
    for (const f of stored) {
      const role = geometricRole(packet, f);
      const item = { url: urlOf(f.file, null), file: f.file, width: f.width, height: f.height, sha256: f.sha256 };
      if (role === 'source') sources.push({ url: item.url, file: f.file });
      else figures.push({ ...item, role, ...(f.svgFile ? { svgFile: f.svgFile } : {}) });
    }
    if (packet.stemMode === 'official_image') status = 'image_question';
    else if (choiceImageNeeded) status = 'choice_image';
    else if (!stored.length) status = FIGURE_REF.test(String(packet.stem ?? '').normalize('NFKC')) ? 'unverified' : 'not_needed';
    else status = 'unverified'; // 座標だけの判定は検証済みとしない
  }
  // 選択肢を文字にできない問：選択肢だけの画像が無ければ、照合用の原本を選択肢として出す（答えられなくしない）
  const overrides = entry?.overrides ?? null;
  const choicesAsText = overrides?.choiceMode === 'text';
  if (choiceImageNeeded && !choicesAsText && !figures.some((f) => f.role === 'choice_image' || f.role === 'question_image') && sources.length) {
    const s = sources.shift();
    figures.push({ url: s.url, file: s.file, role: 'choice_source' });
  }
  const notices = [];
  const figureRef = FIGURE_REF.test(String(overrides?.stem ?? packet.stem ?? '').normalize('NFKC'));
  if (status === 'unverified' && (figureRef || sources.length) && !figures.some((f) => f.role === 'figure')) notices.push(UNVERIFIED_NOTICE);
  return { figures, sources, status, notices, overrides, check: entry?.check ?? 'geometry' };
}

/** 保存済みの表示（採点後の再表示）に含まれる図のURLから、照合用（問題1問分）の画像を除く。 */
export function inlineFigureUrls(question) {
  const urls = (question?.figureUrls ?? (question?.figures ?? []).map((f) => f.url)).filter(Boolean);
  const sha = question?.questionPdfSha256 ?? /\/([a-f0-9]{64})\//.exec(urls[0] ?? '')?.[1];
  const entry = sha && Number.isInteger(question?.questionNumber) ? lookup(sha, question.questionNumber, question.section) : null;
  if (!entry || (entry.status === 'image_question') !== (question.stemMode === 'official_image')) return urls;
  return urls.filter((u) => {
    const file = decodeURIComponent(String(u).split('/').pop() ?? '');
    const role = (entry.figures ?? {})[file];
    return role ? role !== 'source' : (entry.add ?? []).some((a) => a.file === file);
  });
}
