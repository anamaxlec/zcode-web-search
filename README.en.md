> [简体中文](README.md) | English

# zcode-web-search

Web search for ZCode. `web_search` searches, `fetch_content` extracts page text.
Works without any API key (anonymous AnySearch fallback). Config format is
compatible with [pi-web-access](https://github.com/nicobailon/pi-web-access) —
pi users need no setup, `~/.pi/web-search.json` is reused as-is.

![node](https://img.shields.io/badge/node-%E2%89%A518.17-339933)
![deps](https://img.shields.io/badge/runtime%20deps-0-4c1)
![license](https://img.shields.io/badge/license-MIT-blue)

- [Install](#install)
- [Tools](#tools)
- [Configuration](#configuration)
- [Routing](#routing)
- [Providers](#providers)
- [Fetch chain](#fetch-chain)
- [Cost & privacy](#cost--privacy)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## Install

1. ZCode → **创建 → 添加插件市场** (Add Plugin Marketplace) → enter
   `anamaxlec/zcode-web-search` → install.
2. Restart the session.
3. Verify with `/web-search latest Node.js LTS version` and
   `/fetch-page https://example.com`.

No results? See [Troubleshooting](#troubleshooting).

## Tools

- MCP tools: `web_search`, `fetch_content` (namespace
  `plugin:zcode-web-search:web-search`)
- Slash commands: `/web-search [query]`, `/fetch-page [url]`,
  `/web-search-status` (config diagnostics)

Requires Node ≥18.17 on PATH. No npm dependencies.

### web_search arguments

| Arg | Type | Default | Notes |
|-----|------|---------|-------|
| `query` | string | — | Single query. `query` / `queries`, pick one |
| `queries` | string[] | — | Batch; each query walks the full routing chain, so batches multiply call counts |
| `numResults` | int 1–20 | 5 | Results per query |
| `recencyFilter` | `day` / `week` / `month` / `year` | — | Time window |
| `domainFilter` | string[] | — | Restrict domains, `-` prefix excludes |
| `provider` | string | `auto` | `auto` / `all` / a single provider name, see [Routing](#routing) |

Not every provider honors the filter args:

| | recencyFilter | domainFilter |
|---|---|---|
| Ignored | Kagi, AnySearch, DuckDuckGo | AnySearch |
| Filtered locally after search (still billed) | — | Brave, Kagi, DuckDuckGo |
| Server-side | Exa, Tavily, Firecrawl, Perplexity, Serper, TinyFish | same |

Returns a result summary with citations (`snippet` + `Source: title (URL)`);
Tavily and Perplexity may return their own generated answer instead.

### fetch_content arguments

| Arg | Type | Notes |
|-----|------|-------|
| `url` | string | Single URL |
| `urls` | string[], max 10 | Batch |
| `prompt` | string, optional | Extraction intent hint, TinyFish only |

Page text is truncated at 50,000 characters per URL.

## Configuration

Two sources, per-key precedence, pi config wins:

- `~/.pi/web-search.json` (pi-web-access default; also honors
  `$PI_CODING_AGENT_DIR` and `$XDG_CONFIG_HOME/pi`)
- `~/.zcode-web-search.json` (copy `.zcode-web-search.json.example` and edit)

Minimal config:

```json
{
  "tinyfishApiKey": "$TINYFISH_API_KEY",
  "exaApiKey": "$EXA_API_KEY"
}
```

TinyFish search is free (30 req/min) and the same key unlocks the first tier
of fetch_content. Add an Exa or Tavily key for better results. Omitting the
`provider` field means `auto` routing. All fields are documented in
`.zcode-web-search.json.example`.

Credential syntax (pi-compatible):

| Value | Meaning |
|-------|---------|
| `"sk-xxx"` | Literal key |
| `"$EXA_API_KEY"` | Read an environment variable; empty string counts as unset |
| `"!op read ..."` | Run a local command, use its stdout |
| `"$$..."` / `"$!..."` | Literal escapes for `$...` and `!...` |

Precedence: environment variable beats config file. If keys live in a shell
profile (e.g. `~/.zshrc`) that the host process didn't inherit, the server
read-only scans common profile files for `*_API_KEY` variables (regex only,
never executes them, only fills currently-unset keys).

> The `workflow` field from pi configs is accepted but has no effect here
> (pi's curator summary flow is not implemented).

## Routing

Priority: `provider` tool arg → config `provider` field → default `auto`.
All three spellings behave identically:

```
"all"      every provider with a key searches in parallel; results merged,
           deduplicated by URL, tagged by source
           if all fail: AnySearch (anonymous) → DuckDuckGo → Exa MCP

"auto"     providers with a key, sequential, stops at the first non-empty result:
           Exa → TinyFish → Tavily → Brave → Kagi → Firecrawl → AnySearch → Perplexity → Serper
           AnySearch (anonymous) and DuckDuckGo (best effort) are always appended,
           so zero config still returns results

"tavily"   only that one; a failure is the answer
```

`all` bills several services per search; use `auto` or a single provider to
keep costs down. The keyless Exa MCP path in the `all` fallback can also be
triggered directly with `provider: "exa"` (without a key).

## Providers

| Provider | Config key | Env var | Free tier |
|----------|-----------|---------|-----------|
| Exa | `exaApiKey` | `EXA_API_KEY` | keyless path free |
| TinyFish | `tinyfishApiKey` | `TINYFISH_API_KEY` | search free (30 req/min) |
| Tavily | `tavilyApiKey` | `TAVILY_API_KEY` | monthly free credits |
| Brave | `braveApiKey` | `BRAVE_API_KEY` | monthly free quota |
| Kagi | `kagiApiKey` | `KAGI_API_KEY` | none |
| Firecrawl | `firecrawlApiKey` | `FIRECRAWL_API_KEY` | subscription credits |
| AnySearch | `anysearchApiKey` | `ANYSEARCH_API_KEY` | anonymous OK (strict limits); free tier 1k/day |
| Perplexity | `perplexityApiKey` | `PERPLEXITY_API_KEY` | none |
| Serper | `serperApiKey` | `SERPER_API_KEY` | new-account free credits |
| DuckDuckGo | — | — | free, frequently anti-bot blocked |

Endpoints and pricing: see `.zcode-web-search.json.example` comments and each
provider's own page. Every provider except DuckDuckGo needs a key to join the
`all` fan-out. `jinaApiKey` / `JINA_API_KEY` is only used by fetch_content's
Jina Reader (optional, raises rate limits).

## Fetch chain

Per-URL fallback; one blocked page doesn't cost its batch mates:

| Tier | Trigger | Endpoint | Mode |
|------|---------|----------|------|
| 1 TinyFish Fetch | key set | `api.fetch.tinyfish.ai` | batch, up to 10 URLs |
| 2 Firecrawl scrape | key set | `api.firecrawl.dev/v1/scrape` | per URL |
| 3 Jina Reader | keyless | `r.jina.ai` | per URL |

The first two tiers require keys; with none configured the chain drops
straight to Jina — it works, but succeeds less often on protected sites.
Fetching can still fail on anti-bot walls, login requirements, rate limits,
or network errors. Each fetch request caps at 90 seconds, the plugin's
overall timeout is 120 seconds; split large `urls` batches if you hit it.

## Cost & privacy

- The repo contains no real API keys; keys come only from your local config,
  environment, or shell profiles.
- `all` sends the same query to every provider with a key — one search, many
  bills. `queries` multiplies the count.
- `web_search` sends query text to the selected provider; `fetch_content`
  sends URLs (and the optional `prompt`) to the fetch service.
- `"!command"` executes a local shell command. Only use config files you
  trust.
- Environment variables beat config files — if you don't want a key used,
  keep it out of the environment.
- Third-party logging and privacy policies are outside this plugin's control.

## Troubleshooting

- All searches fail: run `/web-search-status` first — it reports each
  provider's key status and the routing mode.
- "key not found": the `$ENV` variable is unset, or the profile line is an
  empty `export KEY=""`.
- DuckDuckGo "no parseable results": anti-bot page. Use AnySearch or add a
  key.
- Fetch empty/half-done: hit a timeout, or the site needs login. Split
  `urls` into smaller batches.
- Code changes not taking effect: ZCode runs the installed cache copy
  (`~/.zcode/cli/plugins/cache/...`); sync changes there and restart.

## Development

```bash
node src/server.js --selftest        # self test, no network
node --test test/search.test.mjs     # unit tests
node scripts/handshake.mjs           # MCP handshake, fires one real search
node scripts/sync-version.mjs        # sync version across all four copies before releasing
```

`sync-version.mjs` propagates the version from `package.json` to
`marketplace.json`, `.zcode-plugin/plugin.json`, and `src/server.js` —
update detection compares these, so they must match.

## Scope

Not implemented: pi's curator summary flow (`workflow`), GitHub repo cloning,
YouTube/video understanding, PDF parsing, and the OpenAI provider (needs a Pi
login, not available in ZCode). Config fields and credential syntax stay
compatible with pi-web-access.

## License

MIT
