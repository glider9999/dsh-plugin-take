# Changelog

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
