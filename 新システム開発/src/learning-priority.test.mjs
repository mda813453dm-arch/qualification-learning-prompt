import assert from "node:assert/strict";
import { rankLearningAreas, PRIORITY_EVIDENCE } from "./learning-priority.js";

const areas=[
 {id:"a",label:"A",overviewOrder:1},
 {id:"b",label:"B",overviewOrder:2},
 {id:"c",label:"C",overviewOrder:3}
];
let r=rankLearningAreas({areas,questionRecords:[
 {year:2025,questionNumber:1,areaId:"b",officialVerified:true},
 {year:2025,questionNumber:2,areaId:"b",officialVerified:true},
 {year:2025,questionNumber:3,areaId:"a",officialVerified:true},
 {year:2024,questionNumber:1,areaId:"c",officialVerified:true}
]});
assert.equal(r.basis,PRIORITY_EVIDENCE.VERIFIED_FREQUENCY);
assert.deepEqual(r.areas.map(x=>x.id),["b","a","c"]);
assert.deepEqual(r.areas.map(x=>x.verifiedQuestionCount),[2,1,1]);

r=rankLearningAreas({areas,questionRecords:[
 {year:2025,questionNumber:1,areaId:"b",officialVerified:false}
]});
assert.equal(r.basis,PRIORITY_EVIDENCE.OFFICIAL_OVERVIEW_ORDER);
assert.deepEqual(r.areas.map(x=>x.id),["a","b","c"]);

r=rankLearningAreas({areas,questionRecords:[
 {year:2025,questionNumber:1,areaId:"b",officialVerified:true}
]});
assert.equal(r.basis,PRIORITY_EVIDENCE.OFFICIAL_OVERVIEW_ORDER);
console.log("learning-priority tests passed");
