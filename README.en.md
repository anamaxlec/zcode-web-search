> [简体中文](README.md) | English

# zcode-web-search

A ZCode plugin providing two MCP tools: `web_search` (web search) and
`fetch_content` (page text extraction). Its config format is compatible with
[pi-web-access](https://github.com/nicobailon/pi-web-access) (the Pi coding
agent's counterpart): if you use pi, your `~/.pi/web-search.json` is reused
as-is — keys you already configured work here too.

## Quick start (3 minutes)

1. In ZCode: **创建 → 添加插件市场** (Add Plugin Marketplace) → enter
   `anamaxlec/zcode-web-search` → install.
2. Restart the session. No API key needed — `web_search` already works via
   the AnySearch anonymous fallback.
3. Try `/web-search latest Node.js LTS version` — you should get a few
   results with source links.

No results? Jump to [Troubleshooting](#troubleshooting).

## Safety, privacy & cost

- This repo contains **no real API keys**. Keys are read only from your local
  config files, environment variables, or shell profiles.
- `web_search` sends your **query text** to whichever third-party search
  provider is selected. With `provider: "all"`, the query is sent to **every
  configured provider simultaneously** — one search may consume quota on
  several services at once, and batched queries (`queries`) multiply the
  call count. Use `auto` or a single named provider to control cost.
- `fetch_content` sends the **URL** (and the optional `prompt` hint) to the
  fetch service (TinyFish / Firecrawl / Jina).
- The `"!command"` config syntax **executes a local shell command** to obtain
  a key — only use config files you fully trust.
- Logging, retention, and privacy policies of those third-party services are
  outside this plugin's control.

## Install

**From GitHub (recommended)**: ZCode → 创建 → 添加插件市场 → enter
`anamaxlec/zcode-web-search` → install → restart the session.

**From a local directory**: copy or symlink this folder → Settings →
Plugin Management → Discover → `+` → add the directory (contains a
`marketplace.json`) → install → restart the session.

You get:

- MCP tools `web_search` and `fetch_content` (namespaced under
  `plugin:zcode-web-search:web-search`);
- Slash commands `/web-search [query]`, `/fetch-page [url]`, and
  `/web-search-status` (config diagnostics).

Requires only Node ≥ 18 on PATH — no `npm install`.

> Releasing a new version: bump `version` in **both** `marketplace.json` and
> `.zcode-plugin/plugin.json` — update detection compares the two, and they
> must stay in sync.

## Configuration

It works with no configuration at all (AnySearch anonymous fallback), but
adding a key usually improves quality and rate limits noticeably. Two config
sources, per-key precedence (pi config wins):

**Option A**: `~/.pi/web-search.json` (pi-web-access default location — if
you already use pi, no action needed).

**Option B**: copy `.zcode-web-search.json.example` to
`~/.zcode-web-search.json` and fill in your keys.

```json
{
  "provider": "all",
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

Credential values support: a literal key, `"$ENV_NAME"` (read an environment
variable), `"!command"` (run a local command, use its stdout), and
`"$$..."` / `"$!..."` (literal escapes).

If keys are exported in a shell profile (e.g. `~/.zshrc`) but the host
process didn't inherit them, the server **read-only scans** common profile
files for the relevant `*_API_KEY` variables (regex only, profiles are never
executed, only currently-unset keys are filled).

> `provider: "all"` fans out to every configured provider — see the cost
> note above. Compatibility note: the `workflow` field from pi-web-access
> configs is accepted but has **no effect** here (pi's curator summary flow
> is not implemented).

## Providers & routing

Priority: `provider` tool arg → config `provider` field → `auto`.

- **`all`**: calls **every provider with a usable key** in parallel, merges
  results deduplicated by URL with per-result provider tags; if everything
  fails, falls back to AnySearch (anonymous) → DuckDuckGo → Exa MCP.
- **`auto`** (the default with no configuration anywhere): walks Exa →
  TinyFish → Tavily → Brave → Kagi → Firecrawl → AnySearch → Perplexity →
  Serper but **only tries providers with a key**; with zero keys configured,
  it falls back to AnySearch anonymous search (works, strict rate limits),
  with DuckDuckGo as a best-effort extra.
- **A single named provider** (`provider: "tavily"`) queries only that one.
  Explicit `provider: "exa"` without a key uses the keyless Exa MCP path.

| Provider | Config key | Endpoint | Free tier |
|----------|------------|----------|-----------|
| Exa | `exaApiKey` | `api.exa.ai/search`; keyless via `mcp.exa.ai` | keyless path free; paid see vendor |
| TinyFish | `tinyfishApiKey` | `api.search.tinyfish.ai` (GET, `X-API-Key`) | search free (30 req/min) |
| Tavily | `tavilyApiKey` | `api.tavily.com/search` | monthly free credits |
| Brave | `braveApiKey` | `api.search.brave.com/res/v1/web/search` | monthly free quota |
| Kagi | `kagiApiKey` | `kagi.com/api/v1/search` | none (pay per use) |
| Firecrawl | `firecrawlApiKey` | `api.firecrawl.dev` | subscription credits |
| AnySearch | `anysearchApiKey` | `api.anysearch.com/v1/search` | anonymous OK (rate-limited); free tier 1k/day |
| Perplexity | `perplexityApiKey` | `api.perplexity.ai/chat/completions` | none (token-priced) |
| Serper | `serperApiKey` | `google.serper.dev/search` | new-account free credits |
| DuckDuckGo | — (keyless) | `html.duckduckgo.com/html/` | free, frequently anti-bot blocked |

Prices and quotas change — check each provider's official pricing page.
`jinaApiKey` / `JINA_API_KEY` is only used by `fetch_content`'s Jina Reader
(optional; raises rate limits).

### The fetch_content chain

Per-URL fallback: **TinyFish Fetch (free) → Firecrawl scrape → Jina Reader
(keyless)**. A URL only moves down the chain after the previous provider
fails; Jina needs no key, so the chain always has a usable exit — but it can
still fail on rate limits, site anti-bot policies, login walls, or network
errors.

## Troubleshooting

- **All searches fail**: run `/web-search-status` first — it reports each
  provider's key status (including whether `$ENV` references resolve), the
  routing mode, and a self-test.
- **"key not found" from a provider**: the `$ENV` variable is unset, or the
  profile line is an empty `export KEY=""` — fill in the real key.
- **DuckDuckGo "no parseable results"**: their anti-bot page; expected.
  Use AnySearch or configure a key.
- **Code changes not taking effect**: ZCode runs the installed cache copy
  (`~/.zcode/cli/plugins/cache/...`) — sync your changes there and restart
  the session.

## Development

```bash
node src/server.js --selftest        # pure-logic self test (no network)
node --test test/search.test.mjs     # unit tests
node scripts/handshake.mjs           # MCP stdio handshake (fires one real search)
```

## Scope vs pi-web-access

Implements `web_search` and `fetch_content` (page text extraction).
pi-web-access's curator summary flow (`workflow`), GitHub repo cloning,
YouTube/video understanding, and PDF parsing are not implemented; Pi-login
paths (e.g. reusing a Codex login for OpenAI search) don't apply to ZCode,
so the OpenAI provider is not implemented. Config fields and credential
syntax remain compatible.

## License

MIT
