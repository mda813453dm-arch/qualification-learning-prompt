"""公式PDFの1問を、原本と同じ順（問題文・図・表・選択肢）に並べた表示用の文章にする。

図は PDF の線と文字から、そのまま SVG に書き出す（描き直さない）。ChatGPT は本文中の SVG を
その位置に表示できるため、AI はこの文章を一字一句そのまま出すだけでよい。
"""

import re
import unicodedata

HEAD = re.compile(r"^(第\s*[0-9]+\s*問|問\s*[0-9]+)")
PAGE_NO = re.compile(r"^[─—\-－]*\s*[（(]\s*[0-9]+\s*[）)]\s*[─—\-－]*$")
NEW_PARA = re.compile(r"^(　|問\s*[0-9]|第\s*[0-9]+\s*問|〔|【|[0-9]\s|[（(][0-9一二三四五六七八九十アイウエオ])")
CTRL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
BLANK_IMAGE = 0.002  # 暗い画素がこれより少ない画像（地紋や汚れ）は図に入れない
MAX_IMAGE_PX = 900


def _norm(t):
    return unicodedata.normalize("NFKC", t).replace(" ", "")


def _num(v):
    s = f"{v:.1f}"
    return s[:-2] if s.endswith(".0") else s


def _color(c):
    if not c:
        return "none"
    return "#%02x%02x%02x" % tuple(round(max(0, min(1, x)) * 255) for x in c[:3])


def _path(items):
    out, cur = [], None
    for it in items:
        kind = it[0]
        if kind == "l":
            a, b = it[1], it[2]
            if cur is None or abs(cur.x - a.x) > 0.05 or abs(cur.y - a.y) > 0.05:
                out.append(f"M{_num(a.x)} {_num(a.y)}")
            out.append(f"L{_num(b.x)} {_num(b.y)}")
            cur = b
        elif kind == "c":
            a, c1, c2, b = it[1], it[2], it[3], it[4]
            if cur is None or abs(cur.x - a.x) > 0.05 or abs(cur.y - a.y) > 0.05:
                out.append(f"M{_num(a.x)} {_num(a.y)}")
            out.append(f"C{_num(c1.x)} {_num(c1.y)} {_num(c2.x)} {_num(c2.y)} {_num(b.x)} {_num(b.y)}")
            cur = b
        elif kind == "re":
            r = it[1]
            out.append(f"M{_num(r.x0)} {_num(r.y0)}H{_num(r.x1)}V{_num(r.y1)}H{_num(r.x0)}Z")
            cur = None
        elif kind == "qu":
            q = it[1]
            out.append(f"M{_num(q.ul.x)} {_num(q.ul.y)}L{_num(q.ur.x)} {_num(q.ur.y)}L{_num(q.lr.x)} {_num(q.lr.y)}L{_num(q.ll.x)} {_num(q.ll.y)}Z")
            cur = None
    return "".join(out)


def _image_tag(page, rect, xref):
    """ほとんど白い画像（地紋・汚れ）は入れない。それ以外は縮めたPNGで埋め込む。"""
    import base64

    import fitz

    pix = page.get_pixmap(clip=rect, dpi=72, colorspace=fitz.csGRAY, alpha=False)
    dark = sum(1 for v in pix.samples if v < 128)
    if dark < pix.width * pix.height * BLANK_IMAGE:
        return ""
    zoom = min(3.0, MAX_IMAGE_PX / max(rect.width, rect.height))
    png = page.get_pixmap(clip=rect, matrix=fitz.Matrix(zoom, zoom), alpha=False).tobytes("png")
    b64 = base64.b64encode(png).decode("ascii")
    return f'<image x="{_num(rect.x0)}" y="{_num(rect.y0)}" width="{_num(rect.width)}" height="{_num(rect.height)}" href="data:image/png;base64,{b64}"/>'


def figure_svg(page, box):
    """図の範囲の線・画像・文字を、そのままの位置で SVG にする（座標はPDFのまま、幅は画面いっぱい）。"""
    import fitz

    box = fitz.Rect(box)
    parts = [f'<rect x="{_num(box.x0)}" y="{_num(box.y0)}" width="{_num(box.width)}" height="{_num(box.height)}" fill="#fff"/>']
    for img in page.get_images():
        for r in page.get_image_rects(img[0]):
            if r.intersects(box):
                parts.append(_image_tag(page, r & box, img[0]))
    for d in page.get_drawings():
        if not fitz.Rect(d["rect"]).intersects(box + (-1, -1, 1, 1)):
            continue
        p = _path(d["items"])
        if not p:
            continue
        if d.get("closePath"):
            p += "Z"
        fill = _color(d.get("fill")) if d["type"] in ("f", "fs") else "none"
        stroke = _color(d.get("color")) if d["type"] in ("s", "fs") else "none"
        attrs = f'd="{p}" fill="{fill}"'
        if stroke != "none":
            attrs += f' stroke="{stroke}" stroke-width="{_num(max(d.get("width") or 1, 0.5))}"'
        parts.append(f"<path {attrs}/>")
    for b in page.get_text("dict", clip=box)["blocks"]:
        for line in b.get("lines", []):
            vertical = abs(line["dir"][0]) < 0.5
            for sp in line["spans"]:
                text = CTRL.sub("", sp["text"]).strip()
                if not text:
                    continue
                text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                x, y = sp["origin"]
                mode = ' writing-mode="tb"' if vertical else ""
                fill = _color(((sp["color"] >> 16) / 255, ((sp["color"] >> 8) & 255) / 255, (sp["color"] & 255) / 255))
                parts.append(f'<text x="{_num(x)}" y="{_num(y)}" font-size="{_num(sp["size"])}" fill="{fill}"{mode}>{text}</text>')
    view = f"{_num(box.x0)} {_num(box.y0)} {_num(box.width)} {_num(box.height)}"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" width="100%" '
        f'style="max-width:100%;height:auto;background:#fff" font-family="serif">' + "".join(p for p in parts if p) + "</svg>"
    )


def _table_md(t):
    width = max(len(r) for r in t["rows"])
    cell = lambda v: (v or "").replace("|", "｜").strip() or "　"  # noqa: E731
    row = lambda r: "| " + " | ".join(cell(r[i] if i < len(r) else "") for i in range(width)) + " |"  # noqa: E731
    return "\n".join([row(t["rows"][0]), "|" + " --- |" * width] + [row(r) for r in t["rows"][1:]])


def build_display(doc, nums, find, tables, figures):
    """見出しから次の問の見出しの手前まで、原本の順に「文・図・表」を並べた文章を返す。"""
    import fitz

    key = _norm(find)
    items = []  # (page, y, kind, value)
    taken = {}  # ページごとの、文として読まない範囲（表・図・表の見出し）
    for t in tables:
        n, box = t["_boxes"][0]
        items.append((n, box.y0, "table", t))
        for pn, b in t["_boxes"] + t["_caps"]:
            taken.setdefault(pn, []).append(b + (-1, -1, 1, 1))
    for f in figures:
        box = fitz.Rect(f["bbox"])
        items.append((f["page"], box.y0, "figure", f))
        taken.setdefault(f["page"], []).append(box + (-1, -1, 1, 1))
    for n in nums:
        page = doc[n - 1]
        right = max((b[2] for b in page.get_text("blocks")), default=page.rect.width)
        for b in page.get_text("blocks"):
            r = fitz.Rect(b[:4])
            text = CTRL.sub("", b[4]).strip()
            if not text or PAGE_NO.match(_norm(text)):
                continue
            if any(t.contains(r) or (t & r).width * (t & r).height > r.width * r.height * 0.5 for t in taken.get(n, [])):
                continue
            items.append((n, r.y0, "text", (text, r, right)))
    items.sort(key=lambda x: (x[0], x[1]))
    started, out, para, prev_short = False, [], "", True
    for n, _, kind, v in items:
        if kind == "text":
            text, r, right = v
            norm = _norm(text)
            if not started:
                if not norm.startswith(key):
                    continue
                started = True
            elif HEAD.match(norm) and not norm.startswith(key) and norm.startswith("第"):
                break
            lines = [line.strip() for line in text.splitlines() if line.strip()]
            joined = "".join(lines) if all(len(line) > 1 for line in lines) else "　".join(lines)
            if para and not prev_short and not NEW_PARA.match(text):
                para += joined
            else:
                if para:
                    out.append(para)
                para = joined
            prev_short = r.x1 < right - 20
        elif started:
            if para:
                out.append(para)
                para = ""
            if kind == "table":
                out.append(((v["caption"] + "\n") if v["caption"] else "") + _table_md(v))
            else:
                out.append(figure_svg(doc[n - 1], v["bbox"]))
            prev_short = True
    if para:
        out.append(para)
    return "\n\n".join(out) if started else None
