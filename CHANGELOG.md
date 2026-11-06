# Changelog

## 0.12.0 — 2026-11-06

- **Share bar** on article and daily/topic readers: X (tweet intent), Facebook
  (sharer), system share via the Web Share API (mobile browsers can share to
  WeChat apps), and a WeChat/Moments helper dialog with copy-text/copy-link
  buttons (desktop browsers cannot post to Moments directly).
- Share text is a digest without a duplicated link; copy feedback uses the toast.

## 0.11.0 — 2026-11-06

- **Designed cover fallbacks**: items without an image now get a generated poster
  cover (category palette gradient + category glyph) instead of an empty block.
- **Bookmarks / read-later**: star any card or article, persisted in the browser
  (`localStorage`), with a "Saved" tab and unstar support.
- **Copy share text**: daily/topic readers copy a digest (title + top entries +
  link); article readers copy title + link, with a toast feedback.
- Inspired by the card-wall / one-tap-copy patterns of the 自媒体工作台 plugin.

## 0.10.0 — 2026-11-06

- **Structured daily & topic pages**: the snapshot parser now records which
  items a daily briefing or topic archive links to; `/take/api/read` returns
  them as structured `entries` (title, date, category, summary, cover, route).
  The reader renders them as entry cards with thumbnails, and clicking one
  opens that article — no more plain-text wall for daily/topic pages.
- Cache schema bumped for the new entry lists.

## 0.9.0 — 2026-11-06

- **Designed Take page**: magazine-style layout with a hero card for today's
  briefing, cover-card grids for news (thumbnails extracted from the site
  snapshot, gradient fallback), topic cards, staggered fade-in, hover lift,
  skeleton loading and a reading view with cover + source links.
- **Cover images in the API**: item pages now expose their first image
  (`og:image` or first `<img>`), carried through `/take/api/news`,
  `/take/api/search` and `/take/api/read`.
- Cache schema bumped so existing snapshots pick up the new image field.

## 0.8.0 — 2026-11-06

- **Web UI page**: the bundle now ships a browser half (`client.js`) that adds a
  **Take** entry to the left sidebar and a matching main panel: daily briefings,
  selected news with category filters, topic archives, full-text search and an
  in-page reader with source links.
- **Local read-only API**: the Host half registers `/take/api/{summary,daily,news,topics,search,read}`
  on the Web server; the page calls these same-origin routes, so no CORS and no
  extra keys. The API serves only public take.hk snapshot content.
- Bundle manifest: `dsh.client` (web, loaded immediately) and `./client` export added.

## 0.7.0 — 2026-11-04

- **Freshness aligned to 5 minutes**: `ttlMinutes` default is now 5 (was 15). When the cache
  is stale, one conditional `If-Modified-Since` request on the first snapshot part answers
  `304 Not Modified` (zero bytes) and simply extends the window; only a changed snapshot is
  re-downloaded. (The CDN hides ETag on gzip responses, so Last-Modified is used.)
- **Response compression**: snapshot requests ask for `br, gzip, deflate`, cutting the
  snapshot transfer from ~10 MB to ~7.4 MB.
- **Request timeout**: every request uses `AbortSignal.timeout` (`requestTimeoutMs`,
  default 20 s) combined with the tool's own signal.
- **Output ceiling**: `maxOutputChars` (default 40,000) caps every tool result, so a long
  page or a broad search can never blow up the conversation context. `take_read` also
  respects it for `maxChars`.
- Single-flight deduplication and disk cache were already present; they are unchanged.
- Graceful degradation: if a refresh fails, the last snapshot is served with a
  "(刷新失败，使用本地缓存)" note instead of failing the tool.

## 0.6.1 — 2026-11-04

- Fix: the 0.6.0 `export const Config` plain JSON-Schema object crashed activation
  (`TypeError: Cannot read properties of undefined (reading 'validate')` because the
  Loader expects a schemastery schema). The export is removed; the same keys
  (`diskCache`, `ttlMinutes`) are still read from the plugin row's `config` in
  `apply(ctx, config)` and documented in both READMEs.
- Configuration changes apply on the next plugin load (restart Harness).

## 0.6.0 — 2026-11-04

- **Streaming snapshot parser**: the 70 MB decompressed payload is parsed chunk by chunk
  (`zlib` gunzip stream + incremental JSON reader) instead of materializing it as one
  buffer. Cold start drops to about 2.6 s / 320 MB (was ~5 s / 420 MB); the byte-buffer
  parser stays as a fallback if the format ever changes.
- **Original source links**: `take_read` now appends up to 3 original links (X post,
  YouTube video, GitHub project, ...) for news items, with site/profile/share links
  filtered out.
- **Category filter**: items are mapped to the site's own categories (video-models,
  tools, works, industry, paper, tip, opinion) from its `?category=` listing pages;
  `take_latest` and `take_search` accept a `category` parameter and show labels.
- **Config**: `export const Config` exposes `diskCache` (default true) and `ttlMinutes`
  (default 15), so users can tune caching or switch to a strict no-write mode.

## 0.5.0 — 2026-11-04

Smoother for everyday use.

- **Disk cache across restarts**: the snapshot (public site content only) is stored as
  gzip JSON under the DSH cache directory (`~/.dsh/cache/dsh-plugin-take/`, overridable
  with `DSH_PLUGIN_TAKE_CACHE_DIR`). A same-day cache answers immediately after a restart
  and a background refresh still picks up new items; the cache expires after 6 hours and
  never contains user data.
- **RSS fallback for `take_search`**: if the snapshot is temporarily unavailable, the tool
  still returns matches from the public daily RSS feed instead of failing outright.
- **Data freshness line**: list/search outputs now say which site snapshot the answer came
  from (e.g. "数据：take.hk 站点快照，更新于 2026-11-03 20:07").

## 0.4.1 — 2026-11-04

Publishing and discovery polish.

- Added repository/homepage/bugs metadata pointing at
  https://github.com/glider9999/dsh-plugin-take, clone instructions in both READMEs.
- English README now leads with badges, install commands and compatibility
  (DeepSeek Harness 0.2.1-rc.5 tested); added an example output block.
- GitHub Actions workflow runs the offline smoke test on push and pull request.

## 0.4.0 — 2026-11-03

Publish-readiness release.

- `take_read` now serves a page from its static HTML page first when the snapshot
  is not loaded yet, so reading one article no longer downloads the whole 10 MB
  snapshot. Snapshot-only pages (items/topics/today) and the search still use it.
- Package metadata for public distribution: author, homepage, bugs, expanded
  keywords, `LICENSE`, English README, this changelog; `private` removed so the
  package can be published.
- No tool-surface change: `take_latest`, `take_search`, `take_read`,
  `take_topics`, `take_links`.

## 0.3.0 — 2026-11-03

Full-site reader.

- New data source: the site's own static snapshot
  (`https://take.hk/data-1.txt … data-10.txt`, rebuilt several times a day),
  decoded from base64+gzip in-process and converted to ~11 MB of plain text.
- New tools: `take_search` (full-text across 1,400+ selected items, all daily
  briefings and the 30 topic archives), `take_read` (any page, by URL/path/item
  id/date/`today`), `take_topics` (topic archives).
- `take_latest` gains `kind: daily | news`; the daily list now includes today's
  briefing, which the public RSS lags behind. RSS is kept as the fallback.
- 15-minute in-process cache; zero runtime dependencies; all registrations owned
  by `ctx.effect`.

## 0.2.0 — 2026-11-03

- Added bundle display metadata: `locale/en.json`, `locale/zh.json`, `icon.svg`,
  exported through `package.json`.
- Tool registration moved to `ctx.effect` so unload/HMR unregisters cleanly.
- Marked the read-only tools concurrency-safe, added `private` and `files`.

## 0.1.0 — 2026-11-03

- Initial local test version: `take_latest` (public RSS) and `take_links`.
