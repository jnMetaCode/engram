# engram — a worked example

These sample notes (`examples/notes/`) let you try engram in 30 seconds. Each note
is dated, so you can see the **temporal** recall in action.

## What this shows

`engram` turns a folder of notes/docs into a private, queryable memory — with
**citations** (`file:line`) and a **sense of time** — that runs entirely on your
machine.

## Try it

From the repo root:

```bash
# 1) index the sample notes into a throwaway store
ENGRAM_STORE=/tmp/engram-demo.json node src/cli.js ingest examples/notes
#   ✓ ingested 3 chunks from 3 file(s)

# 2) ask your notes a question — results come back cited
ENGRAM_STORE=/tmp/engram-demo.json node src/cli.js recall "what did we decide about pricing"
#   0.96  examples/notes/2026-05-20-pricing.md:1-6  2026-05-20
#     We decided to ship v1 with usage-based pricing and a generous free tier…

# 3) time-aware recall — only memories from the last month
ENGRAM_STORE=/tmp/engram-demo.json node src/cli.js recall "hiring" --since month

# 4) what caused the auth incident?
ENGRAM_STORE=/tmp/engram-demo.json node src/cli.js recall "auth token expiry root cause"
#   → the postmortem, with the clock-skew/UTC fix

# 5) see what's stored
ENGRAM_STORE=/tmp/engram-demo.json node src/cli.js status
```

(Installed via npm it's just `npx @jnmetacode/engram ingest ~/notes` — no `ENGRAM_STORE` or
`node src/cli.js` needed.)

## Keep it live

```bash
npx @jnmetacode/engram watch examples/notes   # re-indexes automatically as you edit
```

## Use it from your AI assistant (MCP)

```json
{ "mcpServers": { "engram": { "command": "npx", "args": ["-y", "@jnmetacode/engram", "mcp"] } } }
```

Now the assistant can `engram_recall` your notes and `engram_remember` new facts —
all locally. See the main [README](../README.md) for the full reference.
