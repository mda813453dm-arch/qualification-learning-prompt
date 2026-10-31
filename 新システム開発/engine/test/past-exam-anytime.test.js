import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../src/app.js';
import {MemoryStore} from '../src/store.js';
import {CATALOG} from '../src/catalog.js';
import {TOOLS} from '../src/mcp.js';
import {widgetHtml} from '../src/widget.js';
import {pdf,T0} from './helpers.js';

const token='anytime-upload-test';
function setup(){
  const attachments=[];
  const env={
    STORE:new MemoryStore(),API_TOKEN:token,PUBLIC_BASE_URL:'https://engine.example',
    now:T0,clock:()=>T0,
    fetchAttached:async url=>{attachments.push(url);return pdf('document-content');},
    selfFetch:async()=>new Response('{}',{status:200}),
  };
  const req=async(method,path,data)=>{
    const r=await handle(new Request('https://engine.example'+path,{
      method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:data===undefined?undefined:JSON.stringify(data),
    }),env);
    return {status:r.status,body:await r.json()};
  };
  return {env,req,attachments};
}
async function open(req,qualificationId){
  const r=await req('POST','/v1/sessions',{qualificationId});
  assert.equal(r.status,201,JSON.stringify(r.body));
  return r.body.sessionId;
}
function file(name){return {file_name:name,download_url:'https://files.example/'+encodeURIComponent(name),file_id:name};}

test('103資格に共通の取込入口を用意し、未検証の年度を登録済みにしない',async()=>{
  const html=widgetHtml();
  assert.equal(Object.values(CATALOG).length,103);
  for (const cat of Object.values(CATALOG)) {
    assert.ok(cat.uploadAdapter||cat.sources?.length,cat.name+' has no upload adapter or certified sources');
  }
  assert.match(html,/過去問の追加・登録状況/);
  assert.match(html,/sourceManagerBar\(\)/);
  assert.match(html,/bindSourceManager\(\)/);
  assert.match(html,/同じ問題に戻る/);
  assert.match(html,/id="sourceManageUpload"/);
  assert.match(html,/id="sourceManageYearHint"/);
  assert.match(html,/id="sourceManageSectionHint"/);
  assert.match(html,/公式の問題PDFと同年度・同区分の正答PDF/);
  assert.match(html,/この資格は問題PDFのみ添付してください/);
  assert.match(html,/getStudySnapshot/);
  const picker=TOOLS.find(t=>t.name==='attachPdfBatchFromPicker');
  assert.equal(picker.uiOnly,true);
  assert.equal(picker.appOnly,true);
  for(const p of ['years','sections','answerYears','answerSections'])
    assert.ok(picker.inputSchema.properties[p],'metadata '+p+' absent');
  assert.doesNotMatch(html,/AIの詳しい解説を自動起動/);
});

test('学習中の登録状況APIは宅建・測量士補・行政書士・看護師に存在し、区分を返す',async()=>{
  for(const name of ['宅建','測量士補','土地家屋調査士','行政書士','看護師','通関士']){
    const {req}=setup();
    const sid=await open(req,name);
    const res=await req('GET','/v1/sessions/'+sid+'/official-library');
    assert.equal(res.status,200,name+': '+JSON.stringify(res.body));
    assert.equal(res.body.status,'officialLibrary');
    assert.equal(res.body.sourceAttachmentSupported,true);
    assert.ok(Array.isArray(res.body.readyYearDetails));
    assert.ok(Array.isArray(res.body.uploadSections),name);
    if(name==='行政書士'){
      assert.equal(res.body.permissionedUpload,true);
      assert.equal(res.body.answerFormat,'html');
    }
    if(name==='土地家屋調査士')
      assert.deepEqual(res.body.uploadSections,['午前の部','午後の部']);
    if(name==='通関士')assert.deepEqual(res.body.validatedUploadYears,[2025]);
  }
});

test('年度と区分がファイル名にない場合も、同一の問題と正答を明示指定できる',async()=>{
  const {req,attachments}=setup();
  const sid=await open(req,'看護師');
  const r=await req('POST','/v1/sessions/'+sid+'/attach-batch',{
    questionPdfs:[file('exam.pdf')],answerPdfs:[file('correct.pdf')],
    years:[2024],answerYears:[2024],
  });
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.queued,1,JSON.stringify(r.body));
  assert.equal(r.body.failed,0,JSON.stringify(r.body));
  assert.equal(attachments.length,2);
});

test('問題ファイルの年度と利用者指定年度が矛盾すれば拒否する',async()=>{
  const {req,attachments}=setup();
  const sid=await open(req,'看護師');
  const r=await req('POST','/v1/sessions/'+sid+'/attach-batch',{
    questionPdfs:[file('2025_question.pdf')],answerPdfs:[file('2025_answer.pdf')],
    years:[2024],answerYears:[2024],
  });
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.queued,0,JSON.stringify(r.body));
  assert.equal(r.body.failed,1,JSON.stringify(r.body));
  assert.match(r.body.results[0].reason,/異なります/);
  assert.equal(attachments.length,0,'conflicting files must not reach storage');
});

test('午前・午後が不明な問題をmainと誤登録せず、補足指定を使う',async()=>{
  const {req}=setup();
  const sid=await open(req,'土地家屋調査士');
  const bad=await req('POST','/v1/sessions/'+sid+'/attach-batch',{
    questionPdfs:[file('R7_question.pdf')],answerPdfs:[file('R7_answer.pdf')]});
  assert.equal(bad.status,200);
  assert.equal(bad.body.failed,1,JSON.stringify(bad.body));
  assert.match(bad.body.results[0].reason,/試験区分/);
  const ok=await req('POST','/v1/sessions/'+sid+'/attach-batch',{
    questionPdfs:[file('R7_question.pdf')],answerPdfs:[file('R7_answer.pdf')],
    sections:['午前の部'],answerSections:['午前の部']});
  assert.equal(ok.status,200,JSON.stringify(ok.body));
  assert.equal(ok.body.failed,0,JSON.stringify(ok.body));
  assert.equal(ok.body.queued,1,JSON.stringify(ok.body));
});

test('年度・区分不明の正答は複数年度へ一括割り当てしない',async()=>{
  const {req}=setup();
  const sid=await open(req,'看護師');
  const r=await req('POST','/v1/sessions/'+sid+'/attach-batch',{
    questionPdfs:[file('R6_question.pdf'),file('R7_question.pdf')],
    answerPdfs:[file('correct.pdf')],
  });
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.deepEqual(r.body.unmatchedAnswerFiles,['correct.pdf']);
  assert.equal(r.body.queued,0,'no question may be treated as verified without a matched answer');
});
