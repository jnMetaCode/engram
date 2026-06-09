# Ecosystem & prior art

engram occupies a specific corner: **local-first, private, temporal** memory you
own. Here's an honest map of the neighbors.

## Memory frameworks / agent memory

| Project | Shape | How engram differs |
| --- | --- | --- |
| [mem0](https://github.com/mem0ai/mem0) | Agent memory layer, cloud or self-host | engram is local-first + file-oriented + temporal-ranked; no service to run. The 2026 "state of agent memory" critique (flat vector dumps, no temporal reasoning) is exactly what engram's recency model targets. |
| [Zep](https://github.com/getzep/zep) | Long-term memory server (Postgres) | engram is a single JSON file + CLI, zero infra. |
| [Letta / MemGPT](https://github.com/letta-ai/letta) | Stateful agents w/ memory management | Different scope: engram is a queryable memory store, not an agent runtime. |

## Personal "second brain" / local search

| Project | Shape | How engram differs |
| --- | --- | --- |
| Rewind / Limitless | Closed, cloud-tied personal memory (screen/audio capture) | engram is open, file-based, and never leaves your machine. (Capture is out of scope for the MVP — bring your own notes.) |
| [Obsidian](https://obsidian.md) + search | Local notes, lexical search | engram adds ranked recall, citations, temporal filters, optional semantics, and an API for agents over the same files. |
| [Khoj](https://github.com/khoj-ai/khoj) | Local/self-host AI search over notes | Closest cousin; engram is intentionally tiny (zero deps, one JSON file, CLI-first) and leans hard on the temporal dimension. |

## Building blocks engram relies on

| | |
| --- | --- |
| [Ollama](https://ollama.com) | Optional local embeddings + chat. The only "AI" dependency, and it's local. |
| Okapi BM25 | The always-on, dependency-free lexical engine. |

## Where engram fits

```
  hosted + cloud  ───────────────────────────────  local + private
        mem0 · Zep · Rewind · Limitless        │        engram
        (upload your life to a server)         │   (one JSON file, your box)

           flat vector recall  ──────────────────  temporal, cited recall
```

engram's bet: the most personal data should never leave your machine, and
"when" is a first-class signal, not an afterthought. Contributions that deepen
either axis (more local file types, smarter temporal queries, an MCP server) are
especially welcome.
