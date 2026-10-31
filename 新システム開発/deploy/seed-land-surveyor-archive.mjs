// One-time deployment hook. Reuses validated source pins, never changes learner data.
const base = process.env.QLP_BASE_URL?.replace(/\/$/, '');
const token = process.env.QLP_TEST_TOKEN;
if (!base?.startsWith('https://') || !token) throw Error('ARCHIVE_SEED_ENV_MISSING');
const jobId = 'land_surveyor~_archive_shared';
const api = async (url, options={}) => {
  const response = await fetch(base+url,{...options,headers:{
    authorization:'Bearer '+token,...options.headers,
  }, signal:AbortSignal.timeout(30000)});
  const data = await response.json().catch(()=>({}));
  if(!response.ok) throw Error('ARCHIVE_SEED_HTTP_'+response.status+':'+String(data?.error||data?.code||'').slice(0,90));
  return data;
};
const expected = new Map([
 ['2015:午前の部',10],['2015:午後の部',20],
 ['2016:午前の部',10],['2016:午後の部',20],
 ['2017:午前の部',10],['2017:午後の部',20],
 ['2018:午前の部',10],['2018:午後の部',20],
 ['2019:午前の部',10],['2019:午後の部',20],
 ['2020:午前の部',10],['2020:午後の部',20],
 ['2021:午前の部',10],['2021:午後の部',20],
]);
const seed = async () => {
  const result=await api('/v1/admin/seed-land-surveyor-archive',{
    method:'POST',headers:{'content-type':'application/json'},body:'{}',
  });
  if(result.status!=='archivedSharedImportQueued'||result.requestedSections!==expected.size)
    throw Error('ARCHIVE_SEED_UNEXPECTED_'+JSON.stringify(result));
  console.log('Archived sources queued:',result.requestedSections);
};
await seed();
const deadline=Date.now()+13*60*1000;
let retries=0, last='';
while(Date.now()<deadline) {
  const res=await api('/v1/jobs/'+encodeURIComponent(jobId));
  const sources=res?.job?.sources||[];
  // GET /v1/jobs/... merges the current import job with *already shared*
  // 2022-2025 official sections. Those are legitimate existing records, not
  // duplicate archival sources. Validate only the requested keys;
  // never delete, replace, or reimport other shared years to satisfy a count.
  const selected=sources.filter(s=>expected.has(s.year+':'+s.section));
  const unique=new Set(selected.map(s=>s.year+':'+s.section));
  if(selected.length!==expected.size || unique.size!==expected.size)
    throw Error('ARCHIVE_SEED_TARGETS_MISSING_OR_DUPLICATE_'+JSON.stringify({
      found:selected.map(x=>x.year+':'+x.section), totalSources:sources.length}));
  const state=selected.map(s=>({ ...s, expected:expected.get(s.year+':'+s.section) }));
  const done=state.filter(s=>s.status==='done'&&s.packetCount===s.expected&&s.excludedCount===0);
  const pending=state.filter(s=>s.status==='pending'||s.status==='running');
  const failed=state.filter(s=>s.status==='failed'||(s.status==='done'&&(s.packetCount!==s.expected||s.excludedCount!==0)));
  const summary='Verified '+done.length+'/'+expected.size+
    ', pending '+pending.length+', failed '+failed.length+
    ' ['+failed.map(x=>x.year+':'+x.section+':'+(x.reason||'COUNT')).join(',')+']';
  if(summary!==last){console.log(summary);last=summary;}
  if(done.length===expected.size) {
    console.log('ARCHIVE_SHARED_READY: 210 graded MC questions across 14 archival sections');
    process.exit(0);
  }
  if(failed.length && !pending.length && retries<2){
    retries++;
    console.log('Retrying interrupted archival downloads, attempt '+retries);
    await seed();
  } else if(failed.length && !pending.length && retries>=2){
    throw Error('ARCHIVE_SHARED_IMPORT_FAILED: '+summary);
  }
  await new Promise(resolve=>setTimeout(resolve,15000));
}
throw Error('ARCHIVE_SHARED_IMPORT_TIMEOUT: '+last);
