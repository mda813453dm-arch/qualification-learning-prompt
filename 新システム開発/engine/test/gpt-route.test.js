import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/app.js';
import { MemoryStore } from '../src/store.js';

test('GPT用のAPI定義と設定文をURLから取れる（秘密は含まない）', async () => {
  const env = { STORE: new MemoryStore(), API_TOKEN: 'test-token', clock: () => 0 };
  const spec = await handle(new Request('https://engine.example/gpt/openapi.yaml'), env);
  assert.equal(spec.status, 200);
  const text = await spec.text();
  assert.ok(text.includes('url: https://engine.example'));
  assert.ok(!text.includes('REPLACE-WITH-CLOUD-RUN-URL'));
  const ins = await handle(new Request('https://engine.example/gpt/instructions.txt'), env);
  assert.equal(ins.status, 200);
  assert.match(await ins.text(), /学習エンジン/);
});

test('プライバシーポリシーのページを公開する', async () => {
  const env = { STORE: new MemoryStore(), API_TOKEN: 'test-token', clock: () => 0 };
  const r = await handle(new Request('https://engine.example/privacy'), env);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /プライバシーポリシー/);
});

test('GPT用のAPI定義は engine/openapi.yaml と同じ内容', async () => {
  const { readFileSync } = await import('node:fs');
  const { OPENAPI_YAML } = await import('../src/gpt-openapi.js');
  assert.equal(OPENAPI_YAML, readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8'));
});

test('合言葉が違うときは、中身を出さずに「どう違うか」だけ返す', async () => {
  const env = { STORE: new MemoryStore(), API_TOKEN: 'a'.repeat(64) };
  const hint = async (auth) => {
    const res = await handle(new Request('https://engine.example/v1/sessions', { method: 'POST', headers: auth === null ? {} : { authorization: auth }, body: '{}' }), env);
    assert.equal(res.status, 401);
    return (await res.json()).hint;
  };
  assert.equal(await hint(null), 'no_authorization_header');
  assert.equal(await hint('Basic xyz'), 'not_bearer');
  assert.equal(await hint('Bearer projects/1/secrets/qlp-api-token'), 'looks_like_a_path_not_the_value');
  assert.equal(await hint('Bearer ab cd'), 'contains_whitespace');
  assert.equal(await hint(`Bearer ${'b'.repeat(64)}`), 'wrong_value_length_64');
  const ok = await handle(new Request('https://engine.example/v1/jobs/q041', { headers: { authorization: `Bearer ${'a'.repeat(64)} ` } }), env);
  assert.notEqual(ok.status, 401);
});
