# Take for DeepSeek Harness

[![npm version](https://img.shields.io/npm/v/dsh-plugin-take.svg)](https://www.npmjs.com/package/dsh-plugin-take)
[![license](https://img.shields.io/npm/l/dsh-plugin-take.svg)](./LICENSE)
![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.2.1--rc.5-blue)
![read-only](https://img.shields.io/badge/tools-read--only-brightgreen)

**Search and read all of [take.hk](https://take.hk) inside DeepSeek Harness** — 1,400+ selected AI-film news items, daily briefings including today, and 30 topic archives. Five read-only tools, no browser, no API key.

## Install

**Option 1 (recommended):** Harness → Plugin manager → Add plugin → `dsh-plugin-take` → install → fully restart Harness.

**Option 2 (CLI):**

```bash
dsh plugin --profile <your-profile> add dsh-plugin-take
# the desktop profile is usually "desktop"; the Web profile is usually "web"
```

> Installed from npm: https://www.npmjs.com/package/dsh-plugin-take

## Tools

| Tool | What it does |
| --- | --- |
| `take_latest` | Latest daily briefings (**including today's**) or latest selected news. `kind: daily \| news`, `limit` 1–20 |
| `take_search` | Full-text search across 1,400+ items, every daily briefing and the 30 topic archives |
| `take_read` | Read any page as text: take.hk URL, path (`/daily/2026-11-03`, `/topics/google`, `/items/<id>`), bare item id, a date, or `today` |
| `take_topics` | List the 30 topic archives |
| `take_links` | Main entry points: home, daily, hot, topics, cases, canvas, Agent/API page, RSS |

### Example output in Harness

```text
AI 影像日报 · 显示最新 2 期（共 15 期，最新 2026-11-03）

1. 2026-11-03 · AI 影像日报 2026-11-03：11 月 3 日 · 9 条动态
   快手公告：可灵 198.02 亿元增资交割完成，投后估值约 180 亿美元
   全文：take_read target=/daily/2026-11-03 ｜ https://take.hk/#/daily/2026-11-03
```

## Data source

take.hk is a static-snapshot site: its whole content is generated into
`https://take.hk/data-1.txt … data-10.txt`. On first use the plugin downloads the
snapshot once (about 10 MB), decodes it in-process to ~11 MB of plain text and caches it
for 15 minutes. Single-page reads prefer that page's static HTML (about 40 KB).
`take_latest(daily)` falls back to the public RSS feed if the snapshot is unavailable.

## Safety

- Anonymous GETs to take.hk only (snapshot parts, one static page, RSS). No keys, no
  login, no user data.
- No local file access, no shell, no environment variables, no writes.
- Read-only text output; page scripts are never executed.

## Compatibility

- Tested on **DeepSeek Harness 0.2.1-rc.5** (macOS desktop) on 2026-11-03.
- Uses the documented `ToolDefinition` contract and `ctx.effect`; no private DSH APIs.
  Harness is still a developer preview, so this plugin will follow API changes.

## Limits

- First snapshot call takes a few seconds with ~400 MB peak memory; afterwards calls are
  millisecond-fast for 15 minutes.
- The snapshot follows the site's own rebuilds (several times a day), not real-time.
  Weekly/monthly reports are not published by the site yet.
- Search covers snapshot text; outbound links must be opened on take.hk.

## Development

```bash
git clone https://github.com/glider9999/dsh-plugin-take
cd dsh-plugin-take
node scripts/smoke.mjs        # offline smoke test
dsh plugin --profile <profile> add "$(pwd)"
```

Release: bump `version` in `package.json`, then `npm publish --access public`.

## License

MIT. Content and trademarks belong to Take / take.hk; news copyright belongs to the
original sources.
