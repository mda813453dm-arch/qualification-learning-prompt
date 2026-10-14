import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
const fail=(reason,extra={})=>Object.freeze({status:"unavailable",reason,...extra});
const PDFSIG="%PDF-";
function bytesOf(input){if(input instanceof Uint8Array)return input;if(input instanceof ArrayBuffer)return new Uint8Array(input);if(Buffer.isBuffer(input))return new Uint8Array(input);return null;}
export async function extractPdfPageText(input,{maxPages=500}={}){
 const data=bytesOf(input);if(!data||data.length<5)return fail("PDF_BYTES_INVALID");
 if(String.fromCharCode(...data.slice(0,5))!==PDFSIG)return fail("PDF_SIGNATURE_INVALID");
 let pdf;try{pdf=await getDocument({data,disableFontFace:true,useSystemFonts:false}).promise;}catch(e){return fail("PDF_OPEN_FAILED",{code:e?.name??"ERROR"});}
 if(pdf.numPages<1||pdf.numPages>maxPages){await pdf.destroy();return fail("PDF_PAGE_COUNT_INVALID",{pageCount:pdf.numPages});}
 const pages=[];
 try{
  for(let n=1;n<=pdf.numPages;n++){
   const page=await pdf.getPage(n);const tc=await page.getTextContent({includeMarkedContent:false});
   const lines=[];let line="",lastY=null;
   for(const item of tc.items){
    if(!("str" in item))continue;const y=Array.isArray(item.transform)?Math.round(item.transform[5]):null;
    if(lastY!==null&&y!==null&&Math.abs(y-lastY)>2){if(line.trim())lines.push(line.trim());line="";}
    line+=(line?" ":"")+item.str;lastY=y;
   }
   if(line.trim())lines.push(line.trim());
   pages.push(Object.freeze({page:n,text:lines.join("\n"),textItemCount:tc.items.filter(x=>"str" in x).length}));
   page.cleanup();
  }
 }catch(e){await pdf.destroy();return fail("PDF_TEXT_EXTRACTION_FAILED",{page:pages.length+1,code:e?.name??"ERROR"});}
 await pdf.destroy();return Object.freeze({status:"ready",pageCount:pages.length,pages:Object.freeze(pages)});
}
