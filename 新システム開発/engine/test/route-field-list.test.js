// v201: The global field route is a names-only ordered list, not a completion rate.
// The existing per-field practical-question progress remains unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { WIDGET_URI, WIDGET_VERSION, widgetHtml } from '../src/widget-v201.js';
import { widgetHtml as v200Html, WIDGET_URI as V200_URI } from '../src/widget-v200.js';

const render = (data, index, total, name) => {
  const html = widgetHtml();
  const a = html.indexOf('  var routeFieldNames = null, routeFieldSession = null;');
  const b = html.indexOf('\n  function localBar(', a);
  assert.ok(a >= 0 && b > a, 'the active resource contains the new route renderer');
  const sandbox = { data, index, total, name,
    esc: (v) => String(v).replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]) };
  return runInNewContext(html.slice(a, b) +
    '\ncaptureRouteFields(data); journeyBar(index, total, "practice", name);', sandbox);
};

test('v201 route lists every official field in plan order, only active field bold, without global bar', () => {
  assert.equal(WIDGET_URI, 'ui://qlp/question-v201.html');
  assert.equal(WIDGET_VERSION, '2026-11-19.201');
  const names = ['宅建業法','法令上の制限','権利と権利の変動','税・その他'];
  const output = render({ sessionId:'s1', question:{progress:{fieldNames:names}} },3,4,names[2]);
  assert.equal((output.match(/<span class="qlp-route-item"/g) || []).length, 4);
  assert.equal((output.match(/<strong>/g) || []).length, 1);
  assert.match(output, /<strong>権利と権利の変動<\/strong>/);
  assert.doesNotMatch(output, /progress-track|role="progressbar"|3 \/ 4分野|習得率/);
  const order = names.map((n) => output.indexOf(n));
  assert.deepEqual(order, [...order].sort((a,b)=>a-b));
  assert.match(output, /aria-current="step"/);
});

test('route respects exempt and reordered fields; no fabricated field for an old response', () => {
  const only = ['測量に関する法規','地図編集','公共測量'];
  const output = render({ sessionId:'s2', journey:{fieldNames:only} },2,3,only[1]);
  assert.ok(!output.includes('多角測量'), 'exempt/unselected fields are not fabricated');
  assert.match(output, /<strong>地図編集<\/strong>/);
  const fallback = render({sessionId:'s3'},2,3,'今の分野');
  assert.match(fallback, /<strong>今の分野<\/strong>/);
  assert.equal((fallback.match(/qlp-route-item/g) || []).length, 0);
});

test('field-jump names can restore route order in graded results', () => {
  const names = ['分野B','分野A','分野C'];
  const output = render({ sessionId:'s4', grade:{fieldJump:{choices:names.map(fieldName => ({fieldName,available:true}))}} },2,3,'分野A');
  assert.match(output, /<strong>分野A<\/strong>/);
  assert.ok(output.indexOf('分野B') < output.indexOf('分野A'));
});

test('the per-field question progress remains, v200 HTML is unchanged and compatibility metadata is present', () => {
  const html = widgetHtml();
  assert.match(html, /qlp-route-v201/);
  const local = html.slice(html.indexOf('  function localBar('), html.indexOf('  // 1セッション1固定枠'));
  assert.match(local, /progress-track/);
  const old = v200Html();
  assert.equal(V200_URI, 'ui://qlp/question-v200.html');
  assert.doesNotMatch(old, /qlp-route-v201|captureRouteFields/);
  assert.match(old, /全分野の学習ルートの位置/);
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /fieldNames: fields\.map\(\(fid\) => cat\.fields\[fid\]\)/);
  const mcp = readFileSync(new URL('../src/mcp.js', import.meta.url), 'utf8');
  for(const s of ['stable200Html','question-v200.html','2026-11-18.200']) assert.ok(mcp.includes(s));
});
