> 简体中文 | [English](README.en.md)

# zcode-web-search

ZCode 插件，提供 `web_search`（联网搜索）和 `fetch_content`（网页正文抓取）
两个 MCP 工具。配置写法兼容 [pi-web-access](https://github.com/nicobailon/pi-web-access)
（Pi 编程代理的同类插件）：如果你在用 pi，`~/.pi/web-search.json` 会被直接
复用，已配好的 key 在这里同样生效。

## 快速开始（3 分钟）

1. ZCode 里 **创建 → 添加插件市场**，输入 `anamaxlec/zcode-web-search`，安装。
2. 重启会话。此时不需要任何 API key，`web_search` 已经可用（走 AnySearch
   匿名搜索兜底）。
3. 输入 `/web-search 最新的 Node.js LTS 版本` 验证——应返回几条带来源链接
   的结果。

没看到结果？跳到下面的[故障排查](#故障排查)。

## 安全、隐私与费用

- 本仓库**不包含任何真实 API key**。key 只从你本机的配置文件、环境变量或
  shell profile 读取。
- `web_search` 会把**查询文本**发送给实际选中的第三方搜索服务；配置
  `provider: "all"` 时会把查询**同时发给每个已配置的 provider**——一次搜索
  可能同时消耗多个服务的额度、产生多笔费用，批量查询（`queries`）会进一步
  放大调用次数。想控制成本，用 `auto` 或显式指定单个 provider。
- `fetch_content` 会把 **URL**（以及可选的 `prompt` 提示）发送给抓取服务
  （TinyFish / Firecrawl / Jina）。
- 配置里的 `"!command"` 语法会在**本机执行 shell 命令**来取 key，只应使用
  你完全信任的配置文件。
- 各第三方服务的日志、留存与隐私政策由其自身决定，不在本插件控制范围内。

## 安装

**从 GitHub（推荐）**：ZCode → 创建 → 添加插件市场 → 输入
`anamaxlec/zcode-web-search` → 安装 → 重启会话。

**从本地目录**：复制或软链本目录 → Settings → Plugin Management →
Discover → 点 `+` 添加该目录（内含 `marketplace.json`）→ 安装 → 重启会话。

装好后会得到：

- MCP 工具 `web_search` 和 `fetch_content`（命名空间
  `plugin:zcode-web-search:web-search`）；
- 斜杠命令 `/web-search [查询]`、`/fetch-page [url]`、
  `/web-search-status`（诊断配置）。

只需 PATH 里有 Node ≥ 18，无需 `npm install`。

> 发新版注意：`marketplace.json` 和 `.zcode-plugin/plugin.json` 两处的
> `version` **都要改**——更新检测对比这两处，不同步就不会提示更新。

## 配置

不配置也能用（AnySearch 匿名兜底），但配一个 key 通常能显著提升质量和
速率。两种方式，按 key 逐条取优先（pi 配置优先）：

**方式 A**：`~/.pi/web-search.json`（pi-web-access 默认位置，已在用 pi
就无需任何操作）。

**方式 B**：把 `.zcode-web-search.json.example` 复制为
`~/.zcode-web-search.json`，填自己的 key。

```json
{
  "provider": "all",
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

凭证取值支持：明文 key、`"$ENV_NAME"`（读环境变量）、`"!command"`（执行
本地命令取 stdout）、`"$$..."` / `"$!..."`（字面转义）。

key 写在 shell profile 里（如 `~/.zshrc`）而宿主进程没继承时，server 会
从常见 profile 文件**只读提取**相关 `*_API_KEY`（只做正则扫描、从不执行
文件，只填充当前未设置的键）。

> `provider: "all"` 会并发调用所有已配置 provider——见上方费用提示。
> 兼容说明：pi 配置里的 `workflow` 字段会被接受但**不产生任何效果**
> （pi 的 curator 摘要流程未实现）。

## 搜索源与路由

优先级：工具参数 `provider` → 配置 `provider` 字段 → `auto`。

- **`all`**：并发调用**每个已配置 key 的** provider，结果按 URL 去重合并
  并标注来源；全部失败时依次尝试 AnySearch（匿名）→ DuckDuckGo → Exa MCP。
- **`auto`**（未做任何配置时的默认）：按 Exa → TinyFish → Tavily → Brave →
  Kagi → Firecrawl → AnySearch → Perplexity → Serper 的顺序，**只试配了
  key 的**；一个 key 都没有时，用 AnySearch 匿名搜索兜底（实测可用，限速
  较严），DuckDuckGo 作尽力而为的补充。
- **显式单个 provider**（如 `provider: "tavily"`）：只搜那一个。显式指定
  `provider: "exa"` 而未配 key 时，会走 Exa MCP 的免 key 路径。

| 搜索源 | 配置键 | 端点 | 免费额度 |
|--------|--------|------|----------|
| Exa | `exaApiKey` | `api.exa.ai/search`；无 key 走 `mcp.exa.ai` | keyless 路径免费；付费以官方页为准 |
| TinyFish | `tinyfishApiKey` | `api.search.tinyfish.ai`（GET，`X-API-Key`） | 搜索免费（30 次/分） |
| Tavily | `tavilyApiKey` | `api.tavily.com/search` | 每月免费 credits |
| Brave | `braveApiKey` | `api.search.brave.com/res/v1/web/search` | 每月免费额度 |
| Kagi | `kagiApiKey` | `kagi.com/api/v1/search` | 无（按量付费） |
| Firecrawl | `firecrawlApiKey` | `api.firecrawl.dev` | 订阅 credits |
| AnySearch | `anysearchApiKey` | `api.anysearch.com/v1/search` | 匿名可用（限速）；免费档 1000 次/天 |
| Perplexity | `perplexityApiKey` | `api.perplexity.ai/chat/completions` | 无（token 计费） |
| Serper | `serperApiKey` | `google.serper.dev/search` | 新号免费额度 |
| DuckDuckGo | —（无 key） | `html.duckduckgo.com/html/` | 免费，但反爬拦截常见 |

价格与额度以各 provider 官方定价页为准，此处不再列具体数字以免过时。

`jinaApiKey` / `JINA_API_KEY` 仅用于 `fetch_content` 的 Jina Reader
（可选，提高速率限额）。

### fetch_content 的抓取链

按 URL 粒度依次兜底：**TinyFish Fetch（免费）→ Firecrawl scrape →
Jina Reader（免 key）**。某个 URL 在上一层失败才落到下一层；Jina 无需
key，所以抓取链始终有可用出口——但仍可能因限流、站点反爬策略、登录要求
或网络问题而失败。

## 故障排查

- **搜索全部失败**：先跑 `/web-search-status`——它会列出每个 provider 的
  key 配置状态（含 `$ENV` 引用是否有值）、路由模式和自检结果。
- **某 provider 报 key not found**：`$ENV` 引用的变量未设置，或 profile
  里的 `export KEY=""` 是空值——填上真实 key。
- **DuckDuckGo 报 no parseable results**：DuckDuckGo 的反爬拦截，正常
  现象，换 AnySearch 或配一个 key。
- **改了插件代码不生效**：zcode 运行的是安装时的缓存副本
  （`~/.zcode/cli/plugins/cache/...`），需要把改动同步过去并重启会话。

## 开发

```bash
node src/server.js --selftest        # 纯逻辑自检（不联网）
node --test test/search.test.mjs     # 单元测试
node scripts/handshake.mjs           # MCP stdio 握手（会发一次真实搜索）
```

## 与 pi-web-access 的差异

实现了 `web_search` 和 `fetch_content`（网页正文抓取）。pi-web-access 的
curator 摘要流程（`workflow`）、GitHub 仓库克隆、YouTube/视频理解、PDF
解析未实现；依赖 Pi 登录态的路径（如复用 Codex 登录做 OpenAI 搜索）不适用
于 ZCode，故 OpenAI 搜索源未实现。配置字段与凭证语法保持兼容。

## 许可

MIT
