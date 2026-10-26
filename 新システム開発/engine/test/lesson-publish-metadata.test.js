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
  assert.ok(lesson);
  assert.ok(first);
  assert.deepEqual(lesson._meta.ui.visibility, ['model', 'app']);
  assert.equal(lesson._meta.ui.resourceUri, undefined);
  assert.equal(lesson._meta['openai/outputTemplate'], undefined);
  assert.equal(first._meta.ui.resourceUri, WIDGET_URI);
  assert.equal(first._meta['openai/outputTemplate'], WIDGET_URI);
  assert.match(lesson.description, /showMenu/);
});
