/** 保存済みIPA原本から四肢択一式だけを解析し、全問検証できた区分のみ共有登録。 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GcpStore } from '../src/gcp-store.js';
import { validateResult } from '../src/ingest.js';
import { readResult, writeResult, readFigure } from '../src/cache.js';
import { CATALOG } from '../src/catalog.js';

assert.equal(process.argv[2], '--commit', 'COMMIT_SWITCH_REQUIRED');
assert.equal(process.env.QLP_IPA_LEARNING_APPROVED, 'YES', 'USER_SCOPE_REQUIRED');
assert.equal(process.env.GOOGLE_CLOUD_PROJECT, 'qualification-learning', 'PROJECT_MISMATCH');
const store = new GcpStore({ bucket: 'qualification-learning-qlp-figures' });
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const execFile = promisify(execFileCallback);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const codeBySection = {
  '科目A': 'a', '科目B': 'b', '春期午前': 'spring-am',
  '秋期午前': 'autumn-am', '10月午前': 'october-am',
};
const summary = { checked: 0, ready: 0, failed: [] };
for (const cat of [CATALOG.fe, CATALOG.ap]) {
  for (const source of cat.sources) {
    const { year, section } = source;
    const key = `ipa-source/${cat.qualificationId}/${year}/${codeBySection[section]}`;
    const row = await store.get(key, 'json');
    assert(row?.question?.sha256 && row?.answer?.sha256, `PDF_NOT_ARCHIVED:${key}`);
    const verified = {};
    for (const kind of ['question', 'answer']) {
      const blob = Buffer.from(await store.get(row[kind].key, 'arrayBuffer'));
      assert.equal(sha(blob), row[kind].sha256, `ARCHIVED_SHA_MISMATCH:${key}:${kind}`);
      verified[kind] = blob;
    }
    summary.checked++;
    const work = await mkdtemp(join(tmpdir(), 'qlp-ipa-study-'));
    try {
      const qpath = join(work, 'question.pdf');
      const apath = join(work, 'answer.pdf');
      const assetsDir = join(work, 'assets');
      await writeFile(qpath, verified.question);
      await writeFile(apath, verified.answer);
      let stdout;
      try {
        ({stdout} = await execFile('python3', ['-m', 'qlp_parser.cli', '--adapter', cat.qualificationId,
          '--year', String(year), '--section', section,
          '--question-pdf', qpath, '--question-url', source.questionUrl,
          '--question-sha256', row.question.sha256,
          '--answer-pdf', apath, '--answer-url', source.answerUrl,
          '--answer-sha256', row.answer.sha256, '--assets-dir', assetsDir], {
          env: { ...process.env, PYTHONPATH: join(root, 'parser') },
          timeout: 720000, maxBuffer: 100 * 1024 * 1024,
        }));
      } catch (error) {
        if (!error.stdout) throw error;
        stdout = error.stdout;
      }
      const parsed = JSON.parse(stdout);
      // 公式公開数は科目Aが20、科目Bが6、従来の午前は80。
      // 解答例の全行と問題番号の連続性が確認できない年度は利用不可。
      const expected = section === '科目A' ? 20 : section === '科目B' ? 6 : 80;
      const nums = parsed.packets?.map((p) => p.questionNumber) ?? [];
      if (parsed.status !== 'ready' || parsed.excluded?.length ||
          nums.length !== expected ||
          !nums.length || nums.some((n, i) => n !== i + 1) ||
          parsed.packets.some((p) => (section !== '科目B' && p.choices.length !== 4) ||
            (section === '科目B' && (p.choices.length < 4 || p.choices.length > 10)) || !p.fieldId ||
            !Number.isInteger(p.correctAnswer) || p.correctAnswer < 1 || p.correctAnswer > p.choices.length ||
            p.verification?.answer !== 'same_year_official_answer_checked')) {
        throw new Error(`SOURCE_PARSING_INCOMPLETE:${parsed.status}:${nums.length}:${parsed.excluded?.length}`);
      }
      const assets = {};
      for (const filename of await readdir(assetsDir)) {
        assets[filename] = new Uint8Array(await readFile(join(assetsDir, filename)));
      }
      const sourceInfo = { qualificationId: cat.qualificationId, adapter: cat.qualificationId,
        year, section, questionUrl: source.questionUrl, answerUrl: source.answerUrl, owner: '_shared' };
      const validated = await validateResult(sourceInfo, {
        question: row.question.sha256, answer: row.answer.sha256,
      }, '0.8.2', parsed, assets);
      assert.equal(validated.status, 'ready', 'INGEST_VALIDATION_FAILED');
      assert.equal(validated.packetCount, nums.length, 'INGEST_EXCLUDED_QUESTIONS');
      const parts = { qualificationId: cat.qualificationId, year, section,
        questionSha256: row.question.sha256, answerSha256: row.answer.sha256,
        parserVersion: '0.8.2', owner: '_shared' };
      const already = await readResult(store, parts, Date.now());
      if (!already.hit || already.result?.status !== 'ready' || already.result?.packetCount !== nums.length) {
        await writeResult(store, parts, validated, assets, Date.now());
      }
      const back = await readResult(store, parts, Date.now());
      assert.equal(back.result?.status, 'ready', 'SHARED_READBACK_FAILED');
      assert.equal(back.result.packetCount, nums.length, 'SHARED_COUNT_MISMATCH');
      for (const p of back.result.packets) {
        for (const f of p.figures ?? []) {
          const bytes = await readFigure(store, row.question.sha256, '0.8.2', f.file, '_shared');
          assert(bytes && sha(Buffer.from(bytes)) === f.sha256, `IMAGE_READBACK_FAILED:${p.questionNumber}`);
        }
      }
      await store.put(key, JSON.stringify({ ...row, status: 'learning-ready',
        learningQuestionCount: nums.length, learningParserVersion: '0.8.2' }));
      const updated = await store.get(key, 'json');
      assert.equal(updated.learningQuestionCount, nums.length, 'READY_STATUS_READBACK_FAILED');
      summary.ready++;
      console.log('IPA_LEARNING_READY', cat.qualificationId, year, section, nums.length);
    } catch (err) {
      summary.failed.push({ qualification: cat.qualificationId, year, section, error: String(err.message).slice(0, 200) });
      console.log('IPA_LEARNING_NOT_READY', cat.qualificationId, year, section, String(err.message).slice(0, 200));
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
}
console.log('IPA_LEARNING_IMPORT_SUMMARY', JSON.stringify(summary));
if (!summary.ready) process.exitCode = 1;
