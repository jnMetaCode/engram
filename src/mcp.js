// A minimal, zero-dependency MCP (Model Context Protocol) server over stdio,
// so Claude / any MCP client can use your local engram memory as a tool.
//
// Protocol: JSON-RPC 2.0, newline-delimited, one object per line. stdout carries
// ONLY protocol messages; all logging goes to stderr. Spec revision 2025-06-18.
import fs from 'node:fs';
import { loadStore, saveStore, rememberText, reinforce, stats } from './store.js';
import { recall } from './recall.js';
import { parseSince } from './when.js';

const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const LATEST = '2025-06-18';

function pkgVersion() {
  try {
    return JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  } catch {
    return '0.0.0';
  }
}

export const TOOLS = [
  {
    name: 'engram_recall',
    description:
      'Search the local engram memory and return the most relevant passages with citations ' +
      '(source:line and date). Ranks by lexical relevance + recency; works offline. Use this to ' +
      'recall the user\'s notes, past decisions, or earlier context before answering.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to recall' },
        limit: { type: 'number', description: 'Max passages to return (default 6)' },
        since: { type: 'string', description: 'Only memories on/after this time. ISO date or relative: 7d, week, month, today, yesterday' },
        until: { type: 'string', description: 'Only memories on/before this time (ISO date or relative)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'engram_remember',
    description:
      'Store a new memory in the local engram store so it can be recalled later. Use to persist a ' +
      'fact, decision, or note. Stays 100% on the local machine.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The memory text to store' },
        source: { type: 'string', description: 'Optional label/source for the memory (default: "agent")' },
        date: { type: 'string', description: 'Optional ISO date (YYYY-MM-DD) this memory refers to' },
      },
      required: ['text'],
    },
  },
  {
    name: 'engram_status',
    description: 'Report how many memories and sources are currently stored in the local engram memory.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'engram_reinforce',
    description:
      'Self-improving recall: after a recall, confirm which source correctly answered the query. ' +
      'Future similar queries will rank that source higher. Use when you verified an answer was ' +
      'right (or the user confirmed it) so the memory gets better with use.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The query that was answered' },
        source: { type: 'string', description: 'Substring of the source/citation that held the right answer' },
      },
      required: ['query', 'source'],
    },
  },
];

function formatRecall(query, results) {
  if (!results.length) return `No memories matched "${query}".`;
  return results
    .map((r, i) => `[${i + 1}] ${r.citation}${r.date ? ` (${r.date})` : ''}\n${r.text.trim()}`)
    .join('\n\n');
}

function makeTools(storeFile) {
  return {
    async engram_recall(a) {
      if (!a || !a.query) throw new Error('query is required');
      const store = loadStore(storeFile);
      const opts = { limit: a.limit || 6, since: parseSince(a.since), until: parseSince(a.until) };
      return { content: [{ type: 'text', text: formatRecall(a.query, recall(store, a.query, opts)) }] };
    },
    async engram_remember(a) {
      if (!a || !a.text) throw new Error('text is required');
      const store = loadStore(storeFile);
      const { chunks } = rememberText(store, { text: a.text, source: a.source || 'agent', date: a.date });
      saveStore(store, storeFile);
      return { content: [{ type: 'text', text: `Remembered. ${chunks} memories stored.` }] };
    },
    async engram_reinforce(a) {
      if (!a || !a.query || !a.source) throw new Error('query and source are required');
      const store = loadStore(storeFile);
      const sources = reinforce(store, a.query, a.source);
      if (!sources.length) {
        return { content: [{ type: 'text', text: `No stored source matches "${a.source}" — nothing reinforced.` }] };
      }
      saveStore(store, storeFile);
      return {
        content: [
          { type: 'text', text: `Reinforced: queries like "${a.query}" will now rank ${sources.join(', ')} higher.` },
        ],
      };
    },
    async engram_status() {
      const s = stats(loadStore(storeFile));
      return {
        content: [
          { type: 'text', text: `engram memory: ${s.chunks} chunks across ${s.sources} sources (${s.withEmbeddings} with embeddings).` },
        ],
      };
    },
  };
}

const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

/**
 * Build a pure async message handler. Returns the JSON-RPC response object, or
 * null for notifications (which must never get a reply). Exposed for testing.
 */
export function createHandler({ storeFile } = {}) {
  const tools = makeTools(storeFile);
  const version = pkgVersion();

  return async function handle(msg) {
    if (msg == null || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      // Invalid request; only answerable if it carried an id.
      return msg && 'id' in msg ? fail(msg.id, -32600, 'Invalid Request') : null;
    }
    const isNotification = !('id' in msg);
    if (isNotification) return null; // initialized / cancelled / unknown — ignore silently

    const { id, method, params } = msg;
    try {
      switch (method) {
        case 'initialize': {
          const requested = params && params.protocolVersion;
          return ok(id, {
            protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : LATEST,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'engram', version },
          });
        }
        case 'ping':
          return ok(id, {});
        case 'tools/list':
          return ok(id, { tools: TOOLS });
        case 'tools/call': {
          const name = params && params.name;
          const tool = tools[name];
          if (!tool) return fail(id, -32602, `Unknown tool: ${name}`);
          try {
            return ok(id, await tool((params && params.arguments) || {}));
          } catch (e) {
            // Tool ran but failed — surface to the model as an isError result.
            return ok(id, { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });
          }
        }
        default:
          return fail(id, -32601, `Method not found: ${method}`);
      }
    } catch (e) {
      return fail(id, -32603, `Internal error: ${e.message}`);
    }
  };
}

export function startMcp({ storeFile } = {}) {
  const handle = createHandler({ storeFile });
  const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
  let buf = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
        continue;
      }
      Promise.resolve(handle(msg))
        .then((res) => res && send(res))
        .catch((e) => process.stderr.write(`engram mcp: ${e.message}\n`));
    }
  });
  process.stdin.on('end', () => process.exit(0));
  process.stderr.write('engram MCP server ready on stdio\n');
}
