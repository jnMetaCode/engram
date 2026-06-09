// Okapi BM25 over the stored chunks. Zero deps.

export function buildIndex(chunks, { k1 = 1.5, b = 0.75 } = {}) {
  const df = Object.create(null);
  let totalLen = 0;
  for (const c of chunks) {
    totalLen += c.len;
    for (const term in c.tf) df[term] = (df[term] || 0) + 1;
  }
  return { df, N: chunks.length, avgdl: chunks.length ? totalLen / chunks.length : 0, k1, b };
}

function idf(term, idx) {
  const n = idx.df[term] || 0;
  return Math.log(1 + (idx.N - n + 0.5) / (n + 0.5));
}

export function scoreChunk(queryTerms, chunk, idx) {
  const { k1, b, avgdl } = idx;
  let score = 0;
  for (const term of queryTerms) {
    const tf = chunk.tf[term];
    if (!tf) continue;
    const denom = tf + k1 * (1 - b + (b * chunk.len) / (avgdl || 1));
    score += idf(term, idx) * ((tf * (k1 + 1)) / denom);
  }
  return score;
}
