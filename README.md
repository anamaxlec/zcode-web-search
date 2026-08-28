> 简体中文 | [English](README.en.md)

# zcode-web-search

ZCode 的联网搜索插件。`web_search` 搜索，`fetch_content` 抓网页正文。
不配 key 也能用（AnySearch 匿名搜索兜底）；配置格式兼容
[pi-web-access](https://github.com/nicobailon/pi-web-access)，在用 pi 的
无需任何配置，`~/.pi/web-search.json` 直接复用。

![node](https://img.shields.io/badge/node-%E2%89%A518.17-339933)
![deps](https://img.shields.io/badge/%E8%BF%90%E8%A1%8C%E6%97%B6%E4%BE%9D%E8%B5%96-0-4c1)
![license](https://img.shields.io/badge/license-MIT-blue)

- [安装](#安装)
- [工具](#工具)
- [配置](#配置)
- [路由](#路由)
- [搜索源](#搜索源)
- [抓取链](#抓取链)
- [费用与隐私](#费用与隐私)
- [排查](#排查)
- [开发](#开发)

## 安装

1. ZCode → **创建 → 添加插件市场** → 输入 `anamaxlec/zcode-web-search` → 安装。
2. 重启会话。
3. `/web-search 最新的 Node.js LTS 版本` 验证搜索，`/fetch-page https://example.com` 验证抓取。

搜索失败直接看[排查](#排查)。

## 工具

- MCP 工具：`web_search`、`fetch_content`（命名空间 `plugin:zcode-web-search:web-search`）
- 斜杠命令：`/web-search [查询]`、`/fetch-page [url]`、`/web-search-status`（诊断配置）

需要 PATH 里有 Node ≥18.17，无 npm 依赖。

### web_search 参数

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `query` | string | — | 单条查询。`query` / `queries` 二选一 |
| `queries` | string[] | — | 批量查询，每条独立走完整路由，调用次数成倍增长 |
| `numResults` | int 1–20 | 5 | 每条查询返回几条 |
| `recencyFilter` | `day` / `week` / `month` / `year` | — | 时间窗口 |
| `domainFilter` | string[] | — | 限定域名，`-` 前缀排除 |
| `provider` | string | `auto` | `auto` / `all` / 单个 provider 名，见[路由](#路由) |

不是所有源都支持过滤参数：

| | recencyFilter | domainFilter |
|---|---|---|
| 不支持 | Kagi、AnySearch、DuckDuckGo 忽略 | AnySearch |
| 本地事后过滤（搜索照常计费） | — | Brave、Kagi、DuckDuckGo |
| 服务端过滤 | Exa、Tavily、Firecrawl、Perplexity、Serper、TinyFish | 同左 |

返回带引用的结果摘要（`snippet` + `Source: 标题 (URL)`）；Tavily 和 Perplexity
可能返回它们自己生成的答案。

### fetch_content 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `url` | string | 单个 URL |
| `urls` | string[]，最多 10 | 批量 |
| `prompt` | string，可选 | 抽取意图提示，只对 TinyFish 生效 |

正文每个 URL 截断到 50000 字符。

## 配置

两个配置文件会同时读取并合并：同一个字段两边都写时，pi 配置的值生效；
只在一边写的字段照常生效。

- `~/.pi/web-search.json`（pi-web-access 默认位置，也认 `$PI_CODING_AGENT_DIR`、
  `$XDG_CONFIG_HOME/pi`）
- `~/.zcode-web-search.json`（复制 `.zcode-web-search.json.example` 改）

最小配置：

```json
{
  "tinyfishApiKey": "$TINYFISH_API_KEY",
  "exaApiKey": "$EXA_API_KEY"
}
```

TinyFish 搜索免费（30 次/分），同一个 key 也解锁 fetch_content 的第一层。
要更好的结果再加 Exa 或 Tavily 的 key。不写 `provider` 字段就是 `auto` 路由。
全部字段见 `.zcode-web-search.json.example`。

凭证写法（沿用 pi 语法）：

| 写法 | 含义 |
|------|------|
| `"sk-xxx"` | 明文 key |
| `"$EXA_API_KEY"` | 读环境变量，空字符串视为未配置 |
| `"!op read ..."` | 执行本地命令取 stdout |
| `"$$..."` / `"$!..."` | 字面转义 `$...` 和 `!...` |

取值顺序：环境变量 > 配置文件。key 写在 `~/.zshrc` 等 profile 里而宿主进程没继承时，
server 会只读扫描常见 profile 文件提取 `*_API_KEY`（正则匹配，不执行文件，只填未设置的键）。

> pi 配置里的 `workflow` 字段会被接受但无效果（curator 摘要流程未实现）。

## 路由

优先级：工具参数 `provider` → 配置 `provider` → 默认 `auto`。三种写法行为一致：

```
"all"      所有已配 key 的源并发搜索，结果按 URL 去重合并、标注来源
           全部失败时依次兜底：AnySearch（匿名）→ DuckDuckGo → Exa MCP

"auto"     已配 key 的源按序串行，第一个有结果就停：
           Exa → TinyFish → Tavily → Brave → Kagi → Firecrawl → AnySearch → Perplexity → Serper
           链尾恒定追加 AnySearch（匿名）和 DuckDuckGo（尽力而为），零配置也能出结果

"tavily"   只搜这一个，失败即返回失败
```

`all` 一次搜索消耗多个服务的额度，控成本用 `auto` 或指定单个源。
`all` 兜底链里的 Exa MCP 免 key 路径，也可以用 `provider: "exa"` 直接触发（未配 key 时）。

## 搜索源

| 源 | 配置键 | 环境变量 | 免费额度 |
|----|--------|----------|----------|
| Exa | `exaApiKey` | `EXA_API_KEY` | keyless 路径免费 |
| TinyFish | `tinyfishApiKey` | `TINYFISH_API_KEY` | 搜索免费（30 次/分） |
| Tavily | `tavilyApiKey` | `TAVILY_API_KEY` | 每月免费 credits |
| Brave | `braveApiKey` | `BRAVE_API_KEY` | 每月免费额度 |
| Kagi | `kagiApiKey` | `KAGI_API_KEY` | 无 |
| Firecrawl | `firecrawlApiKey` | `FIRECRAWL_API_KEY` | 订阅 credits |
| AnySearch | `anysearchApiKey` | `ANYSEARCH_API_KEY` | 匿名可用（限速）；免费档 1000 次/天 |
| Perplexity | `perplexityApiKey` | `PERPLEXITY_API_KEY` | 无 |
| Serper | `serperApiKey` | `SERPER_API_KEY` | 新号免费额度 |
| DuckDuckGo | — | — | 免费，反爬拦截常见 |

端点和定价见 `.zcode-web-search.json.example` 注释与各官网，具体价格不在此列。
除 DuckDuckGo 外都要配 key 才参与 `all` 并发。
`jinaApiKey` / `JINA_API_KEY` 只用于 fetch_content 的 Jina Reader（可选，提高限额）。

## 抓取链

按 URL 逐层兜底，单个 URL 失败不影响同批其他 URL：

| 层 | 条件 | 端点 | 方式 |
|----|------|------|------|
| 1 TinyFish Fetch | 已配 key | `api.fetch.tinyfish.ai` | 批量，最多 10 个 |
| 2 Firecrawl scrape | 已配 key | `api.firecrawl.dev/v1/scrape` | 逐 URL |
| 3 Jina Reader | 免 key | `r.jina.ai` | 逐 URL |

前两层要 key，都没配时直接落到 Jina——能用，但对反爬严的站点成功率低。
抓取可能因反爬、登录墙、限流、网络问题失败。抓取路径单请求上限 90 秒，
插件整体超时 120 秒，大批量撞限时把 `urls` 拆小。

## 费用与隐私

- 仓库不含任何真实 key，key 只从本机配置、环境变量或 profile 读取。
- `all` 把同一条查询同时发给每个已配 key 的源，一次搜索多笔费用；`queries` 再翻倍。
- `web_search` 发查询文本给选中的源；`fetch_content` 发 URL（和可选 `prompt`）给抓取服务。
- `"!command"` 会在本机执行 shell 命令，只用你信任的配置。
- 环境变量优先于配置文件——不想让某个 key 被用到，就别放进环境。
- 第三方的日志和隐私政策不在本插件控制范围内。

## 排查

- 搜索全挂：先跑 `/web-search-status`，看每个源的 key 状态和路由模式。
- key not found：`$ENV` 引用的变量没设，或 profile 里是空值 `export KEY=""`。
- DuckDuckGo 报 no parseable results：反爬拦截，换 AnySearch 或配 key。
- 抓取空/半截：撞了超时或站点要登录，`urls` 拆小批。
- 改代码不生效：zcode 跑的是安装缓存副本（`~/.zcode/cli/plugins/cache/...`），
  同步过去再重启会话。

## 开发

```bash
node src/server.js --selftest        # 自检，不联网
node --test test/search.test.mjs     # 单元测试
node scripts/handshake.mjs           # MCP 握手，会发一次真实搜索
node scripts/sync-version.mjs        # 发版前同步四处版本号
```

发版跑一次 `sync-version.mjs`，它会从 `package.json` 同步版本到
`marketplace.json`、`.zcode-plugin/plugin.json`、`src/server.js`——更新检测
对比这几处，不同步就不提示更新。

## 范围

未实现：curator 摘要（`workflow`）、GitHub 仓库克隆、YouTube/视频理解、PDF 解析、
OpenAI 搜索（依赖 Pi 登录态，ZCode 里不可用）。配置字段和凭证语法与 pi-web-access 兼容。

## 许可

MIT
