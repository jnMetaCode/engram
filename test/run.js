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
import { loadStore, ingestChunks, changedFiles, rememberText, forgetSource, reinforce, feedbackBonus, stats } from '../src/store.js';
import { buildIndex, scoreChunk } from '../src/bm25.js';
import { cosine } from '../src/embed.js';
import { recall } from '../src/recall.js';
import { startServer } from '../src/server.js';
import { createHandler } from '../src/mcp.js';
import { ingestPaths } from '../src/ingest.js';
import { startWatch, debounce } from '../src/watch.js';
import { extractPdfText } from '../src/pdf.js';
import { extractEpubText } from '../src/epub.js';
import { htmlToText } from '../src/extract.js';
import { proximityScore } from '../src/proximity.js';
import { runEval } from './eval/eval.js';
import { spawn } from 'node:child_process';
import zlib from 'node:zlib';

// Minimal PDF builders for fixtures (text in a single content stream).
const uncompressedPdf = (t) =>
  Buffer.from(`%PDF-1.4\n4 0 obj\n<< /Length 0 >>\nstream\nBT (${t}) Tj ET\nendstream\nendobj\n%%EOF`, 'latin1');
const flatePdf = (t) =>
  Buffer.concat([
    Buffer.from('%PDF-1.4\n5 0 obj\n<< /Filter /FlateDecode >>\nstream\n', 'latin1'),
    zlib.deflateSync(Buffer.from(`BT (${t}) Tj ET`, 'latin1')),
    Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1'),
  ]);

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

test('proximity: adjacent query terms score higher than scattered; phrase detected', () => {
  const adj = proximityScore('quick brown fox alpha beta gamma', ['quick', 'brown', 'fox']);
  const far = proximityScore('quick alpha brown beta fox gamma', ['quick', 'brown', 'fox']);
  assert.ok(adj.proximity > far.proximity);
  assert.equal(adj.phrase, true);
  assert.equal(far.phrase, false);
});

test('recall ranks a phrase match above scattered terms (same BM25)', () => {
  const store = { version: 1, chunks: [] };
  const mk = (src, text) => ({ text, source: src, startLine: 1, endLine: 1, mtime: NOW, when: NOW });
  // same tokens, same length, same tf/idf -> identical BM25; proximity decides
  ingestChunks(store, 'phrase.md', [mk('phrase.md', 'quick brown fox alpha beta gamma')]);
  ingestChunks(store, 'scattered.md', [mk('scattered.md', 'quick alpha brown beta fox gamma')]);
  const res = recall(store, 'quick brown fox', { now: NOW });
  assert.equal(res.length, 2);
  assert.match(res[0].source, /phrase\.md/);
});

test('snippet centers on the densest cluster of query terms', () => {
  const store = { version: 1, chunks: [] };
  const long = 'intro padding padding padding padding. later the auth token expiry bug appeared. more padding padding.';
  ingestChunks(store, 'n.md', [{ text: long, source: 'n.md', startLine: 1, endLine: 1, mtime: NOW, when: NOW }]);
  const res = recall(store, 'auth token expiry', { now: NOW });
  assert.match(res[0].snippet, /auth token expiry/);
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

// ----------------------------------------------------------- extractors ---
test('extractPdfText reads uncompressed and FlateDecode content streams', () => {
  assert.match(extractPdfText(uncompressedPdf('Hello engram from a PDF document')), /Hello engram from a PDF document/);
  assert.match(extractPdfText(flatePdf('Compressed text inside engram')), /Compressed text inside engram/);
});

test('extractPdfText ignores non-text (image/binary) streams', () => {
  const buf = Buffer.from('%PDF-1.4\nstream\n\x89PNG binary (stuff) not-text\nendstream\n%%EOF', 'latin1');
  assert.equal(extractPdfText(buf).trim(), ''); // no BT/Tj -> nothing mined
});

test('extractPdfText decodes UTF-16BE hex strings instead of emitting NULs', () => {
  // <0048 0069> = "Hi" as a Type0/Identity-H text-showing hex string
  const buf = Buffer.from('%PDF-1.4\nstream\nBT <00480069> Tj ET\nendstream\n%%EOF', 'latin1');
  const out = extractPdfText(buf);
  assert.match(out, /Hi/);
  assert.ok(!out.includes(' '));
});

test('extractPdfText drops CID glyph-index hex soup rather than indexing garbage', () => {
  // Odd-positioned NULs (not UTF-16BE-shaped) — raw CID codes, unmappable.
  const buf = Buffer.from('%PDF-1.4\nstream\nBT <0F00140019001E00> Tj ET\nendstream\n%%EOF', 'latin1');
  assert.equal(extractPdfText(buf).trim(), '');
});

test('extractPdfText rejects binary streams that contain "Tj"/"BT" by chance', () => {
  // High-byte font-program soup with embedded BT/Tj and a stray '(' string.
  const junk = 'BT \xae\xc5\xdc\xf3\xe8\x9f (\xb0\xc8\xe1\xf9\xaa\xbb\xcc\xdd\xee\xff\xa1\xa2\xa3) Tj';
  const buf = Buffer.from(`%PDF-1.4\nstream\n${junk}\nendstream\n%%EOF`, 'latin1');
  assert.equal(extractPdfText(buf).trim(), '');
});

test('extractPdfText collapses PDF layout spacing runs', () => {
  const out = extractPdfText(uncompressedPdf('cols:   a        b          c'));
  assert.match(out, /cols: a b c/);
});

test('chunkText drops mostly-non-printable chunks (extractor garbage guard)', () => {
  const binary = Array.from({ length: 300 }, (_, i) => String.fromCharCode(i % 28)).join('');
  assert.equal(chunkText(binary).length, 0);
  assert.equal(chunkText('Normal prose survives the guard.').length, 1);
});

test('htmlToText strips tags, scripts, and decodes entities', () => {
  const t = htmlToText('<h1>Title</h1><p>Hello &amp; welcome &lt;ok&gt;</p><script>var x=1</script>');
  assert.match(t, /Title/);
  assert.match(t, /Hello & welcome <ok>/);
  assert.ok(!t.includes('var x=1'));
});

test('ingest indexes a PDF and recall finds its text', async () => {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'engram-pdf-'));
  fs.writeFileSync(join(dir, 'doc.pdf'), flatePdf('The annual budget meeting is on 2026-08-12 about hiring plans'));
  const store = tmpStore();
  const r = await ingestPaths(store, [dir], {});
  assert.ok(r.chunks >= 1);
  const res = recall(loadStore(store), 'budget hiring meeting', { now: NOW });
  assert.ok(res.length >= 1);
  assert.match(res[0].source, /doc\.pdf/);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ----------------------------------------------------------- ingest/watch ---
test('ingestPaths indexes once, then is incremental', async () => {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'engram-ing-'));
  fs.writeFileSync(join(dir, 'a.md'), '# note\n\nthe quarterly plan is due 2026-05-01\n');
  const store = tmpStore();
  const first = await ingestPaths(store, [dir], {});
  assert.equal(first.files, 1);
  assert.ok(first.chunks >= 1);
  const second = await ingestPaths(store, [dir], {});
  assert.equal(second.changed, 0); // unchanged -> skipped
  assert.equal(second.chunks, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('debounce collapses rapid calls into one', async () => {
  let n = 0;
  const d = debounce(() => n++, 40);
  d(); d(); d();
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(n, 1);
});

test('watch re-indexes a file after it changes', async () => {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'engram-watch-'));
  fs.writeFileSync(join(dir, 'note.md'), '# first\n\noriginal content about apples\n');
  const store = tmpStore();
  const w = await startWatch(store, [dir], {}, { debounceMs: 50, pollMs: 150 });
  assert.ok(w.initial.chunks >= 1);

  // modify the file; watcher should pick it up
  await new Promise((r) => setTimeout(r, 50));
  fs.writeFileSync(join(dir, 'note.md'), '# first\n\nnow it mentions bananas and oranges instead\n');

  let found = false;
  for (let i = 0; i < 40 && !found; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const res = recall(loadStore(store), 'bananas oranges', { now: NOW });
    found = res.length > 0;
  }
  w.close();
  fs.rmSync(dir, { recursive: true, force: true });
  assert.ok(found, 'watch should have re-indexed the changed file');
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
  assert.deepEqual(names.sort(), ['engram_recall', 'engram_reinforce', 'engram_remember', 'engram_status']);
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

test('irregular past tenses fold to their lemma (query and doc agree)', () => {
  // direct equivalences
  assert.deepEqual(tokenize('chose'), tokenize('choose'));
  assert.deepEqual(tokenize('built'), tokenize('build'));
  assert.deepEqual(tokenize('wrote'), tokenize('write'));
  assert.deepEqual(tokenize('thought'), tokenize('think'));
  // ambiguous noun/verb words are NOT lemmatized
  assert.notDeepEqual(tokenize('left'), tokenize('leave'));
});

test('recall matches a past-tense memory from a present-tense question', () => {
  const store = { version: 1, updatedAt: null, chunks: [] };
  rememberText(store, { text: 'On 2026-06-09 we chose usage-based pricing and built the billing page.', source: 'note' });
  const hits = recall(store, 'what did we choose for pricing', { now: '2026-06-10T00:00:00.000Z' });
  assert.ok(hits.length >= 1, 'expected a hit');
  assert.match(hits[0].snippet, /chose usage-based/);
});

test('recall-quality benchmark stays above its floor (see test/eval/)', () => {
  const r = runEval();
  assert.ok(r.hit1 >= 0.88, `hit@1 ${r.hit1} fell below 0.88 — a ranking change regressed recall`);
  assert.ok(r.hit3 >= 0.96, `hit@3 ${r.hit3} fell below 0.96`);
});

test('ed/ing stripping undoubles the trailing consonant (shipped matches ship)', () => {
  assert.deepEqual(tokenize('shipped'), tokenize('ship'));
  assert.deepEqual(tokenize('running'), tokenize('run'));
  assert.deepEqual(tokenize('stopped'), tokenize('stop'));
  // ll/ss/zz endings are not clipped
  assert.equal(tokenize('rolling')[0], 'roll');
  assert.equal(tokenize('pressed')[0], 'press');
});

// Minimal in-test ZIP/EPUB builder (CRCs unchecked by our reader).
function buildZip(files) {
  const chunks = []; const central = []; let offset = 0;
  for (const f of files) {
    const nameB = Buffer.from(f.name);
    const raw = Buffer.from(f.data);
    const comp = f.deflate ? zlib.deflateRawSync(raw) : raw;
    const method = f.deflate ? 8 : 0;
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(method, 8);
    loc.writeUInt32LE(comp.length, 18); loc.writeUInt32LE(raw.length, 22);
    loc.writeUInt16LE(nameB.length, 26);
    chunks.push(loc, nameB, comp);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(method, 10);
    cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(raw.length, 24);
    cen.writeUInt16LE(nameB.length, 28); cen.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cen, nameB]));
    offset += 30 + nameB.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cd, eocd]);
}

const TINY_EPUB = () => buildZip([
  { name: 'mimetype', data: 'application/epub+zip' },
  { name: 'OEBPS/content.opf', deflate: true, data: `<?xml version="1.0"?>
<package><manifest>
  <item id="c2" href="zz-second.xhtml" media-type="application/xhtml+xml"/>
  <item id="c1" href="aa-first.xhtml" media-type="application/xhtml+xml"/>
</manifest><spine><itemref idref="c2"/><itemref idref="c1"/></spine></package>` },
  // alphabetical order would put aa-first first; the spine says zz-second first
  { name: 'OEBPS/aa-first.xhtml', deflate: true, data: '<html><body><p>The ending of the story.</p></body></html>' },
  { name: 'OEBPS/zz-second.xhtml', data: '<html><body><h1>Chapter One</h1><p>It began on 2026-03-01 with a migration.</p></body></html>' },
]);

test('extractEpubText reads chapters (stored + deflate) in spine order', () => {
  const text = extractEpubText(TINY_EPUB());
  assert.match(text, /Chapter One/);
  assert.match(text, /ending of the story/);
  assert.ok(text.indexOf('Chapter One') < text.indexOf('ending of the story'), 'spine order must win over filename order');
});

test('epub ingestion end-to-end: chunked, dated, recallable', () => {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'engram-epub-'));
  fs.writeFileSync(join(dir, 'book.epub'), TINY_EPUB());
  const store = { version: 1, updatedAt: null, chunks: [] };
  for (const f of walkFiles([dir])) ingestChunks(store, f, chunkFile(f).chunks);
  const res = recall(store, 'when did the migration begin', { now: NOW });
  assert.ok(res.length >= 1);
  assert.match(res[0].source, /book\.epub/);
  assert.equal(res[0].date, '2026-03-01'); // date extracted from chapter text
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---- self-improving recall (reinforce) -------------------------------------
test('reinforce flips the ranking for similar queries, bounded and source-scoped', () => {
  const store = { version: 1, updatedAt: null, chunks: [] };
  const mk = (src, text) => ({ text, source: src, startLine: 1, endLine: 1, mtime: NOW, when: NOW });
  // two chunks that score identically for the query
  ingestChunks(store, 'a.md', [mk('a.md', 'release process checklist for the team')]);
  ingestChunks(store, 'b.md', [mk('b.md', 'release process checklist for the team')]);

  const before = recall(store, 'release process checklist', { now: NOW });
  assert.equal(before.length, 2);

  // user confirms b.md was the right answer
  const sources = reinforce(store, 'release process checklist', 'b.md');
  assert.deepEqual(sources, ['b.md']);

  const after = recall(store, 'release process checklist', { now: NOW });
  assert.match(after[0].source, /b\.md/, 'reinforced source ranks first');

  // a *different* question is unaffected (overlap below the 0.5 floor)
  assert.equal(feedbackBonus(store, tokenize('unrelated zebra migration'), 'b.md'), 0);

  // repeated confirmations grow the bonus but never past the bound
  for (let i = 0; i < 50; i++) reinforce(store, 'release process checklist', 'b.md');
  assert.equal(store.feedback.length, 1, 'same query+source folds into one entry');
  assert.ok(feedbackBonus(store, tokenize('release process checklist'), 'b.md') <= 0.3);

  // reinforcement re-orders, it never resurrects: a non-matching query still
  // returns nothing even for the reinforced source
  assert.equal(recall(store, 'quantum lighthouse', { now: NOW }).length, 0);

  // forgetting the source drops its feedback too
  forgetSource(store, 'b.md');
  assert.equal(store.feedback.length, 0);
});

test('reinforce against a missing source reinforces nothing', () => {
  const store = { version: 1, updatedAt: null, chunks: [] };
  ingestChunks(store, 'a.md', [{ text: 'hello world note', source: 'a.md', startLine: 1, endLine: 1, mtime: NOW, when: NOW }]);
  assert.deepEqual(reinforce(store, 'hello world', 'nope.md'), []);
  assert.ok(!store.feedback || store.feedback.length === 0);
});

test('MCP exposes engram_reinforce and it persists feedback', async () => {
  const file = tmpStore();
  const store = { version: 1, updatedAt: null, chunks: [] };
  rememberText(store, { text: 'We chose usage-based pricing.', source: 'decisions' });
  const { saveStore } = await import('../src/store.js');
  saveStore(store, file);

  const handle = createHandler({ storeFile: file });
  const list = await handle({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
  assert.ok(list.result.tools.some((t) => t.name === 'engram_reinforce'));

  const res = await handle({
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'engram_reinforce', arguments: { query: 'what pricing did we choose', source: 'decisions' } },
  });
  assert.match(res.result.content[0].text, /Reinforced/);
  assert.equal(loadStore(file).feedback.length, 1);
});
