import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
e=json.loads((ROOT/"data/runtime-packets/assets/q063/2026/evidence.json").read_text(encoding="utf-8"))
fw=str.maketrans("０１２３４５６７８９","0123456789")
answers={int(q.translate(fw)):int(a.translate(fw)) for q,a in re.findall(r"No[.．]([０-９]+)\n([１-５])",e["answerText"])}
if answers.get(7)!=4 or answers.get(27)!=1: raise SystemExit("OFFICIAL_ANSWER_BINDING_FAILED")
packets=[]
for q in e["questions"]:
 n=q["questionNumber"]
 if n not in (7,27): continue
 choices=re.findall(r"(?m)^([1-5])\n([^\n]+)$",q["pageText"])
 choices=choices[-5:]
 if [x[0] for x in choices]!=["1","2","3","4","5"]: raise SystemExit(f"CHOICE_EXTRACTION_FAILED:{n}:{choices}")
 asset=f"https://raw.githubusercontent.com/mda813453dm-arch/qualification-learning-prompt/ai-learning-system/新システム開発/data/runtime-packets/assets/q063/2026/question-{n}-page-{q['pdfPage']}.png"
 packets.append({"sourceMode":"static_verified_official_packet","questionId":f"q063-2026-{n:02d}","year":2026,"section":"測量士補","questionNumber":n,"fieldId":"q063-survey-calculation","stem":"公式問題本文・図表はdiagramAssetsの公式PDFページ画像を一体表示して出題する。","choices":[x[1] for x in choices],"correctAnswer":answers[n],"diagramRequired":True,"diagramAssets":[{"url":asset,"sha256":q["imageSha256"],"sourcePdfPage":q["pdfPage"],"kind":"official_question_page"}],"packetStatus":"verified_official","questionPdfUrl":e["sourceUrl"],"answerPdfUrl":e["answerUrl"],"questionPdfSha256":e["pdfSha256"],"answerPdfSha256":e["answerPdfSha256"],"evidence":{"questionPdfPage":q["pdfPage"],"answerPdfPage":1,"visual":"official_pdf_page_render","field":"survey_calculation"},"verification":{"questionText":"official_pdf_checked","choices":"official_pdf_checked","visual":"question_level_pdf_graphics_checked","answer":"same_year_official_answer_checked","field":"verified"}})
out=ROOT/"data/runtime-packets/verified/q063-2026-visual.json";out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps({"schemaVersion":1,"qualificationId":"q063","fieldId":"q063-survey-calculation","year":2026,"verificationStatus":"verified_official","sourceAuthority":"国土地理院","packets":packets},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"status":"verified_official","packets":len(packets)},ensure_ascii=False))
