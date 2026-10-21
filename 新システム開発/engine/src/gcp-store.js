/**
 * Google Cloud の保存先（方針7：2026年10月15日 Google へ統一）。
 *
 * - 図のPNG（キーが fig/ で始まるもの）→ Cloud Storage。Firestore は1件1MiBまでで、航空写真の図（約2.1MB）が入らないため。
 * - それ以外（分解結果・公式PDFのSHA-256の控え・取り込みジョブ・セッション）→ Firestore。
 *
 * 期限切れの判定はプログラム側（cache.js）で行う。expireAt（Firestore の TTL）とバケットのライフサイクル（2日で削除）は掃除用。
 */
const FIG = 'fig/';
// 運営者が添付した公式PDFの控え（source-store.js）も Cloud Storage に置く
const SRC = 'src/';
const inBucket = (key) => key.startsWith(FIG) || key.startsWith(SRC) || key.startsWith('att/');

export class GcpStore {
  /**
   * @param {{bucket: string, collection?: string, firestore?: object, storage?: object}} opts
   *   firestore / storage はテスト用の差し替え。省略時は Google の公式ライブラリを使う（Cloud Run のサービスアカウントで認証）。
   */
  constructor({ bucket, collection = 'qlp', firestore, storage }) {
    if (!bucket) throw new Error('FIGURE_BUCKET_REQUIRED');
    this.bucketName = bucket;
    this.collectionName = collection;
    this.firestore = firestore;
    this.storage = storage;
  }

  async #db() {
    if (!this.firestore) {
      const { Firestore } = await import('@google-cloud/firestore');
      this.firestore = new Firestore({ ignoreUndefinedProperties: true });
    }
    return this.firestore.collection(this.collectionName);
  }

  async #bucket() {
    if (!this.storage) {
      const { Storage } = await import('@google-cloud/storage');
      this.storage = new Storage();
    }
    return this.storage.bucket(this.bucketName);
  }

  // Firestore の文書IDに / は使えないので符号化する
  #docId(key) {
    return encodeURIComponent(key);
  }

  async get(key, type = 'text') {
    let raw;
    if (inBucket(key)) {
      try {
        [raw] = await (await this.#bucket()).file(key).download();
      } catch (e) {
        if (e?.code !== 404) throw e;
        if (!key.startsWith('att/')) return null;
        // 旧バージョンで小さなPDFをFirestoreに保存済みの場合、共有の原本リンクを壊さない。
        const snap = await (await this.#db()).doc(this.#docId(key)).get();
        if (!snap.exists) return null;
        raw = snap.get('v');
      }
    } else {
      const snap = await (await this.#db()).doc(this.#docId(key)).get();
      if (!snap.exists) return null;
      raw = snap.get('v');
    }
    if (type === 'json') return JSON.parse(typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8'));
    if (type === 'arrayBuffer') {
      const b = typeof raw === 'string' ? Buffer.from(raw, 'utf8') : Buffer.from(raw);
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    }
    return typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8');
  }

  async put(key, value, { expirationTtl } = {}) {
    if (inBucket(key)) {
      const body = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value);
      await (await this.#bucket()).file(key).save(body, { contentType: key.startsWith(SRC) || key.startsWith('att/') ? 'application/pdf' : 'image/png', resumable: false });
      return;
    }
    const v = typeof value === 'string' ? value : Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value);
    const doc = { v };
    if (expirationTtl) doc.expireAt = new Date(Date.now() + expirationTtl * 1000);
    await (await this.#db()).doc(this.#docId(key)).set(doc);
  }

  async delete(key) {
    if (inBucket(key)) {
      await (await this.#bucket()).file(key).delete({ ignoreNotFound: true });
      return;
    }
    await (await this.#db()).doc(this.#docId(key)).delete();
  }
}
