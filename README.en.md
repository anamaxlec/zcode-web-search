> [简体中文](README.md) | English

# zcode-web-search

A ZCode plugin that adds a `web_search` MCP tool, modeled after the
[pi-web-access](https://github.com/nicobailon/pi-web-access) plugin for the
Pi coding agent. It reuses the same config file and credential syntax, so if
you already use pi-web-access you get the same search providers in ZCode with
**zero extra configuration**. For everyone else, an independent config file is
supported.

## Features

- **`web_search` tool** — single or batched queries, recency filtering,
  domain filtering, and a synthesized answer with source citations.
  `provider: "all"` fans out to every credentialed provider **in parallel**
  and merges results (mirroring pi-web-access); `auto` walks a sequential
  fallback chain.
- **`fetch_content` tool** — batch-fetch up to 10 URLs as clean markdown with
  a per-URL fallback chain: TinyFish Fetch (free) → Firecrawl scrape → Jina
  Reader (keyless, so fetching always works). Handles pages that block plain
  HTTP clients.
- **Reuses pi-web-access config** (`~/.pi/web-search.json`), including its
  `$ENV` / `!command` credential resolution rules.
- **Zero-config fallback** — works out of the box via keyless Exa MCP and
  keyless DuckDuckGo when no key is configured.
- **Multiple providers** — Exa, TinyFish, Tavily, Brave, Kagi, Firecrawl,
  AnySearch, Perplexity, Serper, DuckDuckGo.
- **Zero runtime dependencies** — a single Node (>=18) ESM file using the
  built-in `fetch`. No npm install needed.
- **Slash commands** — `/web-search [query]`, `/fetch-page [url]`, and
  `/web-search-status` (config diagnostics).

## Install (ZCode)

### From GitHub (recommended)

1. In ZCode: **创建 → 添加插件市场**（Add Plugin Marketplace）→ enter
   `anamaxlec/zcode-web-search` (or paste the repo URL).
2. Install `zcode-web-search` from the marketplace list.
3. Restart the session. You get two MCP tools:
   `web_search` and `fetch_content` (namespaced under
   `plugin:zcode-web-search:web-search`), plus three slash commands:
   `/web-search [query]`, `/fetch-page [url]`, and `/web-search-status`
   (diagnose keys/providers/routing).

### From a local directory

1. Copy (or symlink) this directory anywhere.
2. In ZCode: **Settings → Plugin Management → Discover** → `+` → add the
   directory (it contains a `marketplace.json`) and install
   `zcode-web-search`.
3. Restart the session.

The plugin declares the MCP server in `.zcode-plugin/plugin.json`
(`command: node`, `args: [${ZCODE_PLUGIN_ROOT}/src/server.js]`). It requires
only Node >= 18 on PATH — no `npm install`.

> Releasing a new version: bump `version` in **both** `marketplace.json` and
> `.zcode-plugin/plugin.json` — update detection compares the marketplace
> entry against the installed manifest, so they must stay in sync.

## Configuration

### Option A — reuse your pi-web-access config (recommended if you use Pi)

If `~/.pi/web-search.json` exists (pi-web-access default location), it is used
automatically. The config supports pi's credential syntax:

```json
{
  "provider": "all",
  "workflow": "none",
  "exaApiKey": "$EXA_API_KEY",
  "tinyfishApiKey": "$TINYFISH_API_KEY",
  "tavilyApiKey": "$TAVILY_API_KEY",
  "braveApiKey": "$BRAVE_API_KEY",
  "kagiApiKey": "$KAGI_API_KEY",
  "firecrawlApiKey": "$FIRECRAWL_API_KEY",
  "anysearchApiKey": "$ANYSEARCH_API_KEY",
  "perplexityApiKey": "$PERPLEXITY_API_KEY",
  "serperApiKey": "$SERPER_API_KEY",
  "jinaApiKey": "$JINA_API_KEY"
}
```

Credential values can be:

- a literal key string,
- `"$ENV_NAME"` — read environment variable `ENV_NAME`,
- `"!command"` — run a local command; its stdout (trimmed) is the key,
- `"$$..."` / `"$!..."` — literal `$` / `!` escapes.

### Option B — independent config (for users without pi)

Copy `.zcode-web-search.json.example` to `~/.zcode-web-search.json` and fill in
your keys. Same syntax as above.

### Automatic env pickup

If your keys are exported in a shell profile (e.g. `~/.zshrc`) but the host
process didn't inherit them, the server reads the relevant `*_API_KEY`
variables from common profile files (`~/.zshrc`, `~/.zshenv`, `~/.zprofile`,
`~/.profile`, `~/.bash_profile`, `~/.bashrc`). This is read-only — profiles
are never executed — and only fills keys that are currently unset.

## Provider order & selection

Priority: `provider` tool arg → config `provider` field → `auto`.

- **`all`** (parallel): every credentialed provider is searched
  **simultaneously**, results merged and deduplicated by URL with each result
  tagged by its provider; keyless DuckDuckGo / Exa MCP step in only if
  everything failed.
- **`auto`** (sequential fallback): Exa → TinyFish → Tavily → Brave → Kagi →
  Firecrawl → AnySearch → Perplexity → Serper, then keyless DuckDuckGo / Exa
  MCP as a last-resort fallback so the tool works with zero config.
- A single named provider (`provider: "tavily"`) queries only that one.

`jinaApiKey` / `JINA_API_KEY` is only used by `fetch_content`'s Jina Reader
(optional; raises rate limits).

| Provider   | Config key          | Env var              | Endpoint                          | Price           |
|------------|---------------------|----------------------|-----------------------------------|-----------------|
| Exa        | `exaApiKey`         | `EXA_API_KEY`        | `api.exa.ai/search` (keyed), `mcp.exa.ai` (keyless) | $7/1k (keyed); keyless free |
| TinyFish   | `tinyfishApiKey`    | `TINYFISH_API_KEY`   | `api.search.tinyfish.ai` (GET, `X-API-Key`) | **free** (30 req/min) |
| Tavily     | `tavilyApiKey`      | `TAVILY_API_KEY`     | `api.tavily.com/search`           | ~$8/1k ($0.008/credit) |
| Brave      | `braveApiKey`       | `BRAVE_API_KEY`      | `api.search.brave.com/res/v1/web/search` | $5/1k |
| Kagi       | `kagiApiKey`        | `KAGI_API_KEY`       | `kagi.com/api/v1/search`          | $12/1k          |
| Firecrawl  | `firecrawlApiKey`   | `FIRECRAWL_API_KEY`  | `api.firecrawl.dev/v1/search`     | subscription credits |
| AnySearch  | `anysearchApiKey`   | `ANYSEARCH_API_KEY`  | `api.anysearch.com/v1/search`     | free tier 1k/day |
| Perplexity | `perplexityApiKey`  | `PERPLEXITY_API_KEY` | `api.perplexity.ai/chat/completions` | token + request fees |
| Serper     | `serperApiKey`      | `SERPER_API_KEY`     | `google.serper.dev/search`        | $1/1k           |
| DuckDuckGo | — (keyless)         | —                    | `html.duckduckgo.com/html/`       | free (anti-bot risk) |

## Development

```bash
# Pure-logic self test (no network)
node src/server.js --selftest

# Unit tests (node >= 18)
node --test test/search.test.mjs

# MCP stdio handshake (initialize / tools/list / tools/call / ping)
node scripts/handshake.mjs
```

## Scope vs pi-web-access

Implements `web_search` and `fetch_content` (page text extraction). The
pi-web-access plugin additionally provides GitHub repo cloning,
YouTube/video understanding, and PDF parsing — not included here, but they
could be added later. Pi-login-backed paths (e.g. reusing the Codex login for
OpenAI search) don't apply to ZCode, so the OpenAI provider is not
implemented.

## License

MIT
