import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { widgetHtml, WIDGET_URI, WIDGET_VERSION } from '../src/widget.js';

const html = widgetHtml();
const embedded = html.split('<script>')[1]?.split('</script>')[0];
test('v124 embeds syntactically valid study widget and retains single scroll surface', () => {
  assert.equal(WIDGET_VERSION, '2026-10-28.124');
  assert.equal(WIDGET_URI, 'ui://qlp/question-v124.html');
  assert.ok(embedded, 'widget script must be present');
  assert.doesNotThrow(() => new vm.Script(embedded));
  assert.match(html, /height:auto;max-height:none;overflow:visible/);
  assert.match(embedded, /getStudySnapshot/);
  assert.doesNotMatch(embedded, /callTool\('restoreStudyView'/);
  assert.match(embedded, /lessonPollDelays/);
  assert.match(embedded, /lessonPollGeneration/);
  assert.match(embedded, /preparedGuideHtml/);
  assert.match(embedded, /registerPreparedConfirmation/);
  assert.match(embedded, /quickGuideCheck/);
  assert.match(embedded, /preparedLessons\[data.fieldName\]/);
  assert.match(embedded, /publishManualLesson/);
  assert.match(embedded, /callTool\('showMenu', args\)/);
  assert.match(embedded, /manualLessonBody/);
  assert.match(embedded, /confirmationPollGeneration/);
  assert.match(embedded, /checkPublished/);
  assert.match(embedded, /quickGuidePractice/);
  assert.match(embedded, /lessonPracticeDirect/);
  assert.match(embedded, /lessonMenuPractice/);
  assert.match(embedded, /openPracticeAfterLesson/);
  assert.match(embedded, /mode:'practice'/);
  assert.match(embedded, /callTool\('nextQuestion'/);

});

// Evaluate the actual ownership code with two independent widget frames and
// shared browser storage/broadcast, rather than substituting a copied algorithm.
const begin = embedded.indexOf('  var myAt = 0, locked = false, bc = null;');
const end = embedded.indexOf('  var renderFocusTurn = 0;', begin);
assert.ok(begin >= 0 && end > begin, 'first-frame ownership code must be extractable');
const ownershipCode = embedded.slice(begin, end) +
  '\n;globalThis.__frame = { stamp, claimFirstFrame, releaseOwnedSession, get locked(){return locked}, get frameId(){return frameId}, get followerSession(){return followerSession}, get ownedSession(){return ownedSession} };';

function browserFixture() {
  let clock = 100000, serial = 0;
  const values = new Map(), frames = [], channels = [], tasks = [];
  function makeFrame() {
    const num = ++serial, listeners = new Map(), intervals = [], restores = [];
    const classNames = new Set();
    const app = {
      style: {}, innerHTML: '',
      classList: { add: x => classNames.add(x), remove: x => classNames.delete(x) }
    };
    const win = {
      addEventListener: (name, callback) => listeners.set(name, callback)
    };
    const store = {
      getItem: k => values.has(k) ? values.get(k) : null,
      setItem: (k, v) => {
        const previous = values.has(k) ? values.get(k) : null;
        values.set(k, String(v));
        for (const f of frames) if (f.num !== num && f.listeners.get('storage'))
          f.listeners.get('storage')({ key: k, oldValue: previous, newValue: String(v) });
      },
      removeItem: k => {
        values.delete(k);
        for (const f of frames) if (f.num !== num && f.listeners.get('storage'))
          f.listeners.get('storage')({ key: k, newValue: null });
      }
    };
    class Broadcast {
      constructor(name) { this.name = name; channels.push(this); }
      postMessage(msg) {
        for (const c of channels) if (c !== this && c.name === this.name)
          c.onmessage?.({ data: msg });
      }
    }
    const context = {
      app, state: { sessionId: null }, descriptiveScreen: null, window: win,
      document: { getElementById: () => ({ onclick: null }) },
      input: () => ({}), fit: () => {}, restoring: false,
      restoreFromServer: async (manual) => { restores.push(manual); },
      localStorage: store, BroadcastChannel: Broadcast,
      setInterval: callback => intervals.push(callback),
      setTimeout: (callback, delay) => { if (delay === 2000) intervals.push(callback); else tasks.push(callback); return tasks.length; },
      Date: { now: () => clock },
      Math: Object.assign(Object.create(Math), { random: () => num / 100 }),
      encodeURIComponent, JSON, Number, String, Object, Error
    };
    vm.runInNewContext(ownershipCode, context);
    const frame = { num, listeners, intervals, restores, ...context.__frame, context, app };
    Object.defineProperty(frame, 'locked', { get: () => context.__frame.locked });
    Object.defineProperty(frame, 'ownedSession', { get: () => context.__frame.ownedSession });
    Object.defineProperty(frame, 'followerSession', { get: () => context.__frame.followerSession });
    frames.push(frame);
    return frame;
  }
  function flush() {
    for (let count = 0; tasks.length && count < 30; count++) tasks.shift()();
    assert.equal(tasks.length, 0, 'refresh must be bounded');
  }
  return { makeFrame, flush, advance: ms => { clock += ms; }, values };
}

test('newly published AI lesson is visible in the receiving frame even if the original iframe is suspended', () => {
  const b = browserFixture(), first = b.makeFrame(), second = b.makeFrame();
  first.stamp({ sessionId:'study-A', at:1 });
  second.stamp({ sessionId:'study-A', status:'menu',
    menu:{kind:'lesson',body:'## 法律の基礎\\n\\n権利と義務の区別を確認します。'},at:2 });
  assert.equal(second.locked,false,'new lesson should not be hidden behind a stale first frame');
  assert.equal(second.ownedSession,'study-A');
  assert.equal(first.locked,true,'old frame cannot accept competing answers');
});

test('first frame stays active, duplicate frame relays the update', () => {
  const b = browserFixture(), first = b.makeFrame(), second = b.makeFrame();
  first.stamp({ sessionId: 'study-A', at: 1 });
  second.stamp({ sessionId: 'study-A', at: 2 });
  assert.equal(first.locked, false);
  assert.equal(second.locked, true);
  assert.match(second.app.innerHTML, /最初の枠で更新/);
  b.flush();
  assert.deepEqual(first.restores, [false]);
  assert.deepEqual(second.restores, []);
});

test('repeated duplicate notifications coalesce into one restoration', () => {
  const b = browserFixture(), first = b.makeFrame(), second = b.makeFrame();
  first.stamp({ sessionId: 'study-A', at: 1 });
  second.stamp({ sessionId: 'study-A', at: 2 });
  second.stamp({ sessionId: 'study-A', at: 3 });
  b.flush();
  assert.equal(first.restores.length, 1);
});

test('separate learning sessions never share a pinned frame', () => {
  const b = browserFixture(), a = b.makeFrame(), other = b.makeFrame();
  a.stamp({ sessionId: 'takken', at: 1 });
  other.stamp({ sessionId: 'nurse', at: 2 });
  b.flush();
  assert.equal(a.locked, false);
  assert.equal(other.locked, false);
  assert.equal(a.ownedSession, 'takken');
  assert.equal(other.ownedSession, 'nurse');
});

test('expired first frame lease safely fails over to the remaining frame', () => {
  const b = browserFixture(), first = b.makeFrame(), follower = b.makeFrame();
  first.stamp({ sessionId: 'study-A', at: 1 });
  follower.stamp({ sessionId: 'study-A', at: 2 });
  b.flush();
  b.advance(20000);
  follower.intervals.forEach(f => f());
  assert.equal(follower.locked, false);
  assert.equal(follower.ownedSession, 'study-A');
  assert.deepEqual(follower.restores, [false]);
  assert.equal(first.locked, true);
});

test('explicit recovery can transfer ownership without merging other sessions', () => {
  const b = browserFixture(), first = b.makeFrame(), fallback = b.makeFrame();
  first.stamp({ sessionId: 'study-A', at: 1 });
  fallback.stamp({ sessionId: 'study-A', at: 2 });
  assert.equal(fallback.claimFirstFrame('study-A', true), true);
  assert.equal(first.locked, true);
  assert.equal(fallback.ownedSession, 'study-A');
});
