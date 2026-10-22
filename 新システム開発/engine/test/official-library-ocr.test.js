import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/store.js';
import { officialLibrary } from '../src/official-library.js';
import { resultKey } from '../src/cache.js';

const qHash = 'a'.repeat(64);
const aHash = 'b'.repeat(64);
const cat = {
  qualificationId: 'q063',
  officialShared: {
    validatedUploadYears: [2026], uploadSections: ['main'],
    uploadQuestionCounts: { main: 2 },
    officialPdfPins: { 2026: { main: qHash, answer: aHash } },
  },
};
const key = { qualificationId: 'q063', year: 2026, section: 'main',
  questionSha256: qHash, answerSha256: aHash, parserVersion: '0.8.2', owner: '_shared' };

test('公式図のないOCR問題も、元PDFの図表検証と28問相当の全件照合が済んでいれば共有可', async () => {
  const store = new MemoryStore();
  const packet = (number, figures = []) => ({
    questionNumber: number, questionPdfSha256: qHash, answerPdfSha256: aHash,
    figures, diagramRequired: !!figures.length,
    stemMode: 'ocr', choiceMode: 'ocr',
    verification: { visual: 'question_level_pdf_graphics_checked' },
  });
  const result = {
    status: 'ready', qualificationId: 'q063', year: 2026, section: 'main',
    parserVersion: '0.8.2',questionPdfSha256:qHash,answerPdfSha256:aHash,
    excluded: [], packets: [packet(1), packet(2, [{file:'official-image.png'}])],
  };
  await store.put(resultKey(key), JSON.stringify({savedAt:Date.now(),result}));
  const library = await officialLibrary(store,cat,'0.8.2');
  assert.equal(library.totalQuestions,2);
  assert.deepEqual(library.completeYears,[2026]);
  // 同じ問題でも、図が必要なのに公式画像が欠けている場合は共有禁止。
  result.packets[1].figures = [];
  await store.put(resultKey(key), JSON.stringify({savedAt:Date.now(),result}));
  assert.equal((await officialLibrary(store,cat,'0.8.2')).totalQuestions,0);
});
