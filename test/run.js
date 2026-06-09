// Zero-dependency test suite.  node --test test/run.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize } from '../src/text.js';
import { chunkText, extractDate, walkFiles, chunkFile } from '../src/chunk.js';
import { loadStore, ingestChunks, changedFiles, rememberText, forgetSource, stats } from '../src/store.js';
import { buildIndex, scoreChunk } from '../src/bm25.js';
import { cosine } from '../src/embed.js';
import { recall } from '../src/recall.js';
import { startServer } from '../src/server.js';
import { createHandler } from '../src/mcp.js';
import { spawn } from 'node:child_process';

const NOTES = fileURLToPath(new URL('./fixtures/notes', import.meta.url));
const NOW = '2026-06-10T00:00:00.000Z';
const tmpStore = () => join(fs.mkdtempSync(join(os.tmpdir(), 'engram-')), 'store.json');

function freshStore() {
  const store = { version: 1, updatedAt: null, chunks: [] };
  for (const f of walkFiles([NOTES])) ingestChunks(store, f, chunkFile(f).chunks);
  return store;
}

// --------------------------------------------------------------- text/chunk ---
test('tokenize drops stopwords and stems consistently', () => {
  const t = tokenize('The Pricing decisions were discussed and reconsidered');
  assert.ok(!t.includes('the') && !t.includes('and') && !t.includes('were'));
  // singular and plural collapse to the same stem (so queries match either form)
  assert.equal(tokenize('decision')[0], tokenize('decisions')[0]);
  assert.equal(tokenize('token')[0], tokenize('tokens')[0]);
  assert.equal(tokenize('cache')[0], tokenize('caches')[0]); // was broken pre-fix
  assert.equal(tokenize('class')[0], tokenize('classes')[0]);
  // words ending in "ss" are preserved, not over-stemmed
  assert.equal(tokenize('class')[0], 'class');
  assert.equal(tokenize('process')[0], 'process');
  assert.ok(t.length >= 3);
});

test('extractDate finds ISO and named dates, rejects month-prefix false positives', () => {
  assert.equal(extractDate('met on 2026-05-20 about x'), '2026-05-20');
  assert.equal(extractDate('see May 3, 2026 notes'), '2026-05-03');
  assert.equal(extractDate('September 5, 2026'), '2026-09-05');
  assert.equal(extractDate('no date here'), null);
  // not real months — must NOT parse as May/March
  assert.equal(extractDate('Mayhem 3, 2026 happened'), null);
  assert.equal(extractDate('marathon 7, 2026 route'), null);
});

test('chunkText tracks line ranges', () => {
  const text = '# A\n\nfirst para line two\n\n# B\n\nsecond para is here and longer';
  const chunks = chunkText(text, { minChars: 5, maxChars: 40 });
  assert.ok(chunks.length >= 1);
  assert.equal(chunks[0].startLine, 1);
  assert.ok(chunks[chunks.length - 1].endLine <= text.split('\n').length);
});

// --------------------------------------------------------------------- bm25 ---
test('bm25 ranks the on-topic chunk highest', () => {
  const store = freshStore();
  const idx = buildIndex(store.chunks);
  const q = tokenize('authentication token expiry');
  const ranked = store.chunks
    .map((c) => ({ c, s: scoreChunk(q, c, idx) }))
    .sort((a, b) => b.s - a.s);
  assert.match(ranked[0].c.source, /auth-bug/);
  assert.ok(ranked[0].s > 0);
});

test('cosine similarity basics', () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([1, 1], null), 0);
});

// ------------------------------------------------------------------- recall ---
test('lexical recall returns cited passages', () => {
  const store = freshStore();
  const res = recall(store, 'pricing decision credits', { now: NOW });
  assert.ok(res.length > 0);
  assert.match(res[0].citation, /pricing-decision\.md:\d+-\d+/);
  assert.ok(res[0].snippet.length > 0);
});

test('temporal: newer memory outranks older when lexical score is equal', () => {
  const store = { version: 1, chunks: [] };
  const mk = (src, when) => ({ text: 'pricing strategy notes', source: src, startLine: 1, endLine: 1, mtime: when, when });
  ingestChunks(store, 'new.md', [mk('new.md', '2026-05-20T00:00:00.000Z')]);
  ingestChunks(store, 'old.md', [mk('old.md', '2026-01-10T00:00:00.000Z')]);
  // identical text -> identical BM25 -> recency must decide
  const res = recall(store, 'pricing strategy', { now: NOW });
  assert.equal(res.length, 2);
  assert.match(res[0].source, /new\.md/);
});

test('temporal: --since filters out older memories', () => {
  const store = freshStore();
  const since = new Date(Date.parse(NOW) - 7 * 86400000).toISOString(); // 2026-06-03
  const res = recall(store, 'pricing', { now: NOW, since });
  assert.equal(res.length, 0); // both pricing notes are older than a week
  const auth = recall(store, 'authentication', { now: NOW, since });
  assert.ok(auth.length >= 1); // auth-bug is 2026-06-05
});

test('semantic recall keeps a relevance floor (no whole-store dump on a miss)', () => {
  const store = { version: 1, chunks: [] };
  ingestChunks(store, 'a.md', [{ text: 'apple pie recipe', source: 'a.md', startLine: 1, endLine: 1, mtime: NOW, when: NOW }]);
  store.chunks[0].embedding = [1, 0];
  // query with no lexical match and an orthogonal embedding -> nothing relevant
  const res = recall(store, 'zzzz nonsense', { now: NOW, queryEmbedding: [0, 1] });
  assert.equal(res.length, 0);
});

test('recall ignores a NaN/invalid limit and uses the default', () => {
  const store = freshStore();
  assert.ok(recall(store, 'pricing', { now: NOW, limit: NaN }).length > 0);
  assert.ok(recall(store, 'pricing', { now: NOW, limit: 0 }).length > 0);
});

test('remember is idempotent — identical text is not stored twice', () => {
  const store = { version: 1, chunks: [] };
  rememberText(store, { text: 'Ship date is 2026-07-01', source: 'agent' });
  rememberText(store, { text: 'Ship date is 2026-07-01', source: 'agent' });
  assert.equal(store.chunks.length, 1);
});

test('semantic recall uses embeddings when present', () => {
  const store = { version: 1, chunks: [] };
  // two chunks, identical lexical match to query, different embeddings
  ingestChunks(store, 'a.md', [{ text: 'apple', source: 'a.md', startLine: 1, endLine: 1, mtime: NOW, when: NOW }]);
  ingestChunks(store, 'b.md', [{ text: 'apple', source: 'b.md', startLine: 1, endLine: 1, mtime: NOW, when: NOW }]);
  store.chunks[0].embedding = [1, 0];
  store.chunks[1].embedding = [0, 1];
  const res = recall(store, 'apple', { now: NOW, queryEmbedding: [0.9, 0.1], weights: { lex: 0, sem: 1, time: 0 } });
  assert.match(res[0].source, /a\.md/); // closest embedding wins
});

// -------------------------------------------------------------------- store ---
test('ingest is idempotent per source; forget removes', () => {
  const store = freshStore();
  const n1 = store.chunks.length;
  // re-ingest one file -> count unchanged
  ingestChunks(store, walkFiles([NOTES])[0], chunkFile(walkFiles([NOTES])[0]).chunks);
  assert.equal(store.chunks.length, n1);
  const removed = forgetSource(store, 'auth-bug');
  assert.ok(removed >= 1);
  assert.equal(stats(store).chunks, n1 - removed);
});

// ------------------------------------------------- incremental re-index ---
test('changedFiles splits by mtime; unchanged files are skipped', () => {
  const store = { version: 1, chunks: [] };
  ingestChunks(store, 'a.md', [{ text: 'alpha', source: 'a.md', startLine: 1, endLine: 1, mtime: '2026-01-01T00:00:00.000Z', when: '2026-01-01T00:00:00.000Z' }]);
  ingestChunks(store, 'b.md', [{ text: 'beta', source: 'b.md', startLine: 1, endLine: 1, mtime: '2026-01-01T00:00:00.000Z', when: '2026-01-01T00:00:00.000Z' }]);

  const r = changedFiles(store, [
    ['a.md', '2026-01-01T00:00:00.000Z'], // same mtime -> unchanged
    ['b.md', '2026-02-02T00:00:00.000Z'], // newer -> changed
    ['c.md', '2026-03-03T00:00:00.000Z'], // never seen -> changed
  ]);
  assert.deepEqual(r.unchanged, ['a.md']);
  assert.deepEqual(r.changed.sort(), ['b.md', 'c.md']);
});

test('incremental ingest of the fixtures: second pass skips everything', () => {
  const store = freshStore(); // ingests all 3 fixtures once
  const before = store.chunks.length;
  const mtimes = walkFiles([NOTES]).map((f) => [f, fs.statSync(f).mtime.toISOString()]);
  const { changed, unchanged } = changedFiles(store, mtimes);
  assert.equal(changed.length, 0);
  assert.equal(unchanged.length, 3);
  assert.equal(store.chunks.length, before); // nothing re-ingested
});

// ------------------------------------------------------------------- server ---
function req(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path, headers: { 'content-type': 'application/json' } }, (res) => {
      const ch = [];
      res.on('data', (c) => ch.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(ch).toString() || '{}') }));
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

test('local API: remember -> recall -> stats', async (t) => {
  const storeFile = tmpStore();
  const port = 7099;
  const server = startServer({ port, storeFile });
  await new Promise((r) => setTimeout(r, 150));
  t.after(() => server.close());

  const rem = await req(port, 'POST', '/remember', { text: 'The launch is scheduled for 2026-07-01', source: 'agent' });
  assert.equal(rem.status, 200);
  assert.ok(rem.body.ok);

  const rec = await req(port, 'POST', '/recall', { query: 'launch scheduled' });
  assert.equal(rec.status, 200);
  assert.ok(rec.body.results.length >= 1);
  assert.match(rec.body.results[0].snippet, /launch/);

  const bad = await req(port, 'POST', '/recall', {});
  assert.equal(bad.status, 400);

  const st = await req(port, 'GET', '/stats');
  assert.equal(st.body.chunks, 1);
});

// ---------------------------------------------------------------------- mcp ---
test('MCP handler: initialize / version negotiation / capabilities', async () => {
  const handle = createHandler({ storeFile: tmpStore() });
  const init = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.deepEqual(init.result.capabilities, { tools: { listChanged: false } });
  assert.equal(init.result.serverInfo.name, 'engram');
  // unknown requested version -> server returns its latest
  const init2 = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
  assert.equal(init2.result.protocolVersion, '2025-06-18');
});

test('MCP handler: notifications get no reply; ping replies empty', async () => {
  const handle = createHandler({ storeFile: tmpStore() });
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/cancelled', params: {} }), null);
  const pong = await handle({ jsonrpc: '2.0', id: 9, method: 'ping' });
  assert.deepEqual(pong, { jsonrpc: '2.0', id: 9, result: {} });
});

test('MCP handler: tools/list, remember, recall, errors', async () => {
  const handle = createHandler({ storeFile: tmpStore() });

  const list = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const names = list.result.tools.map((t) => t.name);
  assert.deepEqual(names.sort(), ['engram_recall', 'engram_remember', 'engram_status']);
  assert.equal(list.result.tools[0].inputSchema.type, 'object');

  const rem = await handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'engram_remember', arguments: { text: 'We picked Postgres on 2026-05-01' } } });
  assert.ok(!rem.result.isError);
  assert.match(rem.result.content[0].text, /Remembered/);

  const rec = await handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'engram_recall', arguments: { query: 'database choice postgres' } } });
  assert.match(rec.result.content[0].text, /Postgres/);

  // unknown tool -> JSON-RPC error
  const unk = await handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'nope', arguments: {} } });
  assert.equal(unk.error.code, -32602);

  // tool ran but bad args -> isError result (not a protocol error)
  const bad = await handle({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'engram_recall', arguments: {} } });
  assert.equal(bad.result.isError, true);

  // unknown method -> method not found
  const nf = await handle({ jsonrpc: '2.0', id: 7, method: 'does/not/exist' });
  assert.equal(nf.error.code, -32601);
});

test('MCP stdio: real spawned process handshake + tools/list (pure-JSON stdout)', async () => {
  const store = tmpStore();
  const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
  const child = spawn(process.execPath, [cli, 'mcp'], {
    env: { ...process.env, ENGRAM_STORE: store, NO_COLOR: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const lines = [];
  let buf = '';
  const got = new Promise((resolve, reject) => {
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) {
          lines.push(JSON.parse(line)); // throws if stdout isn't pure JSON-RPC
          if (lines.length >= 2) resolve();
        }
      }
    });
    child.on('error', reject);
    setTimeout(() => reject(new Error('timeout waiting for MCP responses')), 5000);
  });

  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }) + '\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');

  await got;
  child.kill();

  const init = lines.find((l) => l.id === 1);
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.equal(init.result.serverInfo.name, 'engram');
  const tl = lines.find((l) => l.id === 2);
  assert.ok(tl.result.tools.some((t) => t.name === 'engram_recall'));
});
