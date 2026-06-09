// Optional: compose an answer from recalled passages using a LOCAL Ollama chat
// model. Falls back to just listing passages when Ollama isn't available.
const DEFAULT_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.ENGRAM_CHAT_MODEL || 'llama3.2';

export async function answer(query, passages, { host = DEFAULT_HOST, model = DEFAULT_MODEL } = {}) {
  const context = passages
    .map((p, i) => `[${i + 1}] (${p.citation}${p.date ? ', ' + p.date : ''})\n${p.text}`)
    .join('\n\n');

  const system =
    'You answer questions using ONLY the provided memory passages. ' +
    'Cite sources inline as [n]. If the passages do not contain the answer, say so plainly. Be concise.';
  const user = `Question: ${query}\n\nMemory passages:\n${context}`;

  const r = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) throw new Error(`Ollama chat failed (${r.status}). Is the model "${model}" pulled?`);
  const j = await r.json();
  return j.message?.content?.trim() || '';
}
