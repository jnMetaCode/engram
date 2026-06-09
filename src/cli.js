#!/usr/bin/env node
import fs from 'node:fs';
import { loadStore, saveStore, ingestChunks, forgetSource, stats, defaultStorePath } from './store.js';
import { walkFiles, chunkFile } from './chunk.js';
import { recall } from './recall.js';
import { ollamaUp, embedOne, embedMany } from './embed.js';
import { answer } from './ask.js';
import { startServer } from './server.js';
import { startMcp } from './mcp.js';
import { parseSince } from './when.js';

const TTY = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (n) => (s) => (TTY ? `\x1b[${n}m${s}\x1b[0m` : s);
const c = { dim: paint(2), bold: paint(1), green: paint(32), cyan: paint(36), yellow: paint(33), red: paint(31) };
const log = (...a) => console.log(...a);
class UserError extends Error {}

function parseArgs(argv) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--store') flags.store = argv[++i];
    else if (a === '--limit' || a === '-n') flags.limit = Number(argv[++i]);
    else if (a === '--since') flags.since = argv[++i];
    else if (a === '--until') flags.until = argv[++i];
    else if (a === '--embed') flags.embed = true;
    else if (a === '--semantic' || a === '-s') flags.semantic = true;
    else if (a === '--json') flags.json = true;
    else if (a === '--port') flags.port = Number(argv[++i]);
    else if (a === '--host') flags.host = argv[++i];
    else if (a === '--model') flags.model = argv[++i];
    else if (a === '-h' || a === '--help') flags.help = true;
    else if (a === '-v' || a === '--version') flags.version = true;
    else pos.push(a);
  }
  return { flags, pos };
}

const HELP = `${c.bold('engram')} — your local, private memory layer

${c.bold('Usage')}  engram <command> [args] [flags]

${c.bold('Commands')}
  ${c.cyan('ingest')} <path...>     index files/folders into memory (md, txt, …)
  ${c.cyan('recall')} <query>       find relevant passages with citations
  ${c.cyan('ask')} <query>          answer from memory (needs local Ollama)
  ${c.cyan('status')}               show what's stored
  ${c.cyan('forget')} <substr>      remove memories whose source matches
  ${c.cyan('serve')}                start the local memory API (HTTP, for agents)
  ${c.cyan('mcp')}                  run as an MCP server over stdio (Claude/agents)

${c.bold('Flags')}
  --store <path>     store file (default: ${defaultStorePath()})
  -n, --limit <n>    max results (recall)
  --since <when>     filter: ISO date | 7d | today | yesterday | week | month
  --until <when>     filter upper bound
  --embed            compute local embeddings on ingest (needs Ollama)
  -s, --semantic     use embeddings for recall (needs Ollama)
  --json             machine-readable output
  --host/--model     Ollama host / model overrides

${c.bold('Examples')}
  engram ingest ~/notes ~/journal
  engram recall "what did I decide about pricing"
  engram recall "auth bug" --since week
  engram ask "summarize my meetings about hiring"

Everything stays on your machine. Embeddings/answers use a local Ollama only.`;

const commands = {
  async ingest(paths, flags) {
    if (!paths.length) throw new UserError('usage: engram ingest <path...>');
    const file = flags.store || defaultStorePath();
    const store = loadStore(file);
    const files = walkFiles(paths);
    if (!files.length) throw new UserError('no supported files found (md, markdown, txt, text, org, rst)');

    let useEmbed = false;
    if (flags.embed) {
      useEmbed = await ollamaUp(flags.host);
      if (!useEmbed) log(c.yellow('! Ollama not reachable — ingesting without embeddings'));
    }

    let total = 0;
    for (const f of files) {
      const { chunks } = chunkFile(f);
      if (useEmbed) {
        const vecs = await embedMany(chunks.map((ch) => ch.text), { host: flags.host, model: flags.model });
        chunks.forEach((ch, i) => (ch.embedding = vecs[i]));
      }
      total += ingestChunks(store, f, chunks);
    }
    saveStore(store, file);
    log(c.green('✓'), `ingested ${total} chunks from ${files.length} file(s)${useEmbed ? ' (with embeddings)' : ''}`);
    log(c.dim(`  store: ${file}`));
  },

  async recall(words, flags) {
    const query = words.join(' ');
    if (!query) throw new UserError('usage: engram recall <query>');
    const store = loadStore(flags.store);
    const opts = { limit: flags.limit, since: parseSince(flags.since), until: parseSince(flags.until) };

    if (flags.semantic) {
      if (await ollamaUp(flags.host)) opts.queryEmbedding = await embedOne(query, { host: flags.host, model: flags.model });
      else log(c.yellow('! Ollama not reachable — falling back to lexical recall'));
    }

    const results = recall(store, query, opts);
    if (flags.json) return log(JSON.stringify(results, null, 2));
    if (!results.length) return log(c.dim('no memories matched.'));
    log('');
    for (const r of results) {
      const when = r.date || r.when?.slice(0, 10) || '';
      log(`  ${c.green(r.score.toFixed(3))}  ${c.cyan(r.citation)}  ${c.dim(when)}`);
      log(`    ${r.snippet.replace(/\n/g, ' ')}`);
      log('');
    }
  },

  async ask(words, flags) {
    const query = words.join(' ');
    if (!query) throw new UserError('usage: engram ask <query>');
    const store = loadStore(flags.store);
    const opts = { limit: flags.limit || 6, since: parseSince(flags.since) };
    if (await ollamaUp(flags.host)) {
      opts.queryEmbedding = await embedOne(query, { host: flags.host, model: flags.model }).catch(() => null);
    }
    const results = recall(store, query, opts);
    if (!results.length) return log(c.dim('no relevant memories found.'));

    if (await ollamaUp(flags.host)) {
      const text = await answer(query, results, { host: flags.host, model: flags.model });
      log('\n' + text + '\n');
      log(c.dim('sources: ' + results.map((r) => r.citation).join(', ')));
    } else {
      log(c.yellow('! Ollama not reachable — showing the passages instead:\n'));
      for (const r of results) log(`  ${c.cyan(r.citation)}\n    ${r.snippet.replace(/\n/g, ' ')}\n`);
    }
  },

  status(_args, flags) {
    const file = flags.store || defaultStorePath();
    const s = stats(loadStore(file));
    if (flags.json) return log(JSON.stringify({ ...s, store: file }, null, 2));
    log('');
    log(`  ${c.bold('engram')} memory`);
    log(`  store        ${file}`);
    log(`  chunks       ${s.chunks}`);
    log(`  sources      ${s.sources}`);
    log(`  embeddings   ${s.withEmbeddings}${s.withEmbeddings ? '' : c.dim(' (lexical+temporal only)')}`);
    log(`  updated      ${s.updatedAt || c.dim('never')}`);
    log('');
  },

  forget([needle], flags) {
    if (!needle) throw new UserError('usage: engram forget <substring-of-source>');
    const file = flags.store || defaultStorePath();
    const store = loadStore(file);
    const removed = forgetSource(store, needle);
    saveStore(store, file);
    log(c.green('✓'), `forgot ${removed} chunk(s) matching "${needle}"`);
  },

  serve(_args, flags) {
    startServer({ port: flags.port || 7077, storeFile: flags.store });
  },

  mcp(_args, flags) {
    // stdio is the protocol channel here — do not print anything to stdout.
    startMcp({ storeFile: flags.store });
  },
};

async function main() {
  const { flags, pos } = parseArgs(process.argv.slice(2));
  const cmd = pos.shift();
  if (flags.version) {
    const p = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return log(p.version);
  }
  if (!cmd || flags.help || cmd === 'help') return log(HELP);
  const handler = commands[cmd];
  if (!handler) { log(c.red(`unknown command: ${cmd}`)); log(HELP); process.exitCode = 1; return; }
  await handler(pos, flags);
}

main().catch((e) => {
  if (e instanceof UserError) console.error(c.red('✗ ') + e.message);
  else console.error(e);
  process.exitCode = 1;
});
