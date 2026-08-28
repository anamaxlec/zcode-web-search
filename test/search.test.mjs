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
} from "../src/server.js";

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

test("selectProviders: no config -> sequential chain ends with keyless fallback", () => {
  const names = selectProviders(undefined, {});
  assert.ok(Array.isArray(names));
  assert.ok(names.includes("duckduckgo"));
  assert.equal(names[names.length - 1], "duckduckgo");
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
