import { createHash } from 'node:crypto';
const VERSION = 1;
const MAX_BYTES = 8192;
const MAX_QUALIFICATION = 100;
const MODES = new Set(['conversation','paused','practice_request','review']);
function valid(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_HANDOFF');
  if (value.version !== VERSION || typeof value.qualification !== 'string' ||
      value.qualification.length > MAX_QUALIFICATION || !MODES.has(value.mode) ||
      !Array.isArray(value.weakTopics) || value.weakTopics.length > 50 ||
      value.weakTopics.some(x => typeof x !== 'string' || x.length > 100) ||
      typeof value.note !== 'string' || value.note.length > 1000) throw new Error('INVALID_HANDOFF');
  if (Object.keys(value).sort().join(',') !== 'mode,note,qualification,version,weakTopics') throw new Error('INVALID_HANDOFF');
}
function checksum(json) { return createHash('sha256').update(json,'utf8').digest('hex'); }
/** Human-portable, untrusted snapshot. Never includes answers or official-verification flags. */
export function exportHandoff(session, options={}) {
  const snapshot = {
    version: VERSION,
    qualification: session?.qualification ?? '',
    mode: MODES.has(session?.mode) ? session.mode : 'conversation',
    weakTopics: options.weakTopics ?? [],
    note: options.note ?? ''
  };
  valid(snapshot);
  const json = JSON.stringify(snapshot);
  if (Buffer.byteLength(json,'utf8') > MAX_BYTES) throw new Error('HANDOFF_TOO_LARGE');
  return JSON.stringify({payload: snapshot, sha256: checksum(json)});
}
export function importHandoff(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text,'utf8') > MAX_BYTES + 256) throw new Error('INVALID_HANDOFF');
  let wrapper;
  try { wrapper=JSON.parse(text); } catch { throw new Error('INVALID_HANDOFF'); }
  if (!wrapper || Object.keys(wrapper).sort().join(',') !== 'payload,sha256') throw new Error('INVALID_HANDOFF');
  valid(wrapper.payload);
  if (checksum(JSON.stringify(wrapper.payload)) !== wrapper.sha256) throw new Error('HANDOFF_CHECKSUM_MISMATCH');
  return {
    schemaVersion:1, qualification:wrapper.payload.qualification || null,
    mode:wrapper.payload.mode, pendingQuestion:null, history:[], lastIntent:null,
    handoffNote:wrapper.payload.note, weakTopics:wrapper.payload.weakTopics
  };
}
