import test from 'node:test';
import assert from 'node:assert/strict';
import { publicOrigin } from '../src/public-origin.js';

test('Cloud Run public URL must be HTTPS even when Node receives internal HTTP', () => {
  assert.equal(publicOrigin({host:'qlp-engine-774945236720.asia-northeast1.run.app'}),
    'https://qlp-engine-774945236720.asia-northeast1.run.app');
  assert.equal(publicOrigin({host:'qlp-engine-ojsw3j46qa-an.a.run.app'}),
    'https://qlp-engine-ojsw3j46qa-an.a.run.app');
  assert.equal(publicOrigin({host:'localhost:8080'}),'http://localhost:8080');
  assert.equal(publicOrigin({host:'evil.example'}),null);
  assert.equal(publicOrigin({host:'qlp-engine.run.app.evil.com'}),null);
  assert.equal(publicOrigin({host:'qlp-engine.run.app@evil.com'}),null);
  assert.equal(publicOrigin({host:'qlp-engine.run.app', 'x-forwarded-proto':'http'}),
    'https://qlp-engine.run.app');
  assert.equal(publicOrigin({host:'qlp-engine.run.app'},'https://safe.example'),
    'https://safe.example');
});
