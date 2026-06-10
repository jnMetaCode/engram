// Deterministic recall-quality benchmark (lexical path only — no Ollama).
// Run:  node test/eval/eval.js          (prints per-query results + summary)
// CI:   test/run.js asserts the hit@1 / hit@3 floors so regressions fail loudly.
//
// To add a case (e.g. from a recall-quality issue): drop a note in ./notes and
// a { q, expect } line in queries.json. `expect` matches the source filename.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { walkFiles, chunkFile } from '../../src/chunk.js';
import { ingestChunks } from '../../src/store.js';
import { recall } from '../../src/recall.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const NOW = '2026-06-10T00:00:00.000Z'; // frozen so recency scoring is stable

export function runEval() {
  const store = { version: 1, updatedAt: null, chunks: [] };
  for (const f of walkFiles([HERE + 'notes'])) ingestChunks(store, f, chunkFile(f).chunks);
  const queries = JSON.parse(fs.readFileSync(HERE + 'queries.json', 'utf8'));

  let hit1 = 0, hit3 = 0, mrr = 0;
  const misses = [];
  for (const { q, expect, opts = {} } of queries) {
    const res = recall(store, q, { now: NOW, ...opts });
    const rank = res.findIndex((r) => r.source.includes(expect)) + 1;
    if (rank === 1) hit1++;
    if (rank >= 1 && rank <= 3) hit3++;
    if (rank >= 1) mrr += 1 / rank;
    else misses.push({ q, expect, got: res[0]?.source?.split('/').pop() || '(nothing)' });
    if (rank !== 1) misses.push;
  }
  const n = queries.length;
  return {
    n,
    hit1: hit1 / n,
    hit3: hit3 / n,
    mrr: mrr / n,
    misses,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = runEval();
  console.log(`queries  ${r.n}`);
  console.log(`hit@1    ${(r.hit1 * 100).toFixed(0)}%`);
  console.log(`hit@3    ${(r.hit3 * 100).toFixed(0)}%`);
  console.log(`MRR      ${r.mrr.toFixed(3)}`);
  for (const m of r.misses) console.log(`  MISS  "${m.q}"  expected ${m.expect}, top hit ${m.got}`);
}
