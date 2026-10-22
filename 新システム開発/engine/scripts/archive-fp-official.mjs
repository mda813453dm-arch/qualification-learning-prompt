/** Archive official JAFP FP2/FP3 PDFs, preserving verified source hashes.
 * Reads only the public official index. Skips uncertain links and never marks
 * any PDF as question-ready without a separate, verified parser import.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GcpStore } from '../src/gcp-store.js';

assert.equal(process.argv[2], '--commit');
assert.equal(process.env.QLP_FP_ARCHIVE_APPROVED, 'YES');
assert.equal(process.env.GOOGLE_CLOUD_PROJECT, 'qualification-learning');
const store = new GcpStore({bucket:'qualification-learning-qlp-figures'});
const indexUrl = 'https://www.jafp.or.jp/exam/mohan/';
const response = await fetch(indexUrl, {headers:{'User-Agent':'qualification-learning-official-archive/1.0'}});
assert(response.ok, 'OFFICIAL_INDEX_FETCH_FAILED');
const html = await response.text();
const urls = new Set();
for (const match of html.matchAll(/(?:href|data-url)\s*=\s*["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi)) {
  const u = new URL(match[1].replace(/&amp;/g,'&'),indexUrl);
  if (u.protocol !== 'https:' || u.hostname !== 'www.jafp.or.jp') continue;
  if (!u.pathname.startsWith('/exam/mohan/files/')) continue;
  urls.add(u.toString());
}
const summary = { discovered:urls.size, stored:0, skipped:[], errors:[] };
for (const url of urls) {
  const pathname = new URL(url).pathname;
  const name = pathname.slice(pathname.lastIndexOf('/')+1);
  // Distinguish grade in the official filename, instead of guessing by date.
  const grade = /^g([23])[_-]/i.exec(name)?.[1];
  if (!grade) {summary.skipped.push(name); continue;}
  try {
    const res = await fetch(url, {signal:AbortSignal.timeout(60000)});
    if (!res.ok) throw Error('PDF_HTTP_'+res.status);
    const buffer=Buffer.from(await res.arrayBuffer());
    if (buffer.subarray(0,5).toString() !== '%PDF-') throw Error('NOT_PDF');
    const hash=createHash('sha256').update(buffer).digest('hex');
    const key='fp-official-source/jafp/fp'+grade+'/'+name;
    const sourceKey='src/fp-official/jafp/fp'+grade+'/'+hash+'.pdf';
    await store.put(sourceKey,buffer);
    const back=Buffer.from(await store.get(sourceKey,'arrayBuffer'));
    assert.equal(createHash('sha256').update(back).digest('hex'),hash,'PDF_READBACK_MISMATCH');
    const metadata={schema:'qlp-fp-archive-v1',grade:'fp'+grade,organization:'jafp',
      filename:name,sourceUrl:url,sha256:hash,bytes:buffer.length,
      storageKey:sourceKey,parsed:false,learningReady:false};
    await store.put(key,JSON.stringify(metadata));
    assert.equal((await store.get(key,'json'))?.sha256,hash,'METADATA_READBACK_MISMATCH');
    summary.stored++;
    console.log('FP_ARCHIVE_VERIFIED',grade,name,buffer.length,hash);
  } catch(e) {summary.errors.push({name,error:String(e.message).slice(0,120)});}
}
console.log('FP_OFFICIAL_ARCHIVE_SUMMARY',JSON.stringify(summary));
if(summary.stored===0)process.exitCode=1;
