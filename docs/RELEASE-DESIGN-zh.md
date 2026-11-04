# dsh-plugin-take 发布设计（2026-11-03）

## 1. 定位

把 take.hk 全站内容带进 DeepSeek Harness 的只读插件。目标用户：DeepSeek Harness
（桌面版/Web）用户，中文为主、兼顾英文；核心价值是「不用打开浏览器，Agent 就能搜全站、
读任意一篇、拿到当天日报」。

## 2. 现状（v0.4.0，已装进本机 desktop profile）

- 5 个工具：`take_latest` / `take_search` / `take_read` / `take_topics` / `take_links`。
- 数据源：站点静态快照 `data-1.txt … data-N.txt`（base64+gzip），15 分钟内存缓存；
  单页阅读优先走静态 HTML，`take_latest(daily)` 有 RSS 兜底。
- 只读、零依赖、`ctx.effect` 管理注册、展示元数据（locale/icon）齐备。
- 离线自检 51 项；本机真实站点 5 工具实测通过。

## 3. 三层架构

### 站点侧（take.hk，你方）

站点 `/agent?tab=api` 已宣传 v4.0.0 的 REST API 与 MCP，但线上地址实测 404，
插件暂时只能读静态快照。公开分发前建议上线：

1. `/api/v1/items`、`/api/v1/hot-topics`、`/api/v1/dailies/*`、`/api/v1/stories/*`
   （按已发布的文档实现，字段以 OpenAPI 为准）。
2. `/api/v1/search?q=`：服务端索引搜索（站点已有 index，成本低），替代插件下载 10 MB 自建索引。
3. `/api/v1/plugin/manifest`（或 `/plugin.json`）：返回快照版本 `v`、分片数、分片地址、
   建议缓存 TTL、限流策略——插件据此增量/按需取数，不必猜分片数。
4. `/api/mcp`：让支持远程 MCP 的客户端**零安装**接入（7 个官方工具）。
5. 缓存/限流：ETag、`Cache-Control`、按 IP 限流；快照建议 CDN 长缓存 + 版本号。

上线后插件切到 API-first（v0.5），首调从 ~6 秒 / 400 MB 降到毫秒级、KB 级流量。

### 插件侧

- 数据源优先级：官方 API → 静态快照 → RSS/静态页降级。
- `Config`：TTL、数据源模式、mutation 开关（先不做）。
- 保持：零运行时依赖、匿名只读、不写盘、不执行页面脚本。
- 兼容：DSH 仍是 developer preview；tools 用官方 `ToolDefinition`，注册用 `ctx.effect`，
  `engines.dsh` 暂不声明（避免误拦安装），在 README 标注实测版本。

### 分发侧

- **npm 包（主渠道）**：包名 `dsh-plugin-take`（2026-11-03 查询 npm 上尚未被占用）。
  用户安装：插件管理器粘贴 `dsh-plugin-take`，或 `dsh plugin add dsh-plugin-take`。
- **GitHub 仓库（源码/issue/README）**：用户也可用 git 规格安装
  （`dsh plugin add github:<账号>/dsh-plugin-take`），但 npm 包名更短更好装。
- **本地目录 `link:`**：开发/自用现状。
- **官方 catalog**：DSH 有官方 on-demand 目录（`list_bundles` 里带 `installTarget`），
  提交/入选规则以 DeepSeek 官方为准，作为 v1.0 的可选项。

## 4. 路线图

| 阶段 | 内容 | 依赖 |
| --- | --- | --- |
| v0.4（现在） | 发布就绪：LICENSE、CHANGELOG、英文 README、package 元数据、`take_read` 静态页快路径 | 无，本地完成 |
| v0.5 | API-first + Config + 英文文档完善 + 发布到 npm 小范围 | 你登录 npm（`npm login`）；可选站点 API |
| v1.0 | 公开放量 + GitHub 开源 + 官方 catalog 申请 + 可选 Harness 内可视化阅读页 | 站点 API/MCP 上线、限流方案 |

## 5. 公开前必须处理

1. **流量成本**：快照 10 MB/用户/15 分钟。小范围分享没问题；量起来前要么上 API/MCP，
   要么把默认数据源改成 RSS+静态页、搜索改为按需。
2. **内容合规**：只读、逐条给出原文链接与来源；站点 `/about` 已有免责声明。插件不缓存全文到磁盘。
3. **版本兼容**：DSH preview 改 API 时插件可能失效；需要 CI/冒烟测试与快速发版流程。
4. **安全**：不变（匿名 GET、不写盘、不执行脚本）；npm 发布开启 2FA。
5. **命名与署名**：npm 包名、作者署名/邮箱、GitHub 仓库地址、License（MIT）。

## 6. 需要你决定的事项

1. npm 包名：`dsh-plugin-take`（推荐，可立即占名）还是带 scope（如 `@take-hk/...`）。
2. 作者署名与联系邮箱、GitHub 账号/仓库名。
3. 站点 `/api/v1` 与 `/api/mcp` 代码是否在你手上、能否部署（决定 v0.5 的数据源切换速度）。
4. 是否需要 Harness 内的可视化阅读页（Client UI 页面，v1.0 可选项，工作量最大）。
5. 发布节奏：先小范围（npm + 群内试用）还是一步到位（GitHub + catalog）。

## 7. 验证清单（发布前）

- [x] `node scripts/smoke.mjs` 全过（51 项，离线）
- [x] 真实站点 5 工具调用通过（含今天的日报、搜索、全文、静态页兜底）
- [x] 安装/卸载/HMR 重载/重启持久化验证
- [x] npm 发布 `dsh-plugin-take@0.4.0`（2026-11-03，公开包，维护者 glider9999）
- [x] 在干净目录从 npm 安装一次（`npm install dsh-plugin-take@0.4.0` 通过，10 个文件、bundle patch 正常）
- [ ] README/英文 README/CHANGELOG 最终校对
