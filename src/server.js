#!/usr/bin/env node
// zcode-web-search MCP server
//
// Provides a `web_search` tool modeled after pi-web-access
// (https://github.com/nicobailon/pi-web-access). It reuses the same config
// file (~/.pi/web-search.json) when present, including its `$ENV` / `!command`
// credential resolution rules, so keys already configured for pi work here
// with zero extra setup. An independent config (~/.zcode-web-search.json) is
// also supported for users who don't use pi.
//
// Run with --selftest to exercise config loading / credential resolution /
// routing logic without talking to MCP.

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";

const VERSION = "0.1.0";
const SEARCH_TIMEOUT_MS = 60_000;

// Keys that may be referenced by pi-web-access config ($ENV form) and that we
// want to reuse. When any is missing from the process environment, we try to
// pick it up from shell profile files so the same keys configured for pi work
// here even when the host process didn't inherit the interactive shell env.
const PROFILE_KEYS = [
  "ANYSEARCH_API_KEY",
  "FIRECRAWL_API_KEY",
  "TAVILY_API_KEY",
  "EXA_API_KEY",
  "BRAVE_API_KEY",
  "KAGI_API_KEY",
  "PERPLEXITY_API_KEY",
  "SERPER_API_KEY",
  "TINYFISH_API_KEY",
  "JINA_API_KEY",
];

const PROFILE_FILES = ["~/.zshrc", "~/.zshenv", "~/.zprofile", "~/.profile", "~/.bash_profile", "~/.bashrc"];

// Extract `export KEY="value"` / `export KEY=value` lines for PROFILE_KEYS from
// the given profile content. Never executes the file; only regex-scans for the
// exact key names we care about.
function extractProfileKeys(content) {
  const out = {};
  for (const key of PROFILE_KEYS) {
    const re = new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?${key}=["']?([^"'\\n]+)["']?`, "");
    const m = content.match(re);
    if (m && m[1]) out[key] = m[1].trim();
  }
  return out;
}

// Fill missing env vars from shell profiles. Safe: only sets keys in
// PROFILE_KEYS that are currently unset, and only reads (never runs) profiles.
function augmentEnvFromProfiles() {
  const missing = PROFILE_KEYS.filter((k) => !process.env[k]);
  if (missing.length === 0) return;
  for (const file of PROFILE_FILES) {
    const path = file.replace(/^~/, homedir());
    if (!existsSync(path)) continue;
    let content;
    try {
      content = readFileSync(path, "utf-8");
    } catch {
      continue;
    }
    const extracted = extractProfileKeys(content);
    for (const [key, value] of Object.entries(extracted)) {
      if (!process.env[key] && value) process.env[key] = value;
    }
    if (PROFILE_KEYS.every((k) => process.env[k])) break;
  }
}

augmentEnvFromProfiles();

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

function getPiConfigDir() {
  if (process.env.PI_CODING_AGENT_DIR) return process.env.PI_CODING_AGENT_DIR;
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, "pi");
  return join(homedir(), ".pi");
}

function getPiConfigPath() {
  return join(getPiConfigDir(), "web-search.json");
}

function getZcodeConfigPath() {
  return join(homedir(), ".zcode-web-search.json");
}

// Load the pi config (personal) and the zcode config (public). The pi config
// takes precedence per-key: a value present in the pi config wins over the
// zcode config, and the pi `provider` field drives the default routing.
function loadRawConfig() {
  const merged = {};
  for (const path of [getPiConfigPath(), getZcodeConfigPath()]) {
    if (!existsSync(path)) continue;
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path, "utf-8"));
    } catch (err) {
      console.error(`[zcode-web-search] failed to parse ${path}: ${err.message}`);
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      console.error(`[zcode-web-search] invalid config (expected object): ${path}`);
      continue;
    }
    for (const [key, value] of Object.entries(parsed)) {
      if (merged[key] === undefined) merged[key] = value;
    }
  }
  return merged;
}

// Resolve a single credential value using pi-web-access rules:
//   "$NAME"  -> read env var NAME
//   "!cmd"   -> run local command, stdout trimmed is the value
//   "$$..."  -> escaped literal "$..."
//   "$!..."  -> escaped literal "!..."
// A plain string is returned as-is. Env vars referenced via $NAME take
// precedence over inline literal keys (handled in resolveCredential below).
function resolveCredentialString(raw, signal) {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("$$")) return raw.slice(1);
  if (raw.startsWith("$!")) return raw.slice(1);
  if (raw.startsWith("$")) {
    const name = raw.slice(1);
    return process.env[name] ?? null;
  }
  if (raw.startsWith("!")) {
    const cmd = raw.slice(1);
    return new Promise((resolve) => {
      execFile("/bin/sh", ["-c", cmd], { timeout: 15000 }, (err, stdout) => {
        if (err) {
          console.error(`[zcode-web-search] failed to run command for credential: ${err.message}`);
          resolve(null);
        } else {
          resolve(String(stdout).trim() || null);
        }
      });
    });
  }
  return raw;
}

// Provider -> { configKey, envKey, url }. url is the search endpoint used by
// the provider; keyless providers (duckduckgo) have no envKey.
const PROVIDER_META = {
  exa: { configKey: "exaApiKey", envKey: "EXA_API_KEY" },
  tavily: { configKey: "tavilyApiKey", envKey: "TAVILY_API_KEY" },
  brave: { configKey: "braveApiKey", envKey: "BRAVE_API_KEY" },
  kagi: { configKey: "kagiApiKey", envKey: "KAGI_API_KEY" },
  firecrawl: { configKey: "firecrawlApiKey", envKey: "FIRECRAWL_API_KEY" },
  anysearch: { configKey: "anysearchApiKey", envKey: "ANYSEARCH_API_KEY" },
  perplexity: { configKey: "perplexityApiKey", envKey: "PERPLEXITY_API_KEY" },
  serper: { configKey: "serperApiKey", envKey: "SERPER_API_KEY" },
  tinyfish: { configKey: "tinyfishApiKey", envKey: "TINYFISH_API_KEY" },
  duckduckgo: { configKey: null, envKey: null },
};

async function resolveCredentialFor(provider, config, signal) {
  const meta = PROVIDER_META[provider];
  if (!meta || !meta.configKey) return null;
  const configured = config[meta.configKey];
  // pi-web-access: environment variable > configured value (but $NAME in the
  // config also points at an env var, so resolve the config first, then fall
  // back to the direct env var).
  if (configured !== undefined && configured !== null && configured !== "") {
    const resolved = await resolveCredentialString(configured, signal);
    if (resolved) return resolved;
  }
  const envVal = process.env[meta.envKey];
  if (envVal && envVal.trim().length > 0) return envVal;
  return null;
}

// ---------------------------------------------------------------------------
// Shared search types / helpers
// ---------------------------------------------------------------------------

function normalizeCount(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 5;
  return Math.max(1, Math.min(Math.floor(value), 20));
}

function normalizeDomain(value) {
  let input = String(value).trim().toLowerCase();
  if (!input) return null;
  if (input.startsWith("-")) input = input.slice(1).trim();
  if (!input) return null;
  try {
    const parsed = input.includes("://") ? new URL(input) : new URL(`https://${input}`);
    input = parsed.hostname;
  } catch {
    input = input.split("/")[0]?.split(":")[0] ?? "";
  }
  input = input.replace(/^\.+|\.+$/g, "");
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(input) ? input : null;
}

function parseDomainFilter(domainFilter) {
  const filters = { include: [], exclude: [] };
  for (const raw of domainFilter ?? []) {
    const domain = normalizeDomain(raw);
    if (!domain) continue;
    const target = String(raw).trim().startsWith("-") ? filters.exclude : filters.include;
    if (!target.includes(domain)) target.push(domain);
  }
  return filters;
}

function hostMatchesDomain(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function passesDomainFilters(url, filters) {
  if (filters.include.length === 0 && filters.exclude.length === 0) return true;
  let hostname;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (filters.exclude.some((d) => hostMatchesDomain(hostname, d))) return false;
  return filters.include.length === 0 || filters.include.some((d) => hostMatchesDomain(hostname, d));
}

function buildAnswer(results) {
  return results
    .map((r) => (r.snippet ? `${r.snippet}\nSource: ${r.title} (${r.url})` : `Source: ${r.title} (${r.url})`))
    .join("\n\n");
}

function requestSignal(signal) {
  const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

function redact(text, secret) {
  if (!secret) return text;
  try {
    return String(text).split(secret).join("***");
  } catch {
    return text;
  }
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

async function searchWithExa(query, options, config, signal) {
  const apiKey = await resolveCredentialFor("exa", config, signal);
  const numResults = normalizeCount(options.numResults);
  const startDate = options.recencyFilter
    ? new Date(Date.now() - ({ day: 1, week: 7, month: 30, year: 365 }[options.recencyFilter] ?? 0) * 86400000).toISOString()
    : undefined;
  const includeDomains = [];
  const excludeDomains = [];
  for (const raw of options.domainFilter ?? []) {
    const d = normalizeDomain(raw);
    if (!d) continue;
    (String(raw).trim().startsWith("-") ? excludeDomains : includeDomains).push(d);
  }

  if (apiKey) {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json", "x-exa-integration": "zcode-web-search" },
      body: JSON.stringify({
        query,
        type: "auto",
        numResults,
        ...(startDate ? { startPublishedDate: startDate } : {}),
        ...(includeDomains.length ? { includeDomains } : {}),
        ...(excludeDomains.length ? { excludeDomains } : {}),
        contents: { text: { maxCharacters: 400 } },
      }),
      signal: requestSignal(signal),
    });
    if (!res.ok) {
      throw new Error(`Exa API error ${res.status}: ${redact((await res.text()).slice(0, 300), apiKey)}`);
    }
    const data = await res.json();
    const results = (data.results ?? [])
      .filter((r) => r?.url && passesDomainFilters(r.url, parseDomainFilter(options.domainFilter)))
      .slice(0, numResults)
      .map((r) => ({
        title: r.title || `Source ${(data.results ?? []).indexOf(r) + 1}`,
        url: r.url,
        snippet: typeof r.text === "string" ? r.text.replace(/\s+/g, " ").trim().slice(0, 500) : "",
      }));
    return { answer: buildAnswer(results), results };
  }

  // Zero-config path: Exa MCP endpoint via bare JSON-RPC (as pi-web-access does).
  const tool = "web_search_exa";
  const mcpUrl = `https://mcp.exa.ai/mcp?tools=${tool}`;
  const rpc = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: tool,
      arguments: { query, numResults, ...(startDate ? { startPublishedDate: startDate } : {}) },
    },
  };
  const res = await fetch(mcpUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify(rpc),
    signal: requestSignal(signal),
  });
  if (!res.ok) throw new Error(`Exa MCP error ${res.status}`);
  const raw = await res.text();
  let text = "";
  try {
    const data = JSON.parse(raw);
    text = data?.result?.content?.[0]?.text ?? "";
  } catch {
    // SSE stream of "data: {...}" lines
    for (const line of raw.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload);
        const t = parsed?.result?.content?.[0]?.text;
        if (t) text = t;
      } catch {}
    }
  }
  const results = [];
  const seen = new Set();
  const lines = text.split("\n");
  let title = "", url = "", snippet = "";
  for (const line of lines) {
    if (line.startsWith("Title: ")) {
      title = line.slice(7).trim();
    } else if (line.startsWith("URL: ")) {
      url = line.slice(5).trim();
    } else if (line.startsWith("Content: ")) {
      snippet = line.slice(9).trim();
    } else if (line.trim() === "") {
      if (url && !seen.has(url)) {
        seen.add(url);
        results.push({ title: title || url, url, snippet });
      }
      title = ""; url = ""; snippet = "";
    }
  }
  if (url && !seen.has(url)) results.push({ title: title || url, url, snippet });
  return { answer: buildAnswer(results.slice(0, numResults)), results: results.slice(0, numResults) };
}

async function searchWithTavily(query, options, config, signal) {
  const apiKey = await resolveCredentialFor("tavily", config, signal);
  if (!apiKey) throw new Error("Tavily API key not found. Set TAVILY_API_KEY or configure tavilyApiKey.");
  const filters = parseDomainFilter(options.domainFilter);
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: normalizeCount(options.numResults),
      search_depth: "basic",
      ...(options.recencyFilter ? { days: { day: 1, week: 7, month: 30, year: 365 }[options.recencyFilter] } : {}),
      ...(filters.include.length ? { include_domains: filters.include } : {}),
      ...(filters.exclude.length ? { exclude_domains: filters.exclude } : {}),
    }),
    signal: requestSignal(signal),
  });
  if (!res.ok) throw new Error(`Tavily API error ${res.status}: ${redact((await res.text()).slice(0, 300), apiKey)}`);
  const data = await res.json();
  const results = (data.results ?? [])
    .filter((r) => r?.url)
    .slice(0, normalizeCount(options.numResults))
    .map((r) => ({
      title: r.title || `Source ${(data.results ?? []).indexOf(r) + 1}`,
      url: r.url,
      snippet: typeof r.content === "string" ? r.content.replace(/\s+/g, " ").trim().slice(0, 500) : "",
    }));
  const answer = data.answer && typeof data.answer === "string" ? data.answer : buildAnswer(results);
  return { answer, results };
}

async function searchWithBrave(query, options, config, signal) {
  const apiKey = await resolveCredentialFor("brave", config, signal);
  if (!apiKey) throw new Error("Brave API key not found. Set BRAVE_API_KEY or configure braveApiKey.");
  const filters = parseDomainFilter(options.domainFilter);
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(normalizeCount(options.numResults)));
  if (options.recencyFilter) {
    url.searchParams.set("freshness", { day: "pd", week: "pw", month: "pm", year: "py" }[options.recencyFilter]);
  }
  const res = await fetch(url, {
    headers: { "X-Subscription-Token": apiKey, Accept: "application/json" },
    signal: requestSignal(signal),
  });
  if (!res.ok) throw new Error(`Brave API error ${res.status}: ${redact((await res.text()).slice(0, 300), apiKey)}`);
  const data = await res.json();
  const results = (data.web?.results ?? [])
    .filter((r) => r?.url && passesDomainFilters(r.url, filters))
    .slice(0, normalizeCount(options.numResults))
    .map((r) => ({ title: r.title || r.url, url: r.url, snippet: typeof r.description === "string" ? r.description : "" }));
  return { answer: buildAnswer(results), results };
}

async function searchWithKagi(query, options, config, signal) {
  const apiKey = await resolveCredentialFor("kagi", config, signal);
  if (!apiKey) throw new Error("Kagi API key not found. Set KAGI_API_KEY or configure kagiApiKey.");
  const filters = parseDomainFilter(options.domainFilter);
  const url = new URL("https://kagi.com/api/v1/search");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(normalizeCount(options.numResults)));
  const res = await fetch(url, {
    headers: { Authorization: `Bot ${apiKey}`, Accept: "application/json" },
    signal: requestSignal(signal),
  });
  if (!res.ok) throw new Error(`Kagi API error ${res.status}: ${redact((await res.text()).slice(0, 300), apiKey)}`);
  const data = await res.json();
  const results = (data.data?.search ?? [])
    .filter((r) => r?.url && passesDomainFilters(r.url, filters))
    .slice(0, normalizeCount(options.numResults))
    .map((r) => ({
      title: r.title || r.url,
      url: r.url,
      snippet: r.snippet || r.content || "",
    }));
  return { answer: buildAnswer(results), results };
}

async function searchWithFirecrawl(query, options, config, signal) {
  const apiKey = await resolveCredentialFor("firecrawl", config, signal);
  if (!apiKey) throw new Error("Firecrawl API key not found. Set FIRECRAWL_API_KEY or configure firecrawlApiKey.");
  const filters = parseDomainFilter(options.domainFilter);
  const res = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      limit: normalizeCount(options.numResults),
      ...(options.recencyFilter ? { recency: options.recencyFilter } : {}),
      ...(filters.include.length ? { includeDomains: filters.include } : {}),
      ...(filters.exclude.length ? { excludeDomains: filters.exclude } : {}),
    }),
    signal: requestSignal(signal),
  });
  if (!res.ok) throw new Error(`Firecrawl API error ${res.status}: ${redact((await res.text()).slice(0, 300), apiKey)}`);
  const data = await res.json();
  const results = (data.data ?? [])
    .filter((r) => r?.url && passesDomainFilters(r.url, filters))
    .slice(0, normalizeCount(options.numResults))
    .map((r) => ({ title: r.title || r.url, url: r.url, snippet: typeof r.description === "string" ? r.description : "" }));
  return { answer: buildAnswer(results), results };
}

async function searchWithAnySearch(query, options, config, signal) {
  const apiKey = await resolveCredentialFor("anysearch", config, signal);
  const res = await fetch("https://api.anysearch.com/v1/search", {
    method: "POST",
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, max_results: normalizeCount(options.numResults) }),
    signal: requestSignal(signal),
  });
  if (!res.ok) throw new Error(`AnySearch API error ${res.status}: ${redact((await res.text()).slice(0, 300), apiKey)}`);
  const data = await res.json();
  const results = (data.data?.results ?? [])
    .filter((r) => r?.url)
    .slice(0, normalizeCount(options.numResults))
    .map((r) => ({ title: r.title || r.url, url: r.url, snippet: r.snippet || "" }));
  return { answer: buildAnswer(results), results };
}

async function searchWithPerplexity(query, options, config, signal) {
  const apiKey = await resolveCredentialFor("perplexity", config, signal);
  if (!apiKey) throw new Error("Perplexity API key not found. Set PERPLEXITY_API_KEY or configure perplexityApiKey.");
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sonar",
      messages: [{ role: "user", content: query }],
      max_tokens: 1024,
      ...(options.recencyFilter ? { search_recency_filter: options.recencyFilter } : {}),
      ...(options.domainFilter?.length ? { search_domain_filter: options.domainFilter.filter((d) => /^[a-zA-Z0-9][a-zA-Z0-9-_.]*\.[a-zA-Z]{2,}$/.test(String(d).replace(/^-/, ""))) } : {}),
    }),
    signal: requestSignal(signal),
  });
  if (!res.ok) throw new Error(`Perplexity API error ${res.status}: ${redact((await res.text()).slice(0, 300), apiKey)}`);
  const data = await res.json();
  const answer = data.choices?.[0]?.message?.content || "";
  const citations = Array.isArray(data.citations) ? data.citations : [];
  const results = [];
  for (let i = 0; i < Math.min(citations.length, normalizeCount(options.numResults)); i++) {
    const c = citations[i];
    if (typeof c === "string") results.push({ title: `Source ${i + 1}`, url: c, snippet: "" });
    else if (c && typeof c === "object" && c.url) results.push({ title: c.title || `Source ${i + 1}`, url: c.url, snippet: "" });
  }
  return { answer, results };
}

async function searchWithSerper(query, options, config, signal) {
  const apiKey = await resolveCredentialFor("serper", config, signal);
  if (!apiKey) throw new Error("Serper API key not found. Set SERPER_API_KEY or configure serperApiKey.");
  const filters = parseDomainFilter(options.domainFilter);
  const queryParts = [query];
  if (filters.include.length === 1) queryParts.push(`site:${filters.include[0]}`);
  else if (filters.include.length > 1) queryParts.push(`(${filters.include.map((d) => `site:${d}`).join(" OR ")})`);
  for (const d of filters.exclude) queryParts.push(`-site:${d}`);
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      q: queryParts.join(" "),
      num: normalizeCount(options.numResults),
      ...(options.recencyFilter ? { tbs: { day: "qdr:d", week: "qdr:w", month: "qdr:m", year: "qdr:y" }[options.recencyFilter] } : {}),
    }),
    signal: requestSignal(signal),
  });
  if (!res.ok) throw new Error(`Serper API error ${res.status}: ${redact((await res.text()).slice(0, 300), apiKey)}`);
  const data = await res.json();
  const results = (data.organic ?? [])
    .filter((r) => r?.link && passesDomainFilters(r.link, filters))
    .slice(0, normalizeCount(options.numResults))
    .map((r) => ({ title: r.title || r.link, url: r.link, snippet: typeof r.snippet === "string" ? r.snippet : "" }));
  return { answer: buildAnswer(results), results };
}

async function searchWithTinyFish(query, options, config, signal) {
  const apiKey = await resolveCredentialFor("tinyfish", config, signal);
  if (!apiKey) throw new Error("TinyFish API key not found. Set TINYFISH_API_KEY or configure tinyfishApiKey.");
  const numResults = normalizeCount(options.numResults);
  const filters = parseDomainFilter(options.domainFilter);
  const recencyMinutes = options.recencyFilter
    ? { day: 1_440, week: 10_080, month: 43_200, year: 525_600 }[options.recencyFilter]
    : undefined;
  // TinyFish returns 10 results per page; fetch a second page when more are wanted.
  const pageList = numResults > 10 ? [0, 1] : [0];
  const combined = [];
  const seen = new Set();
  for (const page of pageList) {
    const url = new URL("https://api.search.tinyfish.ai/");
    url.searchParams.set("query", query);
    if (filters.include.length) url.searchParams.set("include_domains", filters.include.join(","));
    if (filters.exclude.length) url.searchParams.set("exclude_domains", filters.exclude.join(","));
    if (recencyMinutes !== undefined) url.searchParams.set("recency_minutes", String(recencyMinutes));
    if (page > 0) url.searchParams.set("page", String(page));
    const res = await fetch(url, {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
      signal: requestSignal(signal),
    });
    if (!res.ok) throw new Error(`TinyFish API error ${res.status}: ${redact((await res.text()).slice(0, 300), apiKey)}`);
    const data = await res.json();
    if (!Array.isArray(data.results)) throw new Error("TinyFish API returned an unexpected response shape");
    for (const r of data.results) {
      if (!r?.url || seen.has(r.url)) continue;
      seen.add(r.url);
      if (!passesDomainFilters(r.url, filters)) continue;
      combined.push({
        title: r.title || r.site_name || r.url,
        url: r.url,
        snippet: typeof r.snippet === "string" ? r.snippet : "",
      });
    }
    if (data.results.length < 10) break;
  }
  const results = combined.slice(0, numResults);
  return { answer: buildAnswer(results), results };
}

// TinyFish Fetch (free, 150 urls/min): batch-fetch pages as markdown.
async function fetchWithTinyFish(urls, options, config, signal) {
  const apiKey = await resolveCredentialFor("tinyfish", config, signal);
  if (!apiKey) {
    throw new Error(
      "TinyFish API key not found. Set TINYFISH_API_KEY or configure tinyfishApiKey " +
      "(get a free key at https://agent.tinyfish.ai/api-keys)"
    );
  }
  const list = (Array.isArray(urls) ? urls : [urls]).map((u) => String(u).trim()).filter(Boolean).slice(0, 10);
  if (list.length === 0) throw new Error("fetch_content requires a 'url' or 'urls' argument.");
  const body = {
    urls: list,
    format: "markdown",
    per_url_timeout_ms: 110_000,
  };
  if (typeof options.prompt === "string" && options.prompt.trim()) {
    body.purpose = options.prompt.trim().slice(0, 2000);
  }
  const res = await fetch("https://api.fetch.tinyfish.ai", {
    method: "POST",
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: requestSignal(signal),
  });
  if (!res.ok) throw new Error(`TinyFish Fetch error ${res.status}: ${redact((await res.text()).slice(0, 300), apiKey)}`);
  const data = await res.json();
  const results = (Array.isArray(data.results) ? data.results : [])
    .map((r) => ({
      url: r?.final_url || r?.url,
      title: typeof r?.title === "string" ? r.title.trim() : "",
      content: typeof r?.text === "string" ? r.text.trim() : r?.text && typeof r.text === "object" ? JSON.stringify(r.text, null, 2) : "",
    }))
    .filter((r) => r.url && r.content);
  const errors = (Array.isArray(data.errors) ? data.errors : [])
    .map((e) => `${e?.url}: ${e?.error ?? "unknown error"}${e?.status ? ` (HTTP ${e.status})` : ""}`);
  return { results, errors };
}

// Firecrawl scrape: per-URL fallback for pages TinyFish can't fetch.
async function fetchWithFirecrawl(url, config, signal) {
  const apiKey = await resolveCredentialFor("firecrawl", config, signal);
  if (!apiKey) throw new Error("Firecrawl API key not found. Set FIRECRAWL_API_KEY or configure firecrawlApiKey.");
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"] }),
    signal: requestSignal(signal),
  });
  if (!res.ok) throw new Error(`Firecrawl scrape error ${res.status}: ${redact((await res.text()).slice(0, 300), apiKey)}`);
  const data = await res.json();
  if (data?.success === false) throw new Error(`Firecrawl scrape failed: ${data?.error ?? "unknown error"}`);
  const markdown = typeof data?.data?.markdown === "string" ? data.data.markdown.trim() : "";
  if (!markdown) throw new Error("Firecrawl scrape returned no markdown");
  const title = typeof data?.data?.metadata?.title === "string" ? data.data.metadata.title.trim() : "";
  return { url, title, content: markdown };
}

// Jina Reader (r.jina.ai): keyless-capable last resort. Optional JINA_API_KEY
// raises rate limits.
async function resolveJinaKey(config, signal) {
  const configured = config.jinaApiKey;
  if (typeof configured === "string" && configured.length > 0) {
    const resolved = await resolveCredentialString(configured, signal);
    if (resolved) return resolved;
  }
  const env = process.env.JINA_API_KEY;
  return env && env.trim().length > 0 ? env : null;
}

async function fetchWithJina(url, config, signal) {
  const headers = { Accept: "text/plain" };
  const apiKey = await resolveJinaKey(config, signal);
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers,
    signal: requestSignal(signal),
  });
  if (!res.ok) throw new Error(`Jina reader error ${res.status}`);
  const text = await res.text();
  let title = "";
  const titleMatch = text.match(/^Title:\s*(.+)\s*$/im);
  if (titleMatch) title = titleMatch[1].trim();
  const marker = "Markdown Content:";
  const idx = text.indexOf(marker);
  const content = idx >= 0 ? text.slice(idx + marker.length).trim() : text.trim();
  if (!content) throw new Error("Jina reader returned no content");
  return { url, title, content };
}

// Fetch pipeline: TinyFish (free, batch) -> Firecrawl scrape (per URL) ->
// Jina Reader (keyless). Each fallback only handles URLs the previous
// providers failed to fetch, so a blocked page doesn't cost its batch mates.
async function fetchContent(urls, options, config, signal) {
  const list = (Array.isArray(urls) ? urls : [urls]).map((u) => String(u).trim()).filter(Boolean).slice(0, 10);
  if (list.length === 0) throw new Error("fetch_content requires a 'url' or 'urls' argument.");
  const results = [];
  const errors = [];
  const seen = new Set();
  let pending = [...list];
  const mark = (r) => {
    if (r?.url && r?.content && !seen.has(r.url)) {
      seen.add(r.url);
      results.push(r);
    }
  };

  if (hasCredential("tinyfish", config)) {
    try {
      const { results: fetched, errors: fetchErrors } = await fetchWithTinyFish(pending, options, config, signal);
      for (const r of fetched) mark(r);
      for (const e of fetchErrors) errors.push(`tinyfish ${e}`);
    } catch (err) {
      errors.push(`tinyfish: ${errorMessage(err)}`);
    }
    pending = pending.filter((u) => !seen.has(u));
  }

  if (pending.length > 0 && hasCredential("firecrawl", config)) {
    for (const url of [...pending]) {
      try {
        mark(await fetchWithFirecrawl(url, config, signal));
      } catch (err) {
        errors.push(`firecrawl ${url}: ${errorMessage(err)}`);
      }
      pending = pending.filter((u) => !seen.has(u));
    }
  }

  for (const url of [...pending]) {
    try {
      mark(await fetchWithJina(url, config, signal));
    } catch (err) {
      errors.push(`jina ${url}: ${errorMessage(err)}`);
    }
    pending = pending.filter((u) => !seen.has(u));
  }

  for (const url of pending) {
    if (!seen.has(url)) errors.push(`${url}: all fetch providers failed`);
  }
  return { results, errors };
}

async function searchWithDuckDuckGo(query, options, signal) {
  const filters = parseDomainFilter(options.domainFilter);
  const url = new URL("https://html.duckduckgo.com/html/");
  url.searchParams.set("q", query);
  const res = await fetch(url, {
    headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; zcode-web-search/0.1.0)" },
    signal: requestSignal(signal),
  });
  if (!res.ok) throw new Error(`DuckDuckGo search error ${res.status}`);
  const html = await res.text();
  // Parse with a lightweight regex over the (fairly stable) DDG html result markup.
  const results = [];
  const seen = new Set();
  const resultBlocks = html.split('<div class="result ');
  for (const block of resultBlocks.slice(1)) {
    if (block.includes("result--ad")) continue;
    const titleMatch = block.match(/class="result__a"[^>]*>([^<]*)</);
    const hrefMatch = block.match(/class="result__a"[^>]*href="([^"]+)"/);
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    if (!hrefMatch) continue;
    let url = null;
    try {
      const link = new URL(hrefMatch[1].replace(/&amp;/g, "&"), url);
      const dest = link.searchParams.get("uddg") ?? link.href;
      const parsed = new URL(dest);
      url = parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
    } catch {
      url = null;
    }
    if (!url || seen.has(url)) continue;
    seen.add(url);
    if (!passesDomainFilters(url, filters)) continue;
    const title = titleMatch ? titleMatch[1].replace(/&amp;/g, "&").trim() : url;
    const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim() : "";
    results.push({ title, url, snippet });
    if (results.length >= normalizeCount(options.numResults)) break;
  }
  if (results.length === 0) throw new Error("DuckDuckGo returned no parseable results");
  return { answer: buildAnswer(results), results };
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

// Order used when config.provider === "all" or undefined. keylessDuckDuckGo is
// always tried last as a fallback so the tool works with zero config.
const ALL_ORDER = ["exa", "tinyfish", "tavily", "brave", "kagi", "firecrawl", "anysearch", "perplexity", "serper", "duckduckgo"];

const SEARCHERS = {
  exa: searchWithExa,
  tavily: searchWithTavily,
  brave: searchWithBrave,
  kagi: searchWithKagi,
  firecrawl: searchWithFirecrawl,
  anysearch: searchWithAnySearch,
  perplexity: searchWithPerplexity,
  serper: searchWithSerper,
  tinyfish: searchWithTinyFish,
  duckduckgo: searchWithDuckDuckGo,
};

function isKeyedProvider(provider) {
  return provider !== "duckduckgo";
}

// Returns the ordered provider list for this call. provider param beats
// config.provider. "all" or undefined -> ALL_ORDER; keyless duckduckgo is
// always appended as a last-resort fallback in sequential mode.
function selectProviders(requested, config) {
  let names;
  let mode;
  if (requested) {
    const list = Array.isArray(requested) ? requested : [requested];
    names = list.map((n) => String(n).toLowerCase());
    mode = names.includes("all") || list.length > 1 ? "all" : "explicit";
  } else if (config.provider === "all") {
    names = ALL_ORDER;
    mode = "all";
  } else if (typeof config.provider === "string" && config.provider) {
    names = [config.provider.toLowerCase()];
    mode = "explicit";
  } else {
    names = ALL_ORDER;
    mode = "auto";
  }

  const ordered = [];
  const seen = new Set();
  for (const name of names) {
    if (!SEARCHERS[name] || seen.has(name)) continue;
    seen.add(name);
    ordered.push(name);
  }

  if (mode === "all") {
    // Parallel fan-out: only providers with a usable credential join; keyless
    // duckduckgo stays out of the fan-out and acts as the fallback instead.
    return ordered.filter((name) => isKeyedProvider(name) && hasCredential(name, config));
  }
  if (mode === "explicit") {
    // Explicit single provider: try it even if the key looks missing so the
    // user gets the provider's own error message.
    return ordered;
  }
  // auto: sequential fallback over credentialed providers, keyless last.
  const usable = ordered.filter((name) => isKeyedProvider(name) && hasCredential(name, config));
  usable.push("duckduckgo");
  return usable;
}

function hasCredential(provider, config) {
  const meta = PROVIDER_META[provider];
  if (!meta || !meta.configKey) return true;
  const configured = config[meta.configKey];
  if (typeof configured === "string" && configured.length > 0) {
    // A "$NAME" reference only counts if the env var actually has a value,
    // so an unfilled `export KEY=""` doesn't schedule a doomed request.
    if (configured.startsWith("$") && !configured.startsWith("$$") && !configured.startsWith("$!")) {
      const env = process.env[configured.slice(1)];
      return !!(env && env.trim().length > 0);
    }
    return true; // literal key, "!command", or escape
  }
  const env = process.env[meta.envKey];
  return !!(env && env.trim().length > 0);
}

// Routing mode: "all" fans out in parallel; "explicit" is a single named
// provider; "auto" is the sequential fallback chain (mirrors pi-web-access,
// whose `all` searches every eligible provider simultaneously).
function resolveMode(requested, config) {
  if (requested) {
    const list = Array.isArray(requested) ? requested : [requested];
    if (list.map((n) => String(n).toLowerCase()).includes("all") || list.length > 1) return "all";
    return "explicit";
  }
  if (config.provider === "all") return "all";
  if (typeof config.provider === "string" && config.provider) return "explicit";
  return "auto";
}

async function searchOneProvider(provider, query, options, config) {
  const searcher = SEARCHERS[provider];
  const result = provider === "duckduckgo"
    ? await searcher(query, options, undefined, options.signal)
    : await searcher(query, options, config, options.signal);
  result.provider = provider;
  return result;
}

// Merge parallel provider results: dedupe by URL keeping first occurrence
// (providers arrive in ALL_ORDER order), annotate each result with its source.
function mergeParallelResults(successes) {
  const merged = [];
  const seen = new Set();
  const answers = [];
  const used = [];
  const failed = [];
  for (const { provider, result, error } of successes) {
    if (error) {
      failed.push(`${provider}: ${error}`);
      continue;
    }
    used.push(provider);
    if (result.answer) answers.push(result.answer);
    for (const r of result.results) {
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      merged.push({ ...r, provider });
    }
  }
  return { merged, answers, used, failed };
}

async function runSearchParallel(query, options, config, providers) {
  const settled = await Promise.allSettled(
    providers.map((provider) => searchOneProvider(provider, query, options, config))
  );
  const outcomes = settled.map((s, i) => s.status === "fulfilled"
    ? { provider: providers[i], result: s.value, error: null }
    : { provider: providers[i], result: null, error: errorMessage(s.reason) });

  let { merged, answers, used, failed } = mergeParallelResults(outcomes);

  // All parallel providers failed (or returned nothing) -> keyless fallbacks.
  if (merged.length === 0) {
    for (const provider of ["duckduckgo", "exa"]) {
      try {
        const result = await searchOneProvider(provider, query, options, config);
        if (result.results.length > 0) {
          return { ...result, parallel: { used: [...used, provider], failed } };
        }
        failed.push(`${provider}: no results`);
      } catch (err) {
        failed.push(`${provider}: ${errorMessage(err)}`);
      }
    }
    throw new Error(`web_search failed across ${providers.length} provider(s).${failed.length ? " Tried: " + failed.join(" | ") : ""}`);
  }

  return {
    answer: answers.join("\n\n"),
    results: merged,
    parallel: { used, failed },
  };
}

async function runSearch(query, options, config) {
  const providers = selectProviders(options.provider, config);
  const mode = resolveMode(options.provider, config);

  // "all" (config or explicit) and multi-provider requests fan out in
  // parallel, mirroring pi-web-access: every configured source searches
  // simultaneously and results are merged, not ranked by a fixed order.
  // runSearchParallel falls back to keyless duckduckgo/exa when the fan-out
  // yields nothing (including the zero-keys case).
  if (mode === "all") {
    return runSearchParallel(query, options, config, providers);
  }

  const errors = [];
  for (const provider of providers) {
    try {
      const result = await searchOneProvider(provider, query, options, config);
      if (result.results.length > 0) {
        return result;
      }
      errors.push(`${provider}: no results`);
    } catch (err) {
      errors.push(`${provider}: ${errorMessage(err)}`);
    }
  }
  const detail = errors.length ? ` Tried: ${errors.join(" | ")}` : "";
  throw new Error(`web_search failed across ${providers.length} provider(s).${detail}`);
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

const FETCH_SCHEMA = {
  name: "fetch_content",
  description:
    "Fetch one or more URLs and return the page content as clean markdown (max 10 per call). " +
    "Tries TinyFish Fetch first, then Firecrawl scrape, then the keyless Jina Reader as fallback — " +
    "so pages that block plain HTTP clients usually still work. Use it to read the full text " +
    "of a page found via web_search.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to fetch." },
      urls: { type: "array", items: { type: "string" }, description: "Batch of URLs (max 10)." },
      prompt: { type: "string", description: "Optional purpose hint sent to the fetcher." },
    },
  },
};

const TOOL_SCHEMA = {
  name: "web_search",
  description:
    "Search the web and return a synthesized answer with source citations. " +
    "Uses pi-web-access compatible providers (Exa, TinyFish, Tavily, Brave, Kagi, Firecrawl, AnySearch, " +
    "Perplexity, Serper) falling back to keyless DuckDuckGo. Supports single or batched queries.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query." },
      queries: { type: "array", items: { type: "string" }, description: "Batch of queries (alternative to query)." },
      numResults: { type: "integer", minimum: 1, maximum: 20, default: 5, description: "Results per query." },
      recencyFilter: { type: "string", enum: ["day", "week", "month", "year"], description: "Only sources from this recency window." },
      domainFilter: { type: "array", items: { type: "string" }, description: "Limit domains; prefix with '-' to exclude." },
      provider: { type: "string", description: "Provider(s): auto (default), all, or a specific provider (exa, tavily, brave, kagi, firecrawl, anysearch, perplexity, serper, tinyfish, duckduckgo)." },
      workflow: { type: "string", enum: ["none", "summary-review", "auto-summary"], default: "none", description: "Summary workflow. 'none' returns raw results." },
    },
  },
};

let configCache = null;

function getConfig() {
  if (!configCache) configCache = loadRawConfig();
  return configCache;
}

async function handleToolsCall(params) {
  const name = params?.name;
  const args = params?.arguments ?? {};
  const config = getConfig();

  if (name === "fetch_content") {
    try {
      const { results, errors } = await fetchContent(args.urls ?? args.url, { prompt: args.prompt }, config);
      const sections = results.map((r) =>
        `## ${r.title || r.url}\n\nURL: ${r.url}\n\n${r.content.slice(0, 50_000)}`
      );
      if (errors.length) sections.push(`## Fetch errors\n\n${errors.join("\n")}`);
      return {
        content: [{ type: "text", text: sections.join("\n\n---\n\n") || "No content returned." }],
        structuredContent: { fetched: results.length, errors },
      };
    } catch (err) {
      return { content: [{ type: "text", text: `fetch_content error: ${errorMessage(err)}` }], isError: true };
    }
  }

  if (name !== "web_search") {
    return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }

  const queries = args.queries ?? (args.query ? [args.query] : []);
  if (queries.length === 0) {
    return { content: [{ type: "text", text: "web_search requires a 'query' or 'queries' argument." }], isError: true };
  }

  const options = {
    numResults: args.numResults,
    recencyFilter: args.recencyFilter,
    domainFilter: args.domainFilter,
    provider: args.provider,
    workflow: args.workflow ?? "none",
    signal: undefined,
  };

  const sections = [];
  const allResults = [];
  for (const query of queries) {
    try {
      const result = await runSearch(query, options, config);
      sections.push(`## Query: "${query}"\n\n${result.answer}`);
      for (const r of result.results) allResults.push({ ...r, query });
    } catch (err) {
      sections.push(`## Query: "${query}"\n\nSearch failed: ${errorMessage(err)}`);
    }
  }

  const providerUsed = allResults.length ? " (provider: auto)" : "";
  const text = sections.join("\n\n");
  return {
    content: [{ type: "text", text }],
    structuredContent: {
      queries,
      successfulQueries: sections.filter((s) => !s.includes("Search failed")).length,
      totalResults: allResults.length,
      results: allResults.slice(0, 100),
    },
  };
}

async function main() {
  const isSelftest = process.argv.includes("--selftest");
  if (isSelftest) {
    await runSelftest();
    return;
  }

  const readline = (await import("node:readline")).createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");

  for await (const line of readline) {
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.method === "initialize") {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "zcode-web-search", version: VERSION },
        },
      });
    } else if (msg.method === "notifications/initialized") {
      // no reply
    } else if (msg.method === "tools/list") {
      send({ jsonrpc: "2.0", id: msg.id, result: { tools: [TOOL_SCHEMA, FETCH_SCHEMA] } });
    } else if (msg.method === "tools/call") {
      try {
        const result = await handleToolsCall(msg.params);
        send({ jsonrpc: "2.0", id: msg.id, result });
      } catch (err) {
        send({
          jsonrpc: "2.0",
          id: msg.id,
          result: { content: [{ type: "text", text: `web_search error: ${errorMessage(err)}` }], isError: true },
        });
      }
    } else if (msg.method === "ping") {
      send({ jsonrpc: "2.0", id: msg.id, result: {} });
    }
  }
}

// ---------------------------------------------------------------------------
// Self-test
// ---------------------------------------------------------------------------

async function runSelftest() {
  const assert = (cond, label) => {
    if (!cond) {
      console.error(`FAIL: ${label}`);
      process.exitCode = 1;
    } else {
      console.log(`ok: ${label}`);
    }
  };

  // Config loading: pi config takes precedence over zcode config.
  const config = getConfig();
  assert(config.provider === "all", "pi config provider=all is loaded");
  assert(typeof config.anysearchApiKey === "string", "anysearchApiKey present (as $ENV ref)");

  // Credential resolution
  const prev = process.env.TEST_WEB_SEARCH_ENV;
  process.env.TEST_WEB_SEARCH_ENV = "secret-value";
  const fromEnv = await resolveCredentialString("$TEST_WEB_SEARCH_ENV");
  assert(fromEnv === "secret-value", "$ENV credential resolves from process env");
  const literal = await resolveCredentialString("plain-key");
  assert(literal === "plain-key", "plain credential passes through");
  const escapedDollar = await resolveCredentialString("$$not-env");
  assert(escapedDollar === "$not-env", "$$ escape yields literal $");
  const escapedBang = await resolveCredentialString("$!not-cmd");
  assert(escapedBang === "!not-cmd", "$! escape yields literal !");
  const missingEnv = await resolveCredentialString("$MISSING_TEST_ENV");
  assert(missingEnv === null, "unset $ENV resolves to null");
  if (prev === undefined) delete process.env.TEST_WEB_SEARCH_ENV;
  else process.env.TEST_WEB_SEARCH_ENV = prev;

  // Domain filter parsing
  const filters = parseDomainFilter(["example.com", "-bad.example", "docs.Example.org"]);
  assert(filters.include.includes("example.com") && filters.include.includes("docs.example.org"), "domain filter normalizes + splits include");
  assert(filters.exclude.includes("bad.example"), "domain filter splits exclude");
  assert(passesDomainFilters("https://docs.example.org/x", filters), "passesDomainFilters allows included domain");
  assert(!passesDomainFilters("https://bad.example/x", filters), "passesDomainFilters blocks excluded domain");

  // Provider selection
  const autoChain = selectProviders(undefined, {});
  assert(Array.isArray(autoChain), "selectProviders returns array");
  assert(autoChain[autoChain.length - 1] === "duckduckgo", "auto chain ends with keyless duckduckgo fallback");
  const allFanout = selectProviders(undefined, { provider: "all" });
  assert(!allFanout.includes("duckduckgo"), "all fan-out excludes keyless (it is the fallback)");

  const explicit = selectProviders("tavily", {});
  assert(explicit[0] === "tavily", "explicit provider requested first");

  const explicitMissing = selectProviders("nonsense", {});
  assert(Array.isArray(explicitMissing), "unknown provider is tolerated");

  // buildAnswer formatting
  const answer = buildAnswer([{ title: "T", url: "https://e.com", snippet: "S" }]);
  assert(answer.includes("S\nSource: T (https://e.com)"), "buildAnswer formats pi-web-access style");

  console.log(process.exitCode ? "\nSELFTEST FAILED" : "\nSELFTEST PASSED");
}

// Export pure helpers for unit tests.
export {
  loadRawConfig,
  resolveCredentialString,
  resolveCredentialFor,
  parseDomainFilter,
  passesDomainFilters,
  buildAnswer,
  normalizeCount,
  selectProviders,
  resolveMode,
  runSearch,
  runSearchParallel,
  fetchWithTinyFish,
  fetchWithFirecrawl,
  fetchWithJina,
  fetchContent,
  TOOL_SCHEMA,
  FETCH_SCHEMA,
};

// Only start the MCP loop when run directly (not when imported by tests).
// pathToFileURL normalizes non-ASCII paths (e.g. a Chinese directory name) so
// the comparison matches import.meta.url's percent-encoded form.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error(`[zcode-web-search] fatal: ${errorMessage(err)}`);
    process.exit(1);
  });
}
