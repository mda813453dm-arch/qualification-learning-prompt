"""公式PDFを一時処理して賃管の4項目だけを出す。問題文・選択肢・図表は出力しない。"""
import hashlib
import html.parser
import json
import os
import re
import sys
import urllib.parse
import urllib.request

from qlp_parser.adapters import chintai
from qlp_parser.core import PdfSource, open_pdf
from qlp_parser import fields

INDEX = "https://www.chintaikanrishi.jp/exam/past"
PINS = {
    2015: ("e1a1a2cacbf8b250ab12b53ecc8987b3b6851c09503f92b4151e83d72c00d822","1c43176579e2d3d520e736054ba7855f9be02bd22ee266f2aa0f2c80ebbafdde"),
    2016: ("864732992bd9e9a67221c7aa645c2e5ae1657671ed6e4a3c7ce15ee83854b062","d40a2e224e471fbe59ec1e2f1c9def292f3340212d68a2bee2807664d17e00e2"),
    2017: ("966babf6929d1fd9a6e3b905b74e7d22c932c3489c46f1c9f99428820c75b63e","4550abc4d7c531732c4d3532fa4971f57f581257daf66f6a6c46c474f8bd3c0d"),
    2018: ("571517d5e60c930d04a134d8b1f87028770c1ccd0970882aaf4767cd5863a855","8098b39ebe0e9ed2a33504b607a3fbc1ca9231e8e2745e178f55f51b3e6363af"),
    2019: ("a023532aca5d20c413c6643fef06c2d40b03ec1144eeef62d0c999ee5d187e1e","4583e3097e9dd6e9f6e96dbe9a8ada706af16b810c03dcc2437edbb54e10829d"),
    2020: ("f1578358dd07485fe24c36daacfa60634474eb9ed1ce180ffa0f21075c3b8927","5c087df88ffc43645de070381ca5fc37049ce862efb09f7ce4142efe4aa31913"),
    2021: ("f67318450e5715a5fd15bfb278326b7ad733b315b1ad12c4f89b29dc532f2831","03a8b3f02e1ad5bade42ee5eb9322602609bfa09692551065c3eb1684b104a3c"),
    2022: ("a182f0f589734f3e240944e63994766223b124d2b8d1ca40ec6c5cc0c2340158","efc8c45270b45914d793800ced845b996a880dd3fd9d0bb8fcb458cbc4d8a058"),
    2023: ("175b14137b31391d5edf3f31c51e4c811c15458d11a5f1af71c40a2ac8c563ff","8d227b91e4d63c3f4915c3143d3ff8eacdaabe37dea80521d34edad794688a49"),
    2024: ("4ec10ee8ae65c9ca36fed9f8e7a9a6b1cb89f16b89e488cd6abba632e7b2d939","3cd54c036d3c78c778a411f627d285ad71a7606a1712dcee4d3e8ec09c68826e"),
    2025: ("91848d63f04c36d03290264e72bac8a1a9e0e2e50c5d1619edee18c9db747fde","55b6d9593bd82e2d1232f019aced2c5236e51451ccb88152b9944279ca07db1d"),
}
EXCEPTIONS = {2017:{30:[1,3],31:[1,4]},2022:{32:None},2023:{49:[1,2,3,4]},2025:{9:[1,2,3,4]}}

class Links(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs=[]
    def handle_starttag(self,tag,attrs):
        if tag=="a":
            self.hrefs.extend(v for k,v in attrs if k=="href" and v)

def fetch(url):
    if urllib.parse.urlparse(url).hostname != "www.chintaikanrishi.jp":
        raise RuntimeError("UNAPPROVED_PDF_HOST")
    req=urllib.request.Request(url,headers={"User-Agent":"QLP-MetadataValidation/1.0"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read()

def pdf_url(hrefs, year, kind):
    filename=f"past_{kind}_{year}.pdf"
    matches=[urllib.parse.urljoin(INDEX,h) for h in hrefs
             if urllib.parse.urlparse(urllib.parse.urljoin(INDEX,h)).path.endswith("/"+filename)]
    if len(set(matches))!=1:
        raise RuntimeError("OFFICIAL_PDF_LINK_MISSING_OR_AMBIGUOUS_"+filename)
    return matches[0]


def extra_ocr_classes(qdoc, expected):
    """全ページのVision OCRを使って設問見出しごとに分類する。OCR原文は保存しない。"""
    from qlp_parser import ocr
    from qlp_parser.core import RawQuestion
    ocr.prefetch([qdoc[i] for i in range(qdoc.page_count)],workers=4,force=True)
    chunks={}
    active=None
    for i in range(qdoc.page_count):
        for line in ocr.page_ocr(qdoc[i]):
            t=line[2]
            m=re.search(r"[【\[(]?\s*[問間]\s*([0-9０-９]{1,2})\s*[】\])]",t)
            if m:
                num=int(__import__("unicodedata").normalize("NFKC",m.group(1)))
                if 1<=num<=expected:
                    active=num
                    chunks.setdefault(num,[])
            if active is not None and len("".join(chunks[active]))<1800:
                chunks[active].append(t)
    classified={}
    for n,lines in chunks.items():
        body=" ".join(lines[:13])[:700]
        q=RawQuestion(number=n,stem=body,choices=[],pages=[])
        fid=fields.classify_chintai(q).get("fieldId")
        if fid in ("c1","c2","c3","c4","c5","c6"):
            classified[n]=fid
    return classified

def main():
    year=int(sys.argv[1])
    if year not in PINS or os.environ.get("QLP_METADATA_APPROVED")!="YES":
        raise RuntimeError("YEAR_OR_APPROVAL_INVALID")
    links=Links()
    links.feed(fetch(INDEX).decode("utf8"))
    question=fetch(pdf_url(links.hrefs,year,"question"))
    answer=fetch(pdf_url(links.hrefs,year,"answer"))
    for data,pin in zip((question,answer),PINS[year]):
        if hashlib.sha256(data).hexdigest()!=pin:
            raise RuntimeError("SOURCE_HASH_DIFFERS_FROM_USER_UPLOADED_PDF")
    qdoc,_=open_pdf(PdfSource(question))
    adoc,_=open_pdf(PdfSource(answer))
    raw=chintai.parse_questions(qdoc)
    answers=chintai.parse_answers(adoc)
    expected=40 if year<2020 else 50
    counts={}
    for q in raw:
        counts[q.number]=counts.get(q.number,0)+1
    ocr_classes=extra_ocr_classes(qdoc,expected) if year in (2015,2016) else {}
    rows=[]
    for n in range(1,expected+1):
        found=[q for q in raw if q.number==n]
        if len(found)!=1:
            raise RuntimeError(f"QUESTION_NUMBER_MISSING_OR_DUPLICATE_{year}_{n}")
        q=found[0]
        value=EXCEPTIONS.get(year,{}).get(n,answers.get(n))
        if n not in EXCEPTIONS.get(year,{}) and value not in (1,2,3,4):
            raise RuntimeError(f"OFFICIAL_ANSWER_UNVERIFIED_{year}_{n}")
        cls=fields.classify_chintai(q)
        fid=cls.get("fieldId") or ocr_classes.get(n)
        if fid not in ("c1","c2","c3","c4","c5","c6"):
            fid="unclassified"  # 分類根拠が無い問は推測で6分野に割り当てない
        rows.append({"year":year,"questionNumber":n,"fieldId":fid,"correctAnswer":value})
    if len(rows)!=expected:
        raise RuntimeError("INCOMPLETE_METADATA")
    print(json.dumps(rows,ensure_ascii=False,separators=(",",":")))

if __name__=="__main__":
    main()
