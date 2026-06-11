// Shared ingest core used by both `engram ingest` and `engram watch`.
import fs from 'node:fs';
import { loadStore, saveStore, ingestChunks, changedFiles } from './store.js';
import { walkFiles, chunkFile } from './chunk.js';
import { ollamaUp, embedMany } from './embed.js';

/**
 * Ingest files/folders into the store, incrementally by default (skip files
 * whose mtime is unchanged). Returns counts.
 * @returns {Promise<{files:number, changed:number, unchanged:number, chunks:number, embedded:boolean}>}
 */
export async function ingestPaths(storeFile, paths, { force = false, embed = false, host, model } = {}) {
  const store = loadStore(storeFile);
  const files = walkFiles(paths);
  if (!files.length) return { files: 0, changed: 0, unchanged: 0, chunks: 0, embedded: false };

  let useEmbed = false;
  if (embed) useEmbed = await ollamaUp(host);

  const { changed, unchanged } = force
    ? { changed: files, unchanged: [] }
    : changedFiles(store, files.map((f) => [f, fs.statSync(f).mtime.toISOString()]));

  let chunks = 0;
  const failed = [];
  for (const f of changed) {
    let c;
    try {
      c = chunkFile(f).chunks;
    } catch (e) {
      failed.push({ file: f, reason: e.message }); // skip the bad file, keep the run
      continue;
    }
    if (useEmbed && c.length) {
      const vecs = await embedMany(c.map((x) => x.text), { host, model });
      c.forEach((x, i) => { if (vecs[i]) x.embedding = vecs[i]; });
    }
    chunks += ingestChunks(store, f, c);
  }
  saveStore(store, storeFile);
  return { files: files.length, changed: changed.length - failed.length, unchanged: unchanged.length, chunks, embedded: useEmbed, failed };
}
