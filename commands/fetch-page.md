---
description: Fetch and read the full text of web pages.
argument-hint: "[url or multiple urls]"
---

Use the `fetch_content` MCP tool (from the zcode-web-search plugin) to fetch the full text of:

$ARGUMENTS

Guidelines:

- Pass up to 10 URLs in one call via `urls` when there are several.
- If a fetch fails or returns empty content, mention it — the tool already falls back TinyFish → Firecrawl → Jina Reader, so persistent failure means the page is really unreachable.
- Summarize or quote the fetched content as the user's request implies, citing the source URL.
