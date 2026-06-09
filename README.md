<div align="center">

# 🧠 engram

### Your local, private memory layer

**Index your notes and files, then recall anything — with citations and a sense of time. 100% on your machine.**
No cloud. No account. No data leaving your laptop. Just `npx engram`.

```bash
npx engram ingest ~/notes
npx engram recall "what did I decide about pricing"
```

<!-- TODO: replace with a real screen recording before launch -->
<!-- ![engram demo](docs/demo.gif) -->

</div>

---

Your notes, journals, and docs are a second brain you can't query. Hosted "AI
memory" tools want you to upload all of it to their cloud. engram is the
opposite: it builds a searchable memory **on your machine** and never phones home.

```bash
npx engram ingest ~/notes ~/journal     # index markdown/text files
npx engram recall "auth bug clock skew" # ranked passages, with citations
npx engram recall "hiring" --since week  # time-aware: only recent memories
npx engram ask "summarize my pricing decisions"   # (optional) local LLM answer
```

Every result tells you exactly where it came from — `file:line` and the date —
so you can trust it and jump to the source.

## Why engram

- **Local-first & private.** Memory lives in one JSON file on disk. Embeddings and
  answers (optional) run through a **local Ollama** — nothing ever leaves your box.
- **Temporal reasoning, not a flat vector dump.** Every memory carries a
  timestamp (file mtime *and* dates found in the text). Recall is recency-aware
  and supports `--since week`, `--since 2026-05-01`, etc. — so "what was I working
  on lately" actually works.
- **Cited recall.** Results come back as `source:line (date)` with a snippet.
- **Works with zero setup.** A built-in BM25 lexical engine means recall works
  offline with no model at all. Add a local embedding model for semantic recall
  when you want it — it's an enhancement, never a requirement.
- **Zero dependencies.** Pure Node built-ins. A few hundred readable lines.
- **A memory backend for your agents, too.** `engram serve` exposes a tiny local
  API (`/remember`, `/recall`) so your AI agents get private, persistent memory.

## Install & use

```bash
# index some notes (markdown, txt, org, rst …)
npx engram ingest ~/Documents/notes

# recall — lexical + temporal, fully offline
npx engram recall "postgres migration plan"
npx engram recall "standup notes" --since 7d --limit 5

# optional: semantic recall + answers via a LOCAL Ollama
npx engram ingest ~/notes --embed           # one-time, computes embeddings
npx engram recall "that idea about caching" --semantic
npx engram ask "what are my open questions about auth?"

# housekeeping
npx engram status
npx engram forget old-project
```

## How it works

```
  files ──chunk──▶ memory store (one local JSON file)
                      │   each chunk: text · source:line · timestamp · term-freqs · [embedding]
  recall(query) ─────┤
                      ├─ BM25 lexical score        (always on, offline)
                      ├─ semantic cosine           (optional, local Ollama)
                      └─ temporal recency + filter (the part most tools miss)
                          → ranked, cited passages
```

The store is a plain JSON file (default `~/.engram/store.json`). Back it up,
inspect it, delete it — it's yours.

## Memory for agents

```bash
npx engram serve            # http://127.0.0.1:7077 (local only)
```

```bash
curl -s localhost:7077/remember -d '{"text":"Ship date is 2026-07-01"}'
curl -s localhost:7077/recall   -d '{"query":"ship date"}'
```

The open, local alternative to a hosted agent-memory service. Point your agent at
it and its memories stay on your machine, with the same temporal ranking.

### Use it as an MCP server (Claude, etc.)

engram speaks the [Model Context Protocol](https://modelcontextprotocol.io) over
stdio, so Claude Desktop / Claude Code can use your memory as a tool — `engram_recall`,
`engram_remember`, `engram_status`. Add to `claude_desktop_config.json` (or a
project `.mcp.json`):

```json
{
  "mcpServers": {
    "engram": {
      "command": "npx",
      "args": ["-y", "engram", "mcp"]
    }
  }
}
```

Now the model can recall your notes and persist new memories mid-conversation —
all locally. Zero dependencies, no SDK: it's a few hundred lines of pure Node
implementing JSON-RPC over stdio (spec revision 2025-06-18).

## Optional: local embeddings (Ollama)

engram never ships your data anywhere. For semantic recall it talks to a **local**
[Ollama](https://ollama.com):

```bash
ollama pull nomic-embed-text     # embeddings
ollama pull llama3.2             # for `engram ask`
```

Without Ollama, engram still works great in lexical + temporal mode.

## Commands

| | |
| --- | --- |
| `engram ingest <path...>` | index files/folders (`--embed` for semantic) |
| `engram recall <query>` | cited passages (`--since`, `--until`, `--limit`, `--semantic`) |
| `engram ask <query>` | compose an answer from memory (needs Ollama) |
| `engram status` | what's stored |
| `engram forget <substr>` | remove memories by source |
| `engram serve` | local memory API (HTTP) for agents |
| `engram mcp` | run as an MCP server (stdio) for Claude/agents |

## Status

Early MVP. Lexical + temporal recall, citations, ingest/forget, incremental
re-index (unchanged files are skipped — `--force` to override), the local agent
API, an **MCP server** (stdio), and optional Ollama embeddings/answers all work
today. Roadmap: more file types (PDF/EPUB) and a SQLite store for large vaults.
Star/watch to follow along.

## Sibling projects

Part of a small, local-first, zero-dependency toolkit for building AI agents:

- 🧠 **engram** — a local, private memory layer for agents (and you) *(this repo)*
- 🍳 **[skillet](https://github.com/USER/skillet)** — a package manager for agent skills
- 🔭 **[tracelet](https://github.com/USER/tracelet)** — local DevTools to debug agent runs

## License

MIT — see [LICENSE](LICENSE).
