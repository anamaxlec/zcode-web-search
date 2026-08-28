---
description: Search the web with the zcode-web-search plugin.
argument-hint: "[query]"
---

Use the `web_search` MCP tool (from the zcode-web-search plugin) to search the web for:

$ARGUMENTS

Guidelines:

- Use `numResults: 8` and add a `recencyFilter` if the query is about news, prices, releases, or anything time-sensitive.
- Batch related queries with `queries` when the request covers several sub-questions.
- After the search, answer the user directly with a short synthesis and cite sources inline as `[title](url)`.
- If the search fails, report which providers were tried and suggest checking `/web-search-status`.
