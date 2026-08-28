# Changelog

All notable changes to this project are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/); versioning is
semver.

## [0.2.2] - 2026-08-28

### Fixed

- **`provider: "auto"` / `"all"` as values now work.** The tool schema
  advertised them, but passing either as a tool argument (or writing
  `"provider": "auto"` in a config file) resolved to zero providers —
  `"auto"` failed outright with "failed across 0 provider(s)", `"all"`
  silently degraded to the keyless fallback chain. Both are now treated as
  routing keywords everywhere.
- **`--selftest` no longer depends on the developer's machine.** It now
  loads a fixture config from a temp dir via `PI_CODING_AGENT_DIR` instead of
  asserting against the local `~/.pi/web-search.json`, so it passes on clean
  machines (it used to FAIL there, and `/web-search-status` tells agents to
  run it).
- **Fetch timeouts no longer contradict each other.** The fetch chain now
  uses a 90 s ceiling (`per_url_timeout_ms` lowered to 45 s) instead of being
  cut off at the shared 60 s search timeout mid-batch; the plugin's MCP
  `timeoutMs` raised to 120000 to match.
- `src/server.js` VERSION constant (shown in MCP `initialize` and the
  DuckDuckGo User-Agent) is now in sync with package.json — added
  `scripts/sync-version.mjs` to keep all four copies aligned.
- `plugin.json` description now lists TinyFish.
- SKILL.md no longer leaks a machine-specific default and describes the
  v0.2.1+ zero-config routing (anonymous AnySearch, not Exa MCP).

### Changed

- Example config no longer sets `provider` (unset = `auto`, the safe
  default); the sample now documents how to opt into `all`.
- `engines.node` raised to `>=18.17` (the code uses `AbortSignal.any`).
- `successfulQueries` in the tool result is counted directly instead of
  string-matching the output.

## [0.2.1] - 2026-08-28

### Fixed

- Zero-config `auto` chain now falls back to **anonymous AnySearch**
  (verified working without a key) with DuckDuckGo demoted to best-effort;
  the parallel `all` fallback order is AnySearch → DuckDuckGo → Exa MCP.
- Removed the unused `workflow` field from the tool schema, call path,
  SKILL.md, READMEs, and config example (pi's curator flow was never
  implemented).
- `hasCredential` resolves `$ENV` references, so an unfilled
  `export KEY=""` no longer schedules a doomed request.

### Changed

- READMEs rewritten: quick start, safety/privacy/cost section, softened
  guarantees, troubleshooting, free-tier-only price notes.
- Fixed duplicated `tinyfishApiKey` in the config example.

## [0.2.0] - 2026-08-28

### Added

- Slash commands `/web-search`, `/fetch-page`, `/web-search-status`.
- Plugin icon and GitHub marketplace distribution
  (`anamaxlec/zcode-web-search`).
- English and Chinese READMEs.

## [0.1.0] - 2026-08-27

### Added

- Initial release: `web_search` MCP tool with 10 providers (Exa, TinyFish,
  Tavily, Brave, Kagi, Firecrawl, AnySearch, Perplexity, Serper, keyless
  DuckDuckGo), parallel fan-out with `provider: "all"`, pi-web-access config
  reuse with `$ENV`/`!command` credential syntax, zero-dependency single
  ESM file.
