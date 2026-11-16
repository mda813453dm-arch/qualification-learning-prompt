"""図表分離の判定表（engine/data/figure-separation.json）を作る。

入力：
  - figure_separation_audit.py の結果（資格ごとの audit.json。複数可）
  - figure_separation_manual.json（目視確認の結果）
  - 公式PDF（新しく切り出す図の画像を作るため）
出力：
  - engine/data/figure-separation.json（問ごとの判定。キーは「問題PDFのSHA-256:問番号」）
  - --crops の下に新しい切り出し画像（<qsha>/<file>）と manifest.json（Cloud Storage に置く一覧）
  - --report に資格・年度ごとの集計（JSON）

判定の方針（推測で切り出さない）：
  - 監査で「図だけ」と確かめた既存の切り出しだけを本文と選択肢の間に出す。
  - 本文・選択肢・問番号を含む切り出し（問題1問分など）は原本照合用（畳んで出す）にする。
  - 新しい切り出しは、目視で確かめた候補だけを使う（figure_separation_manual.json）。
  - 確かめられない問は「図表分離未検証」として原本を見られるようにする。

使い方：
  python3 tools/build_figure_registry.py --audit a/audit.json b/audit.json --pdf <PDFのフォルダ> \
    --out ../engine/data/figure-separation.json --crops <出力フォルダ> --report <集計.json>
"""
import argparse
import hashlib
import json
import os
from collections import defaultdict

CROP_ZOOM = 3
PARSER_VERSION = '0.8.2'
HERE = os.path.dirname(os.path.abspath(__file__))


def match(rule, row, q):
    return (rule['q'] == row['qualificationId'] and int(rule['year']) == int(row['year'])
            and row['questionPdfSha256'].startswith(rule['sha']) and int(rule['n']) == int(q['questionNumber']))


def render(pdf_dir, qsha, page, rect):
    import fitz
    doc = fitz.open(os.path.join(pdf_dir, f'{qsha}.pdf'))
    pg = doc[page - 1]
    clip = fitz.Rect(rect) & pg.rect
    pix = pg.get_pixmap(matrix=fitz.Matrix(CROP_ZOOM, CROP_ZOOM), clip=clip, alpha=False)
    if pix.is_unicolor:
        raise SystemExit(f'空の切り出し {qsha} p{page} {rect}')
    return pix.tobytes('png'), pix.width, pix.height, [round(v, 1) for v in clip]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--audit', nargs='+', required=True)
    ap.add_argument('--manual', default=os.path.join(HERE, 'figure_separation_manual.json'))
    ap.add_argument('--pdf', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--crops', required=True)
    ap.add_argument('--report', required=True)
    a = ap.parse_args()
    manual = json.load(open(a.manual, encoding='utf-8'))
    visual_quals = set(manual.get('visualQualifications', {}))
    registry, manifest = {}, []
    report = defaultdict(lambda: defaultdict(int))
    used_rules = set()
    by_section = defaultdict(dict)

    def add_crop(row, q, k, spec):
        qsha = row['questionPdfSha256']
        prefix = f"{row['qualificationId']}-{row['year']}-{qsha[:12]}-q{q['questionNumber']}-p{spec['page']}"
        name = f"{prefix}-{'c' if spec['role'] == 'choice_image' else 's'}{k}.png"
        data, w, h, clip = render(a.pdf, qsha, spec['page'], spec['rect'])
        os.makedirs(os.path.join(a.crops, qsha), exist_ok=True)
        with open(os.path.join(a.crops, qsha, name), 'wb') as f:
            f.write(data)
        sha = hashlib.sha256(data).hexdigest()
        if not any(m['key'].endswith('/' + name) and m['path'].startswith(qsha) for m in manifest):
            manifest.append({'key': f'fig/own/_shared/{qsha}/{PARSER_VERSION}/{name}', 'path': f'{qsha}/{name}', 'sha256': sha,
                         'page': spec['page'], 'rect': clip})
        return {'file': name, 'owner': '_shared', 'parserVersion': PARSER_VERSION, 'width': w, 'height': h, 'sha256': sha,
                'role': spec['role'], 'page': spec['page'], 'rect': clip}

    for path in a.audit:
        for row in json.load(open(path, encoding='utf-8')):
            qid, year, section, qsha = row['qualificationId'], row['year'], row['section'], row['questionPdfSha256']
            rk = (qid, year, section, qsha)
            report[rk]['sharedResults'] += 1
            if row.get('error'):
                report[rk]['error'] = row['error']
                continue
            for q in row['questions']:
                n = q['questionNumber']
                key = f'{qsha}:{n}'
                st = q['status']
                visual = qid in visual_quals
                figs = q['figures']
                defect = any(f['verdict'] in ('whole_question', 'contains_text', 'text_only') for f in figs) or \
                    (st == 'fixable' and not figs)
                entry = {'figures': {}, 'add': [], 'check': 'pdf_audit+visual' if visual else 'pdf_audit', 'audit': st}
                man = next((r for r in manual['questions'] if match(r, row, q)), None)
                appr = next((r for r in manual['approveCandidates'] if match(r, row, q)), None)
                if man:
                    used_rules.add(id(man))
                    for f in figs:
                        entry['figures'][f['file']] = man['existing']
                    for k, spec in enumerate(man.get('add', [])):
                        entry['add'].append(add_crop(row, q, k, spec))
                    entry['status'] = man['status']
                    entry['check'] = 'visual'
                    if man.get('overrides'):
                        entry['overrides'] = manual['overrides'][man['overrides']]
                    entry['why'] = man.get('why')
                else:
                    if appr:
                        used_rules.add(id(appr))
                    for f in figs:
                        entry['figures'][f['file']] = 'figure' if f['verdict'] == 'figure_only' else 'source'
                    clean = [c for c in q['candidates'] if c['clean']]
                    if st == 'pass':
                        entry['status'] = 'verified' if figs else 'not_needed'
                    elif st == 'text_only_fixable':
                        entry['status'] = 'not_needed'
                    elif st == 'image_question':
                        entry['figures'] = {f['file']: 'question_image' for f in figs}
                        entry['status'] = 'image_question'
                    elif st == 'fixable' and (visual or appr) and clean and len(clean) == len(q['candidates']) \
                            and q.get('stemCoverage', 0) >= 0.85:
                        for k, c in enumerate(clean):
                            entry['add'].append(add_crop(row, q, k, {'page': c['page'], 'rect': c['rect'], 'role': 'figure'}))
                        entry['status'] = 'verified'
                        entry['check'] = 'pdf_audit+visual'
                    elif st == 'choice_image' and visual and q.get('choiceRegion'):
                        for k, c in enumerate(clean):
                            entry['add'].append(add_crop(row, q, k, {'page': c['page'], 'rect': c['rect'], 'role': 'figure'}))
                        cr = q['choiceRegion']
                        entry['add'].append(add_crop(row, q, 0, {'page': cr['page'], 'rect': cr['rect'], 'role': 'choice_image'}))
                        entry['status'] = 'verified'
                    elif st == 'choice_image':
                        entry['status'] = 'choice_image'
                    else:
                        entry['status'] = 'unverified'
                        if appr:
                            raise SystemExit(f'目視で承認した候補が使えない {key} {st}')
                if not entry['add']:
                    del entry['add']
                # 同じPDFでも区分（section）ごとに分解結果が違うことがある（例：本文が画像か文字か）
                by_section[key][section] = entry
                r = report[rk]
                r['inspected'] += 1
                r['detected'] += int(defect)
                fixed = entry['status'] in ('verified', 'not_needed')
                r['fixed'] += int(defect and fixed)
                r['unverified'] += int(entry['status'] in ('unverified', 'choice_image'))
                r['imageQuestion'] += int(entry['status'] == 'image_question')
                r['newCrops'] += len(entry.get('add', []))
    for key, secs in by_section.items():
        vals = list(secs.values())
        if all(json.dumps(v, sort_keys=True) == json.dumps(vals[0], sort_keys=True) for v in vals):
            registry[key] = vals[0]
        else:
            for sec, v in secs.items():
                registry[f'{key}@{sec}'] = v
    unused = [r for r in manual['questions'] + manual['approveCandidates'] if id(r) not in used_rules]
    if unused:
        raise SystemExit(f'使われなかった目視確認の行 {unused}')
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump({'version': 1, 'parserVersion': PARSER_VERSION, 'questions': dict(sorted(registry.items()))},
                  f, ensure_ascii=False, separators=(',', ':'))
    os.makedirs(a.crops, exist_ok=True)
    with open(os.path.join(a.crops, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    rows = [{'qualificationId': k[0], 'year': k[1], 'section': k[2], 'questionPdfSha256': k[3], **v} for k, v in sorted(report.items(), key=lambda kv: (kv[0][0], str(kv[0][1]), kv[0][2]))]
    with open(a.report, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
    print('questions', len(registry), 'newCrops', len(manifest))


if __name__ == '__main__':
    main()
