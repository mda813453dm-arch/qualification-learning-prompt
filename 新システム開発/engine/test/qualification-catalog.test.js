import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/catalog.js';
import urlIndex from '../data/qualification-url-index.json' with { type: 'json' };
import { handle, overviewFor } from '../src/app.js';
import { MemoryStore } from '../src/store.js';

const fullCatalog = Object.values(CATALOG);
const normalize = (text) => String(text).normalize('NFKC').replace(/\s/g, '');

test('移行元の103資格がすべて統合され、資格IDと名称が重複しない', () => {
  assert.equal(urlIndex.qualificationCount, 103);
  assert.equal(urlIndex.urlRecordCount, 4184);
  assert.equal(urlIndex.linkedUrlCount, 4023);
  assert.equal(urlIndex.urlVerification, 'NOT_VERIFIED_FOR_QUESTION_GRADING');
  assert.equal(fullCatalog.length, 103);
  assert.equal(new Set(fullCatalog.map((c) => c.qualificationId)).size, fullCatalog.length);
  assert.equal(new Set(fullCatalog.map((c) => normalize(c.name))).size, fullCatalog.length);
  for (const source of urlIndex.qualifications) {
    const matches = fullCatalog.filter((c) => c.qualificationId === source.sourceId ||
      [c.name, ...c.aliases].some((alias) => normalize(alias) === normalize(source.name)));
    assert.equal(matches.length, 1, `未統合または重複: ${source.name}`);
  }
});

test('追加資格には検証済みでない原本を自動出題元として設定しない', () => {
  for (const [key, c] of Object.entries(CATALOG)) {
    if (!c.urlCatalog) continue;
    assert.match(key, /^q\d{3}$/);
    assert.equal(c.overviewOnly, true);
    assert.equal(c.uploadAdapter, 'generic_mc');
    assert.deepEqual(c.sources, []);
    assert.ok(c.pastExamPage?.startsWith('https://'), key);
  }
});

test('既存の専用設定と公式原本の検証条件を温存する', () => {
  assert.equal(CATALOG.takken.qualificationId, 'q041');
  assert.equal(CATALOG.surveyor.qualificationId, 'q063');
  assert.equal(CATALOG.land_surveyor.qualificationId, 'land_surveyor');
  assert.equal(CATALOG.fe.qualificationId, 'fe');
  assert.ok(CATALOG.takken.officialShared.officialPdfPins[2025]);
  assert.ok(CATALOG.mankan.officialShared.officialPdfPins[2025]);
});

async function startSession(name) {
  const env = { STORE: new MemoryStore(), API_TOKEN: 'test-token', clock: () => Date.UTC(2026, 9, 25) };
  const response = await handle(new Request('https://engine.example/v1/sessions', {
    method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
    body: JSON.stringify({ qualificationId: name, sources: [] }),
  }), env);
  return { response, data: await response.json(), env };
}

test('看護師の直接入力で学習開始画面を生成し、URLと未検証状態を示す', async () => {
  const { response, data, env } = await startSession('看護師');
  assert.equal(response.status, 201, JSON.stringify(data));
  assert.ok(data.sessionId);
  assert.ok(data.learnerId);
  const session = await env.STORE.get(`ses/${data.sessionId}`, 'json');
  assert.equal(session.state.qualificationId, 'q070');
  const overview = overviewFor('q070');
  assert.match(overview.lines.join('\n'), /厚生労働省/);
  assert.match(overview.lines.join('\n'), /原本・公式正答との照合は未実施/);
  assert.ok(overview.pastExamPage?.startsWith('https://www.mhlw.go.jp/'));
  const study = await handle(new Request('https://engine.example/v1/study/start', {
    method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
    body: JSON.stringify({ qualificationName: '看護師', learnerId: data.learnerId }),
  }), env);
  assert.equal(study.status, 201);
  const next = await handle(new Request(`https://engine.example/v1/sessions/${data.sessionId}/next`, {
    method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
    body: JSON.stringify({}),
  }), env);
  const body = await next.json();
  assert.equal(next.status, 200, JSON.stringify(body));
  assert.equal(body.status, 'sourceUnavailable');
  assert.equal(body.urlCatalog.sourceId, 'q070');
  assert.equal(body.sourceAttachmentSupported, true);
  assert.match(body.notice, /原本.*未検証|問題.*正答.*照合/);
});

test('医師・獣医師／看護師・愛玩動物看護師の部分一致を取り違えない', async () => {
  for (const [name, expected] of [
    ['医師', 'q033'], ['獣医師', 'q065'], ['看護師', 'q070'],
    ['愛玩動物看護師', 'q050'], ['愛玩動物看護師国家試験', 'q050'],
  ]) {
    const { response, data, env } = await startSession(name);
    assert.equal(response.status, 201, name + JSON.stringify(data));
    const state = await env.STORE.get(`ses/${data.sessionId}`, 'json');
    assert.equal(state.state.qualificationId, expected, name);
  }
});
