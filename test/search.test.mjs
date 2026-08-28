// Unit tests for zcode-web-search pure logic (config, credentials, routing).
// Run with: node --test test/search.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveCredentialString,
  parseDomainFilter,
  passesDomainFilters,
  buildAnswer,
  selectProviders,
  resolveMode,
  normalizeCount,
  PROFILE_KEYS,
} from "../src/server.js";

// Temporarily hide profile-derived keys so hasCredential() only sees what the
// test puts in the config. Returns a restore function.
function hideProfileKeys() {
  const saved = new Map();
  for (const k of PROFILE_KEYS) {
    if (process.env[k] !== undefined) {
      saved.set(k, process.env[k]);
      delete process.env[k];
    }
  }
  return () => {
    for (const [k, v] of saved) process.env[k] = v;
  };
}

test("resolveCredentialString: $ENV from process env", async () => {
  const prev = process.env.TEST_ZWS;
  process.env.TEST_ZWS = "abc";
  try {
    assert.equal(await resolveCredentialString("$TEST_ZWS"), "abc");
    assert.equal(await resolveCredentialString("$MISSING_ZWS_XYZ"), null);
  } finally {
    if (prev === undefined) delete process.env.TEST_ZWS;
    else process.env.TEST_ZWS = prev;
  }
});

test("resolveCredentialString: plain and escapes", async () => {
  assert.equal(await resolveCredentialString("plain"), "plain");
  assert.equal(await resolveCredentialString("$$x"), "$x");
  assert.equal(await resolveCredentialString("$!x"), "!x");
});

test("normalizeCount: clamps 1..20", () => {
  assert.equal(normalizeCount(undefined), 5);
  assert.equal(normalizeCount(0), 1);
  assert.equal(normalizeCount(100), 20);
  assert.equal(normalizeCount(3.9), 3);
});

test("parseDomainFilter: normalize, include/exclude split", () => {
  const f = parseDomainFilter(["Example.com", "-bad.example", "docs.Example.org"]);
  assert.deepEqual([...f.include].sort(), ["docs.example.org", "example.com"]);
  assert.deepEqual(f.exclude, ["bad.example"]);
});

test("passesDomainFilters: allow/block by host suffix", () => {
  const f = parseDomainFilter(["example.com", "-bad.example"]);
  assert.equal(passesDomainFilters("https://docs.example.com/x", f), true);
  assert.equal(passesDomainFilters("https://example.com", f), true);
  assert.equal(passesDomainFilters("https://sub.bad.example/x", f), false);
  assert.equal(passesDomainFilters("https://other.org/x", f), false);
});

test("buildAnswer: pi-web-access style formatting", () => {
  const a = buildAnswer([{ title: "T", url: "https://e.com", snippet: "S" }]);
  assert.ok(a.includes("S\nSource: T (https://e.com)"));
});

test("selectProviders: no config -> sequential chain of credentialed + keyless extras", () => {
  const names = selectProviders(undefined, {});
  assert.ok(Array.isArray(names));
  // keyless extras: anysearch (anonymous) and duckduckgo (best-effort)
  assert.ok(names.includes("anysearch") && names.includes("duckduckgo"));
});

test("selectProviders: explicit provider first", () => {
  const names = selectProviders("tavily", {});
  assert.equal(names[0], "tavily");
});

test("selectProviders: mode=all keeps only credentialed providers (keyless is fallback, not fan-out)", () => {
  const names = selectProviders(undefined, { provider: "all" });
  assert.ok(!names.includes("duckduckgo"));
});

test("resolveMode: all/explicit/auto routing", () => {
  assert.equal(resolveMode(undefined, { provider: "all" }), "all");
  assert.equal(resolveMode("all", {}), "all");
  assert.equal(resolveMode(["exa", "tavily"], {}), "all");
  assert.equal(resolveMode("tavily", {}), "explicit");
  assert.equal(resolveMode(undefined, { provider: "tavily" }), "explicit");
  assert.equal(resolveMode(undefined, {}), "auto");
});

// Regression: the tool schema advertises provider "auto"/"all" as values.
// They are routing keywords and must resolve to a working provider list,
// never to an empty one (v0.2.1 bug: they fell through as provider names).
test("selectProviders: keyword 'auto'/'all' as tool arg never yields an empty list", () => {
  const restore = hideProfileKeys();
  try {
    const cfg = { tavilyApiKey: "fake", provider: "auto" };
    const byArgAll = selectProviders("all", { tavilyApiKey: "fake" });
    assert.deepEqual(byArgAll, ["tavily"]);
    assert.equal(resolveMode("all", { tavilyApiKey: "fake" }), "all");

    const byArgAuto = selectProviders("auto", { tavilyApiKey: "fake" });
    assert.equal(byArgAuto[0], "tavily");
    assert.equal(resolveMode("auto", { tavilyApiKey: "fake" }), "auto");

    const byCfgAuto = selectProviders(undefined, cfg);
    assert.equal(byCfgAuto[0], "tavily");
    assert.equal(resolveMode(undefined, cfg), "auto");
  } finally {
    restore();
  }
});
