/**
 * Cloud Run の入口。環境変数から env を作り、app.js の handle() に渡す。
 *
 * 環境変数（トークンは Secret Manager から渡す。チャットや Git には書かない）：
 *   FIGURE_BUCKET        図を置く Cloud Storage のバケット名（必須）
 *   FIRESTORE_COLLECTION Firestore のコレクション名（既定 qlp）
 *   API_TOKEN            AIアプリが付ける Bearer トークン（必須）
 *   PUBLIC_BASE_URL      このサービスのURL（図のURLに使う）
 *   PARSER_URL / PARSER_TOKEN / PARSER_VERSION  経路Bの分解サーバー（無ければ経路A）
 *   PORT                 Cloud Run が渡す待ち受けポート
 */
import http from 'node:http';
import { handle } from './app.js';
import { GcpStore } from './gcp-store.js';

const e = process.env;
const env = {
  STORE: new GcpStore({ bucket: e.FIGURE_BUCKET, collection: e.FIRESTORE_COLLECTION || 'qlp' }),
  API_TOKEN: e.API_TOKEN,
  PUBLIC_BASE_URL: e.PUBLIC_BASE_URL,
  PARSER_URL: e.PARSER_URL,
  PARSER_TOKEN: e.PARSER_TOKEN,
  PARSER_VERSION: e.PARSER_VERSION,
};

const MAX_BODY = 16 * 1024 * 1024;

const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY) {
        res.writeHead(413, { 'content-type': 'application/json' }).end('{"error":"BODY_TOO_LARGE"}');
        return;
      }
      chunks.push(c);
    }
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, {
      method: req.method,
      headers: Object.entries(req.headers).filter(([, v]) => typeof v === 'string'),
      body: hasBody ? Buffer.concat(chunks) : undefined,
    });
    const response = await handle(request, env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
    res.end('{"error":"INTERNAL_ERROR"}');
  }
});

server.listen(Number(e.PORT) || 8080);
