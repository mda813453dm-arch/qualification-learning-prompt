import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const p=s=>pathToFileURL(resolve(s));
const load=await Promise.all([process.env.V210_BASE_ROOT,'.'].map(r=>import(p(r+'/新システム開発/engine/src/mcp.js'))));
async function rpc(host,method,params={}){
  const response=await host.handleRpc({jsonrpc:'2.0',id:1,method,params},()=>{throw Error('Unexpected backend call');},{widget:true});
  assert.ok(!response.error,JSON.stringify(response.error));return response.result;
}
const [old,next]=await Promise.all(load.map(h=>rpc(h,'resources/list')));
assert.equal(next.resources[0].uri,'ui://qlp/question-v211.html');
assert.equal(next.resources.length,old.resources.length+1);
for(const item of old.resources){
 const expected=(await rpc(load[0],'resources/read',{uri:item.uri})).contents[0].text;
 const actual=(await rpc(load[1],'resources/read',{uri:item.uri})).contents[0].text;
 const sha=value=>createHash('sha256').update(value).digest('hex');
 assert.equal(sha(actual),sha(expected),item.uri);
}
console.log('PASS',old.resources.length,'existing MCP resources byte-identical, new active v211 distinct');
