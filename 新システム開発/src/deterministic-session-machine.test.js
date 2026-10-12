import {createDeterministicSession,rejectDirectMutation} from './deterministic-session-machine.js';

function ok(x,m){if(!x)throw new Error(m)}
const q1=Object.freeze({status:'ready',number:2});
const q2=Object.freeze({status:'ready',number:3});
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
ok(s.dispatch({type:'SKIP_EXPLANATION',packetHash:'p2'}).ok,'skip explanation remains a valid post-grade route');
console.log('PASS deterministic-session-machine 15 guards');
