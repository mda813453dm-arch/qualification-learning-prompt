/** Convert archived official JAFP academic exams into verified shared learning packets.
 * No guessed answers. Reject ambiguous question/answer pairs. The original PDF
 * and hash are immutable inputs and are checked before parsing and after readback.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFile as callback} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, writeFile, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {GcpStore} from '../src/gcp-store.js';
import {validateResult} from '../src/ingest.js';
import {readResult, writeResult, readFigure} from '../src/cache.js';

assert.equal(process.argv[2], '--commit');
assert.equal(process.env.QLP_FP_LEARNING_APPROVED, 'YES');
assert.equal(process.env.GOOGLE_CLOUD_PROJECT, 'qualification-learning');
const store=new GcpStore({bucket:'qualification-learning-qlp-figures'});
const sha=x=>createHash('sha256').update(x).digest('hex');
const execFile=promisify(callback);
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const manifest=await fetch('https://www.jafp.or.jp/exam/mohan/').then(async r=>{assert(r.ok,'INDEX_FETCH_FAILED');return r.text()});
const names=new Set();
for(const m of manifest.matchAll(/href\s*=\s*["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi)){
  const u=new URL(m[1].replace(/&amp;/g,'&'),'https://www.jafp.or.jp/exam/mohan/');
  if(u.hostname!=='www.jafp.or.jp'||!u.pathname.startsWith('/exam/mohan/files/'))continue;
  const name=u.pathname.split('/').pop();
  if(/^g[23]_(?:20\d{4})_(?:qa|q|a)\.pdf$/i.test(name))names.add(name);
}
const groups=new Map();
for(const name of names){
  const m=/^g([23])_(20\d{4})_(qa|q|a)\.pdf$/i.exec(name);
  if(!m)continue;
  const group='fp'+m[1]+':'+m[2];
  if(!groups.has(group))groups.set(group,{grade:'fp'+m[1],session:m[2]});
  groups.get(group)[m[3]]=name;
}
let verified=0, ready=0, parsedCount=0;
const failed=[];
for(const g of groups.values()){
  const questionName=g.qa??g.q,answerName=g.qa??g.a;
  if(!questionName||!answerName){failed.push({grade:g.grade,session:g.session,reason:'MISSING_QUESTION_OR_ANSWER'});continue;}
  const read=async name=>{
    const row=await store.get('fp-official-source/jafp/'+g.grade+'/'+name,'json');
    assert(row?.storageKey&&row?.sha256,'SOURCE_NOT_ARCHIVED:'+name);
    const bytes=Buffer.from(await store.get(row.storageKey,'arrayBuffer'));
    assert.equal(sha(bytes),row.sha256,'SOURCE_HASH_MISMATCH:'+name);
    return {bytes,row};
  };
  const tmp=await mkdtemp(join(tmpdir(),'fp-learning-'));
  try{
    const q=await read(questionName),a=await read(answerName);
    verified++;
    const qpath=join(tmp,'question.pdf'),apath=join(tmp,'answer.pdf'),assetsDir=join(tmp,'assets');
    await writeFile(qpath,q.bytes);await writeFile(apath,a.bytes);
    const args=['-m','qlp_parser.cli','--adapter',g.grade,'--year',String(Number(g.session.slice(0,4))),
      '--section',g.session.slice(0,4)+'年'+Number(g.session.slice(4))+'月','--question-pdf',qpath,'--answer-pdf',apath,
      '--question-url',q.row.sourceUrl,'--answer-url',a.row.sourceUrl,
      '--question-sha256',q.row.sha256,'--answer-sha256',a.row.sha256,'--assets-dir',assetsDir];
    let stdout;
    try{({stdout}=await execFile('python3',args,{env:{...process.env,PYTHONPATH:join(root,'parser')},timeout:720000,maxBuffer:100*1024*1024}));}
    catch(e){if(!e.stdout)throw e;stdout=e.stdout;}
    const parsed=JSON.parse(stdout);
    if(!['ready','partial'].includes(parsed.status)||!parsed.packets?.length)throw Error('PARSER_NOT_READY:'+parsed.reason);
    const nums=parsed.packets.map(p=>p.questionNumber);
    const valid=nums.every(n=>Number.isInteger(n)&&n>=1&&n<=60)&&new Set(nums).size===nums.length;
    assert(valid,'QUESTION_IDS_INVALID');
    assert(parsed.packets.every(p=>p.verification?.answer==='same_year_official_answer_checked'
      &&p.fieldId&&p.choices.length===(g.grade==='fp2'?4:p.questionNumber<=30?2:3)
      &&p.correctAnswer>=1&&p.correctAnswer<=p.choices.length),'PACKET_INVALID');
    const assets={};for(const name of await readdir(assetsDir))assets[name]=new Uint8Array(await readFile(join(assetsDir,name)));
    const source={qualificationId:g.grade==='fp2'?'q002':'q003',adapter:g.grade,year:Number(g.session.slice(0,4)),
      section:g.session.slice(0,4)+'年'+Number(g.session.slice(4))+'月',questionUrl:q.row.sourceUrl,answerUrl:a.row.sourceUrl,owner:'_shared'};
    const validated=await validateResult(source,{question:q.row.sha256,answer:a.row.sha256},'0.8.2',parsed,assets);
    assert(['ready','partial'].includes(validated.status)&&validated.packetCount===nums.length,'VALIDATION_FAILED');
    const parts={qualificationId:source.qualificationId,year:source.year,section:source.section,
      questionSha256:q.row.sha256,answerSha256:a.row.sha256,parserVersion:'0.8.2',owner:'_shared'};
    await writeResult(store,parts,validated,assets,Date.now());
    const back=await readResult(store,parts,Date.now());
    assert.equal(back.result?.packetCount,nums.length,'PACKET_READBACK_FAILED');
    for(const p of back.result.packets){for(const f of p.figures??[]){
      const bytes=await readFigure(store,q.row.sha256,'0.8.2',f.file,'_shared');
      assert(bytes&&sha(Buffer.from(bytes))===f.sha256,'FIGURE_READBACK_FAILED');
    }}
    const record={schema:'qlp-fp-learning-v1',grade:g.grade,organization:'jafp',session:g.session,
      section:source.section,questionCount:nums.length,expectedCount:60,
      sourceQuestionSha256:q.row.sha256,sourceAnswerSha256:a.row.sha256,
      status:nums.length===60?'learning-ready':'learning-partial'};
    await store.put('fp-learning/jafp/'+g.grade+'/'+g.session,JSON.stringify(record));
    assert.equal((await store.get('fp-learning/jafp/'+g.grade+'/'+g.session,'json'))?.questionCount,nums.length);
    ready++;parsedCount+=nums.length;
    console.log('FP_LEARNING_VERIFIED',g.grade,g.session,nums.length,'/ 60');
  }catch(e){failed.push({grade:g.grade,session:g.session,reason:String(e.message).slice(0,160)});
    console.log('FP_LEARNING_NOT_READY',g.grade,g.session,String(e.message).slice(0,160));}
  finally{await rm(tmp,{recursive:true,force:true});}
}
console.log('FP_LEARNING_SUMMARY',JSON.stringify({groups:groups.size,verified,ready,parsedCount,failed}));
if(!ready)process.exitCode=1;
