"""Google Cloud Vision の文字認識（DOCUMENT_TEXT_DETECTION）。

Tesseract は日本語の中の記号・数字（「°」「/」「図13」など）を読み違えやすいので、紙をスキャンした
ページの本文は、使えるときは Vision で読む（2026-10-17 Manabuさん決定）。結果は Tesseract と同じ形
（行ごと・語ごとの位置）に直して返し、使えないとき・失敗したときは None を返す（呼び出し側が Tesseract で読む）。

使うかどうか：環境変数 QLP_OCR=vision のとき。
認証：QLP_VISION_TOKEN（アクセストークン）、無ければ Cloud Run のメタデータサーバー。
控え：同じ画像を2回読まないよう、画像のSHA-256ごとに応答を控える（QLP_VISION_CACHE のフォルダ、
または OCR_CACHE_BUCKET の Cloud Storage）。控えがあれば、認証が無くても読める（開発・試験用）。
"""

import base64
import hashlib
import json
import os
import re
import urllib.request

ENDPOINT = "https://vision.googleapis.com/v1/images:annotate"
_BREAKS_LINE = {"LINE_BREAK", "EOL_SURE_SPACE"}
_BREAKS_SPACE = {"SPACE", "SURE_SPACE"}


def enabled():
    return os.environ.get("QLP_OCR", "").lower() == "vision"


def _token():
    t = os.environ.get("QLP_VISION_TOKEN")
    if t:
        return t
    req = urllib.request.Request(
        "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
        headers={"Metadata-Flavor": "Google"})
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.load(r)["access_token"]


def _cache_get(key):
    d = os.environ.get("QLP_VISION_CACHE")
    if d and os.path.exists(os.path.join(d, key + ".json")):
        with open(os.path.join(d, key + ".json"), encoding="utf-8") as f:
            return json.load(f)
    bucket = os.environ.get("OCR_CACHE_BUCKET")
    if bucket:
        try:
            req = urllib.request.Request(
                f"https://storage.googleapis.com/storage/v1/b/{bucket}/o/vision%2F{key}.json?alt=media",
                headers={"Authorization": f"Bearer {_token()}"})
            with urllib.request.urlopen(req, timeout=10) as r:
                return json.load(r)
        except Exception:  # noqa: BLE001  控えが無い・読めないときは読み直す
            return None
    return None


def _cache_put(key, resp):
    d = os.environ.get("QLP_VISION_CACHE")
    if d and os.environ.get("QLP_VISION_RECORD"):
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, key + ".json"), "w", encoding="utf-8") as f:
            json.dump(resp, f, ensure_ascii=False)
    bucket = os.environ.get("OCR_CACHE_BUCKET")
    if bucket:
        try:
            req = urllib.request.Request(
                f"https://storage.googleapis.com/upload/storage/v1/b/{bucket}/o?uploadType=media&name=vision%2F{key}.json",
                data=json.dumps(resp, ensure_ascii=False).encode("utf-8"),
                headers={"Authorization": f"Bearer {_token()}", "Content-Type": "application/json"}, method="POST")
            urllib.request.urlopen(req, timeout=10).read()
        except Exception:  # noqa: BLE001  控えに書けなくても読み取りは続ける
            pass


def annotate(png):
    """画像を読み、Vision の fullTextAnnotation を返す（読めなければ None）。"""
    key = hashlib.sha256(png).hexdigest()
    cached = _cache_get(key)
    if cached is not None:
        return cached
    if not enabled():
        return None
    body = {"requests": [{"image": {"content": base64.b64encode(png).decode()},
                          "features": [{"type": "DOCUMENT_TEXT_DETECTION"}],
                          "imageContext": {"languageHints": ["ja"]}}]}
    try:
        req = urllib.request.Request(ENDPOINT, data=json.dumps(body).encode(),
                                     headers={"Authorization": f"Bearer {_token()}", "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as r:
            resp = json.load(r)["responses"][0]
    except Exception:  # noqa: BLE001  使えないときは Tesseract で読む
        return None
    if "error" in resp:
        return None
    full = resp.get("fullTextAnnotation") or {"pages": []}
    _cache_put(key, full)
    return full


def _box(vs):
    xs = [v.get("x", 0) for v in vs]
    ys = [v.get("y", 0) for v in vs]
    return min(xs), min(ys), max(xs), max(ys)


def _merge_ascii(ws):
    """Vision は「1」「.」や「a」「,」を別の語にする。Tesseract と同じく、空白なしで続く英数字・記号は1語にまとめる
    （選択肢の番号「1.」を1語として見つけられるように）。日本語の字はまとめない。"""
    out = []
    for w in ws:
        if out:
            p = out[-1]
            # 「1」と「A」（選択肢の番号と本文の英字）はまとめない
            digit_then_letter = p[4][-1].isdigit() and w[4][0].isalpha()
            if not p[5] and w[0] - p[2] <= 1.5 and p[4].isascii() and w[4].isascii() and not digit_then_letter:
                out[-1] = (p[0], min(p[1], w[1]), w[2], max(p[3], w[3]), p[4] + w[4], w[5])
                continue
        out.append(w)
    return out


_CJK = re.compile(r"[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]")


def symbols(full, zoom, ox, oy):
    """Vision の応答を1字ずつにする [(x0, y0, x1, y1, 字)]（座標はPDFのpt）。"""
    out = []
    for page in full.get("pages", []):
        for block in page.get("blocks", []):
            for para in block.get("paragraphs", []):
                for word in para.get("words", []):
                    for s in word.get("symbols", []):
                        t = s.get("text", "")
                        if not t.strip():
                            continue
                        x0, y0, x1, y1 = _box(s["boundingBox"]["vertices"])
                        out.append((ox + x0 / zoom, oy + y0 / zoom, ox + x1 / zoom, oy + y1 / zoom, t))
    return out


def _overlaps(a, b):
    """2つの範囲 (x0, y0, x1, y1) が、低い方の高さの半分以上、縦に重なっているか（同じ行か）。"""
    return min(a[3], b[3]) - max(a[1], b[1]) >= 0.5 * min(a[3] - a[1], b[3] - b[1])


def _runs(word):
    """語を字に分け、縦に重ならない字のところで分ける（表の列を Vision が「11」のように縦に1語で読むことがある）。"""
    syms = [s for s in word.get("symbols", []) if s.get("boundingBox", {}).get("vertices")]
    if not syms:
        return []
    out = [[syms[0]]]
    for k, s in enumerate(syms[1:], 1):
        # 「1A」（選択肢の番号と本文の英字）は Vision が1語にすることがある。番号を別の語にする
        number_then_letter = k == 1 and syms[0].get("text") in ("1", "2", "3", "4", "5") and "A" <= s.get("text", "")[:1] <= "Z"
        if not number_then_letter and _overlaps(_box(out[-1][-1]["boundingBox"]["vertices"]), _box(s["boundingBox"]["vertices"])):
            out[-1].append(s)
        else:
            out.append([s])
    return out


def lines(full, zoom, ox, oy):
    """行のリスト [(y0, y1, 語[(x0, y0, x1, y1, 文字)], 行の文字)]（PDFのpt）にする。

    Vision は段落ごとに行を返すので、同じ高さにある行のかけらは1行にまとめる（Tesseract の psm 6 と同じく、
    ページの横幅いっぱいの行にする。選択肢の字下げなどの判定が同じ形で使えるように）。
    """
    pieces = []  # [(x0, y0, x1, y1, [語])]
    for page in full.get("pages", []):
        for block in page.get("blocks", []):
            for para in block.get("paragraphs", []):
                cur = []
                for word in para.get("words", []):
                    for syms in _runs(word):
                        text = "".join(s.get("text", "") for s in syms)
                        if not text.strip():
                            continue
                        x0, y0, x1, y1 = _box([v for s in syms for v in s["boundingBox"]["vertices"]])
                        brk = syms[-1].get("property", {}).get("detectedBreak", {}).get("type")
                        # 語の後ろに空白があるか（Vision が読んだ空白だけを残す。日本語の語の間には空白を入れない）
                        cur.append((ox + x0 / zoom, oy + y0 / zoom, ox + x1 / zoom, oy + y1 / zoom, text, brk in _BREAKS_SPACE))
                        if brk in _BREAKS_LINE:
                            pieces.append(cur)
                            cur = []
                if cur:
                    pieces.append(cur)
    # 表の列などを、Vision が上から下へ1つの行として返すことがある（「4.」「5.」が1行になる）。
    # 前の語と高さが重ならない語のところで、行のかけらを分ける
    split = []
    for ws in pieces:
        cur = [ws[0]]
        for w in ws[1:]:
            if not _overlaps(cur[-1], w):
                split.append(cur)
                cur = []
            cur.append(w)
        split.append(cur)
    pieces = split
    rows = []
    for ws in sorted(pieces, key=lambda w: min(x[1] for x in w)):
        y0, y1 = min(w[1] for w in ws), max(w[3] for w in ws)
        for row in rows:
            ov = min(y1, row["y1"]) - max(y0, row["y0"])
            if ov > 0.5 * min(y1 - y0, row["y1"] - row["y0"]):
                row["words"] += ws
                row["y0"], row["y1"] = min(row["y0"], y0), max(row["y1"], y1)
                break
        else:
            rows.append({"y0": y0, "y1": y1, "words": list(ws)})
    out = []
    for row in sorted(rows, key=lambda r: r["y0"]):
        ws = []
        for w in sorted(row["words"], key=lambda w: w[0]):
            # 同じ字を同じ場所で2回読むことがある（表の列）。重なる同じ字は1つにする
            if any(v[4] == w[4] and min(v[2], w[2]) - max(v[0], w[0]) > 0.5 * (w[2] - w[0]) for v in ws[-2:]):
                continue
            ws.append(w)
        ws = _merge_ascii(ws)
        # 空欄の記号「エ」を Vision は英字の「I」と読む（「ア〜I」「は I 方向」）。日本語の中の1字だけの「I」はエにする
        ws = [w[:4] + ("エ",) + w[5:] if w[4] == "I" and not any(
            0 <= j < len(ws) and ws[j][4][-1 if j < k else 0].isascii() and ws[j][4][-1 if j < k else 0].isalnum()
            for j in (k - 1, k + 1)) else w for k, w in enumerate(ws)]
        # 空白は、Vision が読んだ空白と、語の間が字の高さほど空いているところ（選択肢の番号の後など）に入れる
        text = ""
        for k, w in enumerate(ws):
            # 行頭の数字1字（選択肢の番号「1 AはBに…」）の後にも空白を入れる
            lead_number = k == 1 and ws[0][4] in ("1", "2", "3", "4", "5") and not w[4][0].isdigit() and w[4][0] not in ".．,，、°"
            # Vision が読んだ空白でも、日本語の字や全角の記号に接するところには入れない（「測量法 ( 昭和 24 年」→「測量法(昭和24年」）
            said = ws[k - 1][5] and not (_CJK.match(ws[k - 1][4][-1]) or _CJK.match(w[4][0]))
            if k and (said or lead_number or w[0] - ws[k - 1][2] > 0.8 * (w[3] - w[1])):
                text += " "
            text += w[4]
        out.append((row["y0"], row["y1"], [w[:5] for w in ws], text))
    # 小文字の「c.」を、大きさの似た「C.」と読むことがある。行頭の「b.」「d.」と並ぶ行頭の「C.」は「c.」にする
    heads = {ln[2][0][4] for ln in out if ln[2]}
    if heads & {"b.", "d."}:
        for i, (y0, y1, ws, text) in enumerate(out):
            if ws and ws[0][4] == "C.":
                ws = [ws[0][:4] + ("c.",)] + ws[1:]
                out[i] = (y0, y1, ws, "c." + text[2:])
    return out
