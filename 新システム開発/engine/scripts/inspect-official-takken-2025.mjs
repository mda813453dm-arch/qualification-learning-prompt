/** 2025年宅建公式PDFを検証する読み取り専用CI。共有保存は一切行わない。 */
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Hex } from '../src/store.js';
import { GcpStore } from '../src/gcp-store.js';
import { sourceKey } from '../src/source-store.js';

const execFile = promisify(execFileCallback);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const expectedSha = '829cde5778e22d1a8f0050ce2ff8b4b8089749bcab5456fbde6d1d843a3ed8ed';
const url = 'https://www.retio.or.jp/wp-content/uploads/2025/12/R7_question_answer.pdf';
const work = await mkdtemp(join(tmpdir(), 'qlp-takken-2025-readonly-'));
const pdf = join(work, 'takken-2025.pdf');
try {
  const store = new GcpStore({bucket:'qualification-learning-qlp-figures'});
  const existing = await store.get(await sourceKey(url),'arrayBuffer') ||
    await store.get(`att/${expectedSha}.pdf`,'arrayBuffer');
  if (existing?.byteLength) {
    await writeFile(pdf,new Uint8Array(existing));
    console.log('SOURCE_FROM_STORED_OFFICIAL_COPY');
  } else {
    console.log('STORED_COPY_NOT_AVAILABLE; REQUESTING_OFFICIAL_SITE');
    await execFile('curl', ['--fail','--silent','--show-error','--location',
      '--max-time','60','--retry','3','--retry-all-errors',
      '--header','User-Agent: Mozilla/5.0 (compatible; qualification-learning-verify/1.0)',
      '--output',pdf,url], { timeout:300000 });
  }
  assert.equal(await sha256Hex(new Uint8Array(await readFile(pdf))), expectedSha, 'SOURCE_PDF_CHANGED');
  const {stdout:pdfInfo} = await execFile('python3', ['-c',
    'import fitz,sys,json; d=fitz.open(sys.argv[1]); print(json.dumps({"pages":len(d),"firstPage":d[0].get_text()[:400]},ensure_ascii=False))',pdf]);
  console.log('CURRENT_OFFICIAL_DOCUMENT',pdfInfo.trim());
  const args = [
    '-m','qlp_parser.cli','--adapter','takken','--year','2025',
    '--section','年度共通','--question-pdf',pdf,'--question-url',url,
    '--question-sha256',expectedSha,
  ];
  let stdout;
  try {
    ({stdout} = await execFile('python3', args, {
      env: {...process.env, PYTHONPATH:join(root,'parser')}, timeout:600000, maxBuffer:30*1024*1024,
    }));
  } catch (error) {
    if (!error.stdout) throw error;
    stdout = error.stdout;
  }
  const result = JSON.parse(stdout);
  const excluded = result.excluded ?? [];
  const missing = Array.from({length:50},(_,i)=>i+1).filter((n)=>!result.packets?.some((p)=>p.questionNumber===n));
  console.log('OFFICIAL_SOURCE_SHA_VERIFIED',expectedSha);
  console.log('PACKET_SUMMARY',JSON.stringify({ status:result.status, packetCount:result.packetCount, excluded, missing }));
  const reference = JSON.parse(await readFile(join(root,'data','takken-2025-official-source-index.json'),'utf8'));
  assert.equal(reference.source.sha256,expectedSha);
  const answers = new Map(reference.questions.map((q)=>[q.number,q.answerNumber]));
  for (const packet of result.packets ?? []) assert.equal(packet.correctAnswer,answers.get(packet.questionNumber),'ANSWER_MISMATCH_'+packet.questionNumber);
  assert.equal(result.status,'ready','PARSER_NOT_READY');
  assert.equal(result.packetCount,50,'NOT_ALL_FIFTY_QUESTIONS');
  assert.equal(excluded.length,0,'EXCLUDED_QUESTIONS');
  assert.equal(missing.length,0,'QUESTION_NUMBER_GAPS');
  console.log('ALL 50 OFFICIAL QUESTIONS VERIFIED. NO PRODUCTION WRITES');
} finally {
  await rm(work,{recursive:true,force:true});
}
