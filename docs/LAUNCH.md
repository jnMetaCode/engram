# Launch playbook (internal)

English | [简体中文](./LAUNCH.zh-CN.md)

Go-to-market checklist for engram. Move out of the repo before/after launch if
you want it private.

## Pre-flight

- [x] Replace `USER` with the real GitHub org → **jnMetaCode**. *(done)*
- [x] Push public repo + topics; **CI green** → https://github.com/jnMetaCode/engram *(done)*
- [x] **npm name decided → `@jnmetacode/engram`** (scoped; unscoped `engram` is
      taken). The CLI bin stays `engram`. `package.json` + all docs updated. *(done)*
- [x] **npm scope claimed**: the `jnmetacode` npm account exists and is logged
      in on the dev machine — the `@jnmetacode/*` scope is ours. *(done)*
- [x] Record the hero GIF (script below) → `docs/demo.gif`, linked in README.
      *(done — vhs-recorded: ingest → cited recall → `--since week` filtering;
      re-record any time with a tape like the script below)*
- [x] **Published**: `@jnmetacode/engram` is live on npm (v0.1.1, published from
      the logged-in local account; tags + GitHub releases created). *(done)*
- [x] Verified on a clean npm cache: `npx @jnmetacode/engram` ingest/recall. *(done)*
- [ ] *(optional)* Add the `NPM_TOKEN` repo secret so future tag pushes publish
      from CI (the workflow skips publish gracefully while it's absent).

## Hero GIF (20–30s)

1. `npx @jnmetacode/engram ingest ~/notes` → "✓ ingested N chunks".
2. `npx @jnmetacode/engram recall "what did I decide about pricing"` → cited passage with a
   date appears, score on the left.
3. `npx @jnmetacode/engram recall "standup" --since week` → only recent memories (show the
   time filter visibly working).
4. (optional, if Ollama is set up) `npx @jnmetacode/engram ask "summarize my auth notes"` →
   a short answer with `sources:` line.

Lead with the **privacy + temporal** angle — that's the differentiator.

## Show HN post

**Title:**
> Show HN: Engram – a local, private memory layer for your notes (and your agents)

**Body:**
> I wanted to ask questions of my own notes and PDFs without uploading my life to
> someone's cloud. Engram indexes your markdown, text, PDF and HTML files into a
> single local file and gives you ranked, cited recall — `engram recall "auth bug
> clock skew"` returns the passage with its `file:line` and date.
>
> Two things I cared about:
> - **Local & private.** Nothing leaves your machine. Optional semantic search and
>   answers run through a local Ollama; with no model at all it still works via a
>   built-in BM25 engine (plus phrase/proximity ranking).
> - **Time is first-class.** Every memory has a timestamp (file mtime + dates in
>   the text), recall is recency-aware, and you can do `--since week`. Most "AI
>   memory" tools are flat vector dumps with no sense of when.
>
> It also runs `engram watch` to stay live as you edit, and as an **MCP server** so
> Claude/any agent can recall and store memories locally. And recall is
> **self-improving**: confirm which source answered a query (`engram reinforce`,
> or the `engram_reinforce` MCP tool for agents) and similar queries rank it
> higher — bounded, inspectable plain data, never resurrects non-matches. Zero
> dependencies (Node built-ins), MIT.
>
> Repo: https://github.com/jnMetaCode/engram — try it in 30s with the sample notes
> in `examples/`. Early MVP; would love feedback on recall ranking and PDF
> extraction quality.

Post Tue/Wed ~8am PT; reply to every comment for 3 hours.

## Other channels — ready-to-paste drafts

Blog post: drafted at [`blog-why-local-memory.md`](./blog-why-local-memory.md)
(publish on a personal blog/dev.to the same morning; link it from the HN
comments when ranking questions come up).

**r/LocalLLaMA** (post 1–2 days after HN, adjust to comments learned):

> **Title:** engram: a local, private memory layer for your notes — BM25 offline, optional Ollama for semantic recall, zero deps
>
> Built this because every "AI memory" tool wanted my notes in their cloud.
> engram indexes md/txt/PDF/HTML into one local JSON file and gives ranked,
> cited recall (`file:line` + date). Works with **no model at all** (BM25 +
> phrase/proximity + a small stemmer); if you run Ollama it adds semantic
> recall (`--semantic`) and short cited answers (`engram ask`) — all local.
> Time is first-class: recency-aware ranking, `--since week`. And it's
> self-improving: `engram reinforce` confirms which source answered a query,
> so recall gets sharper the more you use it.
> Also runs as an MCP server, so a local agent can share your memory.
> `npx @jnmetacode/engram ingest ~/notes` to try. MIT, zero dependencies.
> Repo: https://github.com/jnMetaCode/engram — recall-ranking feedback wanted.

**r/ObsidianMD / r/PKMS** variant: lead with "query your vault from the
terminal with citations + dates, nothing leaves your machine; `engram watch
~/vault` keeps it live as you edit". Don't mention agents/MCP first — notes
people care about privacy and citations.

**X/Twitter thread** (pin after posting):

> 1/ Your notes are a second brain you can't query. The tools that can query
> them want them uploaded first. I built the opposite: engram — a private
> memory layer that runs 100% on your machine. `npx @jnmetacode/engram` [GIF]
>
> 2/ Ask it questions, get cited passages back — file:line + date. Time is
> first-class: "what did I decide about pricing" vs the same query `--since
> week` (it knows that decision is 3 weeks old). [screenshot]
>
> 3/ No model required — built-in BM25 works offline. Run @ollama and it adds
> semantic recall + cited answers, still local. Zero deps, MIT, a few hundred
> lines you can read.
>
> 4/ The fun part: it's an MCP server. Claude (or any agent) can recall, store
> AND reinforce memories mid-conversation — verify an answer, confirm it, and
> the shared memory gets sharper with every task. Self-evolving, 100% local.
> Repo: github.com/jnMetaCode/engram

GitHub topics (already set): `local-first`, `privacy`, `second-brain`,
`ai-memory`, `semantic-search`, `ollama`, `rag`, `agents`.

## Cross-promo with the sibling tools

engram, tracelet, and skillet are one developer-tools story:
- **tracelet** debugs your agents, **skillet** installs skills into them,
  **engram** gives them (and you) memory. Link them in each README's footer once
  all three are public; one launch can lift the others.

## After traction

- GitHub Sponsors once there are stars/issues (the stated goal).
- ~~EPUB~~ shipped in 0.2.0; next file type per issue demand (DOCX likely).
- An optional MCP server makes engram a drop-in memory tool for Claude/agents —
  strong second-wave story.
