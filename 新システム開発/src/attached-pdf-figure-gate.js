/**
 * Verify that each displayed figure is a fresh crop of the PDF bytes supplied
 * to this processing run. Chat/attachment IDs are intentionally not required:
 * ordinary chat file-processing runtimes do not expose those identifiers.
 */
export function verifyAttachedPdfFigureSource(question, assetRegistry, sourcePdf) {
 const fail=reason=>Object.freeze({ok:false,reason});
 if(!question||question.status!=='ready'||!Array.isArray(question.contentBlocks))
  return fail('QUESTION_NOT_READY');
 const figureBlocks=question.contentBlocks.filter(b=>b?.type==='figure');
 if(!figureBlocks.length)return Object.freeze({ok:true,figureCount:0});
 if(!sourcePdf||sourcePdf.status!=='ready'||sourcePdf.mediaType!=='application/pdf'||
    !/^[a-f0-9]{64}$/.test(sourcePdf.sha256||'')||
    typeof sourcePdf.operationId!=='string'||!sourcePdf.operationId)
  return fail('PDF_EXECUTION_RECEIPT_REQUIRED');
 if(typeof assetRegistry?.resolve!=='function')return fail('ASSET_REGISTRY_REQUIRED');
 const seen=new Set();
 for(const block of figureBlocks){
  if(typeof block.assetId!=='string'||!block.assetId||seen.has(block.assetId))
   return fail('FIGURE_ASSET_ID_INVALID');
  seen.add(block.assetId);
  const asset=assetRegistry.resolve(block.assetId);
  const origin=asset?.derivedFromPdf;
  if(!asset||asset.questionId!==question.id||asset.verified!==true||asset.mime!=='image/png'||
     typeof asset.inlineRef!=='string'||!((asset.inlineRef.toLowerCase().split('?')[0].startsWith('sandbox:/mnt/data/'))||
       (asset.inlineRef.toLowerCase().split('?')[0].startsWith('sandbox:/workspace/scratch/')))||
     !asset.inlineRef.toLowerCase().split('?')[0].endsWith('.png')||
     !/^[a-f0-9]{64}$/.test(asset.sha256||''))
   return fail('PDF_FIGURE_ASSET_UNAVAILABLE');
  if(!origin||origin.pdfSha256!==sourcePdf.sha256||origin.operationId!==sourcePdf.operationId||
     origin.imageSha256!==asset.sha256||!Number.isInteger(origin.page)||origin.page<1||
     !origin.crop||!['x0','y0','x1','y1'].every(k=>Number.isFinite(origin.crop[k]))||
     origin.crop.x0>=origin.crop.x1||origin.crop.y0>=origin.crop.y1||
     origin.extractionVerified!==true)
   return fail('FIGURE_NOT_EXTRACTED_FROM_THIS_PDF_RUN');
 }
 return Object.freeze({ok:true,figureCount:figureBlocks.length,
  pdfSha256:sourcePdf.sha256,operationId:sourcePdf.operationId});
}
