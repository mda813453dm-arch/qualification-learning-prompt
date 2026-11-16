/**
 * 図表分離監査（読み取り専用）の入力を書き出す。
 * - 共有（_shared）の分解結果：全資格・全年度・全区分（公式過去問。学習者の情報は含まない）
 * - 学習者ごとの保存件数（資格・年度・区分・解析器版ごとの件数だけ。引継ぎIDは出さない）
 * - 共有の図のPNG（測量士補のみ、確認用）
 * Firestore・Cloud Storage へは書き込まない。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Firestore } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';

const OUT = process.argv[2] ?? 'out';
assert.equal(process.env.GOOGLE_CLOUD_PROJECT, 'qualification-learning', 'PROJECT_MISMATCH');
const db = new Firestore({ projectId: 'qualification-learning' });
const bucket = new Storage().bucket('qualification-learning-qlp-figures');
const refs = (await db.collection('qlp').listDocuments()).filter((r) => {
  try { return decodeURIComponent(r.id).startsWith('pkt/'); } catch { return false; }
});
const inventory = new Map();
let sharedCount = 0;
const figureWanted = [];
for (let i = 0; i < refs.length; i += 20) {
  const batch = refs.slice(i, i + 20);
  const snaps = await Promise.all(batch.map((r) => r.get()));
  snaps.forEach((snap, j) => {
    if (!snap.exists) return;
    const key = decodeURIComponent(batch[j].id);
    const parts = key.split('/');
    const owner = parts[1] === 'own' ? (parts[2] === '_shared' ? 'shared' : 'private') : 'legacy';
    let stored;
    try { const v = snap.get('v'); stored = JSON.parse(typeof v === 'string' ? v : Buffer.from(v).toString('utf8')); } catch { return; }
    const r = stored?.result;
    if (!r || !Array.isArray(r.packets)) return;
    const withFigures = r.packets.filter((p) => (p.figures ?? []).length).length;
    const ik = [r.qualificationId, r.year, r.section, r.parserVersion, owner].join('|');
    const row = inventory.get(ik) ?? { qualificationId: r.qualificationId, year: r.year, section: r.section,
      parserVersion: r.parserVersion, owner, records: 0, packets: 0, packetsWithFigures: 0 };
    row.records++; row.packets += r.packets.length; row.packetsWithFigures += withFigures;
    inventory.set(ik, row);
    if (owner !== 'shared') return;
    sharedCount++;
    const dir = path.join(OUT, 'shared', String(r.qualificationId));
    fs.mkdirSync(dir, { recursive: true });
    const name = `${r.year}-${encodeURIComponent(r.section)}-${String(r.questionPdfSha256).slice(0, 12)}-${r.parserVersion}.json`;
    fs.writeFileSync(path.join(dir, name), JSON.stringify({ key, result: r }));
    if (r.qualificationId === 'q063') for (const p of r.packets) for (const f of p.figures ?? [])
      figureWanted.push({ qsha: r.questionPdfSha256, pv: r.parserVersion, file: f.file });
  });
}
fs.writeFileSync(path.join(OUT, 'inventory.json'), JSON.stringify([...inventory.values()], null, 1));
fs.mkdirSync(path.join(OUT, 'fig'), { recursive: true });
for (const f of figureWanted) {
  const k = ['fig', 'own', '_shared', f.qsha, f.pv, f.file].map(encodeURIComponent).join('/');
  try {
    const [b] = await bucket.file(k).download();
    fs.writeFileSync(path.join(OUT, 'fig', `${f.qsha.slice(0, 12)}-${f.file}`), b);
  } catch (e) { console.log('FIG_MISSING', f.qsha.slice(0, 12), f.file, e?.code); }
}
console.log('PKT_RECORDS', refs.length, 'SHARED', sharedCount, 'SURVEYOR_FIGURES', figureWanted.length);
