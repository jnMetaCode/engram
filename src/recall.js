// Hybrid recall: lexical (BM25) + temporal recency + optional semantic (embeddings).
// This is the bit that addresses "flat vector dump, no temporal reasoning".
import { tokenize } from './text.js';
import { buildIndex, scoreChunk } from './bm25.js';
import { cosine } from './embed.js';

const DAY = 86400000;

function recency(whenIso, nowMs, halfLifeDays) {
  const t = whenIso ? Date.parse(whenIso) : NaN;
  if (!Number.isFinite(t)) return 0; // unknown time -> no recency boost (not "year 2000")
  const age = Math.max(0, nowMs - t);
  return Math.pow(0.5, age / DAY / halfLifeDays);
}

function snippet(text, queryTerms, width = 240) {
  const lower = text.toLowerCase();
  let at = -1;
  for (const t of queryTerms) {
    const i = lower.indexOf(t);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return text.slice(0, width).trim() + (text.length > width ? '…' : '');
  const start = Math.max(0, at - width / 3);
  const end = Math.min(text.length, start + width);
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
}

function normalize(values) {
  const max = Math.max(0, ...values);
  return max > 0 ? values.map((v) => v / max) : values.map(() => 0);
}

/**
 * @param {object} store
 * @param {string} query
 * @param {object} opts { limit, now, halfLifeDays, since, until, queryEmbedding,
 *                         weights:{lex,time,sem} }
 */
export function recall(store, query, opts = {}) {
  const limit = Number.isFinite(opts.limit) && opts.limit > 0 ? Math.floor(opts.limit) : 8;
  const nowMs = opts.now ? Date.parse(opts.now) : Date.now();
  const halfLifeDays = opts.halfLifeDays ?? 60;
  const sinceMs = opts.since ? Date.parse(opts.since) : -Infinity;
  const untilMs = opts.until ? Date.parse(opts.until) : Infinity;

  const hasWindow = Number.isFinite(sinceMs) || Number.isFinite(untilMs);
  let chunks = store.chunks.filter((c) => {
    if (!hasWindow) return true;
    const raw = c.when || c.mtime;
    const w = raw ? Date.parse(raw) : NaN;
    if (!Number.isFinite(w)) return false; // can't place it in time -> exclude from a time-filtered query
    return w >= sinceMs && w <= untilMs;
  });
  if (chunks.length === 0) return [];

  const qTerms = tokenize(query);
  const idx = buildIndex(chunks);
  const lex = chunks.map((c) => scoreChunk(qTerms, c, idx));

  const haveEmb = opts.queryEmbedding && chunks.some((c) => c.embedding);
  const sem = haveEmb
    ? chunks.map((c) => (c.embedding ? Math.max(0, cosine(opts.queryEmbedding, c.embedding)) : 0))
    : chunks.map(() => 0);

  const lexN = normalize(lex);
  const semN = normalize(sem);
  const time = chunks.map((c) => recency(c.when, nowMs, halfLifeDays));

  // Weights: when embeddings exist, lean on semantics; otherwise lexical leads.
  const w = opts.weights || (haveEmb ? { lex: 0.45, sem: 0.45, time: 0.1 } : { lex: 0.8, sem: 0, time: 0.2 });

  const scored = chunks.map((c, i) => ({
    chunk: c,
    lexical: lexN[i],
    semantic: semN[i],
    recencyScore: time[i],
    score: w.lex * lexN[i] + w.sem * semN[i] + w.time * time[i],
    matched: lex[i] > 0 || sem[i] > 0.2,
  }));

  return scored
    // keep a relevance floor even in semantic mode, so a non-matching query
    // doesn't return the whole store
    .filter((r) => r.matched || (haveEmb && r.semantic > 0.2))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => ({
      score: Number(r.score.toFixed(4)),
      source: r.chunk.source,
      lines: [r.chunk.startLine, r.chunk.endLine],
      when: r.chunk.when,
      date: r.chunk.date,
      citation: `${r.chunk.source}:${r.chunk.startLine}-${r.chunk.endLine}`,
      snippet: snippet(r.chunk.text, qTerms),
      text: r.chunk.text,
    }));
}
