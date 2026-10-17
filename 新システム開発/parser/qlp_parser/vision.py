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


def lines(full, zoom, ox, oy):
    """Tesseract と同じ形の行のリスト [(y0, y1, 文字, x0, 語[(x0, y0, x1, y1, 文字)])]（PDFのpt）にする。

    Vision は段落ごとに行を返すので、同じ高さにある行のかけらは1行にまとめる（Tesseract の psm 6 と同じく、
    ページの横幅いっぱいの行にする。選択肢の字下げなどの判定が同じ形で使えるように）。
    """
    pieces = []  # [(x0, y0, x1, y1, [語])]
    for page in full.get("pages", []):
        for block in page.get("blocks", []):
            for para in block.get("paragraphs", []):
                cur = []
                for word in para.get("words", []):
                    text = "".join(s.get("text", "") for s in word.get("symbols", []))
                    if not text.strip():
                        continue
                    x0, y0, x1, y1 = _box(word["boundingBox"]["vertices"])
                    cur.append((ox + x0 / zoom, oy + y0 / zoom, ox + x1 / zoom, oy + y1 / zoom, text))
                    last = (word.get("symbols") or [{}])[-1]
                    brk = last.get("property", {}).get("detectedBreak", {}).get("type")
                    if brk in _BREAKS_LINE:
                        pieces.append(cur)
                        cur = []
                if cur:
                    pieces.append(cur)
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
        ws = sorted(row["words"], key=lambda w: w[0])
        out.append((row["y0"], row["y1"], ws))
    return out
