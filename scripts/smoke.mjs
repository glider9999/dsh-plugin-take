// Smoke test for dsh-plugin-take 0.3.0. Run: node scripts/smoke.mjs
// Uses an in-memory snapshot fixture and a mock Cordis ctx — no network, no Harness.

import { readFileSync } from 'node:fs'

const NL = String.fromCharCode(10)
const mod = await import('../index.js')
const T = mod.tools

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
      '<button>原文</button></div>',
    ['/items/' + itemId]:
      '<div><!--TITLE:可灵 5.0 长镜头测试--><div>量子位 · 2026-11-03 09:00</div>' +
      '<div>AI 导读</div><div>可灵 5.0 支持 30 秒长镜头。</div><div>正文独有词：fixturebodytag</div><nav>菜单</nav></div>',
    '/topics/kling': '<div><!--TITLE:可灵 / Kling--><div>返回全部主题</div><div>量子位 · 2026-11-02</div></div>',
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
const truncated = T.formatRead('/items/' + itemId, site.pages['/items/' + itemId], 5)
check('read honours maxChars', truncated.includes('已截断') || truncated.length < readText.length)

// disk-cache serialization: a blob must revive into an equivalent site
const blob = JSON.parse(JSON.stringify(T.siteToCacheBlob(site)))
const revived = T.reviveSite(blob)
check('cache blob revives pages', revived && Object.keys(revived.pages).length === Object.keys(site.pages).length)
check('cache blob revives items', revived.items.length === site.items.length && revived.items[0].date === '2026-11-03 09:00')
check('cache blob revives dailies/topics', revived.dailies[0].date === '2026-11-03' && revived.topics.length === 1)
check('cache blob keeps latest daily', revived.latestDailyRoute === site.latestDailyRoute)
check('cache blob rejects wrong schema', T.reviveSite({ schema: 2, pages: site.pages }) === null)
check('todayLocal format', /^\d{4}-\d{2}-\d{2}$/.test(T.todayLocal()))
check('dataLine without stamp', T.dataLine(site) === '数据：take.hk 站点快照')
check('dataLine with stamp', T.dataLine({ stamp: '2026-11-03 20:07' }).includes('2026-11-03 20:07'))

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
check('version 0.5.0', manifest.version === '0.5.0')
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
