// The memory store is a single local JSON file. Nothing leaves your machine.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tokenize, termFreq } from './text.js';
import { extractDate } from './chunk.js';

export function defaultStorePath() {
  return process.env.ENGRAM_STORE || path.join(os.homedir(), '.engram', 'store.json');
}

export function loadStore(file = defaultStorePath()) {
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    s.chunks ||= [];
    return s;
  } catch (e) {
    if (e.code === 'ENOENT') return { version: 1, updatedAt: null, chunks: [] };
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

// Replace all chunks from a given source (idempotent re-ingest).
export function ingestChunks(store, source, rawChunks) {
  store.chunks = store.chunks.filter((c) => c.source !== source);
  let added = 0;
  for (const c of rawChunks) {
    const rec = makeChunkRecord(c);
    if (rec.len === 0) continue;
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

export function forgetSource(store, needle) {
  const before = store.chunks.length;
  store.chunks = store.chunks.filter((c) => !c.source.includes(needle));
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
