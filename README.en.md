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
| `take_latest` | Latest daily briefings (**including today's**) or latest selected news, with an optional `category` filter. `kind: daily \| news`, `limit` 1–20 |
| `take_search` | Full-text search across 1,400+ items, every daily briefing and the 30 topic archives; optional `category` filter |
| `take_read` | Read any page as text (URL, path, item id, date or `today`); news items also list their **original source links** |
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
for 15 minutes. It also keeps a compact gzip cache of that **public site content**
(about 2 MB) under the DSH cache directory, so a restart opens in well under a second.
Single-page reads prefer that page's static HTML (about 40 KB).
`take_latest(daily)` falls back to the public RSS feed if the snapshot is unavailable.

## Configuration (optional)

Add `config` to the `take-plugin` row in the profile's `cordis.patch.yml`:

```yaml
- id: take-plugin
  name: dsh-plugin-take
  config:
    diskCache: true      # cache public site content on disk (default true)
    ttlMinutes: 15       # in-memory cache lifetime, 1-1440 minutes (default 15)
```

For a strict no-write setup use `diskCache: false`: the plugin then only makes anonymous requests and writes nothing. Configuration is read at plugin load, so restart Harness after changing it.

## Safety

- Anonymous GETs to take.hk only (snapshot parts, one static page, RSS). No keys, no
  login, no user data.
- No local file access, no shell, no access to your data.
- The only local write is a cache of public site content
  (`~/.dsh/cache/dsh-plugin-take/snapshot-v1.json.gz`, about 2 MB, same-day, at most 6
  hours old, deletable at any time); it never contains user data. Override the directory
  with `DSH_PLUGIN_TAKE_CACHE_DIR`.
- Read-only text output; page scripts are never executed.

## Compatibility

- Tested on **DeepSeek Harness 0.2.1-rc.5** (macOS desktop) on 2026-11-03.
- Uses the documented `ToolDefinition` contract and `ctx.effect`; no private DSH APIs.
  Harness is still a developer preview, so this plugin will follow API changes.

## Limits

- **Cold start** (first call or expired cache): about 2.6 seconds, ~320 MB (streaming parser; no 70 MB buffer).
- **Warm start** (same-day cache after a Harness restart): about 0.05 seconds, ~106 MB;
  a background refresh picks up new items after the 15-minute in-memory TTL.
- If the snapshot is unavailable, `take_search` falls back to the public daily RSS feed
  instead of failing.
- Categories come from the site's own `?category=` listing pages and cover roughly the
  latest 120 items per category; older items have no category tag but stay searchable.
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
