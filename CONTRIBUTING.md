# Contributing to engram

Thanks! engram is small, zero-dependency, and privacy-first by design — please
keep it that way.

## Ground rules

- **No runtime dependencies.** Node built-ins only. Optional AI features talk to a
  **local** Ollama over HTTP — never add a cloud SDK or send data off-machine.
- **Privacy is a feature, not a setting.** Anything that could exfiltrate user
  data (telemetry, remote calls beyond an explicit local Ollama host) is a no.
- **Target Node 18+.** Keep it readable.

## Dev loop

```bash
git clone https://github.com/USER/engram && cd engram
node src/cli.js ingest test/fixtures/notes --store /tmp/e.json
node src/cli.js recall "pricing" --store /tmp/e.json
npm test
```

## Architecture

- `src/text.js` — tokenize + light stemming
- `src/chunk.js` — read files, chunk with line ranges, extract dates
- `src/store.js` — the local JSON store (load/save/ingest/forget)
- `src/bm25.js` — lexical scoring
- `src/embed.js` — optional local Ollama embeddings + cosine
- `src/recall.js` — hybrid lexical + temporal + semantic ranking (the core)
- `src/ask.js` — optional local LLM answer composition
- `src/server.js` — local memory API for agents
- `src/cli.js` — commands

## Good first contributions

- **New file types** — PDF/EPUB/HTML extraction (text-only; keep deps out of
  `dependencies` — prefer shelling out or a tiny vendored parser).
- **Incremental re-index** — skip files whose mtime is unchanged.
- **An MCP server** wrapping the recall/remember API.
- **Smarter temporal queries** — "last month", date ranges in natural language.

Every change to parsing/ranking/store needs a fixture-based test in `test/run.js`.
The store and ranking must stay deterministic (inject `now` for temporal tests).
