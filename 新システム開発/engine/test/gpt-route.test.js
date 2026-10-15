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
