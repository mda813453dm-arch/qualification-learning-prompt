// v200：解答表示後の「問題分野を選択」（全資格共通）。
// エンジンは免除後の正式分野と出題できる問題の有無（fieldJump）を応答に付けるだけで、出題・採点は既存の分野指定
// nextQuestion({fieldName}) が行う。先取りした次問・必須補強・確認問題の途中・問題の無い分野を回帰で確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/store.js';
import { handle } from '../src/app.js';
import { CATALOG } from '../src/catalog.js';
import { SRC, T0, pdf, fakeWeb, fakeParser, assetsB64 } from './helpers.js';
import { WIDGET_URI, WIDGET_VERSION, widgetHtml } from '../src/widget-current.js';
import { widgetHtml as v199Html } from '../src/widget-v199.js';

const TOKEN = 'field-jump-regression';
const SOURCE = { adapter:SRC.adapter, year:SRC.year, section:SRC.section, questionUrl:SRC.questionUrl, answerUrl:SRC.answerUrl };
const S1 = '測量に関する法規', S2 = '多角測量';

function setup(fieldIds = ['s1','s2','s2'], answers = [3,1,4]) {
  CATALOG.surveyor.sources = [SOURCE];
  const web = fakeWeb({ [SRC.questionUrl]:pdf('jump-question'), [SRC.answerUrl]:pdf('jump-answer') });
  const parse = fakeParser(web, { src:{ ...SRC, qualificationId:'q063' }, fieldIds, answers, figureOn:[] });
  const env = { STORE:new MemoryStore(), API_TOKEN:TOKEN, PARSER_URL:'https://parser.example', now:T0,
    fetchPdf:web.fetchPdf, fetchText:async()=>'' };
  env.clock = () => env.now;
  env.parserFetch = async (url, init) => {
    const b = JSON.parse(init.body);
    const decode = x => Uint8Array.from(atob(x.base64), ch => ch.charCodeAt(0));
    const result = await parse({ question:{bytes:decode(b.question)}, answer:{bytes:decode(b.answer)} });
    return new Response(JSON.stringify({ result:result.result, assets:assetsB64(result.assets) }));
  };
  const call = async (method, path, value) => {
    const resp = await handle(new Request('https://engine.example' + path, { method,
      headers:{ authorization:'Bearer ' + TOKEN, 'content-type':'application/json', 'x-qlp-host-chat':'e'.repeat(64) },
      body:value === undefined ? undefined : JSON.stringify(value) }), env);
    return { status:resp.status, body:await resp.json() };
  };
  return { env, call };
}
async function begin(call) {
  const s = await call('POST', '/v1/sessions', { qualificationId:'測量士補', sources:[SOURCE] });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  return s.body.sessionId;
}
const names = (fj) => fj.choices.map((c) => c.fieldName);
const avail = (fj, n) => fj.choices.find((c) => c.fieldName === n)?.available;

test('出題・採点・分からないの応答に、正式分野の一覧と出題できるかを付ける（スキップには付けない）', async () => {
  const { call } = setup(), sid = await begin(call);
  const first = await call('POST', `/v1/sessions/${sid}/next`, { fieldName:S1 });
  assert.equal(first.body.status, 'question');
  const q = first.body.question, fj = q.fieldJump;
  assert.ok(fj, '問題の応答に fieldJump');
  assert.deepEqual(names(fj), Object.values(CATALOG.surveyor.fields), '資格台帳の正式分野名・計画順のまま');
  assert.equal(avail(fj, S1), true); assert.equal(avail(fj, S2), true);
  assert.equal(avail(fj, '写真測量'), false, '問題の無い分野はその旨を付ける');
  assert.equal(fj.gradedQuestionId, q.questionId);
  const graded = await call('POST', `/v1/sessions/${sid}/answer`, { questionId:q.questionId, value:'3' });
  assert.equal(graded.status, 200);
  assert.equal(graded.body.grade.fieldJump.gradedQuestionId, q.questionId, '採点の応答に採点した問の番号');
  assert.deepEqual(names(graded.body.grade.fieldJump), names(fj));
  const q2 = graded.body.next.question;
  const dk = await call('POST', `/v1/sessions/${sid}/answer`, { questionId:q2.questionId, value:'分からない' });
  assert.equal(dk.body.grade.dontKnow, true);
  assert.equal(dk.body.grade.fieldJump.gradedQuestionId, q2.questionId, '分からないの結果にも付ける');
  const q3 = dk.body.next.question;
  const sk = await call('POST', `/v1/sessions/${sid}/answer`, { questionId:q3.questionId, value:'スキップ' });
  if (sk.body.grade?.skipped) assert.equal(sk.body.grade.fieldJump, undefined, 'スキップは自動で次へ進むので付けない');
});

test('採点後に別分野・同分野へ移動できる。先取りした次問を使い回さず、選んだ分野の問だけを返す', async () => {
  const { env, call } = setup(['s1','s1','s2']), sid = await begin(call);
  const q = (await call('POST', `/v1/sessions/${sid}/next`, { fieldName:S1 })).body.question;
  const g = await call('POST', `/v1/sessions/${sid}/answer`, { questionId:q.questionId, value:'1' });
  const prefetched = g.body.next.question;
  assert.ok([S1, S2].includes(prefetched.fieldName));
  // 先取りした次問と違う分野を選ぶ（先取りの問を使い回していないことを確かめる）
  const target = prefetched.fieldName === S1 ? S2 : S1;
  const before = JSON.parse(await env.STORE.get('ses/' + sid)).state.history;
  const other = await call('POST', `/v1/sessions/${sid}/next`, { fieldName:target });
  assert.equal(other.body.status, 'question', JSON.stringify(other.body));
  assert.equal(other.body.question.fieldName, target, '別分野へ直接');
  assert.notEqual(other.body.question.questionId, prefetched.questionId, '先取りの次問を出さない');
  assert.notEqual(other.body.question.questionId, q.questionId);
  assert.equal(other.body.question.kind, 'new', '未出題を優先');
  const after = JSON.parse(await env.STORE.get('ses/' + sid)).state.history;
  assert.deepEqual(after, before, '分野の移動では採点の記録を変えない');
  // 同じ分野への移動：回答してから S2 → S1
  const g2 = await call('POST', `/v1/sessions/${sid}/answer`, { questionId:other.body.question.questionId, value:'4' });
  assert.equal(g2.status, 200);
  // 同じ分野を選び直す：その分野の未出題があればそれ、無ければ再出題（採点した問以外を優先）
  const same = await call('POST', `/v1/sessions/${sid}/next`, { fieldName:target });
  assert.equal(same.body.status, 'question', JSON.stringify(same.body));
  assert.equal(same.body.question.fieldName, target, '同じ分野への移動');
});

test('全問回答済みの分野は既存の再出題（review）、問題の無い分野は fieldExhausted で他分野へ切り替えない', async () => {
  const { env, call } = setup(['s1','s2','s2']), sid = await begin(call);
  const q = (await call('POST', `/v1/sessions/${sid}/next`, { fieldName:S1 })).body.question;
  const g = await call('POST', `/v1/sessions/${sid}/answer`, { questionId:q.questionId, value:'3' });
  const stored = await env.STORE.get('ses/' + sid);
  const none = await call('POST', `/v1/sessions/${sid}/next`, { fieldName:'写真測量' });
  assert.equal(none.status, 200);
  assert.equal(none.body.status, 'fieldExhausted');
  assert.match(none.body.notice, /出題可能な公式過去問がありません/);
  assert.equal(none.body.question, undefined, '別の分野の問を出さない');
  assert.equal(await env.STORE.get('ses/' + sid), stored, '問題の無い分野を選んでも学習状態は変えない');
  const again = await call('POST', `/v1/sessions/${sid}/next`, {});
  assert.equal(again.body.question.questionId, g.body.next.question.questionId, 'その後の通常の次問は先取りのまま');
  await call('POST', `/v1/sessions/${sid}/answer`, { questionId:again.body.question.questionId, value:'1' });
  const recycled = await call('POST', `/v1/sessions/${sid}/next`, { fieldName:S1 });
  assert.equal(recycled.body.status, 'question');
  assert.equal(recycled.body.question.fieldName, S1);
  assert.equal(recycled.body.question.kind, 'review', '全問回答済みは再出題');
  const fj = recycled.body.question.fieldJump;
  assert.equal(avail(fj, S1), true, '回答済みでも再出題できるので選べる');
});

test('免除を確認した学習では免除分野を一覧に出さず、指定しても400で拒否する', async () => {
  const saved = CATALOG.surveyor.exemption;
  CATALOG.surveyor.exemption = { label:'テスト用の免除', numbers:[], excludeFields:['s2'] };
  try {
    const { env, call } = setup(['s1','s1','s3']), sid = await begin(call);
    const path = 'ses/' + sid, stored = JSON.parse(await env.STORE.get(path));
    stored.state.exemption = 'confirmed';
    await env.STORE.put(path, JSON.stringify(stored));
    const q = (await call('POST', `/v1/sessions/${sid}/next`, { fieldName:S1 })).body.question;
    assert.ok(!names(q.fieldJump).includes(S2), '免除分野は出さない');
    assert.ok(names(q.fieldJump).includes(S1));
    const rejected = await call('POST', `/v1/sessions/${sid}/next`, { fieldName:S2 });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.error, 'FIELD_INVALID');
  } finally { CATALOG.surveyor.exemption = saved; }
});

test('必須補強中・確認問題の途中は分野指定で迂回できない', async () => {
  const { env, call } = setup(['s1','s1','s2']), sid = await begin(call);
  const q = (await call('POST', `/v1/sessions/${sid}/next`, { fieldName:S1 })).body.question;
  await call('POST', `/v1/sessions/${sid}/answer`, { questionId:q.questionId, value:'1' });
  const path = 'ses/' + sid, saved = JSON.parse(await env.STORE.get(path));
  // 実際の3連続誤答では先取りせずに補強へ入る（current は採点した問のまま）
  saved.state.current = { ...saved.state.current, questionId:q.questionId, grade:saved.state.lastGrade ?? { questionId:q.questionId }, prefetched:false };
  saved.state.remediation = { required:true, fieldId:'s1', triggerQuestionId:q.questionId };
  await env.STORE.put(path, JSON.stringify(saved));
  const blocked = await call('POST', `/v1/sessions/${sid}/next`, { fieldName:S2 });
  assert.equal(blocked.body.status, 'remediation', '必須補強を迂回しない');
  saved.state.remediation = null;
  saved.state.confirmation = { fieldId:'s1', count:1, correct:1, challenge:null };
  await env.STORE.put(path, JSON.stringify(saved));
  const mid = await call('POST', `/v1/sessions/${sid}/next`, { fieldName:S2 });
  assert.equal(mid.body.status, 'confirmation_pending', '確認問題の途中を迂回しない');
});

test('復元（採点済み画面）・照合画面・AI解説の後のメニュー・確認問題3問完了に同じ一覧を付ける', async () => {
  const { call } = setup(['s1','s1','s2']), sid = await begin(call);
  const q = (await call('POST', `/v1/sessions/${sid}/next`, { fieldName:S1 })).body.question;
  await call('POST', `/v1/sessions/${sid}/answer`, { questionId:q.questionId, value:'3' });
  const restored = await call('GET', `/v1/sessions/${sid}/restore`);
  assert.equal(restored.body.status, 'restoredGrade');
  assert.equal(restored.body.grade.fieldJump.gradedQuestionId, q.questionId, '復元した採点画面にも付ける');
  const ctx = await call('GET', `/v1/sessions/${sid}/explanation`);
  assert.equal(ctx.body.status, 'explanationContext');
  assert.equal(ctx.body.fieldJump.gradedQuestionId, q.questionId);
  assert.equal(ctx.body.grade.fieldJump, undefined, 'AIに渡す採点記録には混ぜない');
  const body = '## 詳しい解説\n' + '測量法の条文に基づき、各選択肢の正誤を順に確認します。'.repeat(6);
  const pub = await call('POST', `/v1/explanation-ref/${ctx.body.explanationRef}/publish`, { body });
  assert.equal(pub.status, 200, JSON.stringify(pub.body));
  assert.equal(pub.body.menu.fieldJump.gradedQuestionId, q.questionId, 'AI解説の後の操作にも付ける');
  const snap = await call('GET', `/v1/sessions/${sid}/restore`);
  assert.equal(snap.body.status, 'menu');
  assert.ok(snap.body.menu.fieldJump, '解説後の画面を復元しても一覧が残る');
  // 確認問題3問
  const item = await call('POST', `/v1/sessions/${sid}/item`, { fieldName:S2, mode:'check' });
  assert.equal(item.status, 200);
  let last;
  for (let n = 1; n <= 3; n++) {
    const reg = await call('POST', `/v1/sessions/${sid}/confirmation/register`, { question:'TEST ONLY 確認問題 ' + n + ' の正しい選択肢は？',
      choices:['一', '二', '三'], correctAnswer:2, explanation:'テスト用の固定された正答です。' });
    assert.equal(reg.status, 200, JSON.stringify(reg.body));
    last = await call('POST', `/v1/sessions/${sid}/confirmation/answer`, { challengeId:reg.body.challengeId, selected:'2' });
    if (n < 3) assert.equal(last.body.fieldJump, undefined, '確認問題1〜2問目には付けない');
  }
  assert.equal(last.body.complete, true);
  assert.deepEqual(names(last.body.fieldJump), Object.values(CATALOG.surveyor.fields), '3問完了の画面に付ける');
  assert.equal(last.body.fieldJump.gradedQuestionId, undefined);
  const restoredDone = await call('GET', `/v1/sessions/${sid}/restore`);
  assert.equal(restoredDone.body.status, 'confirmation_result');
  assert.ok(restoredDone.body.fieldJump, '3問完了の画面を復元しても付ける');
  // 画面の手順どおり：実践問題の状態にしてから選んだ分野へ
  const prac = await call('POST', `/v1/sessions/${sid}/item`, { fieldName:S1, mode:'practice' });
  assert.equal(prac.status, 200);
  const moved = await call('POST', `/v1/sessions/${sid}/next`, { fieldName:S1 });
  assert.equal(moved.body.status, 'question', JSON.stringify(moved.body));
  assert.equal(moved.body.question.fieldName, S1);
});

test('学習画面 v200：採点・分からない・照合・解説後・確認問題完了に選択欄を出し、v199 の HTML は変えない', () => {
  assert.equal(WIDGET_URI, 'ui://qlp/question-v200.html');
  assert.equal(WIDGET_VERSION, '2026-11-18.200');
  const html = widgetHtml();
  assert.match(html, /qlp-field-jump-v200/);
  assert.match(html, /<option value="" selected>分野を選択してください<\/option>/, '初期は未選択');
  assert.match(html, /この分野の問題へ/);
  assert.match(html, /（出題できる問題がありません）/);
  assert.match(html, /callTool\('nextQuestion', \{ sessionId: sid, fieldName: choice\.fieldName \}\)/, '正式分野名で nextQuestion');
  assert.match(html, /callTool\('getStudySnapshot', \{ sessionId: sid \}\)/, '押す前に保存状態を確認');
  assert.doesNotMatch(html.slice(html.indexOf('function bindFieldJump'), html.indexOf('function showGrade(g)')), /state\.next \|\||startSession/,
    '先取りの次問・新しい学習を使わない');
  assert.equal((html.match(/fieldJumpHtml\(/g) || []).length, 6, '定義＋5画面');
  assert.equal((html.match(/bindFieldJump\(/g) || []).length, 6, '定義＋5画面');
  // 必須補強の分岐（checkSuggested）には出さない
  const mandatory = html.slice(html.indexOf('if (g.checkSuggested) {\n      app.innerHTML'), html.indexOf('var nextInPlace'));
  assert.doesNotMatch(mandatory, /fieldJump/, '必須補強の画面には出さない');
  const old = v199Html();
  assert.doesNotMatch(old, /fieldJump|qlp-field-jump-v200/);
  assert.match(old, /2026-11-17\.199/);
});

test('区分を付けた直接指定は、その区分の問がまだ取り込まれていない間も別区分の同じ番号で代用しない（公開後検査で見つかった準備中の競合）', async () => {
  const { findWanted, newState } = await import('../src/engine.js');
  const state = newState({ qualificationId: 'q999', now: 0 });
  const pk = (section, n) => ({ packet: { questionId: `fe:2023:${section}:${n}`, year: 2023, section, questionNumber: n, fieldId: 'f1' } });
  const onlyA = [pk('科目A', 1), pk('科目A', 2)];
  assert.equal(findWanted(state, onlyA, '2023年度 科目B 問1', {}), null, '科目Bが未取り込みなら null（準備中として待つ）');
  assert.equal(findWanted(state, [...onlyA, pk('科目B', 1)], '2023年度 科目B 問1', {}).item.packet.section, '科目B');
  assert.equal(findWanted(state, onlyA, '2023年度 問1', {}).item.packet.section, '科目A', '区分を書かない指定は従来どおり');
  assert.equal(findWanted(state, [pk('春期', 80)], '2023年度 秋期 問80', {}), null);
});
