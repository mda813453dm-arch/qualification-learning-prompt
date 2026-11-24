import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const src=resolve('新システム開発/engine/src');
const prod=resolve(process.env.Q018_BASE_ROOT, '新システム開発/engine/src');
async function mod(directory,name){return import(pathToFileURL(resolve(directory,name+'.js')));}
const [cur,base]=await Promise.all([mod(src,'mcp'),mod(prod,'mcp')]);
const rpc=async (host,method,params={})=>{
 const r=await host.handleRpc({jsonrpc:'2.0',id:1,method,params},()=>{throw Error('Resource method must not call backend');},{widget:true});
 assert.ok(!r.error,JSON.stringify(r.error));
 return r.result;
};
const all=async p=>(await rpc(p,'resources/list')).resources.map(x=>x.uri);
const read=async(p,uri)=>(await rpc(p,'resources/read',{uri})).contents[0].text;
const digest=t=>createHash('sha256').update(t).digest('hex');
test('all historical q018 production resource URIs serve byte-identical payloads after composition',async()=>{
 const [prior,integrated]=await Promise.all([all(base),all(cur)]);
 assert.equal(integrated[0],'ui://qlp/question-v210.html');
 for(const uri of prior){
   assert.ok(integrated.includes(uri),uri);
   assert.equal(digest(await read(cur,uri)),digest(await read(base,uri)),uri);
 }
 console.log('historical production URI count:',prior.length);
});
test('the four distinct historical candidate URIs retain exact versioned payloads and the active resource is only v210',async()=>{
 const listed=await all(cur); assert.equal(listed.length,new Set(listed).size);
 for(const v of [206,207,208,209,210]){
   const expected=await mod(src,'widget-v'+v);
   const html=await read(cur,expected.WIDGET_URI);
   assert.equal(html,expected.widgetHtml());
   assert.match(html,new RegExp(expected.WIDGET_VERSION.replaceAll('.','\\.')));
 }
});
test('strict restore and year guard are both present in their own server routes',()=>{
 const snap=cur.TOOLS.find(x=>x.name==='getStudySnapshot');
 const sid='11111111-1111-4111-8111-111111111111';
 assert.deepEqual(snap.api({sessionId:sid,publishedExplanationOnly:true}),['GET','/v1/sessions/'+sid+'/restore?publishedExplanationOnly=1']);
 assert.deepEqual(snap.api({sessionId:sid}),['GET','/v1/sessions/'+sid+'/restore']);
});
