import {ROOT,QUALIFICATIONS,listAvailable,selectEntry,checkPacketSet,buildVisibleQuestion,createSession,verifyPngBytes} from './engine.mjs';

const root=document.getElementById('app');
const session=createSession();
let capabilities,manifest,available=[],packets=[],objectUrls=[];
const addButton=(parent,label,handler,disabled=false)=>{
  const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=disabled;b.addEventListener('click',handler);parent.append(b);return b;
};
const el=(name,text='',cls='')=>{const node=document.createElement(name);node.textContent=text;if(cls)node.className=cls;return node;};
const clear=()=>{root.replaceChildren();root.append(el('p','公式資料から検証された問題だけを出題します。採点・進行はプログラムが管理します。','lead'));};
const line=(text,heading=false)=>root.append(el(heading?'h2':'p',text));
const button=(label,handler,disabled)=>addButton(root,label,handler,disabled);
const error=(reason)=>{root.replaceChildren();root.append(el('h2','出題を停止しました'));line('公式問題・図表の検証が完了しなかったため、問題を出題しません。');line('確認コード：'+reason);button('最初からやり直す',()=>location.reload());};
async function getJson(url){
  if(!url.startsWith(ROOT))throw Error('SOURCE_NOT_ALLOWED');
  const r=await fetch(url,{cache:'no-store',redirect:'error'});
  if(!r.ok)throw Error('SOURCE_FETCH_FAILED_'+r.status);
  return r.json();
}
async function init(){
  clear();line('利用可能な資格を確認しています…');
  try{
    [capabilities,manifest]=await Promise.all([getJson(ROOT+'capabilities.json'),getJson(ROOT+'manifest.json')]);
    available=listAvailable(capabilities,manifest);
    if(!available.length)throw Error('NO_VERIFIED_QUALIFICATION');
    draw();
  }catch(e){error(e.message||'LOAD_FAILED');}
}
function choose(action,payload){const r=session.dispatch(action,payload);if(!r.ok){error(r.code);return false;}draw();return true;}
function draw(){
  const s=session.state();clear();
  switch(s.phase){
    case 'SELECT_QUALIFICATION':
      line('学習する資格を選択してください',true);
      for(const q of available)button(q.name,()=>choose('QUALIFY',{id:q.id}));
      line('現在は公式データを公開済みの資格・問題だけを利用できます。');break;
    case 'OVERVIEW':{
      const e=manifest.entries.filter(x=>x.qualificationId===s.qualificationId && x.verificationStatus==='verified_official');
      line(QUALIFICATIONS[s.qualificationId].name+'：利用可能な公式過去問',true);
      line('検証済み分野数：'+new Set(e.map(x=>x.fieldId)).size+'、問題数：'+e.reduce((n,x)=>n+x.packetCount,0));
      line('試験科目・試験時間・合格基準の網羅的な概要は、この試験用画面では未実装です。');
      button('確認して進む',()=>choose('OVERVIEW_ACK'));break;
    }
    case 'EXEMPTION':line('免除制度の利用状況',true);line('ご自身が該当する制度に合わせて選択してください。');
      button('1. 免除を利用する',()=>choose('SET_EXEMPTION',{value:1}));
      button('2. 免除を利用しない',()=>choose('SET_EXEMPTION',{value:2}));break;
    case 'STAGE':line('現在の学習段階を選択してください',true);
      ['未着手','基礎','応用','過去問'].forEach((x,i)=>button(`${i+1}. ${x}`,()=>choose('SET_STAGE',{value:i+1})));break;
    case 'PLAN':{
      line('学習計画（検証済み問題の範囲）',true);
      const entries=manifest.entries.filter(x=>x.qualificationId===s.qualificationId && x.verificationStatus==='verified_official');
      line('登録済み公式問題 '+entries.reduce((n,x)=>n+x.packetCount,0)+' 問を、分野・問題番号順に学習します。');
      line('未登録の分野・年度は学習可能と表示しません。');
      button('1. 学習を開始する',()=>choose('APPROVE_PLAN'));
      button('2. 今は学習しない',()=>{root.replaceChildren(el('p','学習は開始していません。'));});break;
    }
    case 'MODE':line('学習モードを選択してください',true);
      button('1. 解説から（未実装）',()=>{},true);
      button('2. 確認問題から（未実装）',()=>{},true);
      button('3. 公式過去問による実践学習',()=>choose('SET_MODE',{mode:'PRACTICE'}));break;
    case 'LOADING':line('公式問題を検証しています…',true);loadQuestion();break;
    case 'VERIFYING_IMAGE':line('公式図表を照合しています…',true);break;
    case 'ANSWER_WAIT':showQuestion(s.visual,s);break;
    case 'GRADED':showGrade(s);break;
    case 'REVIEW_BLOCKED':line('同一分野で3問連続不正解です',true);line('確認問題の検証済みデータがないため、自動作成せず停止します。');button('学習を終了する',()=>choose('END'));break;
    case 'FINISHED':line('学習を終了しました',true);line('回答済み：'+s.history.length+' 問');
      line('正解：'+s.history.filter(x=>x.correct).length+' 問');button('最初へ戻る',()=>location.reload());break;
    case 'FAILED':error(s.failureCode);break;
  }
}
async function loadQuestion(){
  try{
    const s=session.state();
    if(!packets.length){
      const entries=manifest.entries.filter(e=>e.qualificationId===s.qualificationId && e.verificationStatus==='verified_official');
      if(!entries.length)throw Error('VERIFIED_PACKETS_NOT_AVAILABLE');
      const sets=await Promise.all(entries.map(async entry=>checkPacketSet(await getJson(entry.packetUrl),entry)));
      packets=sets.flat();
    }
    const index=s.questionIndex;
    const p=packets[index];
    if(!p){const end=session.dispatch('END');draw();return;}
    if(!session.dispatch('PREPARE',{packets,index}).ok)throw Error('PREPARE_REJECTED');
    draw();
    for(const u of objectUrls)URL.revokeObjectURL(u);objectUrls=[];
    const visuals=[];
    for(const asset of p.diagramAssets||[]){
      if(!asset.url.startsWith(ROOT+'assets/'))throw Error('UNTRUSTED_ASSET_URL');
      const response=await fetch(asset.url,{cache:'no-store',redirect:'error'});
      if(!response.ok)throw Error('IMAGE_FETCH_FAILED');
      const bytes=await response.arrayBuffer();
      await verifyPngBytes(bytes,asset.sha256,crypto.subtle);
      const objectUrl=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
      objectUrls.push(objectUrl);
      const image=new Image();image.src=objectUrl;await image.decode();
      visuals.push(objectUrl);
    }
    const question=buildVisibleQuestion(p,visuals);
    const applied=session.dispatch('DISPLAY_VERIFIED',{question});
    if(!applied.ok)throw Error(applied.code);
    draw();
  }catch(e){session.dispatch('FAIL',{code:e.message||'VERIFY_FAILED'});error(e.message||'VERIFY_FAILED');}
}
function showQuestion(q,s){
  line(`■${q.year}年度 ${q.section}　問${q.number}`,true);
  if(q.stem)line(q.stem);
  for(const src of q.images){const img=document.createElement('img');img.src=src;img.alt=`問${q.number}の公式問題本文と図表`;img.className='official-image';root.append(img);}
  if(q.images.length)line('上の公式問題画像に記載された本文・条件も確認してください。');
  const list=el('ol');for(const choice of q.choices)list.append(el('li',choice));root.append(list);
  line(q.instruction);
  q.choices.forEach((_,i)=>button(String(i+1),()=>choose('ANSWER',{value:i+1})));
  button('学習を終了する',()=>choose('END'));
}
function showGrade(s){
  line(s.graded.correct?'正解です':'不正解です',true);
  line(`選択：${s.graded.selected} ／ 正解：${s.graded.correctAnswer}`);
  const a=el('a','同年度の公式正答資料');a.href=s.graded.answerPdfUrl;a.target='_blank';a.rel='noopener noreferrer';root.append(a);
  const next=s.questionIndex+1<packets.length;
  button(next?'次の公式問題へ':'学習結果へ',()=>{const res=session.dispatch('NEXT');if(!res.ok){error(res.code);return;}draw();});
  button('学習を終了する',()=>choose('END'));
}
window.addEventListener('pagehide',()=>objectUrls.forEach(x=>URL.revokeObjectURL(x)));
init();