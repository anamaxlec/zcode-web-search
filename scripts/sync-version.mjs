#!/usr/bin/env node
// Sync the version from package.json into the other places that carry it:
// .zcode-plugin/plugin.json, marketplace.json (plugins[0].version), and
// src/server.js (VERSION constant). Run before every release:
//   node scripts/sync-version.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf-8")).version;

const pluginPath = join(root, ".zcode-plugin", "plugin.json");
const plugin = JSON.parse(readFileSync(pluginPath, "utf-8"));
plugin.version = version;
writeFileSync(pluginPath, JSON.stringify(plugin, null, 2) + "\n");

const marketPath = join(root, "marketplace.json");
const market = JSON.parse(readFileSync(marketPath, "utf-8"));
market.plugins[0].version = version;
writeFileSync(marketPath, JSON.stringify(market, null, 2) + "\n");

const serverPath = join(root, "src", "server.js");
const src = readFileSync(serverPath, "utf-8");
const synced = src.replace(/const VERSION = "[^"]+";/, `const VERSION = "${version}";`);
if (synced === src) throw new Error("VERSION constant not found in src/server.js");
writeFileSync(serverPath, synced);

console.log(`synced version ${version} -> plugin.json, marketplace.json, src/server.js`);
