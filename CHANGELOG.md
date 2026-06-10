# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com); versions follow semver.

## [Unreleased]

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

[Unreleased]: https://github.com/jnMetaCode/engram/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/jnMetaCode/engram/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/jnMetaCode/engram/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/jnMetaCode/engram/releases/tag/v0.1.0
