// Optional semantic embeddings via a LOCAL Ollama instance. If Ollama isn't
// running, engram silently falls back to lexical+temporal recall — embeddings
// are an enhancement, never a requirement, and nothing leaves your machine.

const DEFAULT_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.ENGRAM_EMBED_MODEL || 'nomic-embed-text';

export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

export async function ollamaUp(host = DEFAULT_HOST) {
  try {
    const r = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(800) });
    return r.ok;
  } catch {
    return false;
  }
}

// Embedding models have small context windows (often 512 tokens); cap the input
// so an oversized chunk degrades to a truncated embedding instead of an error.
const MAX_EMBED_CHARS = 4000;

export async function embedOne(text, { host = DEFAULT_HOST, model = DEFAULT_MODEL } = {}) {
  const input = String(text).slice(0, MAX_EMBED_CHARS);
  // Prefer /api/embed: it truncates oversized input to the model's context
  // window instead of erroring (the legacy /api/embeddings endpoint 500s).
  let r = await fetch(`${host}/api/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, input, truncate: true }),
    signal: AbortSignal.timeout(30000),
  });
  if (r.ok) {
    const j = await r.json();
    if (Array.isArray(j.embeddings?.[0])) return j.embeddings[0];
  } else if (r.status !== 404) {
    throw new Error(`Ollama embeddings failed (${r.status}). Is the model "${model}" pulled?`);
  }
  // Older Ollama without /api/embed
  r = await fetch(`${host}/api/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, prompt: input }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`Ollama embeddings failed (${r.status}). Is the model "${model}" pulled?`);
  const j = await r.json();
  if (!Array.isArray(j.embedding)) throw new Error('Ollama returned no embedding');
  return j.embedding;
}

// Embed a batch, tolerating per-item failures: a chunk the model can't embed
// (e.g. still too long for its context) gets null and stays lexical-only.
export async function embedMany(texts, opts = {}) {
  const out = [];
  let firstError = null;
  for (const t of texts) {
    try {
      out.push(await embedOne(t, opts));
    } catch (e) {
      firstError = firstError || e;
      out.push(null);
    }
  }
  // If literally nothing embedded, the model/host is broken — surface it.
  if (firstError && out.every((v) => v === null)) throw firstError;
  return out;
}

export const embedConfig = { DEFAULT_HOST, DEFAULT_MODEL };
