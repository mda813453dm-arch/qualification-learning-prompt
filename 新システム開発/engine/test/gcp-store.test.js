// Google Cloud の保存先：図は Cloud Storage、それ以外は Firestore に振り分け、掃除用の期限を付ける
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GcpStore } from '../src/gcp-store.js';
import { readFigure, readResult, writeResult } from '../src/cache.js';
import { PNG, T0 } from './helpers.js';

function fakeFirestore() {
  const docs = new Map();
  return {
    docs,
    collection: (name) => ({
      doc: (id) => ({
        get: async () => ({ exists: docs.has(`${name}/${id}`), get: (f) => docs.get(`${name}/${id}`)[f] }),
        set: async (v) => { docs.set(`${name}/${id}`, v); },
        delete: async () => { docs.delete(`${name}/${id}`); },
      }),
    }),
  };
}

function fakeStorage() {
  const objects = new Map();
  return {
    objects,
    bucket: (b) => ({
      file: (name) => ({
        save: async (body, opts) => { objects.set(`${b}/${name}`, { body, opts }); },
        download: async () => {
          if (!objects.has(`${b}/${name}`)) throw Object.assign(new Error('not found'), { code: 404 });
          return [objects.get(`${b}/${name}`).body];
        },
        delete: async () => { objects.delete(`${b}/${name}`); },
      }),
    }),
  };
}

const make = () => {
  const firestore = fakeFirestore();
  const storage = fakeStorage();
  return { firestore, storage, store: new GcpStore({ bucket: 'figs', firestore, storage }) };
};

test('図は Cloud Storage、分解結果は Firestore に入り、期限なしの保存の読み書きがそのまま動く', async () => {
  const { firestore, storage, store } = make();
  const keyParts = { qualificationId: 'q063', year: 2026, section: 'main', questionSha256: 'a'.repeat(64), answerSha256: 'b'.repeat(64), parserVersion: '0.5.0' };
  await writeResult(store, keyParts, { packets: [{ questionNumber: 1 }] }, { 'q1.png': PNG }, T0);
  assert.equal(storage.objects.size, 1);
  const [name, obj] = [...storage.objects.entries()][0];
  assert.ok(name.startsWith('figs/fig/'));
  assert.equal(obj.opts.contentType, 'image/png');
  assert.equal(firestore.docs.size, 1);
  const [id, doc] = [...firestore.docs.entries()][0];
  assert.ok(!id.slice('qlp/'.length).includes('/'), 'Firestore の文書IDに / を含めない');
  assert.equal(doc.expireAt, undefined, '分解結果は消さずに残す（期限を付けない）');
  assert.equal((await readResult(store, keyParts, T0 + 1000)).result.packets[0].questionNumber, 1);
  assert.deepEqual(new Uint8Array(await readFigure(store, keyParts.questionSha256, '0.5.0', 'q1.png')), PNG);
});

test('無いキーは null を返し、削除できる', async () => {
  const { store } = make();
  assert.equal(await store.get('ses/x', 'json'), null);
  assert.equal(await store.get('fig/x/y/z.png', 'arrayBuffer'), null);
  await store.put('ses/x', '{"a":1}', { expirationTtl: 60 });
  assert.deepEqual(await store.get('ses/x', 'json'), { a: 1 });
  await store.delete('ses/x');
  assert.equal(await store.get('ses/x'), null);
});

test('バケット名が無いときは起動しない', () => {
  assert.throws(() => new GcpStore({}), /FIGURE_BUCKET_REQUIRED/);
});

test('Cloud Run の入口が起動し、トークンの無い呼び出しを断る', async () => {
  const port = 18000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/server.js', import.meta.url))], { env: { ...process.env, PORT: String(port), FIGURE_BUCKET: 'figs', API_TOKEN: 't' }, stdio: 'ignore' });
  try {
    let res;
    for (let i = 0; i < 50 && !res; i += 1) {
      res = await fetch(`http://127.0.0.1:${port}/v1/sessions`, { method: 'POST', body: '{}' }).catch(() => null);
      if (!res) await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: 'UNAUTHORIZED', hint: 'no_authorization_header' });
  } finally {
    child.kill();
  }
});
