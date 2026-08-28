> [简体中文](README.md) | English

# zcode-web-search

Two MCP tools for ZCode: `web_search` (web search) and `fetch_content` (page text extraction).
It works with no API key at all; add **one** key and the results get noticeably better.

![node](https://img.shields.io/badge/node-%3E%3D18.17-339933)
![deps](https://img.shields.io/badge/runtime%20deps-0-4c1)
![license](https://img.shields.io/badge/license-MIT-blue)

**Good for**: letting your coding agent look up current docs, prices, version numbers, and news.
**Not for**: PDF parsing, YouTube/video understanding, or GitHub repo cloning — none of that is
implemented, see [Scope](#scope).

The config format is compatible with [pi-web-access](https://github.com/nicobailon/pi-web-access)
(Pi coding agent's counterpart): if you use pi, your `~/.pi/web-search.json` is reused as-is —
keys you already configured work here too.

- [Quick start](#quick-start)
- [The two tools](#the-two-tools)
- [Configuration](#configuration)
- [Providers](#providers)
- [The fetch chain](#the-fetch-chain)
- [Cost, privacy & safety](#cost-privacy--safety)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Scope](#scope)

## Quick start

1. In ZCode: **创建 → 添加插件市场** (Add Plugin Marketplace) → enter
   `anamaxlec/zcode-web-search` → install.
2. Restart the session. No API key needed — `web_search` already works via the AnySearch
   anonymous fallback.
3. Try `/web-search latest Node.js LTS version` — you should get a few results with source links.
4. Try `/fetch-page https://example.com` to verify page extraction.

No results? Jump to [Troubleshooting](#troubleshooting).

## The two tools

You get:

- MCP tools `web_search` and `fetch_content` (namespaced under
  `plugin:zcode-web-search:web-search`);
- Slash commands `/web-search [query]`, `/fetch-page [url]`, and `/web-search-status`
  (config diagnostics).

Requires only Node ≥ 18.17 on PATH — no `npm install`.

### web_search

| Arg | Type | Default | Notes |
|-----|------|---------|-------|
| `query` | string | — | Single query. Use `query` or `queries`; omitting both is an error |
| `queries` | string[] | — | Batched queries. Each one **walks the full routing chain independently**, so batches multiply call counts |
| `numResults` | int 1–20 | 5 | Results per query |
| `recencyFilter` | `day` / `week` / `month` / `year` | — | Restrict to a recency window |
| `domainFilter` | string[] | — | Restrict domains; prefix `-` to exclude (e.g. `["-csdn.net"]`) |
| `provider` | string | `auto` | `all`, `auto`, or a single provider name — see [routing](#routing-all--auto--single-provider) |

Two capability caveats worth knowing:

- `recencyFilter` is **ignored by Kagi, AnySearch, and DuckDuckGo**. Everyone else passes it
  through as a native parameter.
- `domainFilter` is **not supported by AnySearch at all**. Brave, Kagi, and DuckDuckGo filter
  locally after the fact (you still pay for the search). Exa, Tavily, Firecrawl, Perplexity,
  Serper, and TinyFish filter server-side.

The response is a synthesized answer with citations (`snippet` plus `Source: title (URL)`).
Tavily and Perplexity may return their own generated answer instead.

### fetch_content

| Arg | Type | Notes |
|-----|------|-------|
| `url` | string | A single URL |
| `urls` | string[], max 10 | Batch of URLs |
| `prompt` | string, optional | Extraction intent hint, max 2000 chars |

`prompt` only reaches TinyFish Fetch — Firecrawl and Jina ignore it.
Each URL's text is truncated at 50,000 characters.

## Configuration

### Which key should I add?

**For a zero-cost setup: add a single `TINYFISH_API_KEY`.** TinyFish search is free
(30 req/min), and the same key also unlocks the first tier of `fetch_content` — one key covers
both tools.

For better result quality, add a second one: Exa or Tavily, both recall well on technical
queries. You do not need to fill in all ten keys.

### Config file locations

Two sources, **per-key precedence with the pi config winning**:

**Option A**: `~/.pi/web-search.json` (pi-web-access default location — if you already use pi,
no action needed). `$PI_CODING_AGENT_DIR` and `$XDG_CONFIG_HOME/pi` are honored too.

**Option B**: copy `.zcode-web-search.json.example` to `~/.zcode-web-search.json` and fill in
your keys.

```json
{
  "tinyfishApiKey": "$TINYFISH_API_KEY",
  "exaApiKey": "$EXA_API_KEY"
}
```

That is all most people need — **omitting `provider` means `auto`**, and that is the recommended
setup. Every field is optional; here is the full set:

```json
{
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

### Credential syntax

Four forms, following pi-web-access:

| Value | Meaning |
|-------|---------|
| `"sk-xxx"` | A literal key |
| `"$EXA_API_KEY"` | Read an environment variable. An empty string counts as unset |
| `"!op read ..."` | Run a local shell command, use its stdout |
| `"$$..."` / `"$!..."` | Literal escapes for `$...` and `!...` |

One more rule: for any single key, **the environment variable beats the config file**. Even if
`exaApiKey` is absent from your config, an `EXA_API_KEY` in the process environment still applies.

If keys are exported in a shell profile (e.g. `~/.zshrc`) but the host process didn't inherit
them, the server **read-only scans** common profile files for the relevant `*_API_KEY` variables
(regex only, profiles are never executed, only currently-unset keys are filled).

> Compatibility note: the `workflow` field from pi-web-access configs is accepted but has
> **no effect** here (pi's curator summary flow is not implemented).

### Routing: all / auto / single provider

Priority: `provider` tool arg → config `provider` field → `auto`.

```
provider: "all"     ──▶ every provider with a key, in parallel ──▶ merged, deduped by URL, tagged by source
                        if all fail: AnySearch (anonymous) → DuckDuckGo → Exa MCP

provider: "auto"    ──▶ providers with a key, sequential, stops at the first non-empty result
                        ──▶ AnySearch (anonymous, always last) ──▶ DuckDuckGo (best effort)

provider: "tavily"  ──▶ only tavily; if it fails, that's the answer
```

All three spellings behave identically whether written in the config file or passed as a
tool argument.

- **`auto`** (recommended, and the default when no `provider` is set anywhere): sequentially
  tries only the providers **that have a key**, in the order Exa → TinyFish → Tavily → Brave →
  Kagi → Firecrawl → AnySearch → Perplexity → Serper. Regardless of keys, AnySearch (anonymous
  but strictly rate-limited) and DuckDuckGo (best-effort, frequently blocked) are appended to
  the tail, so **zero config always returns something**.
- **`all`**: fans out to every provider with a key in parallel; DuckDuckGo stays out of the
  fan-out and acts only as fallback. Broader results, but one search bills several services at
  once — see [Cost, privacy & safety](#cost-privacy--safety).
- **A single provider**: queries only that one. Explicit `provider: "exa"` without a key uses
  the keyless Exa MCP path; any other provider without a key returns its own error.

## Providers

| Provider | Config key | Env var | Endpoint | Free tier |
|----------|-----------|---------|----------|-----------|
| Exa | `exaApiKey` | `EXA_API_KEY` | `api.exa.ai/search`; keyless via `mcp.exa.ai` | keyless path free; paid see vendor |
| TinyFish | `tinyfishApiKey` | `TINYFISH_API_KEY` | `api.search.tinyfish.ai` | search free (30 req/min) |
| Tavily | `tavilyApiKey` | `TAVILY_API_KEY` | `api.tavily.com/search` | monthly free credits |
| Brave | `braveApiKey` | `BRAVE_API_KEY` | `api.search.brave.com/res/v1/web/search` | monthly free quota |
| Kagi | `kagiApiKey` | `KAGI_API_KEY` | `kagi.com/api/v1/search` | none (pay per use) |
| Firecrawl | `firecrawlApiKey` | `FIRECRAWL_API_KEY` | `api.firecrawl.dev/v1/search` | subscription credits |
| AnySearch | `anysearchApiKey` | `ANYSEARCH_API_KEY` | `api.anysearch.com/v1/search` | anonymous OK (strict limits); free tier 1k/day |
| Perplexity | `perplexityApiKey` | `PERPLEXITY_API_KEY` | `api.perplexity.ai/chat/completions` | none (token-priced) |
| Serper | `serperApiKey` | `SERPER_API_KEY` | `google.serper.dev/search` | new-account free credits |
| DuckDuckGo | — | — | `html.duckduckgo.com/html/` | free, frequently anti-bot blocked |

Prices and quotas change too fast to list — check each provider's official pricing page.

Two easy traps:

- Every provider except DuckDuckGo **needs a key to join the `all` fan-out**.
- Exa's keyless path has two entry points: an explicit `provider: "exa"`, or the third-position
  fallback after an `all` fan-out fails entirely. `auto` mode never reaches it without a key.

`jinaApiKey` / `JINA_API_KEY` is not used for search — it only affects `fetch_content`'s Jina
Reader (optional; raises rate limits).

## The fetch chain

Per-URL fallback: a URL only moves down a tier after the tier above it fails, so one blocked
page doesn't cost its batch mates.

| Tier | Trigger | Endpoint | Mode |
|------|---------|----------|------|
| 1 TinyFish Fetch | `tinyfishApiKey` set | `api.fetch.tinyfish.ai` | batch, up to 10 URLs at once |
| 2 Firecrawl scrape | `firecrawlApiKey` set | `api.firecrawl.dev/v1/scrape` | per URL |
| 3 Jina Reader | always available | `r.jina.ai` | per URL, keyless |

**The first two tiers require keys.** With no keys configured, the chain drops straight to Jina —
it works, but succeeds far less often on aggressively protected sites than the tiers above it.
If you care about fetch quality, `tinyfishApiKey` is the best value per keystroke.

Even then, fetching can fail: anti-bot policies, login walls, rate limits, or network errors can
stop any tier.

The fetch path caps each request at 90 seconds (separate from the 60-second search timeout),
and the plugin's overall MCP `timeoutMs` is 120000. Very large batches with multi-tier fallback
can still hit that ceiling, which shows up as a half-finished response — split `urls` into
smaller batches and retry.

## Cost, privacy & safety

- This repo contains **no real API keys**. Keys are read only from your local config files,
  environment variables, or shell profiles.
- `provider: "all"` sends the **same query to every provider with a key simultaneously** — one
  search may consume quota on several services at once. Batched `queries` multiply the call
  count on top of that. To control cost, **omit the `provider` field** (i.e. `auto`) or name a
  single provider.
- `web_search` sends your **query text** to whichever third-party provider is selected;
  `fetch_content` sends the **URL** (and the optional `prompt` hint) to the fetch service
  (TinyFish / Firecrawl / Jina).
- The `"!command"` config syntax **executes a local shell command** to obtain a key — only use
  config files you fully trust.
- Environment keys outrank config files, so the plugin will use any `*_API_KEY` it can see —
  including ones scanned out of your shell profile. Don't leave a key in the environment if you
  don't want it spent.
- Logging, retention, and privacy policies of those third-party services are outside this
  plugin's control.

## Troubleshooting

- **All searches fail**: run `/web-search-status` first — it reports each provider's key status
  (including whether `$ENV` references resolve), the routing mode, and a self-test.
- **"key not found" from a provider**: the `$ENV` variable is unset, or the profile line is an
  empty `export KEY=""` — fill in the real key.
- **DuckDuckGo "no parseable results"**: their anti-bot page; expected. Use AnySearch or
  configure a key.
- **Fetches come back empty or half-finished**: most likely the 60-second cap, or a login wall.
  Retry with smaller `urls` batches.
- **Code changes not taking effect**: ZCode runs the installed cache copy
  (`~/.zcode/cli/plugins/cache/...`) — sync your changes there and restart the session.

## Development

```bash
node src/server.js --selftest        # pure-logic self test (no network)
node --test test/search.test.mjs     # unit tests
node scripts/handshake.mjs           # MCP stdio handshake (fires one real search)
node scripts/sync-version.mjs        # sync the version across all four copies before releasing
```

> Known issue: the first two `--selftest` assertions depend on a local pi config (they require
> `provider === "all"` and an `anysearchApiKey`), so they report FAIL on machines without
> `~/.pi/web-search.json`. That's a false alarm; it doesn't affect normal use.

Releasing a new version: bump `version` in **both** `marketplace.json` and
`.zcode-plugin/plugin.json` — update detection compares the two, and they must stay in sync.

## Scope

Implements `web_search` and `fetch_content` (page text extraction).

Not implemented: pi-web-access's curator summary flow (`workflow`), GitHub repo cloning,
YouTube/video understanding, and PDF parsing. Pi-login paths (e.g. reusing a Codex login for
OpenAI search) don't apply to ZCode, so the OpenAI provider is not implemented.

Config fields and credential syntax remain compatible.

## License

MIT
