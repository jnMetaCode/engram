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

export async function embedOne(text, { host = DEFAULT_HOST, model = DEFAULT_MODEL } = {}) {
  const r = await fetch(`${host}/api/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, prompt: text }),
  });
  if (!r.ok) throw new Error(`Ollama embeddings failed (${r.status}). Is the model "${model}" pulled?`);
  const j = await r.json();
  if (!Array.isArray(j.embedding)) throw new Error('Ollama returned no embedding');
  return j.embedding;
}

export async function embedMany(texts, opts = {}) {
  const out = [];
  for (const t of texts) out.push(await embedOne(t, opts));
  return out;
}

export const embedConfig = { DEFAULT_HOST, DEFAULT_MODEL };
