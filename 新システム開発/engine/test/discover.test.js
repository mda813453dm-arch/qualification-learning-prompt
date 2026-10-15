// 公式の掲載ページからPDFを探す処理（discover.js）。HTMLは 2026-10-15 に確かめた本物の形を縮めたもの
import test from 'node:test';
import assert from 'node:assert/strict';
import { discover, fiscalYear, pdfLinks, surveyorSources, takkenSources } from '../src/discover.js';

const RETIO = `
<p>平成9年度（1997年度）から平成15年度（2003年度）まで）の試験問題は、各年度の問１から問45までの45問となります。</p>
<a href="https://www.retio.or.jp/wp-content/uploads/2025/12/R7_question_answer.pdf" title="">令和7年度 －試験問題と正解番号表－</a>
<a href="/wp-content/uploads/2024/12/R3-question_002.pdf">令和3年度（12月試験）－試験問題と正解番号表</a>
<a href="/wp-content/uploads/2024/12/R3-question.pdf">令和3年度（10月試験）－試験問題と正解番号表</a>
<a href="/wp-content/uploads/2024/10/R1-q_a.pdf">令和元年度 －試験問題と正解番号表－</a>
<a href="/wp-content/uploads/2024/10/H28-q_a.pdf">平成28年度 －試験問題と正解番号表－</a>
<a href="/other/">その他</a>`;

const GSI = `
<tr><td>令和8年5月17日</td><td><a href="/common/000278970.pdf">問題 （PDF形式：4.0MB）</a>
<a href="/common/000278971.pdf">解答一覧 （PDF形式：60KB）</a><a href="/common/000278972.pdf">問題1 （PDF形式：3.9MB）</a>
<a href="/common/000278973.pdf">問題2 （PDF形式：3.8MB）</a><a href="/common/000279272.pdf">解答例 （PDF形式：1.8MB）</a>
<a href="/common/000279273.pdf">解答用紙 （PDF形式：879KB）</a></td><td>3,966</td><td>961</td><td>24.2％</td>
<td><a href="/common/000278974.pdf">問題 （PDF形式：3.8MB）</a><a href="/common/000278975.pdf">解答一覧 （PDF形式：60KB）</a></td></tr>
<tr><td>12,269</td><td>5,447</td><td>44.4％</td><td>令和7年5月18日</td><td><a href="/common/000270172.pdf">問題1 （PDF形式：3.1MB）</a>
<a href="/common/000270173.pdf">問題2 （PDF形式：4.2MB ）</a><a href="/common/000270179.pdf">解答一覧 （PDF形式：44KB）</a>
<a href="/common/000270174.pdf">問題1 （PDF形式：4.5MB）</a><a href="/common/000270176.pdf">問題2 （PDF形式：4.6MB）</a>
<a href="/common/000271324.pdf">解答例 （PDF形式：2.5MB）</a><a href="/common/000271266.pdf">解答用紙 （PDF形式：1.1MB）</a></td><td>3,703</td><td>1,487</td><td>40.2％</td>
<td><a href="/common/000270177.pdf">問題1 （PDF形式：3.4MB）</a><a href="/common/000270178.pdf">問題2 （PDF形式：3.6MB）</a>
<a href="/common/000270180.pdf">解答一覧 （PDF形式：43KB）</a></td></tr>`;

test('年度の読み取り（令和・平成・元年・全角数字）', () => {
  assert.equal(fiscalYear('令和7年度'), 2025);
  assert.equal(fiscalYear('令和元年度'), 2019);
  assert.equal(fiscalYear('平成２８年度'), 2016);
  assert.equal(fiscalYear('その他'), null);
});

test('宅建：年度と回（10月・12月）を読み取り、直近の年度だけを選ぶ', () => {
  const s = takkenSources(pdfLinks(RETIO, 'https://www.retio.or.jp/exam/past_ques_ans/other/'), 3);
  assert.deepEqual(s.map((x) => [x.year, x.section]), [[2025, 'main'], [2021, '12月'], [2021, '10月'], [2019, 'main']]);
  assert.equal(s[1].questionUrl, 'https://www.retio.or.jp/wp-content/uploads/2024/12/R3-question_002.pdf');
});

test('測量士補：測量士の問題と分け、問題が2つに分かれた年度はまとめる', () => {
  const s = surveyorSources(pdfLinks(GSI, 'https://www.gsi.go.jp/LAW/SHIKEN/past.html'));
  assert.deepEqual(s, [
    { adapter: 'surveyor', year: 2026, section: 'main', questionUrl: 'https://www.gsi.go.jp/common/000278974.pdf', answerUrl: 'https://www.gsi.go.jp/common/000278975.pdf' },
    { adapter: 'surveyor', year: 2025, section: 'main', questionUrl: 'https://www.gsi.go.jp/common/000270177.pdf', questionUrls: ['https://www.gsi.go.jp/common/000270177.pdf', 'https://www.gsi.go.jp/common/000270178.pdf'], answerUrl: 'https://www.gsi.go.jp/common/000270180.pdf' },
  ]);
});

test('discover は掲載ページを開いて取り込み元を返す', async () => {
  const opened = [];
  const s = await discover('surveyor', async (u) => (opened.push(u), GSI));
  assert.deepEqual(opened, ['https://www.gsi.go.jp/LAW/SHIKEN/past.html']);
  assert.equal(s.length, 2);
  assert.deepEqual(await discover('unknown', async () => ''), []);
});
