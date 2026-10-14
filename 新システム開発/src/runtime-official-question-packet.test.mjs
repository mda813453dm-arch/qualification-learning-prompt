import {validateRuntimePacket,buildRuntimeLearnerQuestion,gradeRuntimeQuestion} from "./runtime-official-question-packet.js";
const p={sourceMode:"static_verified_official_packet",qualificationId:"q038",fieldId:"q038-civil-law",year:2025,questionNumber:1,questionId:"q038:2025:午後:1",stem:"official",choices:["a","b","c","d","e"],correctAnswer:1,questionPdfUrl:"https://www.moj.go.jp/content/q.pdf",answerPdfUrl:"https://www.moj.go.jp/content/a.pdf",verification:{questionText:"official_pdf_checked",choices:"official_pdf_checked",visual:"question_level_pdf_graphics_checked",answer:"same_year_official_answer_checked",field:"verified"}};
if(validateRuntimePacket(p).status!=="ready")throw new Error("STATIC_PACKET_REJECTED");
const q=buildRuntimeLearnerQuestion(p);if(q.status!=="ready"||q.choices.length!==5||q.instruction!=="番号で答えてください。")throw new Error("STATIC_DISPLAY_FAILED");
const g=gradeRuntimeQuestion(p,1);if(g.status!=="graded"||!g.correct||g.sourceMode!==p.sourceMode)throw new Error("STATIC_GRADING_FAILED");
const bad={...p,verification:{...p.verification,visual:undefined}};if(validateRuntimePacket(bad).status==="ready")throw new Error("UNVERIFIED_VISUAL_ACCEPTED");
console.log("static verified packet display/grading: PASS");
