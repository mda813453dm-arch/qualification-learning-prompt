/**
 * Cloud Run は内部でHTTPとして転送されるが、公式図と添付PDFの
 * 公開URLは必ずHTTPSを使う。HostはCloud Run既定ドメインかローカルだけ。
 * 任意Hostヘッダを信頼して添付先URLや画像URLを作らない。
 */
export function publicOrigin(headers = {}, configured = '') {
  if (typeof configured === 'string' && /^https:\/\/[^\s/?#]+$/.test(configured)) {
    return configured.replace(/\/$/, '');
  }
  const h = typeof headers.host === 'string' ? headers.host.toLowerCase() : '';
  if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.run\.app$/.test(h)) return `https://${h}`;
  if (/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(h)) return `http://${h}`;
  return null;
}
