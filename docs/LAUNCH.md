# Launch playbook (internal)

Go-to-market checklist for engram. Move out of the repo before/after launch if
you want it private.

## Pre-flight

- [x] Replace `USER` with the real GitHub org → **jnMetaCode**. *(done)*
- [x] Push public repo + topics; **CI green** → https://github.com/jnMetaCode/engram *(done)*
- [ ] **DECIDE the npm name** — `engram` is **taken** on npm (someone's v0.0.1), so
      `npx engram` would run their package. Options:
      - **`@jnmetacode/engram`** (scoped, *recommended*) — keeps the brand exactly;
        run with `npx @jnmetacode/engram`. Scoped names are reserved to you.
      - a free unscoped name: `engram-cli` or `localgram` (verified available).
      The CLI **bin** can stay `engram` either way (separate from the package name).
- [ ] Set the chosen `name` in `package.json` (and update README `npx` commands).
- [ ] Record the hero GIF (script below) → `docs/demo.gif`, uncomment in README.
- [ ] Add `NPM_TOKEN` repo secret; `git tag v0.1.0 && git push --tags` to publish
      (the `.github/workflows/publish.yml` does the rest).
- [ ] Verify the published package on a clean box: `npx <name> ingest <folder>`.

## Hero GIF (20–30s)

1. `npx engram ingest ~/notes` → "✓ ingested N chunks".
2. `npx engram recall "what did I decide about pricing"` → cited passage with a
   date appears, score on the left.
3. `npx engram recall "standup" --since week` → only recent memories (show the
   time filter visibly working).
4. (optional, if Ollama is set up) `npx engram ask "summarize my auth notes"` →
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
> Claude/any agent can recall and store memories locally. Zero dependencies (Node
> built-ins), MIT.
>
> Repo: https://github.com/jnMetaCode/engram — try it in 30s with the sample notes
> in `examples/`. Early MVP; would love feedback on recall ranking and PDF
> extraction quality.

Post Tue/Wed ~8am PT; reply to every comment for 3 hours.

## Other channels

- r/LocalLLaMA, r/selfhosted, r/ObsidianMD, r/PKMS — the privacy + notes crowd.
- X thread: "your second brain, 100% local"; tag the local-AI / Ollama community.
- A blog post: "Why your AI memory should never leave your laptop (and how to
  build it in a few hundred lines)" — doubles as SEO + explains the temporal model.
- GitHub topics: `local-first`, `privacy`, `second-brain`, `ai-memory`,
  `semantic-search`, `ollama`, `rag`, `agents`.

## Cross-promo with the sibling tools

engram, tracelet, and skillet are one developer-tools story:
- **tracelet** debugs your agents, **skillet** installs skills into them,
  **engram** gives them (and you) memory. Link them in each README's footer once
  all three are public; one launch can lift the others.

## After traction

- GitHub Sponsors once there are stars/issues (the stated goal).
- Most-requested file type → ship it (PDF/EPUB likely).
- An optional MCP server makes engram a drop-in memory tool for Claude/agents —
  strong second-wave story.
