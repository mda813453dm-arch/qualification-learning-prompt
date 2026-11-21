// v205: 画面切替後、枠の先頭（最新の目印）に focus し、操作した時に見ていた位置へ新しい内容の先頭を出す。
// 親ページ（ChatGPT 側）はスクロールしない。先頭が見えている時・操作していない時は位置を変えない。
// 親ページと学習枠は別オリジン（ChatGPT と同じ構成）。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { widgetHtml } from '../src/widget-v205.js';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const sid = 'focus-v205-test';
const longStem = Array.from({length:40},(_,i)=>'問10の本文 '+(i+1)+' 行目。').join('\n');
const one = {status:'question',sessionId:sid,at:100,question:{
  questionId:'takken:2025:main:10',year:2025,questionNumber:10,fieldName:'宅建業法',
  stem:longStem,choices:['1','2','3','4'],progress:{fieldIndex:1,fieldTotal:7,fieldQuestion:1,fieldQuestionTotal:84,total:167,done:0}
}};
const two = {status:'question',sessionId:sid,at:200,question:{...one.question,questionId:'takken:2025:main:11',questionNumber:11,stem:'問11の本文',
  progress:{...one.question.progress,fieldQuestion:2,done:1}}};
const grade={questionId:one.question.questionId,correct:true,selected:'3',correctAnswer:3,acceptedAnswers:[3]};
const diagScript = `window.__diag={siv:[],io:[]};(function(){var o=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(a){window.__diag.siv.push(JSON.stringify(a));return o.apply(this,arguments)};var IO=window.IntersectionObserver;if(IO)window.IntersectionObserver=function(cb,opt){return new IO(function(es,ob){es.forEach(function(e){window.__diag.io.push({i:e.isIntersecting,r:e.intersectionRatio,top:e.boundingClientRect.top,rb:e.rootBounds&&e.rootBounds.bottom})});return cb(es,ob)},opt)}})();`;
const makeWidget = extra => widgetHtml().replace('<script>','<script>'+extra+diagScript+'window.openai={toolOutput:'+JSON.stringify(one)+',toolInput:{sessionId:'+JSON.stringify(sid)+'}};<\/script><script>');
// WebKit（iPhone）と同じく、枠の scrollIntoView が ChatGPT 側へ届かない状態を Chromium でも再現する。
const noHostScroll = 'Element.prototype.scrollIntoView=function(){};';
const hostHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0"><div style="height:700px;background:#eee">chat above</div>
<iframe id="study" src="https://widget.test/w.html" style="width:100%;height:400px;border:0;display:block"></iframe>
<div style="height:900px;background:#ddd">chat below</div>
<script>
window.calls=[];
const iframe=document.getElementById('study');
const reply=(id,result)=>iframe.contentWindow.postMessage({jsonrpc:'2.0',id,result},'*');
window.deliver=view=>iframe.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{_meta:{qlp:view}}},'*');
window.addEventListener('message',e=>{
  if(e.source!==iframe.contentWindow||!e.data||e.data.jsonrpc!=='2.0')return;
  const m=e.data;
  if(m.method==='ui/notifications/size-changed'&&m.params&&m.params.height)iframe.style.height=Math.ceil(m.params.height)+'px';
  else if(m.method==='ui/initialize')reply(m.id,{protocolVersion:'2026-01-26',hostCapabilities:{}});
  else if(m.method==='ui/notifications/initialized')window.deliver(${JSON.stringify(one)});
  else if(m.method==='tools/call'){
    window.calls.push(m.params.name);
    if(m.params.name==='submitAnswer')reply(m.id,{structuredContent:{grade:${JSON.stringify(grade)},next:${JSON.stringify(two)}}});
    else if(m.params.name==='getStudySnapshot')reply(m.id,{structuredContent:${JSON.stringify(one)}});
    else if(m.params.name==='nextQuestion')reply(m.id,{structuredContent:${JSON.stringify(two)}});
    else reply(m.id,{structuredContent:{status:'recorded'}});
  }
});
</script></body></html>`;

for (const [name, engine, extra] of [['chromium', chromium, ''], ['chromium-no-host-scroll', chromium, noHostScroll], ['webkit', webkit, '']]) {
  const widget = makeWidget(extra);
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    const errors = []; page.on('pageerror', err => errors.push(err.message));
    await page.route('https://host.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: hostHtml }));
    await page.route('https://widget.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: widget }));
    await page.goto('https://host.test/');
    const ui = page.frameLocator('#study');
    await ui.locator('input[name=ans]').first().waitFor({ timeout: 10000 }).catch(async e => { throw new Error('BOOT ' + (await ui.locator('body').innerText().catch(x=>String(x))).slice(0,800) + ' ' + errors.join('/')); });
    await page.waitForTimeout(700);
    // 操作していない初回表示では親ページを動かさない。
    assert.equal(await page.evaluate(() => scrollY), 0, name + ': 初回表示で会話をスクロールしない');

    // 利用者は長い問題を読み進め、枠の下の方（解答ボタン付近）を見ている。
    // ChatGPT と同じく、枠は内容の高さ（自然高さ）で表示される。
    const frameHeight = await page.evaluate(() => document.getElementById('study').offsetHeight);
    assert.ok(frameHeight > 1500, name + ': 長い問題の枠 ' + frameHeight);
    await page.evaluate(h => scrollTo(0, 700 + h - 600), frameHeight);
    await ui.locator('input[name=ans][value="3"]').check({ force: true });
    const before = await page.evaluate(() => scrollY);
    assert.ok(before > 900, name + ': 枠の先頭が画面外にある前提 ' + before);
    await ui.getByRole('button', { name: '解答する', exact: true }).click();
    await ui.getByText('✓ 正解！').waitFor();
    await page.waitForTimeout(900);
    const top = await page.evaluate(() => {
      const f = document.getElementById('study').getBoundingClientRect().top;
      return { scrollY, frameTop: f };
    });
    const markerTop = await ui.locator('.latest').evaluate(el => el.getBoundingClientRect().top);
    const shown = top.frameTop + markerTop;
    if (!(shown >= 0 && shown < 200)) {
      const diag = await ui.locator('.latest').evaluate(el => window.__diag);
      const y0 = await page.evaluate(() => scrollY);
      await ui.locator('.latest').evaluate(el => el.focus());
      const yFocus = await page.evaluate(() => scrollY);
      await page.evaluate(() => scrollTo(0, 1800));
      await ui.locator('.latest').evaluate(el => el.scrollIntoView({ block: 'start' }));
      const ySiv = await page.evaluate(() => scrollY);
      await page.evaluate(() => scrollTo(0, 1800));
      await ui.locator('.latest').evaluate(el => el.scrollIntoView(true));
      const ySivTrue = await page.evaluate(() => scrollY);
      console.log(name, 'DIAG', JSON.stringify({ diag, y0, yFocus, ySiv, ySivTrue }));
    }
    assert.ok(shown >= 0 && shown < 200, name + ': 切替後の先頭（目印）が画面上部に見える ' + JSON.stringify({ ...top, markerTop }));
    assert.equal(await ui.locator('.latest').evaluate(el => document.activeElement === el), true, name + ': 目印に focus');

    // 先頭が見えている状態で次へ進んでも、会話は動かさない。
    const y1 = await page.evaluate(() => scrollY);
    // 画面を動かさずにボタンを押す（Playwright の click は押す前に会話をスクロールするため）。
    await ui.locator('#next').evaluate(el => el.click());
    await ui.getByText('問11の本文', { exact: true }).waitFor({ timeout: 8000 }).catch(async e => { throw new Error('NEXT ' + (await ui.locator('body').innerText()).slice(0, 1500) + ' calls=' + JSON.stringify(await page.evaluate(() => window.calls))); });
    await page.waitForTimeout(900);
    assert.equal(await page.evaluate(() => scrollY), y1, name + ': 先頭が見えていればスクロールしない');
    const shown2 = await page.evaluate(() => document.getElementById('study').getBoundingClientRect().top) + await ui.locator('.latest').evaluate(el => el.getBoundingClientRect().top);
    assert.ok(shown2 >= 0 && shown2 < 200, name + ': 次の問題の先頭も見ている位置に出る ' + shown2);
    assert.equal(await ui.locator('.latest').evaluate(el => document.activeElement === el), true, name + ': 次の問題でも目印に focus');

    // 操作していない更新（ホストからの結果通知）では、先頭が画面外でも動かさない。
    await page.evaluate(() => scrollTo(0, 1500));
    await page.waitForTimeout(100);
    const y2 = await page.evaluate(() => scrollY);
    await page.evaluate(v => window.deliver(v), { ...one, at: 300, question: { ...two.question, questionId: 'takken:2025:main:12', questionNumber: 12, stem: '問12の本文' } });
    await page.waitForTimeout(900);
    assert.equal(await page.evaluate(() => scrollY), y2, name + ': 操作していない更新では会話を動かさない');
    assert.equal(errors.length, 0, name + ': ' + errors.join(' / '));
    console.log(name, 'ok', { before, after: top.scrollY, y2, y2after: await page.evaluate(() => scrollY) });
  } finally { await browser.close(); }
}
