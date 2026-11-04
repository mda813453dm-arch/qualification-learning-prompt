import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash,createPublicKey} from 'node:crypto';
import {GcpStore} from '../src/gcp-store.js';
import {MemoryStore} from '../src/store.js';
import {decryptFolderEnvelope,importFolderBundle} from '../src/folder-intake.js';

const requestPath=resolve(process.argv[2]);
const request=JSON.parse(await readFile(requestPath,'utf8'));
if(!['dry-run','import'].includes(request.phase))throw Error('IMPORT_PHASE_INVALID');
if(request.phase==='import' && (request.approvedAction!=='REGISTER_USER_FOLDER_SOURCES' ||
   process.env.GOOGLE_CLOUD_PROJECT!=='qualification-learning')) throw Error('IMPORT_NOT_APPROVED');
const credentials=JSON.parse(process.env.CREDENTIAL_JSON);
const publicKey=createPublicKey(credentials.private_key).export({type:'spki',format:'der'});
if(createHash('sha256').update(publicKey).digest('hex')!==request.publicKeySha256)
  throw Error('IMPORT_ENCRYPTION_KEY_CHANGED');
const envelopePath=resolve(dirname(requestPath),request.envelopeFile);
if(dirname(envelopePath)!==dirname(requestPath)) throw Error('ENVELOPE_PATH_INVALID');
const raw=await readFile(envelopePath);
if(createHash('sha256').update(raw).digest('hex')!==request.envelopeSha256)
  throw Error('ENVELOPE_HASH_MISMATCH');
const bundle=decryptFolderEnvelope(JSON.parse(raw),credentials.private_key,request.requestId);
const result=await importFolderBundle(bundle,request,{
  store:request.phase==='import' ? new GcpStore({bucket:'qualification-learning-qlp-figures'}) : new MemoryStore(),
  fetchPdf:async url=>{
    // Never log signed URLs or the response body.
    for(let attempt=0;attempt<3;attempt++) {
      try {
        const response=await fetch(url,{signal:AbortSignal.timeout(60000),redirect:'error'});
        if(!response.ok)throw Error('SOURCE_DOWNLOAD_HTTP_'+response.status);
        return new Uint8Array(await response.arrayBuffer());
      } catch {}
    }
    throw Error('SOURCE_DOWNLOAD_FAILED');
  },
});
console.log(JSON.stringify({...result,productionWritten:request.phase==='import'}));
