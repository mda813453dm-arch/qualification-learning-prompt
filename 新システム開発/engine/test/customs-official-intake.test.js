import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/app.js';
import { MemoryStore } from '../src/store.js';
import { pdf, T0 } from './helpers.js';
import { TOOLS } from '../src/mcp.js';
import { widgetHtml } from '../src/widget.js';

const token = 'customs-2025-intake-test';
function setup() {
  const received = [];
  const env = {
    STORE: new MemoryStore(), API_TOKEN: token,
    PUBLIC_BASE_URL: 'https://engine.example',
    now:T0, clock:() => T0,
    fetchAttached: async url => { received.push(url); return pdf('official-customs-source'); },
    // The parser is deliberately not assumed to succeed: staging and verified questions differ.
    selfFetch: async () => new Response('{}', {status:200}),
  };
  const req = async (method, path, value) => {
    const res = await handle(new Request('https://engine.example'+path, {
      method, headers: { authorization:'Bearer '+token,'content-type':'application/json' },
      body: value === undefined ? undefined : JSON.stringify(value),
    }),env);
    return {status:res.status, body:await res.json()};
  };
  return {env,received,req};
}

test('通関士2025：公式4PDFは3科目+別冊として扱い、正答も公式URLから取得する', async () => {
  const {env,received,req} = setup();
  const opened=await req('POST','/v1/sessions',{qualificationId:'通関士'});
  assert.equal(opened.status,201,JSON.stringify(opened.body));
  const id=opened.body.sessionId;
  const result=await req('POST','/v1/sessions/'+id+'/import-customs-2025',{});
  assert.equal(result.status,200,JSON.stringify(result.body));
  assert.equal(result.body.status,'attachedBatch');
  assert.equal(result.body.requested,4);
  assert.equal(result.body.supplementStored,1,'04は単独問題として登録しない');
  assert.equal(result.body.queued,3,'01～03は3科目として登録依頼する');
  assert.equal(result.body.failed,0,JSON.stringify(result.body.results));
  assert.ok(received.some(u=>u.endsWith('20251005tukanshi01.pdf')));
  assert.ok(received.some(u=>u.endsWith('20251005tukanshi02.pdf')));
  assert.ok(received.some(u=>u.endsWith('20251005tukanshi03.pdf')));
  assert.ok(received.some(u=>u.endsWith('20251005tukanshi04.pdf')));
  assert.ok(received.some(u=>u.endsWith('59shiken_seikai.pdf')));
  const supplementary=await env.STORE.get('customs/supplement/'+opened.body.learnerId+'/2025','json');
  assert.equal(supplementary.section,'通関実務（別冊）');
  assert.equal(result.body.status,'attachedBatch','受付は出題可能の保証ではない');
});

test('通関士2025：実際に送られた4ファイルの年度・役割をファイル名で判別する',async()=>{
  const {req}=setup();
  const opened=await req('POST','/v1/sessions',{qualificationId:'q098'});
  assert.equal(opened.status,201,JSON.stringify(opened.body));
  const questionPdfs=[1,2,3,4].map(n=>({
    file_name:'20251005tukanshi0'+n+'.pdf',
    download_url:'https://files.example/20251005tukanshi0'+n+'.pdf',
  }));
  const result=await req('POST','/v1/sessions/'+opened.body.sessionId+'/attach-batch',{questionPdfs});
  assert.equal(result.status,200,JSON.stringify(result.body));
  assert.equal(result.body.requested,4);
  assert.equal(result.body.queued,3,JSON.stringify(result.body.results));
  assert.equal(result.body.supplementStored,1);
  assert.equal(result.body.failed,0);
  assert.ok(result.body.results.every(x=>x.year===2025));
});

test('他資格から通関士の公式一括取得を実行できない',async()=>{
  const {req}=setup();
  const opened=await req('POST','/v1/sessions',{qualificationId:'宅建'});
  assert.equal(opened.status,201,JSON.stringify(opened.body));
  const result=await req('POST','/v1/sessions/'+opened.body.sessionId+'/import-customs-2025',{});
  assert.equal(result.status,422);
  assert.equal(result.body.error,'CUSTOMS_IMPORT_QUALIFICATION_MISMATCH');
});

test('学習画面からの直接PDF選択と通関士の公開URL取込ツールが公開される',()=>{
  const html=widgetHtml();
  assert.match(html,/id="sourceLocalUpload"/);
  assert.match(html,/id="sourceCustoms2025"/);
  assert.match(html,/importOfficialCustoms2025/);
  assert.match(html,/attachPdfBatchFromPicker/);
  const tool=TOOLS.find(t=>t.name==='importOfficialCustoms2025');
  assert.equal(tool.appOnly,true);
  assert.equal(tool.uiOnly,true);
  assert.equal(tool.api({sessionId:'s'})[1],'/v1/sessions/s/import-customs-2025');
});

test('通関士の学習中に追加登録状況を確認しても現在問を失わない画面導線', async () => {
  const {req}=setup();
  const opened=await req('POST','/v1/sessions',{qualificationId:'通関士'});
  assert.equal(opened.status,201,JSON.stringify(opened.body));
  const r=await req('GET','/v1/sessions/'+opened.body.sessionId+'/official-library');
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.qualificationId,'q098');
  assert.equal(r.body.qualificationName,'通関士');
  assert.ok(Array.isArray(r.body.readyYearDetails));
  assert.ok(Array.isArray(r.body.importingYearDetails));
  assert.deepEqual(r.body.validatedUploadYears,[2025]);
  const html=widgetHtml();
  assert.match(html,/過去問の追加・登録状況/);
  assert.match(html,/function openSourceManager/);
  assert.match(html,/render\(savedView\)/,'利用中の問題へ戻るときに次問を取得しない');
  assert.match(html,/2024年度以前のPDFは/,'対応していない年度を明示する');
  assert.match(html,/まだ登録可能とは案内しません/,'未検証年度を出題可能と誤案内しない');
  const resume = html.slice(html.indexOf('async function goBack()'), html.indexOf("document.getElementById('sourceManageBack').onclick = goBack"));
  assert.match(resume,/getStudySnapshot/,'採点後は実際の保存状態を読む');
  assert.doesNotMatch(resume,/nextQuestion/,'登録状況から戻る際に次問へ進めない');
});

test('通関士専用のテキスト表示更新は他資格のキャッシュを失効させない', async () => {
  const {staleSources}=await import('../src/ingest.js');
  const make=(adapter,version)=>({status:'done',adapter,keyParts:{parserVersion:version}});
  const job={sources:[make('takken','0.8.2'),make('tsukanshi','0.8.2'),
     make('surveyor','0.8.2'),make('tsukanshi','0.8.2-customs-text-v1')]};
  const stale=staleSources(job,'0.8.2');
  assert.equal(stale.length,1);
  assert.equal(stale[0],job.sources[1]);
});
