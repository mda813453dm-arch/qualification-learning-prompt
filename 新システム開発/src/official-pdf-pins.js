/** Trusted, code-owned allowlist; never accept user-provided hash as authority. */
export const OFFICIAL_PDF_PINS = Object.freeze({
  '土地家屋調査士:2025:午後': Object.freeze({
    questionPdfUrl:'https://www.moj.go.jp/content/001450011.pdf',
    answerPdfUrl:'https://www.moj.go.jp/content/001450015.pdf',
    questionSha256:'928c94f3d183788302bf7f9b7e70fb4d3ef40762761fa5e3d3f261a913920a6c',
    answerSha256:'3b6c2bbcb630b6ff6f989890f4e544e0eae7f8067fbefa86cad613fe5b659fad'
  })
});
export function createPinnedOfficialVerifier({verifyOfficialSource, pins=OFFICIAL_PDF_PINS}) {
  if(typeof verifyOfficialSource!=='function')throw new Error('VERIFIER_REQUIRED');
  return async function verify(evidence) {
    if(!evidence||evidence.sourceType!=='official_pdf_pair'||typeof evidence.registryKey!=='string')return false;
    const pin=pins[evidence.registryKey];
    if(!pin)return false;
    for(const k of ['questionPdfUrl','answerPdfUrl','questionSha256','answerSha256'])if(evidence[k]!==pin[k])return false;
    return await verifyOfficialSource({...pin,sourceType:'official_pdf_pair'})===true;
  };
}
