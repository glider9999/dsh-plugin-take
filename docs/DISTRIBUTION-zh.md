# 发布与推荐计划（2026-11-04）

## 一、现状

- **npm**：`dsh-plugin-take@0.4.0` 已公开发布（latest=0.4.0，维护者 `glider9999`）。
- **GitHub**：仓库尚未创建；本目录已初始化为本地 git 仓库并完成首次提交，只等 remote。
- 渠道核实（2026-11-04 实测，全部可达）：
  - GitHub 话题 `dsh-plugin`：https://github.com/topics/dsh-plugin ✔
  - 官方 Discussions「Show Your Plugins!」分类：https://github.com/deepseek-ai/deepseek-harness/discussions ✔
  - plugin.dshx.dev ✔ / dsh-plugin.github.io ✔ / bruc3van/awesome-dsh-plugin ✔

## 二、需要你先做（二选一）

**A（推荐）**：装 GitHub CLI 并登录一次（登录态留在本机，我不用碰 token）：

```bash
brew install gh
gh auth login
```

**B**：在 GitHub 网页新建空仓库 `dsh-plugin-take`（**不要**初始化 README / .gitignore），把仓库 URL 发我，并确认 GitHub 用户名（用于 package.json 的 repository 字段）。

## 三、授权后我会一次性完成

1. `git remote add origin …` + 推送 `main`。
2. 给仓库加话题与简介：
   ```bash
   gh repo edit --add-topic dsh-plugin \
     --add-topic deepseek-harness --add-topic take \
     --description "Search and read all of take.hk inside DeepSeek Harness — 1400+ AI-film news items, daily briefings, topic archives. Read-only DSH plugin." \
     --homepage "https://www.npmjs.com/package/dsh-plugin-take"
   ```
3. 更新 `package.json` 的 `repository` / `homepage` / `bugs`，README 里的 clone 地址，版本升到 `0.4.1`，`npm publish`（npm 页面同步新 README）。
4. 把 Discussions 发帖草稿整理好，你点“发布”即可（发帖必须用你的 GitHub 身份）。

## 四、文案草稿

### 4.1 Discussions 中文帖

**标题**：[Plugin] dsh-plugin-take — 在 DSH 里搜索/阅读整个 take.hk（AI 影像资讯与日报）

> 做了一个只读 DSH 插件，把 Take（take.hk，AI 影像创作者资源站）全站内容接进 Harness：
>
> - `take_latest`：最新 AI 影像日报（含当天，RSS 会滞后）或最新精选资讯
> - `take_search`：全站全文搜索（1400+ 精选、全部日报、30 个主题库）
> - `take_read`：读任意页面全文（URL / 路径 / id / 日期 / `today`）
> - `take_topics`：30 个主题归档库
> - `take_links`：站点主要入口
>
> 安装：插件管理器输入 `dsh-plugin-take`，或
> `dsh plugin --profile <你的profile> add dsh-plugin-take`
>
> 实测环境：DeepSeek Harness 0.2.1-rc.5（macOS 桌面版）。只读、匿名请求、不用 API Key、不写本地文件。首次调用会取一次约 10 MB 的站点快照并缓存 15 分钟。
>
> npm: https://www.npmjs.com/package/dsh-plugin-take
> 源码: <仓库地址>
>
> 欢迎试用反馈，尤其是不同 DSH 版本/平台上的兼容性。

### 4.2 Discussions English post

**Title**: [Plugin] dsh-plugin-take — search and read all of take.hk inside DeepSeek Harness

> A read-only DSH plugin that brings [take.hk](https://take.hk) (an AI-film creator resource site) into Harness:
>
> - `take_latest` — latest daily briefings (including today's; RSS lags) or latest selected news
> - `take_search` — full-text search across 1,400+ items, every daily briefing, and 30 topic archives
> - `take_read` — read any page as plain text (URL, path, item id, date, or `today`)
> - `take_topics` — the 30 topic archives
> - `take_links` — main site entry points
>
> Install: plugin manager → `dsh-plugin-take`, or
> `dsh plugin --profile <your-profile> add dsh-plugin-take`
>
> Tested on DeepSeek Harness 0.2.1-rc.5 (macOS desktop). Read-only, anonymous requests, no API key, no local writes. The first call downloads a ~10 MB site snapshot and caches it for 15 minutes.
>
> npm: https://www.npmjs.com/package/dsh-plugin-take
> Source: <repo>
>
> Feedback welcome, especially compatibility on other DSH versions/platforms.

### 4.3 awesome-dsh-plugin PR（加到 Plugins 列表）

```markdown
- [dsh-plugin-take](https://github.com/<owner>/dsh-plugin-take) — Search and read all of take.hk (AI-film news, daily briefings including today, topic archives) inside DeepSeek Harness. Read-only.
```

### 4.4 群聊/微信短介绍

> 做了个 DSH 插件 `dsh-plugin-take`：在 Harness 里直接搜/读 take.hk 全站——1400+ 精选资讯、每日 AI 影像日报（含当天）、30 个主题库。安装：插件管理器搜 `dsh-plugin-take`，或 `dsh plugin add dsh-plugin-take`。只读、不用 key。npm：https://www.npmjs.com/package/dsh-plugin-take ｜源码：<repo>。欢迎试用反馈。

## 五、检查清单（修正版）

- [x] npm 包已发布（0.4.0）
- [ ] GitHub 仓库公开（等授权/仓库 URL）
- [ ] 仓库话题 `dsh-plugin` 已加（授权后我执行）
- [x] README 有清晰一句话介绍 + 安装命令 + 兼容版本 + 实际输出示例
- [x] npm description / keywords 含 `dsh`、`deepseek-harness`、`dsh-plugin`
- [ ] npm 0.4.1（README 更新后发布）
- [ ] 官方 Discussions 发帖（你点发布）
- [ ] 社区目录：plugin.dshx.dev / dsh-plugin.github.io / awesome-dsh-plugin（先等 GitHub 仓库，多数自动抓话题或支持作者 PR）

## 六、两个常见坑

1. **`--profile web` 不是通用写法**：profile 名取决于用户环境（桌面版通常 `desktop`，Web 版通常 `web`）。README 里统一写 `<你的profile>` 更稳妥。
2. **`npm i dsh-plugin-take` 不会注册插件**：它只是把文件下载到当前目录；DSH 必须用插件管理器或 `dsh plugin add` 才会加载。
