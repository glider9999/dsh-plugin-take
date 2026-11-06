# Take for DeepSeek Harness

[![npm version](https://img.shields.io/npm/v/dsh-plugin-take.svg)](https://www.npmjs.com/package/dsh-plugin-take)
[![license](https://img.shields.io/npm/l/dsh-plugin-take.svg)](./LICENSE)
![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.2.1--rc.5-blue)
![read-only](https://img.shields.io/badge/tools-read--only-brightgreen)

**在 DeepSeek Harness 里直接搜、读整个 take.hk**：1400+ 条 AI 影像精选资讯、每日 AI 影像日报（含今天）、30 个主题归档库。5 个只读工具，不用打开浏览器，不用 API Key。

## 安装

**方式一（推荐）**：Harness → 插件管理器 → 添加插件 → 输入 `dsh-plugin-take` → 安装 → 完全重启 Harness。

**方式二（命令行）**：

```bash
dsh plugin --profile <你的profile> add dsh-plugin-take
# 桌面版 profile 通常是 desktop，Web 版通常是 web
```

> 安装源是 npm 官方包：https://www.npmjs.com/package/dsh-plugin-take

## 能做什么

| 工具 | 用途 |
| --- | --- |
| `take_latest` | 最新 AI 影像日报（含**今天**）或最新精选资讯；资讯可加 `category` 筛分类。`kind: daily \| news`，`limit` 1–20 |
| `take_search` | 全站全文搜索：1400+ 精选资讯、全部日报、30 个主题库；可加 `category` 只搜某分类 |
| `take_read` | 读任意页面全文：take.hk URL、路径（`/daily/2026-11-03`、`/topics/google`、`/items/<id>`）、纯 id、日期或 `today`；条目会附**原文/来源链接** |
| `take_topics` | 列出 30 个主题归档库（专题） |
| `take_links` | 站点主要入口：首页/日报/热点/专题/案例/画布/Agent 接入页/RSS |

## 网页界面（v0.8.0 新增）

装好插件后，左侧栏「插件」分组里会多一个 **Take** 图标（需要刷新一次页面）。点开就是一个只读的 take.hk 浏览器：

- **日报 / 精选 / 专题** 三个标签页；
- 顶部搜索框，全站搜索；「精选」页还有 7 个分类筛选；
- 点任意条目在页内阅读全文，并可直接跳到 take.hk 原文；
- 数据走本地 `/take/api/*` 只读接口（公开站点快照），不跨域、不需要额外密钥。

页面只是同一份站点快照的另一种视图，和 Agent 用的 `take_*` 工具完全一致。

### 在 Harness 里实际长这样

```text
AI 影像日报 · 显示最新 2 期（共 15 期，最新 2026-11-03）

1. 2026-11-03 · AI 影像日报 2026-11-03：11 月 3 日 · 9 条动态
   快手公告：可灵 198.02 亿元增资交割完成，投后估值约 180 亿美元
   全文：take_read target=/daily/2026-11-03 ｜ https://take.hk/#/daily/2026-11-03
2. 2026-11-02 · AI 影像日报 2026-11-02：11 月 2 日 · 9 条动态
   高斯泼溅写实人物探索：自研游戏角色试制
   全文：take_read target=/daily/2026-11-02 ｜ https://take.hk/#/daily/2026-11-02
```

## 数据来源

take.hk 是静态快照站，整站内容生成在 `https://take.hk/data-1.txt … data-10.txt`。插件首次调用时取一次快照（约 10 MB）、在进程内解压成约 11 MB 纯文本并缓存 15 分钟；同时把**公开站点内容**压缩缓存到本地（约 2 MB），重启 Harness 后可直接复用，秒级打开。单页阅读优先走该页静态 HTML（约 40 KB）。日报在快照不可用时回退公开 RSS `https://take.hk/feed.xml`。

## 配置（可选）

在 profile 的 `cordis.patch.yml` 里给 `take-plugin` 行加 `config` 即可（不配则用默认值）：

```yaml
- id: take-plugin
  name: dsh-plugin-take
  config:
    diskCache: true          # 是否把公开站点快照缓存到本地（默认 true）
    ttlMinutes: 5            # 快照新鲜期，1–1440 分钟（默认 5，对齐撤稿窗口）
    maxOutputChars: 40000    # 单次工具输出上限（默认 40000，超出截断）
    requestTimeoutMs: 20000  # 单次请求超时（默认 20000）
```

严格「零写入」用法：`diskCache: false`，插件就只做匿名请求、不落盘。配置在插件加载时读取，改完需要重启 Harness 生效。

## 安全

- 只对 take.hk 发匿名 GET（快照分片、单页 HTML、RSS），不用密钥、不登录、不发送用户数据。
- 不读本地文件、不跑命令、不读你的任何数据。
- 唯一的本地写入是公开站点内容的缓存（`~/.dsh/cache/dsh-plugin-take/snapshot-v1.json.gz`，约 2 MB，当日有效、最多 6 小时、可随时删除）；不含任何用户数据。可用 `DSH_PLUGIN_TAKE_CACHE_DIR` 改缓存目录，或用配置项 `diskCache: false` 完全关闭。
- 工具全部只读，返回纯文本给模型读；不执行页面脚本。

## 兼容性

- 在 **DeepSeek Harness 0.2.1-rc.5**（macOS 桌面版）实测通过。
- 工具注册使用官方 `ToolDefinition` 与 `ctx.effect`，不依赖 DSH 私有 API；DSH 仍处 developer preview，若接口变动本插件会跟进发版。

## 性能与限制

- **冷启动**（第一次或缓存过期）：约 2.3 秒、内存约 350 MB（流式解析，不再整块解压 70 MB）。
- **热启动**（重启后命中本地缓存）：约 0.8 秒、内存约 170 MB；会先发一个 `If-Modified-Since` 条件请求，站点未更新则 **304 零流量续期**，更新了才重新拉取。
- 新鲜期默认 **5 分钟**（对齐站点撤稿窗口），并发调用共享同一个在途请求（单飞锁），不会重复下载。
- 快照不可用时，`take_search` 会自动回退到公开 RSS 的日报范围搜索，而不是直接失败。
- 分类来自站点自己的 `?category=` 列表页，覆盖各分类最近约 120 条；更早的条目没有分类标签（仍可正常搜索/阅读）。
- 快照随站点自身重建（一天多次），不是秒级实时；周报/月报站点尚未发布第一期。
- 搜索覆盖快照文本，正文里的外链需回原文查看。
- 升级用插件管理器或 `dsh plugin add dsh-plugin-take@latest`，卸载 `dsh plugin remove dsh-plugin-take`。

## 开发

```bash
git clone https://github.com/glider9999/dsh-plugin-take
cd dsh-plugin-take
node scripts/smoke.mjs        # 离线自检，不联网
# 本地调试安装：
dsh plugin --profile <profile> add "$(pwd)"
```

发布流程：改 `package.json` 的 `version` → `npm publish --access public`。

## 许可

MIT。内容与商标归 Take / take.hk 所有；资讯版权归各来源所有。
