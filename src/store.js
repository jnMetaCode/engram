// The memory store is a single local JSON file. Nothing leaves your machine.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tokenize, termFreq, TOKENIZER_VERSION } from './text.js';
import { extractDate } from './chunk.js';

export function defaultStorePath() {
  return process.env.ENGRAM_STORE || path.join(os.homedir(), '.engram', 'store.json');
}

export function loadStore(file = defaultStorePath()) {
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    s.chunks ||= [];
    // The stemmer evolves; stored term frequencies are stem-dependent. When the
    // tokenizer version moved on, recompute tf/len from the stored chunk text so
    // old stores keep matching new query stems (persisted on the next save).
    if (s.tokv !== TOKENIZER_VERSION) {
      for (const c of s.chunks) {
        const tokens = tokenize(c.text);
        c.tf = termFreq(tokens);
        c.len = tokens.length;
      }
      s.tokv = TOKENIZER_VERSION;
    }
    return s;
  } catch (e) {
    if (e.code === 'ENOENT') return { version: 1, updatedAt: null, chunks: [], tokv: TOKENIZER_VERSION };
    throw e;
  }
}

export function saveStore(store, file = defaultStorePath()) {
  store.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store));
}

// FNV-1a — a tiny stable hash so re-ingesting identical content is idempotent.
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function makeChunkRecord(c) {
  const tokens = tokenize(c.text);
  return {
    id: hash(c.source + ':' + c.startLine + ':' + c.text.slice(0, 64)),
    source: c.source,
    startLine: c.startLine,
    endLine: c.endLine,
    mtime: c.mtime,
    date: c.date || null,
    when: c.when,
    text: c.text,
    tf: termFreq(tokens),
    len: tokens.length,
    embedding: c.embedding || null,
  };
}

// Replace all chunks from a given source (idempotent re-ingest), and never store
// the same content (same id) twice — so repeated `remember` of identical text
// doesn't accumulate duplicates.
export function ingestChunks(store, source, rawChunks) {
  store.chunks = store.chunks.filter((c) => c.source !== source);
  const seen = new Set(store.chunks.map((c) => c.id));
  let added = 0;
  for (const c of rawChunks) {
    const rec = makeChunkRecord(c);
    if (rec.len === 0 || seen.has(rec.id)) continue;
    seen.add(rec.id);
    store.chunks.push(rec);
    added++;
  }
  return added;
}

// Store a single free-form memory (used by the HTTP API and the MCP server).
export function rememberText(store, { text, source = 'api', date } = {}) {
  const d = date || extractDate(text);
  const when = date ? date + 'T00:00:00.000Z' : new Date().toISOString();
  const key = `${source}:${when}:${String(text).slice(0, 24)}`;
  ingestChunks(store, key, [
    { text, source, startLine: 1, endLine: 1, mtime: new Date().toISOString(), date: d, when },
  ]);
  return { chunks: store.chunks.length };
}

// Split a set of files into those that changed since last ingest and those that
// didn't, by comparing each file's mtime to the stored chunks' mtime. Pure +
// testable; powers incremental re-index (skip unchanged files).
// @param fileMtimes Iterable<[source, mtimeIso]>
export function changedFiles(store, fileMtimes) {
  const prev = new Map();
  for (const c of store.chunks) prev.set(c.source, c.mtime);
  const changed = [];
  const unchanged = [];
  for (const [source, mtime] of fileMtimes) {
    (prev.has(source) && prev.get(source) === mtime ? unchanged : changed).push(source);
  }
  return { changed, unchanged };
}

// ---- self-improving recall (reinforcement) ---------------------------------
// A feedback entry says "queries like THESE terms were correctly answered by
// THIS source". recall() turns matching entries into a bounded score bonus, so
// the memory gets better at the questions you actually ask. Plain data, fully
// inspectable in the store file; `forget` of a source drops its feedback too.

const MAX_FEEDBACK = 500;

/**
 * Record that `query` was correctly answered by the source(s) matching
 * `sourceNeedle`. Returns the sources reinforced (empty if none matched).
 */
export function reinforce(store, query, sourceNeedle) {
  const terms = [...new Set(tokenize(query))].sort();
  if (!terms.length) return [];
  const sources = [...new Set(store.chunks.map((c) => c.source))].filter((s) =>
    s.includes(sourceNeedle)
  );
  store.feedback ||= [];
  const key = terms.join(' ');
  for (const source of sources) {
    const existing = store.feedback.find((f) => f.source === source && f.terms.join(' ') === key);
    if (existing) {
      existing.count++;
      existing.lastAt = new Date().toISOString();
    } else {
      store.feedback.push({ terms, source, count: 1, lastAt: new Date().toISOString() });
    }
  }
  // Bound the table: drop the least-recently-confirmed entries first.
  if (store.feedback.length > MAX_FEEDBACK) {
    store.feedback.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
    store.feedback.length = MAX_FEEDBACK;
  }
  return sources;
}

/**
 * Bonus for one chunk given the current query terms: the best-matching
 * feedback entry for that chunk's source, scaled by how much of the entry's
 * query it shares. Bounded (≤ 0.3) so reinforcement re-orders relevant
 * results but can never overwhelm relevance itself.
 */
export function feedbackBonus(store, queryTerms, source) {
  if (!store.feedback?.length) return 0;
  const q = new Set(queryTerms);
  let best = 0;
  for (const f of store.feedback) {
    if (f.source !== source) continue;
    const overlap = f.terms.filter((t) => q.has(t)).length / f.terms.length;
    if (overlap < 0.5) continue; // must look like the reinforced question
    const strength = Math.min(0.3, 0.1 + 0.05 * Math.log1p(f.count));
    best = Math.max(best, overlap * strength);
  }
  return best;
}

export function forgetSource(store, needle) {
  const before = store.chunks.length;
  store.chunks = store.chunks.filter((c) => !c.source.includes(needle));
  if (store.feedback) store.feedback = store.feedback.filter((f) => !f.source.includes(needle));
  return before - store.chunks.length;
}

export function stats(store) {
  const sources = new Set(store.chunks.map((c) => c.source));
  const withEmbeddings = store.chunks.filter((c) => c.embedding).length;
  return {
    chunks: store.chunks.length,
    sources: sources.size,
    withEmbeddings,
    updatedAt: store.updatedAt,
  };
}
