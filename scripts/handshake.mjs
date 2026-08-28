// MCP stdio handshake test for zcode-web-search. Sends a scripted sequence of
// JSON-RPC messages on a timer and prints each response. Usage:
//   node scripts/handshake.mjs
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "..", "src", "server.js");

const server = spawn("node", [serverPath], { stdio: ["pipe", "pipe", "inherit"] });

const steps = [
  {
    label: "initialize",
    msg: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "handshake-test" } } },
  },
  {
    label: "notifications/initialized",
    msg: { jsonrpc: "2.0", method: "notifications/initialized" },
  },
  {
    label: "tools/list",
    msg: { jsonrpc: "2.0", id: 2, method: "tools/list" },
  },
  {
    label: "tools/call (web_search duckduckgo)",
    msg: { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "web_search", arguments: { query: "typeScript", numResults: 3, provider: "duckduckgo" } } },
  },
  {
    label: "ping",
    msg: { jsonrpc: "2.0", id: 4, method: "ping" },
  },
];

let buf = "";
const responses = [];

server.stdout.on("data", (d) => {
  buf += d.toString();
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      responses.push(JSON.parse(line));
    } catch {}
  }
});

server.on("exit", () => {
  for (const r of responses) {
    console.log("RECV:", JSON.stringify(r).slice(0, 500));
  }
  const ids = responses.map((r) => r.id).filter((x) => x !== undefined);
  const ok = ids.includes(1) && ids.includes(2) && ids.includes(3) && ids.includes(4);
  console.log(ok ? "\nHANDSHAKE PASSED (all 4 request ids responded)" : "\nHANDSHAKE FAILED");
  process.exit(ok ? 0 : 1);
});

let i = 0;
function next() {
  if (i >= steps.length) {
    // Give the server a beat to flush, then close.
    setTimeout(() => server.kill(), 300);
    return;
  }
  const step = steps[i];
  i += 1;
  console.log(`SEND [${step.label}]:`, JSON.stringify(step.msg).slice(0, 200));
  server.stdin.write(JSON.stringify(step.msg) + "\n");
  // Wait for a response before the next request (except the notification).
  setTimeout(next, step.msg.method === "notifications/initialized" ? 300 : 800);
}
next();

server.on("error", (e) => {
  console.error("spawn error:", e);
  process.exit(1);
});
