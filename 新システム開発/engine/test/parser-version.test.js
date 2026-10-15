// エンジンが受け付ける分解結果の版と、パーサーの版が一致すること（ずれると本番で全ての分解結果を受け付けなくなる）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_PARSER_VERSION } from '../src/app.js';

test('エンジンの既定の版はパーサーの PARSER_VERSION と同じ', () => {
  const py = readFileSync(new URL('../../parser/qlp_parser/__init__.py', import.meta.url), 'utf8');
  assert.equal(/PARSER_VERSION = "([^"]+)"/.exec(py)[1], DEFAULT_PARSER_VERSION);
});
