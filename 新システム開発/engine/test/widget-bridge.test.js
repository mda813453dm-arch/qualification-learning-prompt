import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { widgetHtml, WIDGET_VERSION } from '../src/widget.js';
import { handleRpc } from '../src/mcp.js';

// UI host simulator: deliberately rejects the MCP-server version at ui/initialize.
// No browser dependencies; exercises the generated script, not its source strings.
function host(openai) {
  const sent = [], listeners = {}, timers = new Map();
  let timerId = 0;
  const app = { innerHTML: '資格学習', querySelectorAll: () => [], insertAdjacentHTML: (_, s) => { app.innerHTML += s; } };
  const parent = { postMessage: (message) => sent.push(message) };
  const window = { parent, openai, innerWidth: 375, addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); } };
  const context = vm.createContext({ window, document: { getElementById: () => app, documentElement: { scrollHeight: 180 } },
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: (id) => timers.delete(id) });
  vm.runInContext(widgetHtml().match(/<script>([\s\S]*?)<\/script>/)[1], context);
  const emit = (data, source = parent) => listeners.message.forEach((fn) => fn({ source, data }));
  return { app, sent, timers, window, emit, globals: () => listeners['openai:set_globals'].forEach((fn) => fn()),
    accept: async () => {
      const init = sent.find((m) => m.method === 'ui/initialize');
      assert.equal(init.params.protocolVersion, '2026-01-26');
      emit({ jsonrpc: '2.0', id: init.id, result: { protocolVersion: '2026-01-26', hostCapabilities: {} } });
      await new Promise(setImmediate);
    } };
}
const menuResult = { structuredContent: { status: 'menu' }, _meta: { qlp: { menu: { prompt: '学習を開始しますか？', choices: ['始めます'] } } } };

test('UIは正しいバージョンで初期化し、initializedより前に診断・高さ通知を送らない', async () => {
  const h = host();
  assert.deepEqual(h.sent.map((m) => m.method), ['ui/initialize']);
  await h.accept();
  assert.equal(h.sent[1].method, 'ui/notifications/initialized');
  const diag = h.sent.find((m) => m.method === 'tools/call');
  assert.equal(diag.params.name, 'reportUiEvent');
  assert.equal(diag.params.arguments.version, WIDGET_VERSION);
  h.emit({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: menuResult });
  assert.match(h.app.innerHTML, /始めます/);
});

test('openai.toolOutputが空・要約だけでも標準UI初期化を省略しない', async () => {
  const h = host({ toolOutput: { status: 'needPlan' } });
  assert.equal(h.sent[0].method, 'ui/initialize');
  await h.accept();
  h.emit({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { _meta: { qlp: { onboarding: [{ kind: 'status', prompt: '現在の学習状況', choices: ['未着手', '基礎学習中', '応用学習中', '過去問演習中'] }] } } } });
  assert.match(h.app.innerHTML, /過去問演習中/);
  assert.doesNotMatch(h.app.innerHTML, /まだ分からない/);
});

test('旧ブリッジのメタデータが遅れて届いても表示し、標準の通知も受信する', async () => {
  const openai = { toolOutput: { status: 'menu' }, callTool: async () => ({ structuredContent: { status: 'recorded' } }) };
  const h = host(openai);
  openai.toolResponseMetadata = menuResult._meta;
  h.globals();
  assert.match(h.app.innerHTML, /始めます/);
  await h.accept();
  h.emit({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { _meta: { qlp: { menu: { prompt: '次は？', choices: ['次の問題へ'] } } } } });
  h.globals(); // old globals must not overwrite a standard result
  assert.match(h.app.innerHTML, /次の問題へ/);
});

test('無応答は有限時間で案内に変わり、後から結果が来れば復帰する', async () => {
  const h = host();
  [...h.timers.values()].find((t) => t.ms === 5000).fn();
  await new Promise(setImmediate);
  assert.match(h.app.innerHTML, /接続を確認できません/);
  h.emit({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: menuResult });
  assert.match(h.app.innerHTML, /始めます/);
  [...h.timers.values()].find((t) => t.ms === 10000).fn();
  assert.match(h.app.innerHTML, /始めます/);
});

test('別フレームからの結果は採用しない', async () => {
  const h = host();
  await h.accept();
  h.emit({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: menuResult }, {});
  assert.doesNotMatch(h.app.innerHTML, /始めます/);
});

test('診断は画面専用・テンプレートなし。スキーマどおりの値だけ受け付ける', async () => {
  const api = () => { throw new Error('診断から学習APIを呼ばない'); };
  const req = (method, params, widget = true) => handleRpc({ jsonrpc: '2.0', id: 1, method, params }, api, { widget });
  const tool = (await req('tools/list')).result.tools.find((t) => t.name === 'reportUiEvent');
  assert.deepEqual(tool._meta.ui.visibility, ['app']);
  assert.equal(tool._meta['openai/outputTemplate'], undefined);
  const args = { stage: 'bridge_ready', version: WIDGET_VERSION };
  const r = (await req('tools/call', { name: tool.name, arguments: args })).result;
  assert.deepEqual(r, { content: [], structuredContent: { status: 'recorded' } });
  assert.equal((await req('tools/call', { name: tool.name, arguments: { ...args, stage: 'secret' } })).result.isError, true);
  assert.equal((await req('tools/call', { name: tool.name, arguments: { ...args, accessCode: 'secret' } })).result.isError, true);
  assert.equal((await req('tools/call', { name: tool.name, arguments: args }, false)).error.code, -32602);
});
