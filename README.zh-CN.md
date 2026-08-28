> 🌐 English | [中文](README.zh-CN.md)

# zcode-web-search

一个 ZCode 插件，提供 `web_search` 和 `fetch_content` 两个 MCP 工具，模仿
Pi 编程代理的 [pi-web-access](https://github.com/nicobailon/pi-web-access)
插件。它直接复用同一份配置文件和凭证语法——如果你已经在用 pi-web-access，
在 ZCode 里**零额外配置**就能获得同一批搜索源；不用 pi 的用户也有独立的
配置文件可用。

## 功能

- **`web_search` 工具** — 支持单查询和批量查询、时效过滤、域名过滤，返回
  带来源引用的合成答案。配置 `provider: "all"` 时**并发**调用所有配了 key
  的搜索源再合并结果（与 pi-web-access 行为一致）；`auto` 模式走顺序回退链。
- **`fetch_content` 工具** — 一次抓取最多 10 个 URL，返回干净的 markdown
  正文。按 URL 粒度三级兜底：TinyFish Fetch（免费）→ Firecrawl scrape →
  Jina Reader（无需 key，所以抓取永远可用）。能读那些屏蔽普通 HTTP 客户端
  的页面（比如 Cloudflare 防护页）。
- **复用 pi-web-access 配置**（`~/.pi/web-search.json`），包括它的
  `$ENV` / `!command` 凭证解析规则。
- **零配置兜底** — 不配任何 key 也能用：keyless 的 Exa MCP 和 DuckDuckGo。
- **多个搜索源** — Exa、TinyFish、Tavily、Brave、Kagi、Firecrawl、
  AnySearch、Perplexity、Serper、DuckDuckGo。
- **零运行时依赖** — 单个 Node（>=18）ESM 文件，只用内置 `fetch`，无需
  `npm install`。

## 安装（ZCode）

### 从 GitHub 安装（推荐）

1. ZCode 里：**创建 → 添加插件市场** → 输入 `anamaxlec/zcode-web-search`
   （或粘贴仓库地址）。
2. 在市场列表里安装 `zcode-web-search`。
3. 重启会话。你会得到两个 MCP 工具：`web_search` 和 `fetch_content`
   （挂在 `plugin:zcode-web-search:web-search` 命名空间下）。

### 从本地目录安装

1. 把本目录复制（或软链）到任意位置。
2. ZCode：**Settings → Plugin Management → Discover** → 点 `+` → 添加该
   目录（里面带 `marketplace.json`）→ 安装 `zcode-web-search`。
3. 重启会话。

插件在 `.zcode-plugin/plugin.json` 里声明 MCP server
（`command: node`，`args: [${ZCODE_PLUGIN_ROOT}/src/server.js]`），
只需要 PATH 里有 Node >= 18，不用装任何依赖。

> 发新版注意：`marketplace.json` 和 `.zcode-plugin/plugin.json` 两处的
> `version` **都要改**——更新检测拿市场条目的版本和已安装清单的版本做
> 对比，不同步就不会提示更新。

## 配置

### 方式 A — 复用 pi-web-access 配置（在用 Pi 就选这个）

`~/.pi/web-search.json` 存在时会被自动使用（pi-web-access 的默认位置）。
配置支持 pi 的凭证语法：

```json
{
  "provider": "all",
  "workflow": "none",
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

凭证取值可以是：

- 明文 key 字符串；
- `"$ENV_NAME"` — 读环境变量 `ENV_NAME`；
- `"!command"` — 执行本地命令，stdout（去首尾空白）作为 key；
- `"$$..."` / `"$!..."` — 字面 `$` / `!` 转义。

### 方式 B — 独立配置（不用 pi 的用户）

把 `.zcode-web-search.json.example` 复制为 `~/.zcode-web-search.json`，
填上自己的 key。语法同上。

### 自动补全环境变量

如果你的 key 写在 shell 配置文件里（比如 `~/.zshrc`）而宿主进程没继承到，
server 会从常见 profile 文件（`~/.zshrc`、`~/.zshenv`、`~/.zprofile`、
`~/.profile`、`~/.bash_profile`、`~/.bashrc`）里只读提取相关 `*_API_KEY`
变量。只做正则扫描、**从不执行**这些文件，而且只填充当前未设置的键。

## 搜索源的路由与选择

优先级：工具参数 `provider` → 配置里的 `provider` 字段 → `auto`。

- **`all`**（并发）：所有配了 key 的搜索源**同时**发起搜索，结果按 URL
  去重合并，每条结果标注来源 provider；全部失败时回退 keyless 的
  DuckDuckGo / Exa MCP。
- **`auto`**（顺序回退）：按 Exa → TinyFish → Tavily → Brave → Kagi →
  Firecrawl → AnySearch → Perplexity → Serper 的顺序逐个尝试，keyless
  DuckDuckGo 殿后——所以零配置也能用。
- 显式指定单个 provider（如 `provider: "tavily"`）就只搜那一个。

| 搜索源 | 配置键 | 环境变量 | 端点 | 价格 |
|--------|--------|----------|------|------|
| Exa | `exaApiKey` | `EXA_API_KEY` | `api.exa.ai/search`（有 key）、`mcp.exa.ai`（无 key） | 有 key $7/1k；keyless 免费 |
| TinyFish | `tinyfishApiKey` | `TINYFISH_API_KEY` | `api.search.tinyfish.ai`（GET，`X-API-Key`） | **免费**（30 次/分钟） |
| Tavily | `tavilyApiKey` | `TAVILY_API_KEY` | `api.tavily.com/search` | 约 $8/1k（$0.008/credit） |
| Brave | `braveApiKey` | `BRAVE_API_KEY` | `api.search.brave.com/res/v1/web/search` | $5/1k |
| Kagi | `kagiApiKey` | `KAGI_API_KEY` | `kagi.com/api/v1/search` | $12/1k |
| Firecrawl | `firecrawlApiKey` | `FIRECRAWL_API_KEY` | `api.firecrawl.dev/v1/search` | 订阅 credits 制 |
| AnySearch | `anysearchApiKey` | `ANYSEARCH_API_KEY` | `api.anysearch.com/v1/search` | 免费档 1000 次/天 |
| Perplexity | `perplexityApiKey` | `PERPLEXITY_API_KEY` | `api.perplexity.ai/chat/completions` | token + 请求费 |
| Serper | `serperApiKey` | `SERPER_API_KEY` | `google.serper.dev/search` | $1/1k |
| DuckDuckGo | —（无 key） | — | `html.duckduckgo.com/html/` | 免费（有反爬风险） |

`jinaApiKey` / `JINA_API_KEY` 只用于 `fetch_content` 的 Jina Reader
（可选，提高速率限额）。

## 开发

```bash
# 纯逻辑自检（不联网）
node src/server.js --selftest

# 单元测试（node >= 18）
node --test test/search.test.mjs

# MCP stdio 握手（initialize / tools/list / tools/call / ping）
node scripts/handshake.mjs
```

## 与 pi-web-access 的差异

实现了 `web_search` 和 `fetch_content`（抓网页正文）。pi-web-access 还提供
GitHub 仓库克隆、YouTube/视频理解、PDF 解析等能力，这里暂未包含，需要的话
后续可以加。另外，依赖 Pi 登录态的路径（如 OpenAI/Codex 复用登录）不适用
于 ZCode，OpenAI 搜索源未实现。

## 许可

MIT
