// Phrase + proximity scoring on top of BM25. BM25 is bag-of-words; it can't tell
// "quick brown fox" (a phrase) from those three words scattered across a chunk.
// This rewards chunks where the query terms actually cluster together.
import { tokenize } from './text.js';

function isPhrase(tokens, qTerms) {
  if (qTerms.length < 2) return false;
  for (let i = 0; i + qTerms.length <= tokens.length; i++) {
    let ok = true;
    for (let k = 0; k < qTerms.length; k++) {
      if (tokens[i + k] !== qTerms[k]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * @returns {{proximity:number, phrase:boolean}} proximity in [0,1]; 1 means the
 * distinct query terms appear in the tightest possible window.
 */
export function proximityScore(text, qTerms) {
  const q = [...new Set(qTerms)];
  if (q.length < 2) return { proximity: 0, phrase: false };

  const tokens = tokenize(text);
  const qset = new Set(q);
  const hits = [];
  tokens.forEach((t, i) => {
    if (qset.has(t)) hits.push([i, t]);
  });
  if (hits.length < 2) return { proximity: 0, phrase: false };

  // Smallest window covering the most distinct query terms.
  let bestDistinct = 0;
  let bestSpan = Infinity;
  for (let i = 0; i < hits.length; i++) {
    const seen = new Set();
    for (let j = i; j < hits.length; j++) {
      seen.add(hits[j][1]);
      const span = hits[j][0] - hits[i][0];
      if (seen.size > bestDistinct || (seen.size === bestDistinct && span < bestSpan)) {
        bestDistinct = seen.size;
        bestSpan = span;
      }
      if (seen.size === qset.size) break;
    }
  }

  const coverage = bestDistinct / qset.size; // how many query terms cluster
  // tightness: 1 when the covered terms are adjacent, → 0 as the window widens
  const ideal = bestDistinct - 1;
  const tightness = ideal > 0 ? ideal / Math.max(ideal, bestSpan) : 0;
  return { proximity: coverage * tightness, phrase: isPhrase(tokens, qTerms) };
}
