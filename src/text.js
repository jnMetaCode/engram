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

// Irregular past tenses can't be suffix-stripped, but recall queries about past
// decisions are full of them ("what did we choose" must find "we chose…").
// Only unambiguous, common verbs — words that double as nouns (left, saw, rose,
// ground, felt) are deliberately absent.
const LEMMAS = new Map(Object.entries({
  chose: 'choose', chosen: 'choose', made: 'make', built: 'build', wrote: 'write',
  written: 'write', took: 'take', taken: 'take', gave: 'give', given: 'give',
  went: 'go', gone: 'go', got: 'get', gotten: 'get', kept: 'keep', sent: 'send',
  spent: 'spend', held: 'hold', ran: 'run', came: 'come', brought: 'bring',
  bought: 'buy', thought: 'think', taught: 'teach', caught: 'catch', sold: 'sell',
  told: 'tell', paid: 'pay', met: 'meet', began: 'begin', begun: 'begin',
  broke: 'break', broken: 'break', spoke: 'speak', spoken: 'speak',
  drove: 'drive', driven: 'drive', grew: 'grow', grown: 'grow', knew: 'know',
  known: 'know', threw: 'throw', thrown: 'throw', understood: 'understand',
  stood: 'stand', lost: 'lose', won: 'win', hid: 'hide', hidden: 'hide',
  froze: 'freeze', frozen: 'freeze', dealt: 'deal', meant: 'mean',
  became: 'become', found: 'find', fell: 'fall', fallen: 'fall',
}));

// Common tech-name shorthands — "postgres" must find "PostgreSQL" notes.
const ALIASES = new Map(Object.entries({
  postgres: 'postgresql', pg: 'postgresql', mongo: 'mongodb', k8s: 'kubernetes',
  js: 'javascript', ts: 'typescript', py: 'python', tf: 'terraform',
  repo: 'repository', repos: 'repositories', config: 'configuration',
  auth: 'authentication', db: 'database', env: 'environment',
}));

// Light suffix stemmer — enough to match plural/verb forms without a dependency.
// Plural handling follows Porter step 1a so singular/plural pairs collapse to the
// same stem (cache/caches, class/classes, address/addresses) while words ending
// in "ss" are preserved (class, process).
function stem(w) {
  w = ALIASES.get(w) || w;
  w = LEMMAS.get(w) || w;
  if (w.length <= 3) return w;
  if (/sses$/.test(w)) w = w.slice(0, -2); // processes -> process
  else if (/ies$/.test(w)) w = w.slice(0, -2); // queries -> queri
  else if (/ss$/.test(w)) {
    /* keep: class, process, address */
  } else if (/s$/.test(w)) w = w.slice(0, -1); // tokens -> token, caches -> cache
  // common verb/noun suffixes (longest first); applied to both query and doc, so
  // it only needs to be self-consistent, not linguistically perfect.
  w = w.replace(/(ization|ational|fulness|ousness|iveness|ation|ements|ement|ments|ment|ness|edly|ingly|ing|ed)$/, '');
  // Undouble a trailing consonant pair left by ed/ing stripping (shipped→shipp
  // must match ship; running→runn must match run). Keep ll/ss/zz (roll, press).
  if (w.length >= 4 && /([b-df-hj-np-tv-z])\1$/.test(w) && !/(ll|ss|zz)$/.test(w)) w = w.slice(0, -1);
  // Drop a trailing silent 'e' so suffix-stripped forms line up with their base
  // word ("licensing"→licens must match "license"→licens; "making"→mak must
  // match "make"→mak). Applied to both sides, so it only needs consistency.
  if (w.length > 4 && w.endsWith('e') && !w.endsWith('ee')) w = w.slice(0, -1);
  return w;
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
