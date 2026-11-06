// Smoke test for dsh-plugin-take 0.10.0. Run: node scripts/smoke.mjs
// Uses an in-memory snapshot fixture and a mock Cordis ctx — no network, no Harness.

import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const NL = String.fromCharCode(10)
const mod = await import('../index.js')
const T = mod.tools
const initialSettings = { ...T.settings }

let checks = 0
function check(name, ok, detail) {
  checks++
  if (!ok) throw new Error('FAILED: ' + name + (detail ? ' — ' + detail : ''))
}

// ---------------------------------------------------------- snapshot fixture
const itemId = 'kling5test00000000000000'
const snapshot = {
  v: '2026-11-03 20:07',
  pages: {
    '/daily/2026-11-03':
      '<div><!--TITLE:AI 影像日报 2026-11-03：测试 3 条 · 云开 Take--><header>导航</header>' +
      '<div>当日动态</div><div>11 月 3 日 · 3 条动态</div><div>帧 X · @tester</div>' +
      '<div>可灵 5.0 发布：视频生成更快</div>' +
      '<div>截至 2026-11-03，快手宣布可灵 5.0 上线，支持 30 秒长镜头 &amp; 原生音频。</div>' +
      '<a href="#/items/' + itemId + '">相关报道</a>' +
      '<button>原文</button></div>',
    ['/items/' + itemId]:
      '<div><!--TITLE:可灵 5.0 长镜头测试--><div>量子位 · 2026-11-03 09:00</div>' +
      '<div>AI 导读</div><div>可灵 5.0 支持 30 秒长镜头。</div><div>正文独有词：fixturebodytag</div>' +
      '<img src="https://i.ytimg.com/vi/test/hqdefault.jpg" alt="cover">' +
      '<a href="https://x.com/tester/status/12345">看原视频</a>' +
      '<a href="https://www.youtube.com/watch?v=abc123">打开原文</a>' +
      '<a href="https://x.com/tester">X · @tester</a>' +
      '<nav>菜单</nav></div>',
    '/all?category=tools':
      '<div><!--TITLE:全部 AI 影像动态 · AI 影像工具--><a href="#/items/' + itemId + '">可灵 5.0 长镜头测试</a></div>',
    '/topics/kling': '<div><!--TITLE:可灵 / Kling--><a href="#/items/' + itemId + '">可灵 5.0 长镜头测试</a><div>返回全部主题</div><div>量子位 · 2026-11-02</div></div>',
    '/weekly': '<div><!--TITLE:AI 影像周报--><div>还没有发布 AI 影像周报</div></div>',
  },
  index: {
    [itemId]: { id: itemId, t: '可灵 5.0 长镜头测试', s: '可灵 5.0 支持 30 秒长镜头，原生音频。', src: '量子位' },
  },
}
const site = T.buildSiteFromBuffer(Buffer.from(JSON.stringify(snapshot)), {})

check('fast byte parser used', site.usedFastPath === true)
check('daily route detected', site.dailies.length === 1 && site.dailies[0].date === '2026-11-03')
check('latest daily points at today', site.latestDailyRoute === '/daily/2026-11-03')
check('item index joined with page', site.items.length === 1 && site.items[0].route === '/items/' + itemId)
check('item publish date extracted', site.items[0].date === '2026-11-03 09:00', site.items[0].date)
check('topic detected', site.topics.length === 1 && site.topics[0].route === '/topics/kling')
check('page title cleaned', site.pages['/daily/2026-11-03'].title === 'AI 影像日报 2026-11-03：测试 3 条', site.pages['/daily/2026-11-03'].title)
check('nav/header/button stripped', !/导航|菜单|原文/.test(site.pages['/daily/2026-11-03'].text))
check('entities decoded', site.pages['/daily/2026-11-03'].text.includes('长镜头 & 原生音频'))
check('item category extracted from listing page', site.items[0].category === 'tools', site.items[0].category)
check('source links extracted', site.pages['/items/' + itemId].links.includes('https://x.com/tester/status/12345'))
check('profile links filtered out', !site.pages['/items/' + itemId].links.includes('https://x.com/tester'))
check('non-source hosts kept', site.pages['/items/' + itemId].links.includes('https://www.youtube.com/watch?v=abc123'))

// search + format
const bodyHit = T.searchSite(site, 'fixturebodytag', 5)
check('search indexes item body text', bodyHit.length === 1 && bodyHit[0].route === '/items/' + itemId)
const hits = T.searchSite(site, '可灵 长镜头', 5)
check('search finds item and page', hits.length >= 2 && hits[0].matched === 2, 'hits=' + hits.length)
check('search ranks the item first', hits[0].route === '/items/' + itemId)
const searchText = T.formatSearch('可灵 长镜头', hits, site)
check('search output has read hint', searchText.includes('take_read target=/items/' + itemId))
check('news listing uses dates', T.formatNews(site, 3).includes('2026-11-03 09:00'))
check('daily listing has a digest line', T.formatDailies(site, 3).includes('可灵 5.0 发布'))
const readText = T.formatRead('/items/' + itemId, site.pages['/items/' + itemId], 100)
check('read output has title and body', readText.includes('可灵 5.0 长镜头测试') && readText.includes('30 秒长镜头'))
check('read output lists source links', readText.includes('原文/来源：') && readText.includes('https://x.com/tester/status/12345'))
check('news category filter keeps item', T.formatNews(site, 5, 'tools').includes('可灵 5.0 长镜头测试'))
check('news category filter drops other categories', T.formatNews(site, 5, 'industry').includes('暂时没有'))
check('search category filter', T.searchSite(site, '可灵', 5, 'tools').length >= 1 && T.searchSite(site, '可灵', 5, 'paper').length === 0)
check('category labels', T.categoryLabel('tools') === 'AI 影像工具' && T.normalizeCategory('AI 影像工具') === 'tools')
check('unknown category normalised empty', T.normalizeCategory('nope') === '')

// streaming parser must produce the same site as the buffer parser
const streamed = await T.buildSiteFromStream(gzipSync(Buffer.from(JSON.stringify({ pages: snapshot.pages, index: snapshot.index }))), {})
check('stream parser pages', Object.keys(streamed.pages).length === Object.keys(site.pages).length)
check('stream parser items/categories', streamed.items.length === 1 && streamed.items[0].category === 'tools')
check('stream parser links', streamed.pages['/items/' + itemId].links.length === 2)
check('stream parser dailies', streamed.dailies.length === 1 && streamed.latestDailyRoute === '/daily/2026-11-03')

// apply() accepts config values (configuration is parsed from the plugin row)
const configCtx = { effect(run) { run() }, tools: { register() { return () => {} } } }
mod.apply(configCtx, { diskCache: false, ttlMinutes: 30 })
check('apply accepts config object', true)
const truncated = T.formatRead('/items/' + itemId, site.pages['/items/' + itemId], 5)
check('read honours maxChars', truncated.includes('已截断') || truncated.length < readText.length)

// disk-cache serialization: a blob must revive into an equivalent site
const blob = JSON.parse(JSON.stringify(T.siteToCacheBlob(site)))
const revived = T.reviveSite(blob)
check('cache blob revives pages', revived && Object.keys(revived.pages).length === Object.keys(site.pages).length)
check('cache blob revives items', revived.items.length === site.items.length && revived.items[0].date === '2026-11-03 09:00')
check('cache blob revives dailies/topics', revived.dailies[0].date === '2026-11-03' && revived.topics.length === 1)
check('cache blob keeps latest daily', revived.latestDailyRoute === site.latestDailyRoute)
check('cache blob rejects old schema', T.reviveSite({ schema: 1, pages: site.pages }) === null)
check('todayLocal format', /^\d{4}-\d{2}-\d{2}$/.test(T.todayLocal()))
check('dataLine without stamp', T.dataLine(site) === '数据：take.hk 站点快照')
check('dataLine with stamp', T.dataLine({ stamp: '2026-11-03 20:07' }).includes('2026-11-03 20:07'))
check('cache blob keeps etag field', 'etag' in T.siteToCacheBlob(site))
check('default ttl is 5 minutes', initialSettings.ttlMinutes === 5)
check('default output cap is 40000', initialSettings.maxOutputChars === 40000)
const oldCap = T.settings.maxOutputChars
T.settings.maxOutputChars = 1000
check('capOutput truncates', T.capOutput('x'.repeat(5000)).includes('输出已截断'))
T.settings.maxOutputChars = oldCap
check('capOutput passes short text', T.capOutput('ok') === 'ok')

// Web UI API payload builders
const newsApi = T.apiNewsPayload(site, 10, '')
check('api news payload', newsApi.items.length === 1 && newsApi.items[0].url.includes('take.hk'))
check('api news carries cover image', newsApi.items[0].image === 'https://i.ytimg.com/vi/test/hqdefault.jpg')
check('extractImage fallback empty', T.extractImage('<div>no image</div>') === '')
const newsFiltered = T.apiNewsPayload(site, 10, 'tools')
check('api news category filter', newsFiltered.items.length === 1 && newsFiltered.items[0].categoryLabel === 'AI 影像工具')
const dailyApi = T.apiDailyPayload(site, 5)
check('api daily payload', dailyApi.dailies.length === 1 && dailyApi.dailies[0].date === '2026-11-03')
const searchApi = T.apiSearchPayload(site, '可灵', 5, 'tools')
check('api search payload', searchApi.results.length >= 1 && searchApi.results[0].route.startsWith('/items/'))
const topicsApi = T.apiTopicsPayload(site)
check('api topics payload', topicsApi.topics.length === 1 && topicsApi.topics[0].route === '/topics/kling')
check('daily page exposes structured entries', Array.isArray(site.pages['/daily/2026-11-03'].items) && site.pages['/daily/2026-11-03'].items.includes(itemId))
check('topic page exposes structured entries', Array.isArray(site.pages['/topics/kling'].items) && site.pages['/topics/kling'].items.includes(itemId))
const pkgJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
check('client module exists', pkgJson.exports['./client'] === './client.js' && pkgJson.dsh.client.platform === 'web')

// route normalisation
check('today shortcut', T.normalizeRoute('today') === '/today')
check('date shortcut', T.normalizeRoute('2026-11-03') === '/daily/2026-11-03')
check('bare item id', T.normalizeRoute(itemId) === '/items/' + itemId)
check('trailing slash', T.normalizeRoute('/daily/2026-11-03/') === '/daily/2026-11-03')
check('full URL', T.normalizeRoute('https://take.hk/topics/kling') === '/topics/kling')
check('hash URL', T.normalizeRoute('https://take.hk/#/items/' + itemId) === '/items/' + itemId)
check('clampInt default', T.clampInt(undefined, 8, 1, 20) === 8)
check('clampInt upper bound', T.clampInt(99, 8, 1, 20) === 20)

// ----------------------------------------------------------- registration
const registered = []
const cleanups = []
const ctx = {
  effect(run) {
    const cleanup = run()
    cleanups.push(cleanup)
    return () => { if (typeof cleanup === 'function') cleanup() }
  },
  tools: {
    register(def) {
      registered.push(def)
      return () => {
        const at = registered.indexOf(def)
        if (at >= 0) registered.splice(at, 1)
      }
    },
  },
}
mod.apply(ctx)
const names = registered.map((def) => def.name)
check('five tools registered', names.join(',') === 'take_latest,take_search,take_read,take_topics,take_links', names.join(','))
for (const def of registered) {
  check(def.name + ' description', typeof def.description === 'string' && def.description.length > 40)
  check(def.name + ' parameters root', def.parameters && def.parameters.type === 'object')
  const rendered = def.output.render({}, 'sample')
  check(def.name + ' output.render', Array.isArray(rendered) && rendered[0].type === 'text' && rendered[0].text === 'sample')
}
check('registrations owned by ctx.effect', cleanups.length === 5 && cleanups.every((fn) => typeof fn === 'function'))
for (const cleanup of cleanups) cleanup()
check('unmount unregisters tools', registered.length === 0)

// ------------------------------------------------------- manifest/resources
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
check('version 0.10.0', manifest.version === '0.10.0')
check('dsh bundle patch', manifest.dsh && manifest.dsh.bundle && manifest.dsh.bundle.patch === './cordis.patch.yml')
check('exports locale+icon', manifest.exports['./locale/*.json'] && manifest.exports['./icon'])
for (const file of ['locale/en.json', 'locale/zh.json']) {
  const meta = JSON.parse(readFileSync(new URL('../' + file, import.meta.url), 'utf8')).meta
  check(file + ' title', typeof meta.title === 'string' && meta.title.length > 0)
  check(file + ' description', typeof meta.description === 'string' && meta.description.length > 20)
}
const icon = readFileSync(new URL('../icon.svg', import.meta.url), 'utf8')
check('icon is svg', icon.includes('<svg') && icon.includes('</svg>'))
const license = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8')
check('license is MIT', license.includes('MIT License'))
check('english readme exists', readFileSync(new URL('../README.en.md', import.meta.url), 'utf8').length > 500)
check('changelog exists', readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').includes('0.4.0'))
check('publishable (private removed)', manifest.private !== true)

console.log('SMOKE PASS: ' + checks + ' checks — snapshot parse, search, read, routing, 5 tools, clean unmount.')
