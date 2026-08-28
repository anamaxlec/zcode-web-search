---
name: web-search
description: >-
  Web search through the `web_search` tool provided by the zcode-web-search
  plugin. Use it whenever you need current, up-to-date information from the
  web — news, documentation, product info, prices, code references, or any
  external fact you don't have offline. Supports single and batched queries,
  recency filtering, domain filtering, and multiple search providers
  (Exa, TinyFish, Tavily, Brave, Kagi, Firecrawl, AnySearch, Perplexity,
  Serper, and keyless DuckDuckGo). Reuses pi-web-access config
  (~/.pi/web-search.json) when present, so keys already configured for pi work
  here with zero setup.
emoji: "🔎"
---

# Web Search

Two MCP tools from the `zcode-web-search` plugin (modeled after the
pi-web-access plugin for the Pi coding agent):

- **`web_search`** — search the web, get a synthesized answer with citations.
- **`fetch_content`** — fetch one or more URLs and get clean markdown
  (TinyFish Fetch; handles pages that block plain HTTP clients).

## When to use

- You need facts, news, prices, versions, docs, or any external information
  that isn't available offline or from the repo.
- You want to verify something is current (recencyFilter).
- You want results limited to specific domains (domainFilter).
- You want several sources for a research-style answer.

## Tool signature

`web_search` accepts:

- `query` (string) — the search query. Use either `query` or `queries`.
- `queries` (string[]) — batch of queries; each gets its own synthesized answer.
- `numResults` (int, 1–20, default 5) — results per query.
- `recencyFilter` (`day` | `week` | `month` | `year`) — restrict to recent sources.
- `domainFilter` (string[]) — restrict to domains; prefix with `-` to exclude.
- `provider` — `auto` (default), `all`, or a specific provider:
  `exa`, `tavily`, `brave`, `kagi`, `firecrawl`, `anysearch`, `perplexity`,
  `serper`, `tinyfish`, `duckduckgo`.

The result includes a result summary with per-source citations
(`snippet` / `Source: title (url)`); some providers (Tavily, Perplexity) may
return a generative answer instead.

### fetch_content

- `url` (string) or `urls` (string[], max 10) — the page(s) to fetch.
- `prompt` (string, optional) — purpose hint for the fetcher.

Fetch pipeline with per-URL fallback: **TinyFish Fetch → Firecrawl scrape →
Jina Reader (keyless)**. Each URL only moves down the chain when the previous
provider fails, so one blocked page doesn't cost its batch mates. Jina works
without a key; a `JINA_API_KEY` raises its rate limits. The chain can still
fail on rate limits, anti-bot walls, or login requirements.

## Provider fan-out vs fallback

With `provider: "all"` all credentialed providers are searched
**simultaneously** (mirroring pi-web-access), and results are merged and
deduplicated — each result is tagged with the provider it came from. The
`auto` mode instead walks a sequential fallback chain over credentialed
providers, ending with anonymous AnySearch and keyless DuckDuckGo, and a
single named provider (`provider: "tavily"`) queries only that one.

## Examples

```
web_search({ query: "2026 AI inference cost trends", numResults: 10, recencyFilter: "month" })
web_search({ query: "Next.js 15 server actions", domainFilter: ["nextjs.org"] })
web_search({ queries: ["Rust vs Go 2026", "Zig adoption"], numResults: 5 })
web_search({ query: "latest Laravel release", provider: "tavily" })
```

## Configuration

Two config sources, read in order with per-key precedence (pi first):

1. **pi-web-access config** — `~/.pi/web-search.json` (or
   `$PI_CODING_AGENT_DIR` / `$XDG_CONFIG_HOME/pi/web-search.json`). Values
   support pi's credential syntax: `"$ENV_NAME"` reads an environment
   variable, `"!command"` runs a command, `"$$..."`/`"$!..."` are escapes.
2. **Independent config** — `~/.zcode-web-search.json` for users who don't
   use pi. Same syntax.

Provider selection: `provider` tool arg → config `provider` field → `auto`.
- `all`: parallel fan-out to every provider with a key; results merged and
  deduplicated. Keyless fallbacks (AnySearch anonymous → DuckDuckGo → Exa
  MCP) only step in if the whole fan-out fails.
- `auto`: sequential over credentialed providers only, then anonymous
  AnySearch and best-effort DuckDuckGo — works with zero configuration.
- A single named provider queries only that one (keyless `provider: "exa"`
  uses the Exa MCP path).

Note: TinyFish Search is free (30 req/min) — a `TINYFISH_API_KEY` alone is
enough for a zero-cost setup.

If keys are set in a shell profile (e.g. `~/.zshrc`) but not in the current
environment, the server picks up the relevant `*_API_KEY` variables from
common profile files automatically (read-only, never executes them).

See the plugin README for the full provider list and key names.
