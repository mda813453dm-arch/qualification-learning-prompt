/**
 * 公式の過去問掲載ページから、問題・正答PDFを探す（AIには探させない）。
 * ページの作りは 2026-10-15 に GitHub Actions で本物を開いて確かめた（parser/tools/survey_sources.py）。
 *
 * 宅建（RETIO）：リンクの文言が「令和7年度 －試験問題と正解番号表－」。令和2・3年度は（10月試験）（12月試験）の2回。
 *   問題と正答が1つのPDFに入っている。
 * 測量士補（国土地理院）：試験日ごとに「測量士（問題・解答一覧・問題1・問題2・解答例・解答用紙）」
 *   「測量士補（問題 または 問題1・問題2、解答一覧）」の順に並ぶ。解答用紙より後が測量士補。
 */

const ANCHOR = /<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
const ERA = { 令和: 2018, 平成: 1988, 昭和: 1925 };
const toHalf = (s) => s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const plain = (s) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** ページ内のPDFリンク {href, text, before}。before はリンク直前の文（試験日などを読むため）。 */
export function pdfLinks(html, base) {
  const out = [];
  for (const m of html.matchAll(ANCHOR)) {
    let href;
    try {
      href = new URL(decode(m[1]), base).href;
    } catch {
      continue;
    }
    if (!/\.pdf($|\?)/i.test(href)) continue;
    out.push({ href, text: plain(m[2]), before: plain(html.slice(Math.max(0, m.index - 300), m.index)).slice(-120) });
  }
  return out;
}

export function fiscalYear(label) {
  const m = /(令和|平成|昭和)\s*(元|[0-9０-９]{1,2})\s*年/.exec(label);
  if (!m) return null;
  return ERA[m[1]] + (m[2] === '元' ? 1 : Number(toHalf(m[2])));
}

function session(label) {
  const m = /（\s*([0-9０-９]{1,2})\s*月試験\s*）/.exec(label);
  return m ? `${Number(toHalf(m[1]))}月` : 'main';
}

const latest = (sources, years) => {
  const keep = new Set([...new Set(sources.map((s) => s.year))].sort((a, b) => b - a).slice(0, years));
  return sources.filter((s) => keep.has(s.year));
};

export function takkenSources(links, years = 10) {
  const out = [];
  for (const a of links) {
    const year = fiscalYear(a.text);
    if (year && /試験問題/.test(a.text)) out.push({ adapter: 'takken', year, section: session(a.text), questionUrl: a.href, answerUrl: null });
  }
  return latest(out, years);
}

const DATE = /令和\s*(元|[0-9]{1,2})\s*年\s*[0-9]{1,2}\s*月\s*[0-9]{1,2}\s*日/g;

export function surveyorSources(links, years = 10) {
  const groups = [];
  let cur = null;
  for (const a of links) {
    const dates = [...a.before.matchAll(DATE)];
    if (dates.length) {
      const d = dates[dates.length - 1][1];
      const year = d === '元' ? 2019 : 2018 + Number(d);
      if (!cur || cur.year !== year) groups.push((cur = { year, afterSheet: false, q: [], a: null }));
    }
    if (!cur) continue;
    if (a.text.startsWith('解答用紙')) cur.afterSheet = true;
    else if (cur.afterSheet && a.text.startsWith('問題')) cur.q.push(a.href);
    else if (cur.afterSheet && a.text.startsWith('解答一覧')) cur.a = a.href;
  }
  const out = groups
    .filter((g) => g.q.length && g.a)
    .map((g) => ({ adapter: 'surveyor', year: g.year, section: 'main', questionUrl: g.q[0], ...(g.q.length > 1 ? { questionUrls: g.q } : {}), answerUrl: g.a }));
  return latest(out, years);
}

/** 賃管（協議会）：年度ごとに past_question_YYYY.pdf と past_answer_YYYY.pdf が並ぶ（2015〜2025年度で確認）。 */
export function chintaiSources(links, years = 10) {
  const q = new Map();
  const a = new Map();
  for (const l of links) {
    const m = /past_(question|answer)_(20[0-9]{2})\.pdf/.exec(l.href);
    if (m) (m[1] === 'question' ? q : a).set(Number(m[2]), l.href);
  }
  const out = [...q].filter(([y]) => a.has(y)).map(([year, questionUrl]) => ({ adapter: 'chintai', year, section: 'main', questionUrl, answerUrl: a.get(year) }));
  return latest(out, years);
}

/**
 * FP（日本FP協会）の学科試験：g2_YYYYMM_qa.pdf（問題と正解が1つ。CBTの公表問題）、
 * または g2_YYYYMM_q.pdf と g2_YYYYMM_a.pdf（紙の試験）。年に複数回あるので、区分を「2024年9月」のようにする。
 */
function fpSources(grade) {
  return (links, years = 10) => {
    const q = new Map();
    const a = new Map();
    for (const l of links) {
      const m = new RegExp(`/g${grade}_(20[0-9]{2})(0[1-9]|1[0-2])_(qa|q|a)\\.pdf`).exec(l.href);
      if (!m) continue;
      const key = `${m[1]}${m[2]}`;
      if (m[3] === 'a') a.set(key, l.href);
      else q.set(key, { href: l.href, both: m[3] === 'qa' });
    }
    const out = [];
    for (const [key, v] of q) {
      if (!v.both && !a.has(key)) continue;
      out.push({ adapter: `fp${grade}`, year: Number(key.slice(0, 4)), section: `${key.slice(0, 4)}年${Number(key.slice(4))}月`, questionUrl: v.href, answerUrl: v.both ? null : a.get(key) });
    }
    return latest(out, years);
  };
}
export const fp2Sources = fpSources(2);
export const fp3Sources = fpSources(3);

/**
 * 行政書士（試験研究センター）：問題は /pdf/rN_mondai.pdf。正解はPDFがなく、ページ /doc/exam/rNans.html の表で公開される
 * （令和2〜7年度で確認。正解ページのURLは問題PDFの年度から決める）。
 */
export function gyoseiSources(links, years = 10) {
  const out = [];
  for (const l of links) {
    const m = /\/pdf\/r([0-9]{1,2})_mondai\.pdf$/.exec(l.href);
    if (!m) continue;
    const year = 2018 + Number(m[1]);
    if (out.some((s) => s.year === year)) continue;
    out.push({ adapter: 'gyosei', year, section: '年度共通', questionUrl: l.href, answerUrl: new URL(`/doc/exam/r${m[1]}ans.html`, l.href).href });
  }
  return latest(out, years);
}

export const LISTINGS = {
  takken: { url: 'https://www.retio.or.jp/exam/past_ques_ans/other/', sources: takkenSources },
  surveyor: { url: 'https://www.gsi.go.jp/LAW/SHIKEN/past.html', sources: surveyorSources },
  chintai: { url: 'https://www.chintaikanrishi.jp/exam/past/', sources: chintaiSources },
  fp2: { url: 'https://www.jafp.or.jp/exam/mohan/', sources: fp2Sources },
  fp3: { url: 'https://www.jafp.or.jp/exam/mohan/', sources: fp3Sources },
  gyosei: { url: 'https://gyosei-shiken.or.jp/doc/exam/index.html', sources: gyoseiSources },
};

/** 掲載ページを開いて、直近 years 年度分の取り込み元を返す。fetchText(url) は HTML の文字列を返す関数。 */
export async function discover(slug, fetchText, years = 10) {
  const l = LISTINGS[slug];
  if (!l) return [];
  const html = await fetchText(l.url);
  return l.sources(pdfLinks(html, l.url), years);
}
