import test from 'node:test';import assert from 'node:assert/strict';
import {createStudyRuntime,toRenderCommands} from '../src/study-question-runtime.js';
const packet=(n,ans,fig=false)=>({status:'ready',number:n,display:[{kind:'number',value:n},{kind:'stem',value:'Q'+n},...(fig?[{kind:'figure',value:{questionNumber:n,assetId:'q'+n}}]:[]),{kind:'choices',value:['a','b','c','d','e']}],answer:{number:ans}});
test('開始問題はコード指定',()=>assert.equal(createStudyRuntime({packets:[packet(2,4),packet(3,1)],startNumber:2}).currentView().number,2));
test('表示命令順を変更不能',()=>assert.deepEqual(toRenderCommands(createStudyRuntime({packets:[packet(2,4,true)],startNumber:2}).currentView()).map(x=>x.op),['TEXT','TEXT','IMAGE','CHOICES','TEXT']));
test('正解は出題viewに露出しない',()=>assert.equal('answer' in createStudyRuntime({packets:[packet(2,4)],startNumber:2}).currentView(),false));
test('採点と次問を同時にコード決定',()=>{const r=createStudyRuntime({packets:[packet(2,4),packet(3,2)],startNumber:2}).submitAnswer(4);assert.equal(r.result.correct,true);assert.equal(r.next.number,3)});
test('不正入力で勝手に次へ進まない',()=>{const rt=createStudyRuntime({packets:[packet(2,4),packet(3,2)],startNumber:2});assert.equal(rt.submitAnswer('次').type,'rejected');assert.equal(rt.currentView().number,2)});
test('最終問回答後はfinished',()=>assert.equal(createStudyRuntime({packets:[packet(2,4)],startNumber:2}).submitAnswer(4).next.type,'finished'));
