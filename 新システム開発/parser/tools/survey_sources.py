"""公式の過去問掲載ページを実際に開き、PDFへのリンクを一覧にし、各年度のPDFを分解してみる（開発用）。

GitHub Actions で動かす（開発環境からは公式サイトへつながらないため）。
目的：プログラムが公式PDFを探す仕組み（エンジンの発見処理）を、本物のページの形に合わせて作ること。

使い方: python survey_sources.py <出力フォルダ>
"""

import html
import ssl
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path
from urllib.parse import quote, urljoin

LISTINGS = {
    "takken": "https://www.retio.or.jp/exam/past_ques_ans/other/",
    "surveyor": "https://www.gsi.go.jp/LAW/SHIKEN/past.html",
}
UA = {"User-Agent": "Mozilla/5.0 (qualification-learning-system source survey)"}
ANCHOR = re.compile(r"<a\s[^>]*href=\"([^\"]+)\"[^>]*>(.*?)</a>", re.S | re.I)
TAG = re.compile(r"<[^>]+>")


# 国土地理院のサーバーは古い再ネゴシエーション方式を使うため、標準設定では接続できない（2026-10-15 確認）
CTX = ssl.create_default_context()
CTX.options |= getattr(ssl, "OP_LEGACY_SERVER_CONNECT", 0x4)


def get(url, timeout=60):
    # 令和5年度の宅建のURLには全角スペースが入っているため、URLとして送れる形にする
    req = urllib.request.Request(quote(url, safe=":/?&=%#~+,;@!$'()*"), headers=UA)
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        return r.read(), r.geturl()


def text(s):
    return re.sub(r"\s+", " ", html.unescape(TAG.sub(" ", s))).strip()


def anchors(page_html, base):
    out = []
    for m in ANCHOR.finditer(page_html):
        href = urljoin(base, html.unescape(m.group(1)))
        if not re.search(r"\.pdf($|\?)", href, re.I):
            continue
        start = max(0, m.start() - 300)
        out.append({"href": href, "text": text(m.group(2)), "before": text(page_html[start:m.start()])[-120:]})
    return out


HINT = re.compile(r"過去|以前|平成|令和|年度|バックナンバー")


def other_links(page_html, base):
    """PDF以外のリンクのうち、古い年度の掲載ページらしいもの（掲載ページが年度で分かれているかを見るため）。"""
    out = []
    for m in ANCHOR.finditer(page_html):
        href = urljoin(base, html.unescape(m.group(1)))
        t = text(m.group(2))
        if not re.search(r"\.pdf($|\?)", href, re.I) and HINT.search(t):
            out.append({"href": href, "text": t})
    return out


def main(outdir):
    out = Path(outdir)
    out.mkdir(parents=True, exist_ok=True)
    report = {}
    for slug, url in LISTINGS.items():
        try:
            raw, final = get(url)
        except Exception as e:  # noqa: BLE001
            report[slug] = {"listing": url, "error": str(e)}
            print(f"[{slug}] listing error: {e}")
            continue
        m = re.search(rb"charset=[\"']?([A-Za-z0-9_-]+)", raw[:2000])
        enc = (m.group(1).decode() if m else "utf-8").lower().replace("shift_jis", "cp932")
        page = raw.decode(enc, errors="replace")
        (out / f"{slug}-listing.html").write_text(page, encoding="utf-8")
        links = anchors(page, final)
        others = other_links(page, final)
        report[slug] = {"listing": url, "final": final, "pdfLinks": links, "otherLinks": others}
        for a in others:
            print(f"  (page) {a['text']} | {a['href']}")
        print(f"\n===== {slug}: {len(links)} PDF links ({final})")
        for a in links:
            print(f"- {a['text']} | {a['href']} | before: {a['before'][-60:]}")
    (out / "links.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "survey-out")
