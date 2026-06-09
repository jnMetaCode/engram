// A tiny LOCAL HTTP API so your AI agents can remember and recall — the
// open, local alternative to a hosted agent-memory service. Binds to 127.0.0.1.
import http from 'node:http';
import { loadStore, saveStore, rememberText, stats } from './store.js';
import { recall } from './recall.js';

function readJson(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const send = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

export function startServer({ port = 7077, storeFile, host = '127.0.0.1' } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/stats') {
        return send(res, 200, stats(loadStore(storeFile)));
      }
      if (req.method === 'POST' && url.pathname === '/remember') {
        const { text, source = 'api', date } = await readJson(req);
        if (!text) return send(res, 400, { error: 'text is required' });
        const store = loadStore(storeFile);
        const { chunks } = rememberText(store, { text, source, date });
        saveStore(store, storeFile);
        return send(res, 200, { ok: true, chunks });
      }
      if (req.method === 'POST' && url.pathname === '/recall') {
        const { query, limit, since, until } = await readJson(req);
        if (!query) return send(res, 400, { error: 'query is required' });
        const results = recall(loadStore(storeFile), query, { limit, since, until });
        return send(res, 200, { results });
      }
      return send(res, 404, { error: 'try GET /stats, POST /remember, POST /recall' });
    } catch (e) {
      return send(res, 400, { error: String(e.message) });
    }
  });
  server.listen(port, host, () => {
    console.log(`engram memory API → http://${host}:${port}  (local only)`);
    console.log(`  POST /remember {text}   POST /recall {query}   GET /stats`);
  });
  return server;
}
