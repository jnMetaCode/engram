// Tokenization + light normalization for the lexical index. Zero deps.

const STOPWORDS = new Set(
  ('a an the and or but if then else for to of in on at by with from up down out '
    + 'is are was were be been being am do does did doing have has had having i you '
    + 'he she it we they me him her us them my your his its our their this that these '
    + 'those as so not no nor too very can will just dont should now about into over '
    + 'after before between during again further once here there when where why how all '
    + 'any both each few more most other some such only own same than s t')
    .split(/\s+/)
);

// Very light suffix stemmer — enough to match plurals/verb forms without a dep.
function stem(w) {
  if (w.length <= 3) return w;
  return w
    .replace(/(ing|edly|edly|ements|ement|ations|ation|ies|ied|ily|ness|ments|ment)$/, '')
    .replace(/(ed|es|s)$/, '')
    .replace(/(.)\1$/, '$1'); // collapse a trailing double letter from stemming
}

export function tokenize(text, { stemming = true } = {}) {
  const out = [];
  const raw = String(text).toLowerCase().match(/[a-z0-9][a-z0-9'_-]*/g) || [];
  for (let w of raw) {
    w = w.replace(/^['_-]+|['_-]+$/g, '');
    if (w.length < 2 || STOPWORDS.has(w)) continue;
    out.push(stemming ? stem(w) : w);
  }
  return out;
}

export function termFreq(tokens) {
  const tf = Object.create(null);
  for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
  return tf;
}
