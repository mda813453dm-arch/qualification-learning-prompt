import {createDeterministicSession,rejectDirectMutation} from './deterministic-session-machine.js';

function ok(x,m){if(!x)throw new Error(m)}
const q1=Object.freeze({status:'ready',number:2,topicId:'topic-a'});
const q2=Object.freeze({status:'ready',number:3,topicId:'topic-a'});
const packet=Object.freeze({status:'ready',packetHash:'p2',answer:Object.freeze({value:4})});
const s=createDeterministicSession();

ok(!s.dispatch({type:'SUBMIT_ANSWER',value:4}).ok,'skip must fail');
ok(s.dispatch({type:'SET_QUALIFICATION',qualificationId:'land-surveyor'}).ok,'qualification');
ok(!s.dispatch({type:'PIN_QUESTION',question:q1}).ok,'source skip');
ok(s.dispatch({type:'PIN_SOURCE',source:{problemSha256:'problem',answerSha256:'answer'}}).ok,'source');
ok(s.dispatch({type:'PIN_QUESTION',question:q1}).ok,'question');
ok(s.dispatch({type:'PIN_ASSETS',assets:[{assetId:'q2fig',sha256:'fig',sourcePage:2}]}).ok,'assets');
ok(s.dispatch({type:'VALIDATE_PACKET',packet}).ok,'packet');
ok(!s.dispatch({type:'OPEN_ANSWER'}).ok,'cannot answer before render');
ok(!s.dispatch({type:'COMMIT_RENDER',receipt:{complete:true,packetHash:'wrong'}}).ok,'wrong render hash');
ok(s.dispatch({type:'COMMIT_RENDER',receipt:{complete:true,packetHash:'p2'}}).ok,'render');
ok(s.dispatch({type:'OPEN_ANSWER'}).ok,'answer wait');
ok(s.dispatch({type:'SUBMIT_ANSWER',value:4}).state.grade.correct===true,'grade pinned');
ok(s.dispatch({type:'COMMIT_EXPLANATION',explanation:'解説',packetHash:'p2'}).ok,'explain');
ok(s.dispatch({type:'FIX_NEXT',nextQuestionNumber:3}).ok,'next fixed');
ok(!s.dispatch({type:'LOAD_NEXT',question:q1}).ok,'wrong next');
ok(s.dispatch({type:'LOAD_NEXT',question:q2}).ok,'load next');
let blocked=false;try{rejectDirectMutation('set_grade')}catch{blocked=true}ok(blocked,'direct mutation');
const skip=createDeterministicSession();
ok(skip.dispatch({type:'SET_QUALIFICATION',qualificationId:'land-surveyor'}).ok,'skip qualification');
ok(skip.dispatch({type:'PIN_SOURCE',source:{problemSha256:'p',answerSha256:'a'}}).ok,'skip source');
ok(skip.dispatch({type:'PIN_QUESTION',question:q1}).ok,'skip question');
ok(skip.dispatch({type:'PIN_ASSETS',assets:[]}).ok,'skip assets');
ok(skip.dispatch({type:'VALIDATE_PACKET',packet}).ok,'skip packet');
ok(skip.dispatch({type:'COMMIT_RENDER',receipt:{complete:true,packetHash:'p2'}}).ok,'skip render');
ok(skip.dispatch({type:'OPEN_ANSWER'}).ok,'skip wait');
ok(skip.dispatch({type:'SUBMIT_ANSWER',value:1}).ok,'skip grade');
ok(skip.dispatch({type:'SKIP_EXPLANATION',packetHash:'p2'}).state.phase==='EXPLAINED','skip explanation route');
console.log('PASS deterministic-session-machine 15 guards');

const topic='37-article';
const review=createDeterministicSession();
ok(review.dispatch({type:'SET_QUALIFICATION',qualificationId:'takken'}).ok,'qualification');
ok(review.dispatch({type:'PIN_SOURCE',source:{problemSha256:'p',answerSha256:'a'}}).ok,'source');
for(const [i,n] of [29,30,31].entries()){
 const q={status:'ready',number:n,kind:'practice',topicId:topic};
 if(i===0)ok(review.dispatch({type:'PIN_QUESTION',question:q}).ok,'first question');
 else ok(review.dispatch({type:'LOAD_NEXT',question:q}).ok,'next question');
 ok(review.dispatch({type:'PIN_ASSETS',assets:[]}).ok,'assets');
 const packet={status:'ready',packetHash:'p'+n,answer:{value:2}};
 ok(review.dispatch({type:'VALIDATE_PACKET',packet}).ok,'packet');
 ok(review.dispatch({type:'COMMIT_RENDER',receipt:{complete:true,packetHash:packet.packetHash}}).ok,'render');
 ok(review.dispatch({type:'OPEN_ANSWER'}).ok,'wait');
 ok(review.dispatch({type:'SUBMIT_ANSWER',value:1}).ok,'wrong answer');
 ok(review.dispatch({type:'COMMIT_EXPLANATION',packetHash:packet.packetHash,explanation:'説明'}).ok,'explain');
 if(i<2){
  ok(review.state().consecutiveWrong===i+1,'wrong streak before threshold');
  ok(review.dispatch({type:'FIX_NEXT',nextQuestionNumber:n+1}).ok,'fix next');
 }
}
ok(review.state().phase==='REVIEW_REQUIRED','three same-topic wrongs trigger review');
ok(!review.dispatch({type:'FIX_NEXT',nextQuestionNumber:32}).ok,'normal next blocked');
ok(review.dispatch({type:'PIN_REVIEW_QUESTION',question:{status:'ready',kind:'review',number:900,topicId:topic,reviewChainId:'chain-1'}}).ok,'review accepted');
console.log('PASS 3 consecutive wrong same-topic review gate');

const reviewPacket={status:'ready',packetHash:'review900',answer:{value:2}};
ok(review.dispatch({type:'PIN_ASSETS',assets:[]}).ok,'review assets');
ok(review.dispatch({type:'VALIDATE_PACKET',packet:reviewPacket}).ok,'review packet');
ok(review.dispatch({type:'COMMIT_RENDER',receipt:{complete:true,packetHash:'review900'}}).ok,'review render');
ok(review.dispatch({type:'OPEN_ANSWER'}).ok,'review wait');
ok(review.dispatch({type:'SUBMIT_ANSWER',value:1}).ok,'review wrong');
ok(review.state().consecutiveWrong===3,'review wrong does not increment practice');
ok(review.state().reviewWrong===1,'review wrong increments review only');
ok(review.dispatch({type:'COMMIT_EXPLANATION',packetHash:'review900',explanation:'解説'}).ok,'review explanation');
ok(review.state().phase==='REVIEW_REQUIRED','another review required');
ok(!review.dispatch({type:'FIX_NEXT',nextQuestionNumber:32}).ok,'cannot bypass review');
console.log('PASS independent practice/review counters');
