# Why your AI memory should never leave your laptop

*(launch blog post draft — publish on a personal blog / dev.to / HN-friendly
host; doubles as the long-form explainer LAUNCH.md mentions)*

---

Every "AI memory" product I tried in the last year had the same architecture:
you upload your notes, journals, meeting minutes — the most personal text you
produce — to someone's cloud, where it gets chunked, embedded, and stored next
to everyone else's. In exchange you get a search box.

That trade never made sense to me. The whole point of a second brain is that
it's *yours*. So I built [engram](https://github.com/jnMetaCode/engram): a
memory layer that indexes your files and answers questions about them with
citations — and runs entirely on your machine. No account, no server, no
telemetry. It's a few hundred lines of Node with zero dependencies, MIT
licensed.

This post is about the three design decisions that mattered.

## 1. Local is a feature, not a deployment option

"Self-hostable" usually means: here's a Docker compose file with Postgres,
ClickHouse and Redis, good luck. That's still infrastructure — just *your*
infrastructure.

engram's stance is stricter: the entire memory is **one JSON file on disk**
(`~/.engram/store.json`). Ingestion, ranking, snippets, the agent API, the MCP
server — all pure Node built-ins. `npx @jnmetacode/engram ingest ~/notes` and
you're done. You can `cat` your memory. You can back it up with `cp`. You can
delete it and be certain it's gone.

The interesting consequence: **trust changes what you index.** People don't
upload their therapy journal or salary negotiation notes to a SaaS. When
memory is a local file, you index everything — and memory that covers
everything is the only memory worth querying.

## 2. Time is first-class, because memory without time is just search

Ask any "chat with your docs" tool *"what was I working on last week?"* and
watch it flail. Vector stores are flat: every chunk is equally *now*.

Real memory is temporal. engram extracts a timestamp for every chunk (file
mtime *plus* dates written in the text — "2026-05-20", "May 3, 2026"), ranks
recency-aware, and supports filters like `--since week`:

```
$ engram recall "what did I decide about pricing"
  0.96  notes/pricing.md:1-6  2026-05-20
        We decided to ship v1 with usage-based pricing …

$ engram recall "what did I decide about pricing" --since week
  no memories matched.        ← it knows that decision is three weeks old
```

That second result is the feature. A memory that can say "nothing recent"
is a memory you can reason with.

## 3. The model is optional, the engine is not

engram works with **no model at all**: a built-in BM25 engine with phrase and
proximity scoring, plus a small stemmer that folds plurals, verb forms, even
irregular pasts ("what did we choose" finds "we chose Postgres"). Offline, on
a plane, on a locked-down work machine — recall still works.

If you run [Ollama](https://ollama.com), engram will use it — locally — for
semantic recall (`--semantic`) and short cited answers (`engram ask`). But
it's an enhancement, never a requirement. Recall quality is held to a small
benchmark in CI (25 natural-language queries; a ranking change that regresses
hit@1 fails the build), so "works without a model" stays true rather than
aspirational.

## And then your agent gets it for free

The part I didn't expect to care about: once memory is a local process, your
**AI agents** can share it. engram ships an MCP server (`engram mcp`), so
Claude Code / Claude Desktop can call `engram_recall` and `engram_remember`
mid-conversation — reading and writing the same memory file your CLI uses.
Your assistant remembers your decisions *without your decisions leaving the
room*.

```json
{ "mcpServers": { "engram": { "command": "npx", "args": ["-y", "@jnmetacode/engram", "mcp"] } } }
```

## Try it

```bash
npx @jnmetacode/engram ingest ~/notes
npx @jnmetacode/engram recall "that idea about caching" --since month
```

Repo: https://github.com/jnMetaCode/engram — sample notes in `examples/` give
you the full loop in 30 seconds. It's an early MVP; recall-ranking feedback is
the most useful thing you can file (there's an issue template that turns your
bad query into a test case).

Your notes deserve a memory that works for you, on your machine, and answers
to nobody else.
