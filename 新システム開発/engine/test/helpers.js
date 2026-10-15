import { sha256Hex } from '../src/store.js';
import { toBase64 } from '../src/parser-client.js';

export const PV = '0.3.0';
export const DAY = 24 * 60 * 60 * 1000;
export const T0 = Date.parse('2026-10-15T01:00:00Z');

export const pdf = (label) => new TextEncoder().encode(`%PDF-1.7\n${label}\n`);
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

/** URL -> 現在の公式PDF。差し替えは files[url] = pdf('v2') のように行う。 */
export function fakeWeb(files) {
  const calls = [];
  const fetchPdf = async (url) => {
    calls.push(url);
    if (!files[url]) throw new Error('HTTP 404');
    return files[url];
  };
  return { files, calls, fetchPdf };
}

export const SRC = {
  qualificationId: 'surveyor',
  adapter: 'surveyor',
  year: 2026,
  section: 'main',
  questionUrl: 'https://example.go.jp/q.pdf',
  answerUrl: 'https://example.go.jp/a.pdf',
};

/** 分解器の偽物：問題数・正答・図を指定して、パーサー出力と同じ形を作る。 */
export async function fakeResult({ src = SRC, qBytes, aBytes, answers = [3, 1, 4], figureOn = [2] }) {
  const qsha = await sha256Hex(qBytes);
  const asha = await sha256Hex(aBytes);
  const pngSha = await sha256Hex(PNG);
  const packets = answers.map((correctAnswer, i) => {
    const n = i + 1;
    const fig = figureOn.includes(n);
    return {
      questionId: `${src.qualificationId}:${src.year}:${src.section}:${n}`,
      year: src.year,
      section: src.section,
      questionNumber: n,
      stem: `問${n}の本文`,
      stemMode: 'text',
      choices: ['一', '二', '三', '四', '五'],
      choiceMode: 'text',
      correctAnswer,
      questionPdfUrl: src.questionUrl,
      answerPdfUrl: src.answerUrl,
      questionPdfSha256: qsha,
      answerPdfSha256: asha,
      figures: fig ? [{ file: `q${n}.png`, sha256: pngSha, width: 10, height: 10 }] : [],
      evidence: { questionPdfPages: [n] },
    };
  });
  const assets = Object.fromEntries(figureOn.map((n) => [`q${n}.png`, PNG]));
  return {
    result: { status: 'ready', parserVersion: PV, qualificationId: src.qualificationId, year: src.year, section: src.section, questionPdfSha256: qsha, answerPdfSha256: asha, packets, excluded: [] },
    assets,
  };
}

/** 偽の分解器（呼ばれた回数を数える）。web の今のPDFで結果を作る。 */
export function fakeParser(web, opts = {}) {
  const parse = async (input) => {
    parse.count += 1;
    return fakeResult({ ...opts, qBytes: input.question.bytes, aBytes: input.answer.bytes });
  };
  parse.count = 0;
  return parse;
}

export const assetsB64 = (assets) => Object.fromEntries(Object.entries(assets).map(([f, b]) => [f, toBase64(b)]));
