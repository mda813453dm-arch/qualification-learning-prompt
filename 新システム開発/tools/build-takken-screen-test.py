#!/usr/bin/env python3
"""Build a standalone mobile HTML test from verified, on-demand extracted questions.
This is a UI prototype, not a ChatGPT-native rendering integration.
"""
import hashlib, html, json, os, subprocess, sys
from pathlib import Path
pdf = Path(os.environ["RUNNER_TEMP"]) / "takken-2025-verified.pdf"
out = Path(os.environ["RUNNER_TEMP"]) / "takken-screen-test.html"
records = []
for n in (29, 30):
    p = subprocess.run([sys.executable, "tools/extract-takken-on-demand.py", str(pdf), str(n)], text=True, capture_output=True, check=True)
    d = json.loads(p.stdout)
    if not(d["questionNumber"] == n and d["choicesParsed"] is True and len(d["choices"]) == 4 and d["stem"]):
        raise SystemExit("QUESTION_EXTRACTION_INCOMPLETE")
    records.append({"number":n, "stem":d["stem"], "choices":d["choices"], "page":d["pdfPage"]})
payload = json.dumps(records, ensure_ascii=False).replace("<", "\\u003c")
page = """<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>宅建2025 画面試験（抽出表示のみ）</title>
<style>body{font-family:system-ui,sans-serif;line-height:1.75;max-width:760px;margin:auto;padding:20px;background:#fafafa;color:#161616}main{background:white;padding:18px;border-radius:14px}button{display:block;width:100%;padding:14px;margin:12px 0;border:1px solid #aaa;border-radius:10px;background:#fff;text-align:left;font-size:16px}button:focus{outline:3px solid #3865a8}.muted{color:#666}#stem{white-space:pre-wrap}</style>
<main><h2>宅建2025年度・公式問題表示テスト</h2><p class="muted">公式PDF SHA-256照合済み。図表の有無・正答欄の照合は未完了。これは出題画面の表示・選択・次問遷移のみのテストです。採点機能は有効化していません。</p><h3 id="title"></h3><div id="stem"></div><div id="choices"></div><p id="selection" aria-live="polite"></p><button id="next" disabled>次の問題へ</button><p id="status" class="muted"></p></main>
<script>
const questions=__PAYLOAD__;
let index=0,selected=null;
const el=id=>document.getElementById(id);
function render(){
 const q=questions[index];selected=null;
 el('title').textContent='■2025年度 問'+q.number;
 el('stem').textContent=q.stem;
 el('choices').replaceChildren();
 q.choices.forEach((choice,i)=>{const b=document.createElement('button');b.textContent=(i+1)+'. '+choice;b.onclick=()=>{selected=i+1;el('selection').textContent='選択：'+selected+'（採点は未実装）';el('next').disabled=false};el('choices').append(b)});
 el('selection').textContent='番号を選んでください。';el('next').disabled=true;
 el('next').textContent=index+1<questions.length?'次の問題へ':'終了';
 el('status').textContent='公式PDF '+q.page+'ページ／'+(index+1)+' / '+questions.length;
}
el('next').onclick=()=>{if(selected===null)return;if(index+1<questions.length){index++;render()}else{el('status').textContent='表示・選択・次問遷移の画面テスト終了';el('next').disabled=true}};
render();
</script></html>""".replace("__PAYLOAD__",payload)
out.write_text(page,encoding="utf-8")
print(json.dumps({"status":"screen_test_built","path":str(out),"questions":[r["number"] for r in records],"bytes":out.stat().st_size},ensure_ascii=False))
