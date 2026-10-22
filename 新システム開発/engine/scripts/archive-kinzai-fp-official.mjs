/** Archive original Kinzai FP grade-2/grade-3 PDFs linked on VERIFIED official pages.
 * No presumed URLs, no user-visible "ready" flag; learning parser follows separately.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {GcpStore} from '../src/gcp-store.js';
assert.equal(process.argv[2],'--commit');
assert.equal(process.env.QLP_FP_ARCHIVE_APPROVED,'YES');
assert.equal(process.env.GOOGLE_CLOUD_PROJECT,'qualification-learning');
const officialPages=[
  ['2025-05-questions','https://www.kinzai.or.jp/fp/news-fp/47728.html'],
  ['2025-05-answers','https://www.kinzai.or.jp/fp/news-fp/47718.html'],
  ['2025-05-cbt','https://www.kinzai.or.jp/fp/news-fp/47740.html']
];
const store=new GcpStore({bucket:'qualification-learning-qlp-figures'});
const sha=b=>createHash('sha256').update(b).digest('hex');
const fetched=new Set(),summary={officialPages:0,pdfs:0,errors:[],skipped:0};
for(const [session,pageUrl] of officialPages){
  try{
    const r=await fetch(pageUrl,{signal:AbortSignal.timeout(30000)});
    if(!r.ok)throw Error('OFFICIAL_PAGE_HTTP_'+r.status);
    const html=await r.text();
    if(!html.includes('FP')&&!html.includes('ファイナンシャル'))throw Error('PAGE_NOT_FP');
    summary.officialPages++;
    for(const m of html.matchAll(/href\s*=\s*["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi)){
      const u=new URL(m[1].replace(/&amp;/g,'&'),pageUrl);
      if(!['www.kinzai.or.jp','www2.kinzai.or.jp'].includes(u.hostname)){summary.skipped++;continue;}
      if(!u.pathname.toLowerCase().includes('/fp')||!/\.pdf$/i.test(u.pathname)){summary.skipped++;continue;}
      const basename=u.pathname.split('/').pop();
      const grade=/fp0?([23])[_-]/i.exec(basename)?.[1];
      if(!grade){summary.skipped++;continue;}
      if(fetched.has(u.href))continue;
      fetched.add(u.href);
      try{
        const p=await fetch(u.href,{signal:AbortSignal.timeout(60000)});
        if(!p.ok)throw Error('PDF_HTTP_'+p.status);
        const data=Buffer.from(await p.arrayBuffer());
        if(data.subarray(0,5).toString()!=='%PDF-')throw Error('PDF_INVALID');
        const hash=sha(data);
        const storageKey='src/fp-official/kinzai/fp'+grade+'/'+hash+'.pdf';
        await store.put(storageKey,data);
        assert.equal(sha(Buffer.from(await store.get(storageKey,'arrayBuffer'))),hash,'READBACK_SHA_MISMATCH');
        const row={schema:'qlp-fp-source-v1',grade:'fp'+grade,organization:'kinzai',session,officialPage:pageUrl,
          originalUrl:u.href,filename:basename,sha256:hash,bytes:data.length,storageKey,learningReady:false};
        const key='fp-official-source/kinzai/fp'+grade+'/'+session+'/'+hash.slice(0,16);
        await store.put(key,JSON.stringify(row));
        assert.equal((await store.get(key,'json'))?.sha256,hash,'METADATA_MISMATCH');
        summary.pdfs++;
        console.log('KINZAI_FP_SOURCE_VERIFIED',grade,session,basename,hash);
      }catch(e){summary.errors.push({url:u.href,error:String(e.message).slice(0,80)});}
    }
  }catch(e){summary.errors.push({page:pageUrl,error:String(e.message).slice(0,80)});}
}
console.log('KINZAI_FP_SOURCE_SUMMARY',JSON.stringify(summary));
if(!summary.pdfs)process.exitCode=1;
