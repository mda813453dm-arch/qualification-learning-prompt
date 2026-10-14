import json,io,hashlib,base64,os
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright
root=Path(__file__).parent
im=Image.new('RGB',(450,350),'white');buf=io.BytesIO();im.save(buf,format='PNG');image=buf.getvalue();hashimg=hashlib.sha256(image).hexdigest()
root_url='https://raw.githubusercontent.com/mda813453dm-arch/qualification-learning-prompt/ai-learning-system/新システム開発/data/runtime-packets/'
packet_url=root_url+'verified/q063-2026-visual.json';img_url=root_url+'assets/q063/2026/fixture.png'
packets=[]
for number,answer in [(7,4),(27,1)]:
 packets.append({'sourceMode':'static_verified_official_packet','packetStatus':'verified_official','questionId':f'test-{number}','year':2026,'section':'測量士補','questionNumber':number,'fieldId':'q063-survey-calculation','stem':'公式問題本文・図表はdiagramAssetsの公式PDFページ画像を一体表示して出題する。','choices':['a','b','c','d','e'],'correctAnswer':answer,'diagramRequired':True,'diagramAssets':[{'url':img_url,'sha256':hashimg,'sourcePdfPage':1,'kind':'official_question_page'}],'questionPdfSha256':'a'*64,'answerPdfSha256':'a'*64,'questionPdfUrl':'https://www.gsi.go.jp/problem.pdf','answerPdfUrl':'https://www.gsi.go.jp/answer.pdf','verification':{'questionText':'official_pdf_checked','choices':'official_pdf_checked','visual':'question_level_pdf_graphics_checked','answer':'same_year_official_answer_checked','field':'verified'}})
fixture={'capabilities.json':{'schemaVersion':1,'qualifications':[{'qualificationId':'q063','officialPracticeRuntime':'static_verified_packets_available'}]},'manifest.json':{'schemaVersion':1,'entries':[{'qualificationId':'q063','fieldId':'q063-survey-calculation','year':2026,'packetCount':2,'verificationStatus':'verified_official','packetUrl':packet_url}]},'q063-2026-visual.json':{'schemaVersion':1,'qualificationId':'q063','fieldId':'q063-survey-calculation','year':2026,'verificationStatus':'verified_official','packets':packets}}
html=(root/'index.html').read_text().replace('<script type="module" src="./app.mjs"></script>','')
e=(root/'engine.mjs').read_text().replace('export const ','const ').replace('export function ','function ').replace('export async function ','async function ')
a=(root/'app.mjs').read_text();a=a[a.index('\n',a.index('import '))+1:]
script=e+'\n'+a
with sync_playwright() as pw:
 b=pw.chromium.launch(headless=True,args=['--no-sandbox'],**({'executable_path':'/usr/bin/chromium'} if os.path.exists('/usr/bin/chromium') else {}))
 def setup(tamper=False):
  page=b.new_page(viewport={'width':390,'height':844})
  page.goto('about:blank');page.set_content(html)
  js='''({fixture,png,hash})=>{
    const bin=Uint8Array.from(atob(png),v=>v.charCodeAt(0));
    const digest=Uint8Array.from(hash.match(/../g),v=>parseInt(v,16));
    Object.defineProperty(crypto,'subtle',{value:{digest:async()=>digest.buffer},configurable:true});
    window.fetch=async(url)=>{
      const name=Object.keys(fixture).find(x=>url.endsWith(x));
      if(name)return new Response(JSON.stringify(fixture[name]),{status:200});
      if(url.endsWith('fixture.png'))return new Response(bin,{status:200});
      throw new Error('unexpected URL '+url)
    }
   }'''
  page.evaluate(js,{'fixture':fixture,'png':base64.b64encode(image).decode(),'hash':hashimg})
  if tamper:
   page.evaluate("(()=>{const original=window.fetch;window.fetch=async(url)=>url.endsWith('fixture.png') ? new Response(new Uint8Array([1,2,3,4,5,6,7,8,9,0])) : original(url);})()")
  page.add_script_tag(content=script)
  page.get_by_role('button',name='測量士補').click();page.get_by_role('button',name='確認して進む').click();page.get_by_role('button',name='4. 過去問').click();page.get_by_role('button',name='1. 学習を開始する').click();page.get_by_role('button',name='3. 公式過去問による実践学習').click()
  return page
 p=setup()
 p.get_by_role('heading',name='■2026年度 測量士補　問7').wait_for(timeout=5000)
 assert p.locator('ol li').count()==5
 assert p.locator('img.official-image').count()==1
 p.screenshot(path=str(root/'local-browser-smoke.png'),full_page=True)
 p.get_by_role('button',name='4',exact=True).click()
 assert p.get_by_role('heading',name='正解です').count()==1
 p.get_by_role('button',name='次の公式問題へ').click()
 p.get_by_role('heading',name='■2026年度 測量士補　問27').wait_for(timeout=5000)
 p.get_by_role('button',name='1',exact=True).click()
 p.get_by_role('button',name='学習結果へ').click()
 assert '回答済み：2 問' in p.locator('#app').inner_text()
 print('PASS local browser: complete problem, image, five choices, grading, next, finish')
 q=setup(tamper=True)
 q.get_by_role('heading',name='出題を停止しました').wait_for(timeout=5000)
 assert q.get_by_role('button',name='4',exact=True).count()==0
 print('PASS local browser: modified image bytes block answer buttons')
 b.close()