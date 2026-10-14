const norm=s=>String(s??"").normalize("NFKC").replace(/\r/g,"").replace(/[ \t]+/g," ").trim();
const num=s=>Number(String(s).normalize("NFKC"));
const defaultQuestionPatterns=[
 /(?:^|\n)\s*[【［\[]?\s*問\s*([0-9０-９]+)\s*[】］\]]?/g,
 /(?:^|\n)\s*第\s*([0-9０-９]+)\s*問/g,
 /(?:^|\n)\s*([0-9０-９]+)\s*[\.．、]\s+/g
];
const defaultChoicePattern=/(?:^|\n)\s*([1-9１-９][0-9０-９]*)\s*[\.．、\)）]\s*/g;
const diagramPattern=/(?:〔\s*図\s*〕|\[\s*図\s*\]|次の図|下図|図に示|図のよう|別図|図表)/;

export function segmentQuestionCandidates(pages,{questionPatterns=defaultQuestionPatterns,choicePattern=defaultChoicePattern}={}){
 if(!Array.isArray(pages)||!pages.length)return Object.freeze([]);
 const joined=pages.map((p,i)=>({page:Number.isInteger(p?.page)?p.page:i+1,text:String(p?.text??"")})); 
 const offsets=[];let cursor=0;for(const p of joined){offsets.push({start:cursor,end:cursor+p.text.length,page:p.page});cursor+=p.text.length+1;}
 const all=joined.map(x=>x.text).join("\n");
 const marks=[];
 for(const re0 of questionPatterns){const re=new RegExp(re0.source,re0.flags.includes("g")?re0.flags:re0.flags+"g");let m;while((m=re.exec(all)))marks.push({index:m.index,bodyStart:re.lastIndex,questionNumber:num(m[1]),heading:m[0]});}
 marks.sort((a,b)=>a.index-b.index);
 const unique=marks.filter((m,i,a)=>i===0||m.index!==a[i-1].index);
 const out=[];
 for(let i=0;i<unique.length;i++){
  const m=unique[i],end=i+1<unique.length?unique[i+1].index:all.length;
  const raw=all.slice(m.bodyStart,end).trim();const cms=[];let cm;const cre=new RegExp(choicePattern.source,choicePattern.flags.includes("g")?choicePattern.flags:choicePattern.flags+"g");
  while((cm=cre.exec(raw)))cms.push({n:num(cm[1]),index:cm.index,start:cre.lastIndex});
  let stem=raw,choices=[];
  if(cms.length){stem=raw.slice(0,cms[0].index).trim();choices=cms.map((x,j)=>norm(raw.slice(x.start,j+1<cms.length?cms[j+1].index:raw.length)));}
  const absEnd=end;const sourcePages=offsets.filter(o=>o.end>=m.index&&o.start<=absEnd).map(o=>o.page);
  const nums=cms.map(x=>x.n);const sequential=nums.length>0&&nums.every((n,j)=>n===j+1);
  out.push(Object.freeze({questionNumber:m.questionNumber,stem:norm(stem),choices:Object.freeze(choices),sourcePages:Object.freeze(sourcePages),
   boundaryCandidate:true,pageSpanCandidate:sourcePages.length>1,choiceSequenceCandidate:sequential,
   diagramReferenceCandidate:diagramPattern.test(stem)||diagramPattern.test(raw),rawText:norm(raw)}));
 }
 return Object.freeze(out);
}

export function assessSegmentationCandidate(c,{expectedChoiceCount=null}={}){
 const issues=[];
 if(!Number.isInteger(c?.questionNumber))issues.push("question_number");
 if(!c?.stem)issues.push("stem");
 if(!Array.isArray(c?.choices)||!c.choices.length)issues.push("choices");
 if(c?.choiceSequenceCandidate!==true)issues.push("choice_sequence");
 if(expectedChoiceCount!=null&&c?.choices?.length!==expectedChoiceCount)issues.push("choice_count");
 return Object.freeze({status:issues.length?"needs_adapter_verification":"candidate_ready",issues:Object.freeze(issues)});
}
