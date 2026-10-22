"""行政書士の公式PDF/HTMLを一時照合し、4項目だけを出力する。"""
import hashlib
import html
import json
import re
import sys
import unicodedata
import urllib.request

ROOT = 'https://gyosei-shiken.or.jp/'
PINS = {
    2020: '794a8c6cd5b35f9008951b749f7f89505e28155c4729568c5333a8b3c0ff1992',
    2021: '94f66d3f1870f04b04e21fb81c708138e4ede6be66ecd25229c5461264d62ec1',
    2022: '6c208e00a4dedd8a2b7e637bb70ad811af2efd3de1220f20c513f48282f5bbca',
    2023: 'c4c2682f7cc2afbdb0863fbb4e4d107ec90d8086751d4dd0a6cbf1f35a324cd5',
    2024: 'a1f331eea109007798ac75004d26028a3387c999a6f61f532d01d1f8591b4ea4',
    2025: 'fca8a98d1ff630058e6492ffe103233ba25640b0ef12c18de4a6e8a37f8e217d',
}

def fetch(url):
    if not url.startswith(ROOT):
        raise RuntimeError('UNAPPROVED_OFFICIAL_HOST')
    req = urllib.request.Request(url, headers={'User-Agent': 'QLP-MetadataValidation/1.0'})
    with urllib.request.urlopen(req, timeout=90) as resp:
        return resp.read()

def norm(value):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', html.unescape(value)))

def table_cells(page):
    return [norm(re.sub(r'<[^>]+>', '', cell))
            for cell in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>',page,re.S|re.I)]

def check_year_html(page, year):
    title = re.search(r'<title[^>]*>(.*?)</title>',page,re.S|re.I)
    match = re.search(r'令和\s*([0-9０-９]{1,2})\s*年度',
                      unicodedata.normalize('NFKC',html.unescape(title.group(1)))) if title else None
    if not match or 2018+int(match.group(1)) != year:
        raise RuntimeError('ANSWER_PAGE_YEAR_MISMATCH')

def official_answers(page):
    """択一40+14問、多肢選択3問の数字4個、記述3問（非自動採点）を照合。"""
    cells = table_cells(page)
    result = {}
    for idx, cell in enumerate(cells):
        m = re.fullmatch(r'問題([0-9]{1,2})', cell)
        if not m:
            continue
        number = int(m.group(1))
        if number in result or number < 1 or number > 60:
            continue
        if 44 <= number <= 46:
            # 記述式正解例は採点用の単一番号にならない。出典URLと結びつけて未採点扱い。
            result[number] = None
        elif 41 <= number <= 43:
            following = cells[idx+1:idx+9]
            if len(following) != 8 or [norm(s) for s in following[::2]] != ['ア', 'イ', 'ウ', 'エ']:
                raise RuntimeError(f'MULTI_SELECT_STRUCTURE_INVALID_{number}')
            values = [int(norm(s)) for s in following[1::2]]
            if not all(1 <= n <= 20 for n in values):
                raise RuntimeError(f'MULTI_SELECT_ANSWER_INVALID_{number}')
            result[number] = values
        else:
            value = norm(cells[idx+1]) if idx+1 < len(cells) else ''
            if not re.fullmatch(r'[1-5]', value):
                raise RuntimeError(f'OFFICIAL_ANSWER_INVALID_{number}_{value[:30]}')
            result[number] = int(value)
    if sorted(result) != list(range(1, 61)):
        raise RuntimeError(f'OFFICIAL_ANSWER_SET_INCOMPLETE: {sorted(set(range(1,61))-set(result))}')
    return result

def main():
    year = int(sys.argv[1])
    if year not in PINS:
        raise RuntimeError('YEAR_INVALID')
    era = year - 2018
    problem_url = f'{ROOT}pdf/r{era}_mondai.pdf'
    answer_url = f'{ROOT}doc/exam/r{era}ans.html'
    pdf = fetch(problem_url)
    if hashlib.sha256(pdf).hexdigest() != PINS[year]:
        raise RuntimeError('PROBLEM_PDF_HASH_DIFFERS_FROM_USER_SUBMISSION')
    page = fetch(answer_url).decode('utf-8')
    check_year_html(page, year)
    answers = official_answers(page)
    rows = []
    for number in range(1, 61):
        if number <= 2: fid = 'g1'
        elif number <= 7: fid = 'g2'
        elif number <= 26: fid = 'g3'
        elif number <= 35: fid = 'g4'
        elif number <= 40: fid = 'g5'
        elif number <= 43: fid = 'g7'   # 多肢選択式（科目は推測しない）
        elif number <= 46: fid = 'g8'   # 記述式（公式解答例参照、番号採点不可）
        else: fid = 'g6'
        rows.append({'year':year, 'questionNumber':number,'fieldId':fid,'correctAnswer':answers[number]})
    print(json.dumps(rows, ensure_ascii=False, separators=(',', ':')))

if __name__ == '__main__':
    main()
