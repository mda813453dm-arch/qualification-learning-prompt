import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosisOrder, diagnosisRows } from '../src/study.js';

test('診断同率は比較可能な確信度だけをタイブレークに用いる', () => {
  const a = [
    {fieldId:'a',result:'wrong',confidence:'sure'}, {fieldId:'a',result:'correct',confidence:'sure'},
    {fieldId:'b',result:'wrong',confidence:'guess'}, {fieldId:'b',result:'correct',confidence:'unsure'}
  ];
  const evaluated=diagnosisOrder(['a','b'],a,{a:10,b:2});
  assert.deepEqual(evaluated.order,['b','a'],'同率でも勘が多い分野を先にする');
  assert.deepEqual(evaluated.ties,[['a','b']],'診断上は同程度の扱いを残す');
  assert.equal(evaluated.rows.find(x=>x.fieldId==='b').uncertaintyRate,1);
});

test('確信度の一方が欠測なら推定せず出題頻度で順位を決める',()=>{
  const r=diagnosisOrder(['a','b'],[
    {fieldId:'a',result:'wrong'}, {fieldId:'a',result:'correct'},
    {fieldId:'b',result:'wrong',confidence:'guess'}, {fieldId:'b',result:'correct',confidence:'unsure'}
  ],{a:10,b:2});
  assert.deepEqual(r.order,['a','b']);
  assert.equal(r.rows.find(x=>x.fieldId==='a').uncertaintyRate,null);
});

test('診断未回答は誤答率の分母に含めず、全正解・全不正解は有効回答だけ',()=>{
  const rows=diagnosisRows(['a','b'],[
    {fieldId:'a',result:'wrong'}, {fieldId:'a',result:'unanswered'},
    {fieldId:'b',result:'confident_correct'}
  ]);
  assert.equal(rows[0].n,1);assert.equal(rows[0].rate,1);
  assert.equal(rows[1].n,1);assert.equal(rows[1].rate,0);
  assert.deepEqual(diagnosisOrder(['a','b'],[{fieldId:'a',result:'unanswered'}]).undiagnosed,['a','b']);
});
