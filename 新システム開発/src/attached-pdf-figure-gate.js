/**
 * Require each inline figure to be freshly extracted from the official PDF
 * attached in the same chat. A cached PNG or a sandbox path copied from a
 * different conversation is not portable and must not make a question ready.
 *
 * sourcePdf and asset provenance are populated by the trusted attachment/PDF
 * extraction connector, not inferred from filenames or user-authored text.
 */
export function verifyAttachedPdfFigureSource(question, assetRegistry, sourcePdf) {
 const fail=reason=>Object.freeze({ok:false,reason});
 if(!question||question.status!=='ready'||!Array.isArray(question.contentBlocks))
  return fail('QUESTION_NOT_READY');
 const figureBlocks=question.contentBlocks.filter(b=>b?.type==='figure');
 if(!figureBlocks.length)return Object.freeze({ok:true,figureCount:0});
 if(!sourcePdf||sourcePdf.serverReceived!==true||sourcePdf.receivedInCurrentChat!==true||
    sourcePdf.mediaType!=='application/pdf'||typeof sourcePdf.fileId!=='string'||!sourcePdf.fileId||
    !/^[a-f0-9]{64}$/.test(sourcePdf.sha256||'')||typeof sourcePdf.chatId!=='string'||!sourcePdf.chatId)
  return fail('CURRENT_CHAT_OFFICIAL_PDF_REQUIRED');
 if(typeof assetRegistry?.resolve!=='function')return fail('ASSET_REGISTRY_REQUIRED');
 const seen=new Set();
 for(const block of figureBlocks){
  if(typeof block.assetId!=='string'||!block.assetId||seen.has(block.assetId))
   return fail('FIGURE_ASSET_ID_INVALID');
  seen.add(block.assetId);
  const asset=assetRegistry.resolve(block.assetId);
  const origin=asset?.derivedFromPdf;
  if(!asset||asset.questionId!==question.id||asset.verified!==true||asset.mime!=='image/png'||
     typeof asset.inlineRef!=='string'||!asset.inlineRef.startsWith('sandbox:/mnt/data/')||
     !asset.inlineRef.toLowerCase().split('?')[0].endsWith('.png')||
     !/^[a-f0-9]{64}$/.test(asset.sha256||''))
   return fail('PDF_FIGURE_ASSET_UNAVAILABLE');
  if(asset.generatedInChatId!==sourcePdf.chatId||!origin||
     origin.fileId!==sourcePdf.fileId||origin.pdfSha256!==sourcePdf.sha256||
     !Number.isInteger(origin.page)||origin.page<1||
     !origin.crop||!['x0','y0','x1','y1'].every(k=>Number.isFinite(origin.crop[k]))||
     origin.crop.x0>=origin.crop.x1||origin.crop.y0>=origin.crop.y1||
     origin.extractionVerified!==true)
   return fail('FIGURE_NOT_EXTRACTED_FROM_CURRENT_CHAT_PDF');
 }
 return Object.freeze({ok:true,figureCount:figureBlocks.length,pdfFileId:sourcePdf.fileId,pdfSha256:sourcePdf.sha256});
}
