// Real Chromium/WebKit iframe with a synthetic host, no live sessions.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { handle } from '../src/app.js';
import { handleRpc } from '../src/mcp.js';
import { MemoryStore } from '../src/store.js';
import { newState } from '../src/engine.js';
import { WIDGET_URI } from '../src/widget-current.js';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const sid='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const qid='q018:2022:main:9';
const now=Date.UTC(2026,10,24,6);
const initial={status:'needPlan',sessionId:sid,
  overview:{title:'試験概要',name:'宅建',fields:['宅建業法']},
  onboarding:[{kind:'exempt',prompt:'今回の試験での免除適用状況',choices:['適用確定','免除を利用しない']}]};
const menu={kind:'next',sessionId:sid,body:'保存済みの問9 AI詳説',
  choices:['次の問題へ','今日はここまで（学習を終了）'],actions:['next','end']};
const fresh=newState({qualificationId:'q018',learnerId:'mocktest22',now});
const stored={...fresh,history:{[qid]:{result:'confident_correct'}},
  lastExplanation:{questionId:qid,grade:{questionId:qid,selected:3,correct:true}},
  publishedExplanation:{questionId:qid,menu}};
const restoredQ4={status:'restoredGrade',sessionId:sid,
  question:{questionId:'q018:2022:main:4',year:2022,questionNumber:4,stem:'合成問4',choices:['A','B','C','D']},
  grade:{questionId:'q018:2022:main:4',selected:3,correct:true,correctAnswer:1,correctAnswerLabel:'正解肢なし（全員正解）',acceptedAnswers:[1,2,3,4]}};
const explicitPlan={status:'needPlan',sessionId:sid,planReady:true,
  plan:{fields:['診断で確定した分野']},diagResult:['診断結果を反映']};

async function rpc(method,params,call=()=>{throw Error('Unexpected API call');}){
  const res=await handleRpc({jsonrpc:'2.0',id:1,method,params},call,{widget:true});
  assert.ok(!res.error,JSON.stringify(res.error));
  return res.result;
}
const html=(await rpc('resources/read',{uri:WIDGET_URI})).contents[0].text;
assert.equal(WIDGET_URI,'ui://qlp/question-v210.html');
async function classify(state){
  const STORE=new MemoryStore();
  const raw=JSON.stringify({savedAt:now,state});
  await STORE.put('ses/'+sid,raw);
  await STORE.put('lrnsess/mocktest22',other);
  const writes=[];
  for(const name of ['put','delete']){
    const underlying=STORE[name].bind(STORE);
    STORE[name]=(...args)=>{writes.push([name,args[0]]);return underlying(...args);};
  }
  const env={STORE,QLP_WIDGET:true,API_TOKEN:'synthetic',clock:()=>now};
  const paths=[];
  const result=await rpc('tools/call',{name:'getStudySnapshot',arguments:{sessionId:sid,publishedExplanationOnly:true}},
    async(method,path)=>{
      paths.push([method,path]);
      const res=await handle(new Request('https://qlp.fixture.invalid'+path,{method,headers:{authorization:'Bearer synthetic'}}),env);
      return {status:res.status,body:await res.json()};
    });
  assert.deepEqual(paths,[['GET','/v1/sessions/'+sid+'/restore?publishedExplanationOnly=1']]);
  assert.deepEqual(writes,[]);
  assert.equal(await STORE.get('ses/'+sid),raw);
  assert.equal(await STORE.get('lrnsess/mocktest22'),other);
  return result;
}
const freshReply=await classify(fresh);
const menuReply=await classify(stored);
const advancedReply=await classify({...stored,current:{questionId:'q018:2022:main:10',grade:null,prefetched:false}});
assert.equal(freshReply.structuredContent.status,'noPublishedExplanation');
assert.equal(menuReply.structuredContent.status,'menu');
assert.equal(advancedReply.structuredContent.status,'restoreNotCurrent');

const scenarios=[
  {id:'fresh',reply:freshReply,toolCount:1,display:'fresh'},
  {id:'q9',input:sid,reply:menuReply,toolCount:1,display:'menu'},
  {id:'advanced',input:sid,reply:advancedReply,toolCount:1,display:'paused'},
  {id:'wrong-host',input:other,toolCount:0,display:'paused'},
  {id:'invalid-id',late:{...initial,sessionId:'test-session'},toolCount:0,display:'paused'},
  {id:'wrong-reply',reply:{structuredContent:{status:'noPublishedExplanation',sessionId:other}},toolCount:1,display:'paused'},
  {id:'explicit-plan',late:explicitPlan,toolCount:0,display:'plan'},
  {id:'q4-beats-late-q9',reply:menuReply,supersede:true,toolCount:1,display:'q4'},
  {id:'bridge-denied',input:sid,bridgeDenied:true,toolCount:0,display:'unavailable'},
  {id:'no-late-bound-and-recovery',input:sid,waitForBound:true,reply:freshReply,toolCount:1,display:'fresh'},
];
for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
    for(const s of scenarios){
      const page=await browser.newPage({viewport:{width:375,height:667},isMobile:true,hasTouch:true});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('https://qlp.fixture.invalid/',route=>route.fulfill({
        contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body></body>'}));
      await page.goto('https://qlp.fixture.invalid/');
      await page.evaluate(({html,s})=>{
        window.businessCalls=[]; window.readyForResult=false;
        const iframe=document.createElement('iframe');
        iframe.style='display:block;width:100%;height:650px;border:0';
        const send=(m)=>iframe.contentWindow.postMessage({jsonrpc:'2.0',...m},'*');
        window.deliver=(view)=>send({method:'ui/notifications/tool-result',params:{_meta:{qlp:view}}});
        window.release=()=>{};
        addEventListener('message',e=>{
          if(e.source!==iframe.contentWindow||e.data?.jsonrpc!=='2.0')return;
          const m=e.data;
          if(m.method==='ui/initialize') {
            if(s.bridgeDenied) send({id:m.id,error:{code:-32601,message:'unsupported bridge'}});
            else send({id:m.id,result:{protocolVersion:'2026-01-26',hostCapabilities:{}}});
          } else if(m.method==='ui/notifications/initialized')window.readyForResult=true;
          else if(m.method==='tools/call'){
            if(m.params.name==='reportUiEvent'){send({id:m.id,result:{}});return;}
            window.businessCalls.push([m.params.name,m.params.arguments]);
            const reply=()=>send({id:m.id,result:s.reply||{isError:true,structuredContent:{error:'UNEXPECTED_TOOL'}}});
            if(s.supersede)window.release=reply;else reply();
          }
        });
        const bridge={toolOutput:{status:'needPlan'},toolInput:s.input?{sessionId:s.input}:{}};
        iframe.srcdoc=html.replace('<head>','<head><script>window.openai='+JSON.stringify(bridge)+';</script>');
        document.body.appendChild(iframe);
      },{html,s});
      const iframe=page.frameLocator('iframe');
      if(s.bridgeDenied){
        await iframe.getByRole('alert').filter({hasText:/試験概要を受信できませんでした/}).waitFor({timeout:5000});
      } else{
        await page.waitForFunction(()=>window.readyForResult);
        await iframe.getByRole('status').filter({hasText:/試験概要・学習状況の情報を待っています/}).waitFor({timeout:5000});
      }
      assert.equal(await iframe.locator('#app button:not([disabled])').count(),0);
      assert.deepEqual(await page.evaluate(()=>window.businessCalls),[]);
      if(s.waitForBound){
        await iframe.getByRole('alert').filter({hasText:/試験概要を受信できませんでした/}).waitFor({timeout:13000});
        assert.equal(await iframe.locator('#app button:not([disabled])').count(),0);
        assert.deepEqual(await page.evaluate(()=>window.businessCalls),[]);
      }
      if(!s.bridgeDenied)await page.evaluate(view=>window.deliver(view),s.late||initial);
      if(s.supersede){
        await page.waitForFunction(()=>window.businessCalls.length===1);
        await page.evaluate(view=>window.deliver(view),restoredQ4);
        await iframe.getByText('採点上の正解',{exact:false}).first().waitFor();
        await page.evaluate(()=>window.release());
      }
      if(s.display==='fresh') await iframe.getByRole('button',{name:/免除を利用しない/}).waitFor({timeout:5000});
      if(s.display==='menu'){
        await iframe.getByText(menu.body).waitFor({timeout:5000});
        assert.equal(await iframe.getByRole('button',{name:/次の問題へ/}).count(),1);
        assert.equal(await iframe.getByRole('button',{name:/学習を終了/}).count(),1);
      }
      if(s.display==='paused'){
        await iframe.getByRole('alert').filter({hasText:/学習記録を変更せず/}).waitFor({timeout:5000});
        assert.equal(await iframe.locator('#app button:not([disabled])').count(),0);
      }
      if(s.display==='plan')await iframe.getByRole('button',{name:/この学習計画で始める/}).waitFor({timeout:5000});
      if(s.display==='q4'){
        const summary=iframe.locator('.official-answer-summary');
        await summary.locator('summary').click();
        assert.equal(await summary.getByText('【正答】',{exact:true}).count(),0);
        assert.equal(await summary.getByText('【あなたの回答】',{exact:false}).count(),1);
        assert.equal(await iframe.getByText(menu.body).count(),0);
      }
      assert.deepEqual(await page.evaluate(()=>window.businessCalls),
        s.toolCount?[['getStudySnapshot',{sessionId:sid,publishedExplanationOnly:true}]]:[]);
      assert.deepEqual(errors,[]);
      console.log(engineName,'PASS',s.id);
      await page.close();
    }
  } finally {await browser.close();}
}
