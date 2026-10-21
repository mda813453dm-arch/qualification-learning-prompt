import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/catalog.js';
import { MemoryStore } from '../src/store.js';
import { writeResult } from '../src/cache.js';
import { officialLibrary } from '../src/official-library.js';

test('宅建は原本を照合した50の文章問題を図がなくても共通利用でき、図が必要な問は欠損を許さない', async () => {
  const cat = CATALOG.takken;
  const store = new MemoryStore();
  const now = Date.now();
  const sha = cat.officialShared.officialPdfPins[2025]['年度共通'];
  const key = {qualificationId:'q041', year:2025, section:'年度共通',
    questionSha256:sha,answerSha256:sha,parserVersion:'0.8.2',owner:'_shared'};
  const packets = Array.from({length:50},(_,i)=>({
    questionId:`q041:2025:年度共通:${i+1}`,
    qualificationId:'q041',year:2025,section:'年度共通',questionNumber:i+1,
    fieldId:'t2',stem:`原文問題${i+1}`,stemMode:'text',
    choices:['原文1','原文2','原文3','原文4'],choiceMode:'text',
    correctAnswer:1,diagramRequired:false,figures:[],
    questionPdfSha256:sha,answerPdfSha256:sha,
    verification:{visual:'question_level_pdf_graphics_checked'},
  }));
  const result = {status:'ready',qualificationId:'q041',year:2025,section:'年度共通',
    parserVersion:'0.8.2',questionPdfSha256:sha,answerPdfSha256:sha,
    packetCount:50,excluded:[],packets};
  assert.equal((await officialLibrary(store,cat,'0.8.2',now)).totalQuestions,0);
  await writeResult(store,key,result,{},now);
  const ready = await officialLibrary(store,cat,'0.8.2',now);
  assert.equal(ready.totalQuestions,50);
  assert.deepEqual(ready.completeYears,[2025]);
  assert.equal(ready.missing.length,11);
  assert(ready.missing.some(x=>x.year===2020&&x.section==='10月'));
  assert(ready.missing.some(x=>x.year===2020&&x.section==='12月'));
  assert(ready.missing.some(x=>x.year===2021&&x.section==='10月'));
  assert(ready.missing.some(x=>x.year===2021&&x.section==='12月'));
  packets[28].diagramRequired=true;
  await writeResult(store,key,result,{},now);
  assert.equal((await officialLibrary(store,cat,'0.8.2',now)).totalQuestions,0,
    '図が必要なのに画像が無いパケットのある50問は共有済みと認めない');
});
