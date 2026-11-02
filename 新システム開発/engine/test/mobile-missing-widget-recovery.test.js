import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRpc } from '../src/mcp.js';
import { WIDGET_URI, WIDGET_VERSION } from '../src/widget-v171.js';

const rpc = (id, method, params={}) => ({ jsonrpc: '2.0', id, method, params });
const baseUrl='https://qlp.example';

test('Cached iPhone UI URIs receive stable legacy HTML, not Android v170 touch handler', async () => {
  const api=()=>{ throw Error('resources may not touch study data'); };
  const initial=(await handleRpc(rpc(1,'tools/list'),api,{widget:true,baseUrl})).result;
  const tools=initial.tools;
  assert.equal(tools.find(t=>t.name==='startSession')._meta.ui.resourceUri,WIDGET_URI);
  assert.match(tools.find(t=>t.name==='startSession').description,/reopenMissingWidget/);
  const recover=tools.find(t=>t.name==='reopenMissingWidget');
  assert.equal(recover._meta.ui.resourceUri,WIDGET_URI);
  assert.equal(recover._meta['openai/outputTemplate'],WIDGET_URI);
  assert.equal(recover.inputSchema.required[0],'sessionId');
  const cached168=(await handleRpc(rpc(2,'resources/read',{uri:'ui://qlp/question-v168.html'}),api,{widget:true,baseUrl})).result.contents[0];
  assert.equal(cached168.uri,'ui://qlp/question-v168.html');
  assert.match(cached168.text,/2026-11-01\.168/);
  assert.doesNotMatch(cached168.text,/qlpAndroidScrollTools/);
  const cached169=(await handleRpc(rpc(3,'resources/read',{uri:'ui://qlp/question-v169.html'}),api,{widget:true,baseUrl})).result.contents[0];
  assert.equal(cached169.uri,'ui://qlp/question-v169.html');
  assert.match(cached169.text,/qlp-android-scroll-guard/);
  assert.doesNotMatch(cached169.text,/qlpAndroidScrollTools/);
  const current=(await handleRpc(rpc(4,'resources/read',{uri:WIDGET_URI}),api,{widget:true,baseUrl})).result.contents[0];
  assert.match(current.text,/qlpAndroidScrollTools/);
  assert.match(current.text,new RegExp(WIDGET_VERSION.replaceAll('.','\\.')));
  const old170=(await handleRpc(rpc(9,'resources/read',{uri:'ui://qlp/question-v170.html'}),api,{widget:true,baseUrl})).result.contents[0];
  assert.match(old170.text,/2026-11-02\\.170/);
  assert.match(old170.text,/qlpAndroidScrollTools/);
  const resources=(await handleRpc(rpc(5,'resources/list'),api,{widget:true,baseUrl})).result.resources;
  assert.equal(resources.filter(x=>x.uri===WIDGET_URI).length,1,'latest URI only once');
});

test('UI reopening reads prior session and does not create new session, grade, or change question', async () => {
  const calls=[];
  const sid='session-existing-ui-hidden';
  const callApi=async(method,path,body)=>{
    calls.push({method,path,body});
    assert.equal(method,'GET');
    assert.equal(path,'/v1/sessions/'+sid+'/restore');
    return {status:200,body:{status:'needPlan',sessionId:sid,overview:{name:'宅建'},
      onboarding:[{kind:'status',prompt:'現在の学習状況',choices:['基礎学習中','過去問演習中']}]}};
  };
  const result=(await handleRpc(rpc(6,'tools/call',{name:'reopenMissingWidget',arguments:{sessionId:sid}}),callApi,{widget:true,baseUrl})).result;
  assert.equal(result.isError,undefined);
  assert.equal(result._meta.qlp.sessionId,sid);
  assert.equal(result.structuredContent.sessionId,sid);
  assert.ok(result.structuredContent.onboarding?.length);
  assert.deepEqual(calls,[{method:'GET',path:'/v1/sessions/'+sid+'/restore',body:undefined}]);
});

test('Legacy widgets can report real rendering stage using their own version', async ()=>{
  const api=()=>{ throw Error('no API'); };
  for(const ver of ['2026-11-01.168','2026-11-01.169','2026-11-02.170','2026-11-02.171']){
    const value=(await handleRpc(rpc(7,'tools/call',{name:'reportUiEvent',arguments:{stage:'render_onboarding',version:ver}}),api,{widget:true,baseUrl})).result;
    assert.equal(value.structuredContent.status,'recorded');
  }
  const rejected=(await handleRpc(rpc(8,'tools/call',{name:'reportUiEvent',arguments:{stage:'render_onboarding',version:'bad-version'}}),api,{widget:true,baseUrl})).result;
  assert.equal(rejected.isError,true);
});


test('read-only UI snapshot returns intact confirmation/remediation choices to iframe only', async ()=>{
  const sid='private-snapshot-test';
  const testCases=[
    {status:'confirmation_question',question:'保存済み確認問題の本文',choices:['基準A','基準B','基準C'],challengeId:'c1',correctAnswer:2,position:1,total:3},
    {status:'remediation_question',question:'補強確認問題の本文',choices:['事実1','事実2','事実3'],challengeId:'c2',correctAnswer:1}
  ];
  for(const original of testCases){
    const res=(await handleRpc(rpc(10,'tools/call',{
      name:'getStudySnapshot',arguments:{sessionId:sid},
    }),async(method,path)=>{
      assert.equal(method,'GET');
      assert.equal(path,'/v1/sessions/'+sid+'/restore');
      return {status:200,body:{...original,sessionId:sid}};
    },{widget:true,baseUrl})).result;
    assert.equal(res.isError,undefined);
    assert.equal(res._meta.qlp.question,original.question,'iframe gets full stored text');
    assert.deepEqual(res._meta.qlp.choices,original.choices,'iframe gets stored choice order');
    assert.equal(res.structuredContent.question,undefined,'model does not get raw text');
    assert.equal(res.structuredContent.choices,undefined,'model does not get private choices');
    assert.equal(res.structuredContent.correctAnswer,undefined,'model does not get answer');
  }
  const listed=(await handleRpc(rpc(11,'tools/list'),()=>{throw Error('no api')},{widget:true,baseUrl})).result.tools;
  const snapshot=listed.find(t=>t.name==='getStudySnapshot');
  assert.deepEqual(snapshot._meta.ui.visibility,['app'],'snapshot is app only');
  assert.equal(snapshot._meta['openai/outputTemplate'],undefined,'snapshot never creates a new frame');
});
