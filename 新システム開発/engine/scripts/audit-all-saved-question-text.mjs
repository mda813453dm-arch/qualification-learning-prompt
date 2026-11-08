/**
 * 全資格／全年度／全所有者の保存済み問題を対象とする、読み取り専用監査。
 * Firestore の他の保存記録（セッション・学習履歴・添付）は一切取得しない。
 * 利用者ID、問題本文、正答、画像データは表示・保存しない。
 *
 * GitHub Actions の認証済み実行環境から:
 *   GOOGLE_CLOUD_PROJECT=qualification-learning node .../audit-all-saved-question-text.mjs
 */
import assert from 'node:assert/strict';
import { Firestore } from '@google-cloud/firestore';
import { auditQuestionPackets } from '../src/question-text-audit.js';

assert.equal(process.env.GOOGLE_CLOUD_PROJECT, 'qualification-learning', 'PROJECT_MISMATCH');
const db = new Firestore({ projectId: 'qualification-learning' });
const refs = await db.collection('qlp').listDocuments();
const packetRefs = refs.filter((ref) => {
  let key;
  try { key = decodeURIComponent(ref.id); } catch { return false; }
  return key.startsWith('pkt/');
});
// 上限到達時は未監査を含むことを明示して不合格にする（全件監査と偽らない）。
assert(packetRefs.length <= 20000, 'PACKET_RECORD_COUNT_EXCEEDS_AUDIT_CAP');
const summary = new Map();
const failures = [];
for (let offset = 0; offset < packetRefs.length; offset += 20) {
  const batch = packetRefs.slice(offset, offset + 20);
  const snapshots = await Promise.all(batch.map((ref) => ref.get()));
  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    if (!snap.exists) continue;
    let stored;
    try {
      const v = snap.get('v');
      stored = JSON.parse(typeof v === 'string' ? v : Buffer.from(v).toString('utf8'));
    } catch {
      failures.push('SAVED_PACKET_JSON_INVALID');
      continue;
    }
    const result = stored?.result;
    if (!result || !Array.isArray(result.packets)) {
      failures.push('SAVED_PACKET_RESULT_INVALID');
      continue;
    }
    const parts = decodeURIComponent(batch[i].id).split('/');
    const owner = parts[1] === 'own' ? parts[2] === '_shared' ? 'shared' : 'private' : 'legacy';
    const key = [result.qualificationId || 'unknown', result.year ?? '?', result.section || '?', owner].join('|');
    const previous = summary.get(key) ?? { qualificationId: result.qualificationId || 'unknown',
      year: result.year, section: result.section, owner, packetSets: 0,
      questionCount: 0, textCount: 0, imageOnly: 0, ocrPending: 0, pendingCount: 0,
      reasons: {}, pendingExamples: [] };
    const audit = auditQuestionPackets(result.packets);
    previous.packetSets++;
    previous.questionCount += audit.total;
    previous.textCount += audit.fullyText;
    previous.imageOnly += audit.imageOnly;
    previous.ocrPending += audit.ocrPending;
    previous.pendingCount += audit.pendingCount;
    for (const [reason, n] of Object.entries(audit.reasonCounts)) {
      previous.reasons[reason] = (previous.reasons[reason] ?? 0) + n;
    }
    // ログ肥大化防止。所有者の情報や本文・正答・画像は出さない。
    for (const row of audit.pending) {
      if (previous.pendingExamples.length >= 25) break;
      previous.pendingExamples.push({ number: row.questionNumber, reasons: row.reasons });
    }
    summary.set(key, previous);
  }
}
const rows = [...summary.values()].sort((a, b) =>
  a.qualificationId.localeCompare(b.qualificationId) || b.year - a.year ||
  a.section.localeCompare(b.section) || a.owner.localeCompare(b.owner));
const total = rows.reduce((out, row) => {
  for (const name of ['packetSets', 'questionCount', 'textCount', 'imageOnly', 'ocrPending', 'pendingCount']) {
    out[name] = (out[name] ?? 0) + row[name];
  }
  return out;
}, {});
console.log('ALL_QUALIFICATIONS_TEXT_AUDIT_TOTAL', JSON.stringify({ savedRecords: packetRefs.length,
  qualifications: new Set(rows.map((r) => r.qualificationId)).size, ...total, errors: failures.length }));
for (const row of rows) console.log('ALL_QUALIFICATIONS_TEXT_AUDIT_ROW', JSON.stringify(row));
for (const failure of failures) console.log('ALL_QUALIFICATIONS_TEXT_AUDIT_ERROR', failure);
assert.equal(failures.length, 0, 'SAVED_RECORDS_COULD_NOT_BE_AUDITED');
if (total.pendingCount) console.log('TEXT_REPAIR_STILL_REQUIRED', total.pendingCount);

