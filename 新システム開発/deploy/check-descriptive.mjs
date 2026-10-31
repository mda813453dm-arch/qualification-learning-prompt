// 本番の新規テスト用セッションのみを使用。実利用者の記録や択一正答は変更しない。
import assert from 'node:assert/strict';
const base = process.env.QLP_BASE_URL;
const token = process.env.QLP_TEST_TOKEN;
assert.ok(base && token);
async function api(method,path,body) {
  const res=await fetch(base+path,{method,
    headers:{authorization:'Bearer '+token,'content-type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(240000)});
  const value=await res.json();
  assert.ok(res.ok,method+' '+path+' '+res.status+' '+JSON.stringify(value).slice(0,250));
  return value;
}
const session=await api('POST','/v1/sessions',{qualificationId:'land_surveyor',sources:[]});
assert.ok(session.sessionId && session.learnerId);
const prefix='/v1/sessions/'+encodeURIComponent(session.sessionId);
const study=await api('POST','/v1/study/start',{qualificationName:'土地家屋調査士',learnerId:session.learnerId});
assert.ok(study.studyId);
// 合成の非公開スモークテスト文。実際の過去問の参考解答として学習者へ提供しない。
const landFixture='## 問1：テスト用照合\n'+'原本の条件、根拠、通常解法、三角関数・座標法、検算を小問ごとに確認する（テスト用）。'.repeat(12)+
  '\n## 問2：テスト用計算照合\n'+'必要な面積計算は通常解法と複素数を照合し、原本で未確認の値は推測しない（テスト用）。'.repeat(12)+
  '\nS=Abs(Imag(A*Conjg(B)+B*Conjg(G)+G*Conjg(E)+E*Conjg(A)))/2';
const buildingFixture='## 問1：テスト用建物要件\n'+ '原本の建物に関する法的根拠と確認範囲を検証し、数値や図面は推測しない（テスト用）。'.repeat(6)+
  '\n## 問2：テスト用登記手続\n'+ '申請書類と確認できない条件を区別し、公式模範解答と称しない（テスト用）。'.repeat(6);
for(const [section,n,count] of [['午前の部',11,2],['午後の部',21,10],['午後の部',22,9]]) {
  const d=await api('POST',prefix+'/descriptive',{year:2025,section,number:n});
  assert.equal(d.status,'descriptiveQuestion');
  assert.equal(d.question.kind,'descriptive');
  assert.equal(d.question.gradingMode,'none');
  assert.equal(d.question.correctAnswer,undefined);
  assert.equal(d.question.choices,undefined);
  assert.equal(d.question.pages.length,count);
  assert.ok(d.question.text.length>500);
  // 文字・表・図を独立表示できること。ページ全体の画像は学習画面で使用しない。
  assert.ok(Array.isArray(d.question.layout) && d.question.layout.length >= 3,
    'structured text/table/figure missing');
  const tables=d.question.layout.filter(x=>x.kind==='table');
  const diagrams=d.question.layout.filter(x=>x.kind==='figure');
  // 建物記述の設計図面は表が存在しない年度もある。表がある問は行列検証、
  // 図のみの問はPDFの図切出しと本文を照合する。
  if(n!==22) assert.ok(tables.length>=1, 'structured HTML table source missing '+n);
  assert.ok(diagrams.length>=1, 'PDF diagram crop missing '+n);
  for(const t of tables){
    assert.ok(t.rows.length>=2 && t.rows.every(row=>row.length===t.rows[0].length));
  }
  for(const f of diagrams){
    assert.ok(/^https:\/\//.test(f.url), 'diagram URL missing');
    const img=await fetch(f.url,{signal:AbortSignal.timeout(30000)});
    assert.ok(img.ok, 'official diagram not readable '+n);
    assert.deepEqual([...new Uint8Array(await img.arrayBuffer()).slice(0,4)],[137,80,78,71]);
  }
  if(n===11){
    assert.ok(tables.length>=2,'observed and calculated survey tables both required');
    assert.ok(tables.some(t=>JSON.stringify(t.rows).includes('200.00')));
  }
  const layout=d.question.layout;
  assert.ok(Array.isArray(layout) && layout.length>3,'verified structured layout required');
  assert.ok(layout.some(b=>b.kind==='text' && b.text.includes('第'+n+'問')),'official heading');
  const nativeTables=layout.filter(b=>b.kind==='table');
  const figBlocks=layout.filter(b=>b.kind==='figure');
  if(n===11){
    assert.equal(nativeTables.length,2,'morning 11 must have observation and survey tables');
    assert.equal(figBlocks.length,1,'morning 11 must crop only the official sketch');
    const tableText=JSON.stringify(nativeTables);
    for(const original of ['T1','T2','14.12','200.00','192.50'])assert.ok(tableText.includes(original),'missing source cell '+original);
  }
  for(const figure of figBlocks){
    assert.ok(!/pageimg/.test(figure.url),'full-page images must not be displayed as diagrams');
    const crop=await fetch(figure.url,{signal:AbortSignal.timeout(30000)});
    assert.ok(crop.ok,'diagram crop unavailable '+n);
    assert.deepEqual([...new Uint8Array(await crop.arrayBuffer()).slice(0,4)],[137,80,78,71]);
  }
  const ctx=await api('GET',prefix+'/descriptive/context');
  assert.equal(ctx.questionId,d.question.questionId);
  assert.equal(ctx.shownAt,d.question.shownAt);
  assert.equal(ctx.officialModelAnswerVerified,false);
  const shown=await api('POST',prefix+'/descriptive/reveal',{});
  assert.equal(shown.status,'descriptiveReveal');
  assert.equal(shown.grade,undefined);
  const restored=await api('GET',prefix+'/restore');
  assert.equal(restored.status,'descriptiveReveal');
  assert.equal(restored.question.questionId,d.question.questionId);
  assert.equal(restored.question.layout,undefined,'revealed/restored question does not re-send full original');
  assert.equal(shown.question.layout,undefined,'reveal response is compact');
  assert.equal(shown.question.text,undefined,'original text stays on server for AI reference only');
  if (n===21){
    const registered=await api('POST',prefix+'/descriptive/actions',
      {questionId:ctx.questionId,shownAt:ctx.shownAt,explanationMarkdown:landFixture});
    assert.equal(registered.status,'descriptiveActions');
    assert.equal(registered.explanationMarkdown,landFixture);
    assert.equal(registered.grade,undefined);
    const saved=await api('GET',prefix+'/descriptive/actions?questionId='+encodeURIComponent(ctx.questionId));
    assert.equal(saved.explanationMarkdown,landFixture,'現在の問21の解説を学習枠用に復元');
    assert.equal((await api('GET',prefix+'/restore')).status,'descriptiveActions');
  }
  const image=await fetch(d.question.pages[0].url,{signal:AbortSignal.timeout(30000)});
  assert.ok(image.ok,'official page image '+n);
  assert.deepEqual([...new Uint8Array(await image.arrayBuffer()).slice(0,4)],[137,80,78,71]);
  console.log('PASS structured descriptive',section,n,'pages',count,'tables',nativeTables.length,'diagrams',figBlocks.length);
}
// 問22を再取得した直後に reveal 通知が欠ける場合も、同じ現行問だけ登録可能。
const reopened22=await api('POST',prefix+'/descriptive',
  {year:2025,section:'午後の部',number:22});
const context22=await api('GET',prefix+'/descriptive/context');
assert.equal(context22.questionId,reopened22.question.questionId);
assert.equal(context22.revealed,false);
const saved22=await api('POST',prefix+'/descriptive/actions',
  {questionId:context22.questionId,shownAt:context22.shownAt,explanationMarkdown:buildingFixture});
assert.equal(saved22.status,'descriptiveActions');
assert.equal(saved22.explanationMarkdown,buildingFixture);
assert.equal(saved22.grade,undefined);
const restored22=await api('GET',prefix+'/descriptive/actions?questionId='+encodeURIComponent(context22.questionId));
assert.equal(restored22.explanationMarkdown,buildingFixture);
assert.equal((await api('GET',prefix+'/restore')).status,'descriptiveActions');
console.log('PASS current-question Q21→Q22 AI explanation registration and same-frame restoration, no grading');
// 2007-2014 scan-only mode: original pages, no OCR-generated values and no grading.
// One real historical section is checked end-to-end; the 24-question PDF matrix
// is independently validated by the parser audit workflow.
const historical=await api('POST',prefix+'/descriptive',
  {year:2014,section:'午後の部',number:22});
assert.equal(historical.status,'descriptiveQuestion');
assert.equal(historical.question.questionId,'land_surveyor:2014:午後の部:22');
assert.equal(historical.question.gradingMode,'none');
assert.equal(historical.question.correctAnswer,undefined);
assert.equal(historical.question.choices,undefined);
assert.equal(historical.question.pages.length,8);
assert.match(historical.notice,/保存版PDFの原本ページ画像/);
const historicalFigures=historical.question.layout.filter(x=>x.kind==='figure');
assert.deepEqual(historicalFigures.map(x=>x.page),[31,32,33,34,35,36,37,38]);
assert.ok(historical.question.layout.filter(x=>x.kind==='table').length===0,
  'scanned source must not reconstruct table cell values');
for(const figure of [historicalFigures[0],historicalFigures.at(-1)]) {
  assert.ok(figure.url.startsWith('https://'));
  const image=await fetch(figure.url,{signal:AbortSignal.timeout(30000)});
  assert.ok(image.ok,'archived page image missing '+figure.page);
  assert.deepEqual([...new Uint8Array(await image.arrayBuffer()).slice(0,4)],[137,80,78,71]);
}
const historicalReveal=await api('POST',prefix+'/descriptive/reveal',{});
assert.equal(historicalReveal.status,'descriptiveReveal');
assert.equal(historicalReveal.grade,undefined);
assert.equal((await api('GET',prefix+'/restore')).status,'descriptiveReveal');
console.log('PASS archived 2014 descriptive non-graded original-page display/reveal/restore');
const end=await api('POST','/v1/study/'+encodeURIComponent(study.studyId)+'/end',{sessionId:session.sessionId});
assert.match(end.log,/午後の部 問22/);
assert.match(end.handoff,/午前の部 問11/);
console.log('PASS all 2025 descriptive pages and non-graded reveal/restore/handoff');
