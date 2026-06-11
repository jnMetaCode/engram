# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com); versions follow semver.

## [Unreleased]

## [0.3.1] - 2026-06-11
### Fixed
Findings from an adversarial review of the 0.2/0.3 feature code:
- EPUB: spine hrefs with `../` now resolve (path normalization); an
  unresolvable spine falls back to filename order instead of silently
  extracting nothing; malformed percent-encoded hrefs no longer crash;
  hostile/ZIP64 offsets fail cleanly instead of throwing range errors.
- Ingest: one unreadable file no longer aborts the whole run — it's skipped
  and reported, everything else still lands.
- Stemmer: 4-letter e-bases now match their -ing/-ed forms ("make"/"making");
  y/ies forms agree ("query"/"queries"); the repo/repos aliases unify.
- Stores written by older versions are migrated on load (term frequencies
  recomputed from stored text), so stemmer improvements apply to existing
  memories instead of silently missing them.

## [0.3.0] - 2026-06-11
### Added
- **Self-improving recall** — `engram reinforce "<query>" <source>` (also
  `POST /reinforce` and the `engram_reinforce` MCP tool) records which source
  correctly answered a query; similar future queries rank it higher. The
  boost is bounded, only re-orders already-relevant results, lives as plain
  data in the store file, and is dropped by `forget`. Pairs with the new
  `self-evolve` skill in the skillet registry.

## [0.2.0] - 2026-06-11
### Added
- **EPUB ingestion** — zero-dependency ZIP + OPF spine parsing; chapters are
  extracted in reading order and indexed like any other note. Closes the
  roadmap item.

## [0.1.2] - 2026-06-11
### Fixed
- The demo GIF and the 中文 README link now render on the npm package page
  (absolute URLs instead of repo-relative ones).

## [0.1.1] - 2026-06-11
### Fixed
- Natural-language recall for past-tense queries with doubled consonants:
  "what did we ship" now finds "we shipped …".

## [0.1.0] - 2026-06-11

First public release.

### Added
- Local, private memory: ingest markdown/text/org/rst/**PDF**/**HTML** into a
  single JSON store on disk — nothing leaves your machine.
- Cited recall: ranked passages with `file:line` and date, via a built-in BM25
  engine with phrase/proximity scoring — works offline, no model needed.
- Time as a first-class signal: timestamps from file mtime *and* dates in the
  text, recency-aware ranking, `--since` / `--until` filters.
- Natural-language friendliness: stemming including irregular past tenses
  ("what did we choose" finds "we chose …") and tech-name aliases
  ("postgres" finds PostgreSQL notes).
- `engram watch` — live re-indexing as you edit.
- Optional local-Ollama integration: semantic recall (`--semantic`) and short
  cited answers (`engram ask`); degrades gracefully when unavailable.
- Agent integration: local HTTP API (`engram serve`) and an MCP server
  (`engram mcp`) exposing `engram_recall` / `engram_remember` / `engram_status`.
- A recall-quality benchmark (25 natural queries) asserted as a floor in CI.

### Fixed (during pre-release hardening)
- PDF extraction no longer leaks binary font/CID data into the index;
  UTF-16BE hex strings decode correctly; layout spacing is collapsed.
- Oversized chunks degrade to truncated embeddings instead of failing the
  whole ingest.
- Clean one-line CLI errors (`ENGRAM_DEBUG=1` for stack traces).

[Unreleased]: https://github.com/jnMetaCode/engram/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/jnMetaCode/engram/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/jnMetaCode/engram/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/jnMetaCode/engram/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/jnMetaCode/engram/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/jnMetaCode/engram/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/jnMetaCode/engram/releases/tag/v0.1.0
