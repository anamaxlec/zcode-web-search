---
description: Diagnose zcode-web-search configuration (keys, providers, routing).
argument-hint: ""
---

Diagnose the zcode-web-search plugin setup. Do this without calling the search tools themselves:

1. Read `~/.pi/web-search.json` (or `$PI_CODING_AGENT_DIR` / `$XDG_CONFIG_HOME/pi`) and `~/.zcode-web-search.json` if present. List which provider keys are configured and whether each value is a `$ENV` reference, a `!command`, or a literal.
2. For every `$ENV` reference, check whether that environment variable is currently set (report set/unset only, never print the value).
3. Run `node <plugin-root>/src/server.js --selftest` where `<plugin-root>` is this plugin's installed directory, and report pass/fail.
4. Report the effective routing: the `provider` field from config (all = parallel fan-out, specific = fixed provider, absent = auto chain).

Finish with a short verdict: which providers will actually be used on the next `web_search` call, and for any provider that is configured but unusable, the exact fix (e.g. "TINYFISH_API_KEY is referenced but unset — export it in ~/.zshrc").
