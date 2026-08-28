> 简体中文 | [English](README.en.md)

# zcode-web-search

给 ZCode 补两个 MCP 工具：`web_search`（联网搜索）和 `fetch_content`（网页正文抓取）。
装完不配任何 key 就能搜；想要更好的结果，配一个 key 就够。

![node](https://img.shields.io/badge/node-%E2%89%A518.17-339933)
![deps](https://img.shields.io/badge/%E8%BF%90%E8%A1%8C%E6%97%B6%E4%BE%9D%E8%B5%96-0-4c1)
![license](https://img.shields.io/badge/license-MIT-blue)

适合让编码代理自己去查最新文档、价格、版本号、新闻。PDF 解析、YouTube/视频理解、
GitHub 仓库克隆不在范围内，见[实现范围](#实现范围)。

配置格式兼容 [pi-web-access](https://github.com/nicobailon/pi-web-access)
（Pi 编程代理的同类插件）：如果你在用 pi，`~/.pi/web-search.json` 会被直接复用，
已配好的 key 在这里同样生效。

- [30 秒上手](#30-秒上手)
- [两个工具](#两个工具)
- [配置](#配置)
- [搜索源](#搜索源)
- [抓取链](#抓取链)
- [成本、隐私与安全](#成本隐私与安全)
- [故障排查](#故障排查)
- [开发](#开发)
- [实现范围](#实现范围)

## 30 秒上手

1. ZCode 里 **创建 → 添加插件市场**，输入 `anamaxlec/zcode-web-search`，安装。
2. 重启会话。此时不需要任何 API key，`web_search` 已经可用（走 AnySearch 匿名搜索兜底）。
3. 输入 `/web-search 最新的 Node.js LTS 版本` 验证——应返回几条带来源链接的结果。
4. 再试 `/fetch-page https://example.com`，验证正文抓取。

没看到结果？直接跳到[故障排查](#故障排查)。

## 两个工具

装好后得到：

- MCP 工具 `web_search` / `fetch_content`，命名空间 `plugin:zcode-web-search:web-search`；
- 斜杠命令 `/web-search [查询]`、`/fetch-page [url]`、`/web-search-status`（诊断配置）。

只需 PATH 里有 Node ≥18.17，不需要 `npm install`。

### web_search

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `query` | string | — | 单条查询。`query` 和 `queries` 二选一，都不给会报错 |
| `queries` | string[] | — | 批量查询。每条独立走一遍完整路由，批量 = 调用次数成倍增长 |
| `numResults` | int 1–20 | 5 | 每个查询返回几条 |
| `recencyFilter` | `day` / `week` / `month` / `year` | — | 限定时间窗口 |
| `domainFilter` | string[] | — | 限定域名，前缀 `-` 表示排除（如 `["-csdn.net"]`） |
| `provider` | string | `auto` | `auto`、`all` 或单个 provider 名，见[路由](#路由all--auto--单个-provider) |

两个参数的能力边界，用前知道：

- `recencyFilter`：Kagi、AnySearch、DuckDuckGo 会忽略它，其余走各家原生参数。
- `domainFilter`：AnySearch 不支持；Brave、Kagi、DuckDuckGo 是本地后过滤（搜索照常计费，
  结果事后被筛掉）；Exa、Tavily、Firecrawl、Perplexity、Serper、TinyFish 走服务端过滤。

返回内容是一段带引用的结果摘要（`snippet` + `Source: 标题 (URL)`）。Tavily 和 Perplexity
可能返回它们自己生成的答案而不是拼装结果。

### fetch_content

| 参数 | 类型 | 说明 |
|------|------|------|
| `url` | string | 单个 URL |
| `urls` | string[]，最多 10 | 批量 URL |
| `prompt` | string，可选 | 抽取意图提示，最多 2000 字符 |

`prompt` 只对 TinyFish Fetch 生效，Firecrawl 和 Jina 会忽略它。
每个 URL 的正文最多返回 50000 字符。

## 配置

### 该配哪个 key

只想要零成本可用：配一个 `TINYFISH_API_KEY`。TinyFish 搜索免费（30 次/分），
而且同一个 key 同时解锁 `fetch_content` 的第一层抓取，搜索和抓取都覆盖。

想提升结果质量再加第二个：Exa 或 Tavily 二选一，两者对技术类查询的召回都不错。
不需要把十个 key 全配齐。

### 配置文件位置

两个来源，按 key 逐条取优先，pi 配置赢：

**方式 A**：`~/.pi/web-search.json`（pi-web-access 默认位置，已在用 pi 就无需任何操作）。
也认 `$PI_CODING_AGENT_DIR` 和 `$XDG_CONFIG_HOME/pi`。

**方式 B**：把 `.zcode-web-search.json.example` 复制为 `~/.zcode-web-search.json`，填自己的 key。

```json
{
  "tinyfishApiKey": "$TINYFISH_API_KEY",
  "exaApiKey": "$EXA_API_KEY"
}
```

这份就够用——`provider` 字段不写就是 `auto`，推荐保持默认。
所有字段可选，下面是全集：

```json
{
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

### 凭证写法

四种，沿用 pi-web-access 的语法：

| 写法 | 含义 |
|------|------|
| `"sk-xxx"` | 明文 key |
| `"$EXA_API_KEY"` | 读环境变量。变量为空字符串时视为未配置 |
| `"!op read ..."` | 执行本地 shell 命令，取 stdout |
| `"$$..."` / `"$!..."` | 字面转义，分别是 `$...` 和 `!...` |

另外：单项 key 的取值顺序是环境变量 > 配置文件。即使配置文件里没写 `exaApiKey`，
只要进程里有 `EXA_API_KEY`，它照样生效。

key 写在 shell profile 里（如 `~/.zshrc`）而宿主进程没继承时，server 会从常见 profile
文件只读提取相关 `*_API_KEY`：只做正则扫描、从不执行文件，只填充当前未设置的键。

> 兼容说明：pi 配置里的 `workflow` 字段会被接受但不产生任何效果（pi 的 curator
> 摘要流程未实现）。

### 路由：all / auto / 单个 provider

优先级：工具参数 `provider` → 配置 `provider` 字段 → 默认 `auto`。
三种写法（配置或工具参数）行为一致：

```
provider: "all"     ──▶ 所有已配 key 的 provider 并发搜索 ──▶ 按 URL 去重合并，每条标注来源
                        全部失败时：AnySearch（匿名）→ DuckDuckGo → Exa MCP

provider: "auto"    ──▶ 已配 key 的 provider 按序串行，第一个有结果就停
                        ──▶ AnySearch（匿名，恒定在链尾）──▶ DuckDuckGo（尽力而为）

provider: "tavily"  ──▶ 只搜 tavily，失败就是失败，不再兜底
```

- **`auto`**（默认）：只串行尝试配了 key 的 provider，顺序 Exa → TinyFish → Tavily →
  Brave → Kagi → Firecrawl → AnySearch → Perplexity → Serper。链尾恒定追加 AnySearch
  （匿名可用、限速较严）和 DuckDuckGo（反爬拦截常见，尽力而为），所以零配置也能出结果。
- **`all`**：并发打所有配了 key 的 provider，DuckDuckGo 不参与并发、只做兜底。
  结果更全，但一次搜索同时消耗多个服务的额度，见[成本、隐私与安全](#成本隐私与安全)。
- **单个 provider**：只搜那一个，失败不兜底。显式指定 `provider: "exa"` 而未配 key 时，
  会走 Exa MCP 的免 key 路径；其他 provider 没配 key 会直接返回它自己的报错。

## 搜索源

| 搜索源 | 配置键 | 环境变量 | 端点 | 免费额度 |
|--------|--------|----------|------|----------|
| Exa | `exaApiKey` | `EXA_API_KEY` | `api.exa.ai/search`；无 key 走 `mcp.exa.ai` | keyless 路径免费；付费见官网 |
| TinyFish | `tinyfishApiKey` | `TINYFISH_API_KEY` | `api.search.tinyfish.ai` | 搜索免费（30 次/分） |
| Tavily | `tavilyApiKey` | `TAVILY_API_KEY` | `api.tavily.com/search` | 每月免费 credits |
| Brave | `braveApiKey` | `BRAVE_API_KEY` | `api.search.brave.com/res/v1/web/search` | 每月免费额度 |
| Kagi | `kagiApiKey` | `KAGI_API_KEY` | `kagi.com/api/v1/search` | 无，按量付费 |
| Firecrawl | `firecrawlApiKey` | `FIRECRAWL_API_KEY` | `api.firecrawl.dev/v1/search` | 订阅 credits |
| AnySearch | `anysearchApiKey` | `ANYSEARCH_API_KEY` | `api.anysearch.com/v1/search` | 匿名可用（限速严）；免费档 1000 次/天 |
| Perplexity | `perplexityApiKey` | `PERPLEXITY_API_KEY` | `api.perplexity.ai/chat/completions` | 无，按 token 计费 |
| Serper | `serperApiKey` | `SERPER_API_KEY` | `google.serper.dev/search` | 新号免费额度 |
| DuckDuckGo | — | — | `html.duckduckgo.com/html/` | 免费，但反爬拦截常见 |

价格与额度变化快，具体数字一律以各家官方定价页为准，这里不列。

两点值得知道：

- 除 DuckDuckGo 外，所有搜索源都要配 key 才会参与 `all` 并发。
- Exa 的免 key 路径有两个入口：显式 `provider: "exa"`，或 `all` 模式下并发全部失败后的
  第三顺位兜底。`auto` 模式下没配 key 时轮不到它。

`jinaApiKey` / `JINA_API_KEY` 不参与搜索，只用于 `fetch_content` 的 Jina Reader
（可选，提高速率限额）。

## 抓取链

按 URL 粒度逐层兜底，某个 URL 在上一层失败才落到下一层——一个页面被墙不会拖累同批的其他页面。

| 层 | 触发条件 | 端点 | 方式 |
|----|----------|------|------|
| 1 TinyFish Fetch | 已配 `tinyfishApiKey` | `api.fetch.tinyfish.ai` | 批量，一次最多 10 个 URL |
| 2 Firecrawl scrape | 已配 `firecrawlApiKey` | `api.firecrawl.dev/v1/scrape` | 逐 URL |
| 3 Jina Reader | 总是可用 | `r.jina.ai` | 逐 URL，免 key |

前两层都要 key。一个 key 都没配时，链路直接落到 Jina——能抓，但对反爬严格的站点成功率
明显低于前两层。想要抓取质量，配 `tinyfishApiKey` 是性价比最高的选择。

即便如此，抓取仍可能失败：站点反爬、登录墙、限流、网络问题，任何一层都拦得住。

抓取路径的单次请求上限是 90 秒（与搜索的 60 秒分开），批量 URL 叠加多层兜底时仍可能撞上
插件整体的 120 秒超时，表现为"抓到一半就没了"——把 `urls` 拆成小批再试。

## 成本、隐私与安全

- 本仓库不包含任何真实 API key。key 只从你本机的配置文件、环境变量或 shell profile 读取。
- `provider: "all"` 会把同一条查询同时发给每个已配 key 的 provider——一次搜索可能同时
  消耗多个服务的额度、产生多笔费用。`queries` 批量查询会把调用次数再乘一倍。
  想控成本就用默认的 `auto` 或显式指定单个 provider。
- `web_search` 会把查询文本发给实际选中的第三方搜索服务；`fetch_content` 会把 URL
  （以及可选的 `prompt` 提示）发给抓取服务（TinyFish / Firecrawl / Jina）。
- 配置里的 `"!command"` 语法会在本机执行 shell 命令来取 key。只应使用你完全信任的配置文件。
- 进程环境里的 key 优先级高于配置文件，所以插件会用它看得到的任何 `*_API_KEY`——包括
  shell profile 里扫出来的。不希望某个 key 被用掉，就别让它出现在环境里。
- 各第三方服务的日志、留存与隐私政策由其自身决定，不在本插件控制范围内。

## 故障排查

- **搜索全部失败**：先跑 `/web-search-status`——它会列出每个 provider 的 key 配置状态
  （含 `$ENV` 引用是否有值）、路由模式和自检结果。
- **某 provider 报 key not found**：`$ENV` 引用的变量未设置，或 profile 里的
  `export KEY=""` 是空值——填上真实 key。
- **DuckDuckGo 报 no parseable results**：DuckDuckGo 的反爬拦截，正常现象，换 AnySearch
  或配一个 key。
- **抓取返回空/半截**：大概率撞了超时，或站点需要登录。把 `urls` 拆小批重试。
- **改了插件代码不生效**：zcode 运行的是安装时的缓存副本
  （`~/.zcode/cli/plugins/cache/...`），需要把改动同步过去并重启会话。

## 开发

```bash
node src/server.js --selftest        # 纯逻辑自检（不联网）
node --test test/search.test.mjs     # 单元测试
node scripts/handshake.mjs           # MCP stdio 握手（会发一次真实搜索）
node scripts/sync-version.mjs        # 发版前同步四处版本号
```

发新版时跑 `node scripts/sync-version.mjs`（从 `package.json` 同步到
`marketplace.json`、`.zcode-plugin/plugin.json`、`src/server.js` 三处）——
更新检测对比这几处，不同步就不会提示更新。

## 实现范围

实现了 `web_search` 和 `fetch_content`（网页正文抓取）。

未实现：pi-web-access 的 curator 摘要流程（`workflow`）、GitHub 仓库克隆、YouTube/视频
理解、PDF 解析。依赖 Pi 登录态的路径（如复用 Codex 登录做 OpenAI 搜索）不适用于 ZCode，
故 OpenAI 搜索源未实现。

配置字段与凭证语法保持与 pi-web-access 兼容。

## 许可

MIT
