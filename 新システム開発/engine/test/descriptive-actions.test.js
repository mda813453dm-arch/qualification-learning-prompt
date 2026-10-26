import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/app.js';
import { MemoryStore } from '../src/store.js';

const T0 = Date.parse('2026-10-24T07:20:00Z');
const SID = '11111111-2222-4333-8444-555555555555';
const Q1 = 'land_surveyor:2025:午前の部:11';
const Q2 = 'land_surveyor:2025:午後の部:21';
const base = 'https://engine.example';
const env = () => ({ STORE:new MemoryStore(), API_TOKEN:'test-token', clock:()=>T0 });
async function send(e, method, route, payload){
  const res = await handle(new Request(base+route,{method,
    headers:{authorization:'Bearer test-token','content-type':'application/json'},
    ...(payload===undefined?{}:{body:JSON.stringify(payload)})}),e);
  return { status:res.status, body:await res.json() };
}
async function store(e, questionId, shownAt, revealedAt){
  await e.STORE.put('ses/'+SID, JSON.stringify({savedAt:T0,
    state:{ qualificationId:'land_surveyor',
      descriptiveCurrent:{ questionId,year:2025,
        section:questionId.includes('午前')?'午前の部':'午後の部',
        number:Number(questionId.match(/:(\d+)$/)?.[1]),shownAt,revealedAt,
        text:'公式原本の内容を保持',pageNumbers:[14],
        pages:[{page:14,url:'https://moj.example/p14.png'}],
        layout:[{kind:'text',text:'第11問の公式本文'}] }
      } }));
}
test('解説前には操作メニューを返さず、現在問だけ解説後の短い操作パネルを返す',async()=>{
  const e=env();await store(e,Q1,T0,null);
  const uri='/v1/sessions/'+SID+'/descriptive/actions?questionId=';
  const verify='/v1/sessions/'+SID+'/descriptive/status?questionId=';
  assert.equal((await send(e,'GET',verify+encodeURIComponent(Q1)+'&shownAt='+T0)).status,200,'未学習開始でも現在問だけは照合可能');
  assert.equal((await send(e,'GET',verify+encodeURIComponent(Q2)+'&shownAt='+T0)).status,409,'旧問や別問からの誤操作を拒否');
  assert.equal((await send(e,'GET',verify+encodeURIComponent(Q1)+'&shownAt='+(T0-1))).status,409,'同じ問題でも古い表示を拒否');

  assert.equal((await send(e,'GET',uri+encodeURIComponent(Q1))).status,409);
  // 既存のモデル公開nextQuestionが新しい操作パネルツールを代替できる。
  const route='/v1/sessions/'+SID+'/next';
  const special='記述式解説後の操作メニュー:';
  assert.equal((await send(e,'POST',route,{question:special+Q1})).status,409,'解説前は出せない');
  assert.equal((await send(e,'POST',route,{question:special+Q2})).status,409,'現在問以外は出せない');

  assert.equal((await send(e,'POST','/v1/sessions/'+SID+'/descriptive/reveal',{questionId:Q2})).status,409);
  const shown=await send(e,'POST','/v1/sessions/'+SID+'/descriptive/reveal',{questionId:Q1});
  assert.equal(shown.status,200);
  assert.equal(shown.body.status,'descriptiveReveal');
  const controls=await send(e,'GET',uri+encodeURIComponent(Q1));
  assert.equal(controls.status,200);
  assert.equal(controls.body.status,'descriptiveActions');
  assert.equal(controls.body.question.questionId,Q1);
  assert.equal(controls.body.question.shownAt,T0);
  assert.equal(controls.body.question.layout,undefined,'元の問題・表・図を返さない');
  assert.equal(controls.body.grade,undefined,'自動採点しない');
  const fallback=await send(e,'POST',route,{question:special+Q1});
  assert.equal(fallback.status,200);
  assert.equal(fallback.body.status,'descriptiveActions','既存nextQuestion経由で画面を開ける');
  assert.equal(fallback.body.question.questionId,Q1,'現在問のみに固定');
  assert.equal(fallback.body.question.text,undefined,'既存ツールでも原本文を再表示しない');
  assert.equal(fallback.body.grade,undefined,'学習履歴と自動採点は変更しない');

  assert.equal((await send(e,'GET',uri+encodeURIComponent(Q2))).status,409);
  await store(e,Q2,T0+1000,T0+1500);
  assert.equal((await send(e,'GET',uri+encodeURIComponent(Q1))).status,409,'次問移動後の旧パネルは無効');
  assert.equal((await send(e,'POST',route,{question:special+Q1})).status,409,'既存ツールも旧問題IDを拒否');
  assert.equal((await send(e,'POST',route,{question:special+Q2})).status,200);

  assert.equal((await send(e,'GET',uri+encodeURIComponent(Q2))).status,200);
});
test('モデルの操作パネル取得ツールは本文を再掲せずMCPのUIメタデータを伴う',async()=>{
  const e=env();await store(e,Q1,T0,T0+1);
  const post=(method,params)=>send(e,'POST','/mcp',{jsonrpc:'2.0',id:1,method,params});
  const list=await post('tools/list',{});
  const tool=list.body.result.tools.find(t=>t.name==='showDescriptiveActions');
  assert.equal(tool?._meta?.['openai/outputTemplate'], undefined, '記述式の操作メニュー登録では新しい枠を増やさない');
  const complete='## 問1：条件と根拠\n'+ '原本を確認し通常解法の座標法・三角関数を示す。'.repeat(19) +
    '\n## 問2：面積と検算\n'+ '通常解法で結果を求め、根拠を照合し、検算する。'.repeat(18) +
    '\nS=Abs(Imag(A*Conjg(B)+B*Conjg(G)+G*Conjg(E)+E*Conjg(A)))/2';
  const response=await post('tools/call',{name:'showDescriptiveActions',arguments:{sessionId:SID,questionId:Q1,explanationMarkdown:complete}});
  assert.equal(response.status,200);
  assert.equal(response.body.result.structuredContent.status,'descriptiveActions');
  assert.equal(response.body.result._meta.qlp.question.text,undefined,'モデルと画面のどちらにも原本は再送しない');
  assert.equal(response.body.result._meta.qlp.question.questionId,Q1);
});

test('AI解説全文を同じ画面でボタンの前に返し、別問への遅延解説や空本文は拒否する',async()=>{
  const e=env();await store(e,Q1,T0,T0+1);
  const route='/v1/sessions/'+SID+'/descriptive/actions';
  const explanationMarkdown='## 問1：状況整理\n\n'+ '原本の土地の条件を確認し、根拠と通常解法を座標法・三角関数で整理する。'.repeat(12) +
    '\n\n## 問2：地積計算\n\n'+ '通常解法は座標法で行い、各点の座標から検算する。'.repeat(12) +
    '\n\nS=Abs(Imag(A*Conjg(B)+B*Conjg(G)+G*Conjg(E)+E*Conjg(A)))/2';
  const res=await send(e,'POST',route,{questionId:Q1,explanationMarkdown});
  assert.equal(res.status,200);
  assert.equal(res.body.status,'descriptiveActions');
  assert.equal(res.body.explanationMarkdown,explanationMarkdown,'省略せずモデルの解説を表示する');
  assert.equal(res.body.question.layout,undefined,'長い原本問題は再添付しない');
  assert.equal(res.body.grade,undefined,'採点しない');
  const fragment=await send(e,'POST',route,{questionId:Q1,explanationMarkdown:'## 電卓による面積計算\nS=Abs(Imag(A*Conjg(B)))/2'});
  assert.equal(fragment.status,422,'電卓だけの短い解説は登録できない');
  const invalid=await send(e,'POST',route,{questionId:Q1,explanationMarkdown:'  '});
  assert.equal(invalid.status,400);
  const wrong=await send(e,'POST',route,{questionId:Q2,explanationMarkdown});
  assert.equal(wrong.status,409);
  await store(e,Q2,T0+1000,T0+1500);
  assert.equal((await send(e,'POST',route,{questionId:Q1,explanationMarkdown})).status,409,
    '画面切替後に前の問へ解説を混入させない');

  const post=(method,params)=>send(e,'POST','/mcp',{jsonrpc:'2.0',id:1,method,params});
  const tool=(await post('tools/list',{})).body.result.tools.find(t=>t.name==='showDescriptiveActions');
  assert.ok(tool.inputSchema.properties.explanationMarkdown,'同一カード用の引数をモデルへ公開');
  const mcp=await post('tools/call',{name:'showDescriptiveActions',
    arguments:{sessionId:SID,questionId:Q2,explanationMarkdown}});
  assert.equal(mcp.status,200);
  assert.equal(mcp.body.result._meta.qlp.explanationMarkdown,explanationMarkdown,
    '学習画面に解説全文を渡す');
  assert.equal(mcp.body.result.structuredContent.explanationMarkdown,undefined,
    'チャットへ同じ解説を二重出力しない');
});

test('土地の座標計算だけ機種非依存の関数電卓ガイドを返す',async()=>{
  const e=env();
  const target='/v1/sessions/'+SID+'/descriptive/context';
  for(const questionId of [Q1,Q2]){
    await store(e,questionId,T0,T0+1);
    const answer=await send(e,'GET',target);
    assert.equal(answer.status,200);
    assert.deepEqual(answer.body.coordinateExplanationMethods,
      ['trigonometry','complex_numbers','scientific_calculator']);
    const calc=answer.body.calculatorExplanation;
    assert.ok(calc && calc.format.includes('generic-function-names'));
    assert.deepEqual(calc.assumedModels,['Canon F-789SG','CASIO fx-JP series']);
    const names=calc.functions.join(' ');
    for(const f of ['arg','Abs','Conjg','Real','Imag','r∠θ','a+bi','STO','RCL','M'])
      assert.ok(names.includes(f),'calculator function '+f);
    assert.ok(calc.settings.some(x=>x.includes('DEG')));
    assert.ok(calc.examples.some(x=>x.includes('Δz')));
    const area=answer.body.areaExplanation;
    assert.ok(area && area.when.includes('面積'), 'land area method must be explicit');
    assert.ok(area.polygon.includes('Conjg(B)'), 'point-name polygon formula');
    assert.ok(area.polygon.includes('Imag('), 'extract imaginary part');
    assert.ok(area.polygon.includes('/2'), 'halve the doubled signed area');
    assert.ok(area.diagonals.includes('(A-G)*Conjg(B-E)'), 'diagonal area alternative');
    assert.ok(area.triangle.includes('Conjg(C-A)'), 'triangle subdivision alternative');
    assert.deepEqual(area.vertexOrderExample,['A','B','G','E']);
    assert.equal(area.memoryExample['点G'],'変数C');
    assert.match(area.caution,/未丸め/);
    assert.ok(calc.examples.some(x=>x.includes('A*Conjg(B)')));
    assert.ok(calc.examples.some(x=>x.includes('(A-G)*Conjg(B-E)')));
    assert.ok(calc.notes.some(x=>x.includes('ConjgとImag')));
    assert.match(answer.body.coordinateExplanationGuidance,/面積計算/);

    assert.ok(calc.notes.some(x=>x.includes('M+/M-')));
    assert.match(answer.body.coordinateExplanationGuidance,/途中丸め/);
  }
  await store(e,'land_surveyor:2025:午後の部:22',T0,T0+1);
  const building=await send(e,'GET',target);
  assert.equal(building.status,200);
  assert.equal(building.body.number,22);
  assert.deepEqual(building.body.coordinateExplanationMethods,[]);
  assert.equal(building.body.calculatorExplanation,null);
  assert.equal(building.body.areaExplanation,null,'建物には土地の面積計算ガイドを付けない');
  assert.match(building.body.coordinateExplanationGuidance,/建物記述式/);
});

test('複素数Conjgの多角形周回式と対角線式は同じ面積を返す',()=>{
  // Imag(z*Conjg(w)) = y_z*x_w - x_z*y_w。外周A,B,G,Eの対角線式と一致する。
  const imagProductConjg=(z,w)=>z[1]*w[0]-z[0]*w[1];
  const A=[0,0],B=[4,0],G=[3,2],E=[0,2];
  const vertices=[A,B,G,E];
  const polygon=Math.abs(vertices.reduce((total,v,i)=>
    total+imagProductConjg(v,vertices[(i+1)%vertices.length]),0))/2;
  const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
  const diagonal=Math.abs(imagProductConjg(sub(A,G),sub(B,E)))/2;
  assert.equal(polygon,7);
  assert.equal(diagonal,7);
  assert.equal(polygon,diagonal);
  // 三角形へ分割しても面積は一致する。
  const triangle=(a,b,c)=>Math.abs(imagProductConjg(sub(b,a),sub(c,a)))/2;
  assert.equal(triangle(A,B,G)+triangle(A,G,E),7);
});

test('表示用に丸めたG座標では面積が変わるため最終丸めに注意',()=>{
  const imagProductConjg=(z,w)=>z[1]*w[0]-z[0]*w[1];
  const vertices=[[205.41,204.33],[206.13,213.40],[197.06,214.29],[196.11,202.38]];
  const area=Math.abs(vertices.reduce((sum,z,i)=>sum+
    imagProductConjg(z,vertices[(i+1)%4]),0))/2;
  assert.ok(Math.abs(area-95.9081)<1e-8,'rounded G source gives area 95.9081');
  assert.notEqual(Math.floor(area*100)/100,95.92,
    'do not falsely assert that rounded point yields the reference solution');
});
