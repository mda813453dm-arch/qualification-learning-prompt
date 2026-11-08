import test from 'node:test';
import assert from 'node:assert/strict';
import { auditQuestionPackets, textAuditReasons } from '../src/question-text-audit.js';

const valid = { questionNumber: 1, stem: '都市計画について正しいものはどれか。', stemMode: 'text',
  choices: ['都市計画区域では届出が要る。', '区域外では届出が不要。', '当該届出を省略できる。', '全ての取引に要る。'], choiceMode: 'text' };

test('real text questions with complete choice text are clean', () => {
  assert.deepEqual(textAuditReasons(valid), []);
});

test('image-only fallback from the user screenshot is never classified as full text', () => {
  const q = { ...valid, questionNumber: 22, stem: '', stemMode: 'official_image',
    choices: ['1', '2', '3', '4'], choiceMode: 'official_image',
    evidence: { notes: ['official_original_image_question'] } };
  assert.deepEqual(textAuditReasons(q), ['FULL_QUESTION_IMAGE', 'STEM_EMPTY',
    'CHOICES_PLACEHOLDERS', 'FULL_QUESTION_CROP_RECORDED']);
});

test('a visually complete image is still marked for correction, and a figure alone is OK', () => {
  const screenshot = { ...valid, stemMode: 'official_image', choices: ['1', '2', '3', '4'], choiceMode: 'official_image', figures: [{ file: 'full.png' }] };
  assert(textAuditReasons(screenshot).includes('FULL_QUESTION_IMAGE'));
  assert.deepEqual(textAuditReasons({ ...valid, diagramRequired: true, figures: [{ file:'plot.png' }] }), []);
});

test('ocr must be explicitly reported as unverified, not counted as verified text', () => {
  const q = { ...valid, stemMode: 'ocr', choiceMode: 'ocr', verification: { questionText:'ocr_unverified' } };
  const summary = auditQuestionPackets([valid, q]);
  assert.equal(summary.fullyText, 1);
  assert.equal(summary.ocrPending, 1);
  assert.equal(summary.pendingCount, 1);
});

test('missing choices and figures are reported independently', () => {
  const reasons = textAuditReasons({ ...valid, choices: ['a', ''], diagramRequired: true, figures: [] });
  assert(reasons.includes('CHOICES_INCOMPLETE'));
  assert(reasons.includes('FIGURES_MISSING'));
});
