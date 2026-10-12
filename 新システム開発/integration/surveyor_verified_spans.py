import hashlib
import re
import subprocess
import unicodedata
from pathlib import Path

HEADER = re.compile(r'^\s*第\s*(\d{1,2})\s*問(?=\s|$)', re.M)
CHOICE_LINE = re.compile(r'^\s*1\s+([アイウエオ]{2})\s+2\s+([アイウエオ]{2})\s+3\s+([アイウエオ]{2})\s+4\s+([アイウエオ]{2})\s+5\s+([アイウエオ]{2})\s*$', re.M)
ANSWER_ROW = re.compile(r'^([ \t]*)第[ \t]*(\d+)問[ \t]+([1-5])(?:[ \t]+第[ \t]*(\d+)問[ \t]+([1-5]))?[ \t]*$', re.M)

def _sha256(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def pages_from_pdf(path):
    data = Path(path).read_bytes()
    if not data.startswith(b'%PDF-'):
        raise ValueError('NOT_PDF')
    raw = subprocess.check_output(['pdftotext', '-layout', str(path), '-'])
    return raw.decode('utf-8').split('\f'), hashlib.sha256(data).hexdigest()

def extract_questions(pages):
    occurrences=[]
    for page_index,page in enumerate(pages):
        for m in HEADER.finditer(page):
            number=int(m.group(1))
            if 1<=number<=22:
                occurrences.append((number,page_index,m.start()))
    counts={n:sum(x[0]==n for x in occurrences) for n in range(1,21)}
    if any(v!=1 for v in counts.values()):
        raise ValueError('QUESTION_HEADERS_NOT_UNIQUE')
    if [n for n,_,_ in occurrences[:20]]!=list(range(1,21)):
        raise ValueError('QUESTION_ORDER_INVALID')
    if len(occurrences)<21 or occurrences[20][0]!=21:
        raise ValueError('END_BOUNDARY_MISSING')
    result={}
    for i in range(20):
        number,page_idx,start=occurrences[i]
        _,end_page,end_offset=occurrences[i+1]
        span='\n'.join(
            pages[k][start if k==page_idx else 0:end_offset if k==end_page else None]
            for k in range(page_idx,end_page+1)
        ) if page_idx!=end_page else pages[page_idx][start:end_offset]
        choice_match=CHOICE_LINE.search(span)
        choices=CHOICE_LINE.findall(span)
        if len(choices)!=1:
            raise ValueError(f'CHOICE_LINE_UNVERIFIED:{number}')
        before=span[:choice_match.start()].strip()
        if len(before)<30:
            raise ValueError(f'QUESTION_TEXT_TOO_SHORT:{number}')
        result[number]={
            'page':page_idx+1,
            'pages':list(range(page_idx+1,end_page+2)),
            'raw_span':span,
            'span_sha256':_sha256(span),
            'stem_text':before,
            'stem_sha256':_sha256(before),
            'choices':list(choices[0])
        }
    return result

def _select_afternoon_answer(m):
    indentation,n,a,n2,a2=m.groups()
    if n2 is not None:
        return int(n2),int(a2)
    if len(indentation)<14:
        raise ValueError('AMBIGUOUS_ANSWER_COLUMN')
    return int(n),int(a)

def extract_answers(text):
    t=unicodedata.normalize('NFKC',text)
    if not re.search(r'午前の部\s+午後の部',t):
        raise ValueError('ANSWER_HEADER_UNVERIFIED')
    morning,afternoon={},{}
    for m in ANSWER_ROW.finditer(t):
        indentation,n,a,n2,a2=m.groups()
        if n2 is not None:
            n=int(n);n2=int(n2)
            if n in morning or n2 in afternoon:
                raise ValueError('DUPLICATE_ANSWER')
            morning[n]=int(a);afternoon[n2]=int(a2)
        else:
            if len(indentation)<14:
                raise ValueError('AMBIGUOUS_ANSWER_COLUMN')
            n=int(n)
            if n in afternoon:
                raise ValueError('DUPLICATE_ANSWER')
            afternoon[n]=int(a)
    if sorted(morning)!=list(range(1,11)) or sorted(afternoon)!=list(range(1,21)):
        raise ValueError('ANSWER_COVERAGE_INVALID')
    return afternoon

def extract_answer_evidence(pages):
    normalized_pages=[unicodedata.normalize('NFKC',page) for page in pages]
    joined='\n'.join(normalized_pages)
    if not re.search(r'午前の部\s+午後の部',joined):
        raise ValueError('ANSWER_HEADER_UNVERIFIED')
    evidence={}
    morning_seen=set()
    for page_number,page in enumerate(normalized_pages,1):
        for m in ANSWER_ROW.finditer(page):
            indentation,n,a,n2,a2=m.groups()
            if n2 is not None:
                morning_number=int(n); afternoon_number=int(n2); answer=int(a2)
                if morning_number in morning_seen or afternoon_number in evidence:
                    raise ValueError('DUPLICATE_ANSWER')
                morning_seen.add(morning_number)
            else:
                if len(indentation)<14:
                    raise ValueError('AMBIGUOUS_ANSWER_COLUMN')
                afternoon_number=int(n); answer=int(a)
                if afternoon_number in evidence:
                    raise ValueError('DUPLICATE_ANSWER')
            if not 1<=afternoon_number<=20:
                raise ValueError('ANSWER_COVERAGE_INVALID')
            row=m.group(0)
            evidence[afternoon_number]={
                'number':afternoon_number,
                'answer':answer,
                'page':page_number,
                'evidence':row,
                'evidence_sha256':_sha256(row)
            }
    if sorted(morning_seen)!=list(range(1,11)) or sorted(evidence)!=list(range(1,21)):
        raise ValueError('ANSWER_COVERAGE_INVALID')
    return evidence

def verify_files(question_path,answer_path):
    pages,qhash=pages_from_pdf(question_path)
    apages,ahash=pages_from_pdf(answer_path)
    questions=extract_questions(pages)
    answers=extract_answers('\n'.join(apages))
    answer_evidence=extract_answer_evidence(apages)
    if {n:item['answer'] for n,item in answer_evidence.items()}!=answers:
        raise ValueError('ANSWER_EVIDENCE_MISMATCH')
    return {
        'questions':questions,
        'answers':answers,
        'answer_evidence':answer_evidence,
        'question_pdf_sha256':qhash,
        'answer_pdf_sha256':ahash
    }
