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
esc=html.escape
parts=['<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
'<title>宅建2025 公式問題表示テスト</title>',
'<style>body{font-family:system-ui,sans-serif;line-height:1.8;max-width:760px;margin:auto;padding:16px;background:#fafafa;color:#161616}section{background:white;padding:18px;margin:20px 0;border-radius:12px}p.stem{white-space:pre-wrap}label{display:block;border:1px solid #aaa;padding:12px;margin:10px 0;border-radius:8px}input{margin-right:10px}a{display:block;padding:14px;background:#e5ecf9;border-radius:8px;text-align:center}small{color:#555}</style>',
'<h1>宅建2025年度・公式問題表示テスト</h1>',
'<p>公式PDFのSHA-256照合済み。原文の完全照合、図表の有無、正答表照合は未完了。採点は無効です。</p>']
for i,d in enumerate(records):
    n=d["questionNumber"]
    parts.append(f'<section id="q{n}"><h2>■2025年度 問{n}</h2><small>公式PDF {d["pdfPage"]}ページ</small><p class="stem">{esc(d["stem"])}</p><fieldset><legend>番号を選んでください。</legend>')
    for j,choice in enumerate(d["choices"],1):
        parts.append(f'<label><input type="radio" name="q{n}" value="{j}">{j}. {esc(choice)}</label>')
    parts.append('</fieldset><p>※選択状態は確認できますが、採点は行いません。</p>')
    if i+1<len(records):parts.append(f'<a href="#q{records[i+1]["questionNumber"]}">次の問題へ ↓</a>')
    else:parts.append('<p>表示確認はここまでです。</p>')
    parts.append('</section>')
parts.append('</html>')
out.write_text("".join(parts),encoding="utf-8")
print(json.dumps({"status":"static_screen_test_built","path":str(out),"questions":[d["questionNumber"] for d in records],"bytes":out.stat().st_size},ensure_ascii=False))
