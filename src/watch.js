// Live memory: keep the store in sync with a folder as it changes. Zero-dep —
// fs.watch where recursive watching is supported, polling fallback otherwise.
import fs from 'node:fs';
import { ingestPaths } from './ingest.js';

export function debounce(fn, ms) {
  let t = null;
  const wrapped = (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn(...args);
    }, ms);
  };
  wrapped.cancel = () => {
    if (t) clearTimeout(t);
    t = null;
  };
  return wrapped;
}

/**
 * Watch paths and re-ingest changed files on change (debounced).
 * @returns {Promise<{close:Function, initial:object}>}
 */
export async function startWatch(storeFile, paths, opts = {}, { log = () => {}, debounceMs = 600, pollMs = 2000 } = {}) {
  const initial = await ingestPaths(storeFile, paths, opts);

  const reindex = debounce(async () => {
    try {
      const r = await ingestPaths(storeFile, paths, opts);
      if (r.chunks) log(`re-indexed ${r.chunks} chunk(s) from ${r.changed} changed file(s)`);
    } catch (e) {
      log(`watch error: ${e.message}`);
    }
  }, debounceMs);

  const watchers = [];
  for (const p of paths) {
    try {
      watchers.push(fs.watch(p, { recursive: true }, () => reindex()));
    } catch {
      // recursive fs.watch unsupported (e.g. older Linux) — poll instead.
      const timer = setInterval(() => reindex(), pollMs);
      watchers.push({ close: () => clearInterval(timer) });
    }
  }

  return {
    initial,
    close: () => {
      reindex.cancel();
      for (const w of watchers) {
        try {
          w.close();
        } catch {}
      }
    },
  };
}
