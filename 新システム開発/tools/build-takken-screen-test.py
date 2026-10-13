#!/usr/bin/env python3
"""Build static-first mobile screen test; works even in iOS HTML previews without JS."""
import html, json, os, subprocess, sys
from pathlib import Path
pdf=Path(os.environ["RUNNER_TEMP"])/"takken-2025-verified.pdf"
out=Path(os.environ["RUNNER_TEMP"])/"takken-screen-test.html"
records=[]
for n in (29,30):
    p=subprocess.run([sys.executable,"tools/extract-takken-on-demand.py",str(pdf),str(n)],capture_output=True,text=True,check=True)
    d=json.loads(p.stdout)
    if not (d["questionNumber"]==n and d["choicesParsed"] is True and len(d["choices"])==4 and d["stem"] and all(d["choices"])):
        raise SystemExit("QUESTION_EXTRACTION_INCOMPLETE")
    records.append(d)
MANUALLY_CONFIRMED_ANSWERS={29:2,30:3} # Prior official answer-table review; not machine verified.
esc=html.escape
parts=['<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
'<title>宅建2025 公式問題表示テスト</title>',
'<style>details{background:white;padding:18px;margin:20px 0;border-radius:12px}summary{font-weight:700;font-size:1.2em;cursor:pointer}body{font-family:system-ui,sans-serif;line-height:1.8;max-width:760px;margin:auto;padding:16px;background:#fafafa;color:#161616}section{background:white;padding:18px;margin:20px 0;border-radius:12px}p.stem{white-space:pre-wrap}label{display:block;border:1px solid #aaa;padding:12px;margin:10px 0;border-radius:8px}input{margin-right:10px}a{display:block;padding:14px;background:#e5ecf9;border-radius:8px;text-align:center}small{color:#555}</style>',
'<h1>宅建2025年度・公式問題表示テスト</h1>',
'<p>公式PDFのSHA-256照合済み。原文の完全照合、図表の有無、正答表照合は未完了。採点は過去の公式正答表の手動確認記録に基づく暫定機能です。正答表の自動照合は未完了です。</p>']
for i,d in enumerate(records):
    n=d["questionNumber"]
    parts.append(f'<details id="q{n}" {"open" if i==0 else ""}><summary>■2025年度 問{n}</summary><small>公式PDF {d["pdfPage"]}ページ</small><p class="stem">{esc(d["stem"])}</p><fieldset><legend>番号を選んでください。</legend>')
    for j,choice in enumerate(d["choices"],1):
        parts.append(f'<label><input type="radio" name="q{n}" value="{j}">{j}. {esc(choice)}</label>')
    parts.append(f'</fieldset><button type="button" class="grade" data-question="{n}" disabled>採点する</button><p class="result" aria-live="polite">番号を選択してください。</p>')
    if i+1<len(records):parts.append(f'<a href="#q{records[i+1]["questionNumber"]}">次の問題へ ↓</a>')
    else:parts.append('<p>表示確認はここまでです。</p>')
    parts.append('</details>')
parts.append('<script>const answerMap='+json.dumps(MANUALLY_CONFIRMED_ANSWERS)+';document.querySelectorAll("details").forEach(d=>{const b=d.querySelector(".grade"),r=d.querySelector(".result");d.querySelectorAll("input").forEach(x=>x.addEventListener("change",()=>{b.disabled=false;r.textContent="採点できます。"}));b.addEventListener("click",()=>{const x=d.querySelector("input:checked");if(!x)return;const a=answerMap[b.dataset.question];r.textContent=(Number(x.value)===a?"正解。":"不正解。")+"正答番号："+a;b.disabled=true;});});</script>')
parts.append('''<script>document.querySelectorAll('details').forEach((d,i,all)=>{d.addEventListener('toggle',()=>{if(d.open)all.forEach(other=>{if(other!==d)other.open=false})})});document.querySelectorAll('a[href^="#q"]').forEach(a=>a.addEventListener('click',()=>{const target=document.querySelector(a.getAttribute('href'));if(target)target.open=true}));</script>''')
parts.append('</html>')
out.write_text("".join(parts),encoding="utf-8")
print(json.dumps({"status":"static_screen_test_built","path":str(out),"questions":[d["questionNumber"] for d in records],"bytes":out.stat().st_size},ensure_ascii=False))
