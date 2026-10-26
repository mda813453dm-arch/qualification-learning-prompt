import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRpc } from '../src/mcp.js';
import { WIDGET_URI } from '../src/widget.js';

test('AI explanation publication does not mount a second study widget', async () => {
  const result = await handleRpc(
    { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
    async () => { throw new Error('tools/list must not call Cloud Run API'); },
    { widget: true, baseUrl: 'https://example.invalid' }
  );
  const tools = result.result.tools;
  const lesson = tools.find(t => t.name === 'showMenu');
  const first = tools.find(t => t.name === 'startSession');
  const restored = tools.find(t => t.name === 'restoreStudyView');
  const handoff = tools.find(t => t.name === 'openHandoffView');
  const importer = tools.find(t => t.name === 'importHandoff');
  assert.ok(lesson);
  assert.ok(first);
  assert.ok(restored);
  assert.ok(handoff);
  assert.ok(importer);
  assert.match(importer.description, /openHandoffView/);
  assert.doesNotMatch(importer.description, /sessionIdでrestoreStudyView/);
  assert.deepEqual(lesson._meta.ui.visibility, ['model', 'app']);
  assert.equal(lesson._meta.ui.resourceUri, undefined);
  assert.equal(lesson._meta['openai/outputTemplate'], undefined);
  assert.equal(first._meta.ui.resourceUri, WIDGET_URI);
  assert.equal(first._meta['openai/outputTemplate'], WIDGET_URI);
  // Ordinary restoration must never add a second embedded frame.
  assert.deepEqual(restored._meta.ui.visibility, ['model', 'app']);
  assert.equal(restored._meta.ui.resourceUri, undefined);
  assert.equal(restored._meta['openai/outputTemplate'], undefined);
  // A handoff into a new conversation is the only explicit restoration
  // operation allowed to mount a widget.
  assert.equal(handoff._meta.ui.resourceUri, WIDGET_URI);
  assert.equal(handoff._meta['openai/outputTemplate'], WIDGET_URI);
  assert.match(lesson.description, /showMenu/);
});
