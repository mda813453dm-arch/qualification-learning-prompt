/**
 * 保存先の共通の形（Cloudflare Workers KV と同じ呼び方）。
 *   get(key, 'json' | 'text' | 'arrayBuffer') / put(key, value, {expirationTtl, metadata}) / delete(key)
 * 本番は KV（env.QLP_CACHE）をそのまま渡す。テストと手元確認は MemoryStore を使う。
 */
export class MemoryStore {
  constructor() {
    this.map = new Map();
    this.writes = 0;
  }

  async get(key, type = 'text') {
    if (!this.map.has(key)) return null;
    const v = this.map.get(key);
    if (type === 'json') return JSON.parse(typeof v === 'string' ? v : new TextDecoder().decode(v));
    if (type === 'arrayBuffer') return typeof v === 'string' ? new TextEncoder().encode(v).buffer : v.slice(0);
    return typeof v === 'string' ? v : new TextDecoder().decode(v);
  }

  async put(key, value) {
    this.writes += 1;
    this.map.set(key, value instanceof Uint8Array ? value.slice().buffer : value);
  }

  async delete(key) {
    this.map.delete(key);
  }
}

export async function sha256Hex(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
