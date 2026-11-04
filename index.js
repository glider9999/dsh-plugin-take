// dsh-plugin-take 0.5.0 — read all of Take (take.hk) inside DeepSeek Harness.
//
// Data source (read-only, no key, no account):
// - take.hk is a static snapshot site. Its pages are generated into
//   https://take.hk/data-1.txt ... data-N.txt: one JSON object with
//   { v, data, wf, titles }, where `data` is base64(gzip(JSON of
//   { pages: {route: rendered html}, index: {itemId: {t, s, src}} })).
//   The snapshot is rebuilt several times a day and contains the whole
//   public site: 1400+ selected items, daily briefings (including today's),
//   30 topic archives and the site's own pages.
// - The public RSS feed https://take.hk/feed.xml is kept as a fallback for
//   take_latest(daily) if the snapshot cannot be loaded.
// Safety: only anonymous GETs to take.hk. The only local writes are a compact
// cache of public site content under the DSH cache directory (same-day, at most
// 6 hours old, deletable at any time; no user data). Everything returned is
// text for the model to read.
//
// Tools are registered as raw Host ToolDefinitions (name/description/
// parameters/output.render/timeoutMs/execute) and owned by ctx.effect so
// unloading the plugin unregisters them.

import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { createGunzip, gunzipSync, gzipSync } from 'node:zlib'

export const name = 'take-plugin'
export const inject = ['tools']

const SITE = 'https://take.hk'
const FEED_URL = SITE + '/feed.xml'
const UA = 'dsh-plugin-take/0.6.0'
const CACHE_SCHEMA = 2
const DISK_CACHE_TTL_MS = 6 * 60 * 60 * 1000
const CACHE_DIR = process.env.DSH_PLUGIN_TAKE_CACHE_DIR ||
  join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'cache', 'dsh-plugin-take')
const CACHE_FILE = join(CACHE_DIR, 'snapshot-v1.json.gz')
const MAX_PARTS = 30
const NL = String.fromCharCode(10)

// Runtime settings, filled from the plugin row's `config` (see Config below).
const settings = { diskCache: true, ttlMinutes: 15 }

function memoryTtlMs() {
  return settings.ttlMinutes * 60 * 1000
}

// Configuration is read from the plugin row's `config` in apply(ctx, config);
// exporting a plain JSON-Schema `Config` object is not supported by the Loader
// (it expects a schemastery schema), so the accepted keys are documented instead.


// The site's own ?category= listing pages define these categories.
const CATEGORIES = [
  { slug: 'video-models', label: 'AI 视频模型' },
  { slug: 'tools', label: 'AI 影像工具' },
  { slug: 'works', label: 'AI 作品与案例' },
  { slug: 'industry', label: '影视与 AI 行业' },
  { slug: 'paper', label: '研究' },
  { slug: 'tip', label: '教程' },
  { slug: 'opinion', label: '观点' },
]

const CATEGORY_LABELS = {}
for (const category of CATEGORIES) CATEGORY_LABELS[category.slug] = category.label

function categoryLabel(slug) {
  return CATEGORY_LABELS[String(slug || '').trim()] || ''
}

function normalizeCategory(raw) {
  const value = String(raw || '').trim().toLowerCase()
  if (!value) return ''
  if (CATEGORY_LABELS[value]) return value
  for (const category of CATEGORIES) {
    if (category.label.toLowerCase() === value) return category.slug
  }
  return ''
}

// ---------------------------------------------------------------- text utils

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', hellip: '…', mdash: '—', ndash: '–' }

function decodeEntities(raw) {
  return String(raw || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const cp = Number.parseInt(hex, 16)
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : _
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const cp = Number(dec)
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : _
    })
    .replace(/&([a-z]+);/gi, (whole, name) => Object.prototype.hasOwnProperty.call(NAMED, name) ? NAMED[name] : whole)
}

function collapse(text) {
  return String(text || '')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

// Rendered page HTML -> readable plain text. The site's docs, nav, sidebars and
// action buttons are removed so the result reads like an article.
function htmlToText(html) {
  let text = String(html || '')
  text = text.replace(/<!--[\s\S]*?-->/g, ' ')
  text = text.replace(/<(script|style|svg|noscript|template)[\s\S]*?<\/\1>/gi, ' ')
  text = text.replace(/<(nav|aside|header|footer|button|form|select|textarea|dialog)[\s\S]*?<\/\1>/gi, ' ')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<\/(p|div|li|ul|ol|h[1-6]|tr|section|article|blockquote|pre|table|figcaption)>/gi, '\n')
  text = text.replace(/<[^>]+>/g, ' ')
  return collapse(decodeEntities(text))
}

function cleanTitle(raw) {
  return collapse(String(raw || ''))
    .replace(/\s*·\s*云开\s*Take\s*$/, '')
    .replace(/\s*·\s*Take\s*$/, '')
    .trim()
}

function pageTitle(html) {
  const marker = String(html || '').match(/<!--TITLE:([\s\S]*?)-->/)
  if (marker) return cleanTitle(marker[1])
  const tag = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return tag ? cleanTitle(tag[1]) : ''
}

function extractDate(text) {
  const hit = String(text || '').match(/20\d{2}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?/)
  return hit ? hit[0] : ''
}

// External source links (original X post, YouTube video, GitHub project, ...)
// extracted from a rendered item page; the site's own links are dropped.
const EXTERNAL_LINK_RE = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi

function extractSourceLinks(html) {
  const out = []
  EXTERNAL_LINK_RE.lastIndex = 0
  let match
  while ((match = EXTERNAL_LINK_RE.exec(String(html || '')))) {
    const url = decodeEntities(match[1])
    if (!url || url.includes('take.hk')) continue
    if (/^https?:\/\/(?:x|twitter)\.com\/[^/?#]+\/?$/i.test(url)) continue // profile links
    if (/(?:twitter\.com\/intent|facebook\.com\/sharer|linkedin\.com\/share|reddit\.com\/submit|t\.me\/share|getpocket)/i.test(url)) continue
    if (/\.(?:png|jpe?g|gif|webp|svg|mp4|webm|css|js)(?:[?#]|$)/i.test(url)) continue
    if (!out.includes(url)) out.push(url)
    if (out.length >= 3) break
  }
  return out
}

// The site's ?category= listing pages link to item pages; that is how the
// plugin learns each item's category instead of guessing from tags.
function extractItemIds(html) {
  const ids = []
  const re = /\/items\/([a-z0-9]{20,})/g
  let match
  while ((match = re.exec(String(html || '')))) {
    if (!ids.includes(match[1])) ids.push(match[1])
  }
  return ids
}

// One page record shared by the buffer and the streaming parsers.
function pageRecord(route, html) {
  const text = htmlToText(html)
  const record = { title: pageTitle(html), text, date: extractDate(text) }
  if (route.startsWith('/items/')) {
    const links = extractSourceLinks(html)
    if (links.length > 0) record.links = links
  }
  return record
}

// ----------------------------------------------------------- snapshot decode

// Reads one JSON string starting at buf[i] (which must be a quote) and returns
// [unescaped value, index after the closing quote].
function readJsonString(buf, at) {
  if (buf[at] !== 0x22) throw new Error('snapshot: expected string at ' + at)
  let i = at + 1
  let out = ''
  while (i < buf.length) {
    const byte = buf[i]
    if (byte === 0x5c) { // backslash escape: copy both bytes, skip the escaped byte
      out += buf.toString('utf8', i, i + 2)
      i += 2
      continue
    }
    if (byte === 0x22) return [out, i + 1]
    // copy a run of ordinary bytes at once
    let j = i
    while (j < buf.length && buf[j] !== 0x22 && buf[j] !== 0x5c) j++
    out += buf.toString('utf8', i, j)
    i = j
  }
  throw new Error('snapshot: unterminated string')
}

function skipJsonSpace(buf, at) {
  let i = at
  while (i < buf.length) {
    const b = buf[i]
    if (b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09) i++
    else break
  }
  return i
}

// Extracts the `index` object (itemId -> {t, s, src}) without parsing the 70 MB
// pages payload.
function extractIndexObject(buf, from) {
  const keyAt = buf.indexOf('"index":', from)
  if (keyAt < 0) return {}
  let i = skipJsonSpace(buf, keyAt + 8)
  if (buf[i] !== 0x7b) throw new Error('snapshot: expected index object')
  const start = i
  let depth = 0
  let inString = false
  let escaped = false
  for (; i < buf.length; i++) {
    const b = buf[i]
    if (inString) {
      if (escaped) escaped = false
      else if (b === 0x5c) escaped = true
      else if (b === 0x22) inString = false
      continue
    }
    if (b === 0x22) inString = true
    else if (b === 0x7b) depth++
    else if (b === 0x7d) {
      depth--
      if (depth === 0) { i++; break }
    }
  }
  return JSON.parse(buf.toString('utf8', start, i))
}

// Parses the whole decompressed snapshot into a compact site model:
// every page becomes { title, text, date } (about 11 MB in total) and the
// item index is attached, so the raw 70 MB payload can be dropped afterwards.
function buildSiteFromBuffer(buf, titles) {
  let pages = {}
  let index = {}
  const categoryByItem = {}
  let usedFastPath = true
  try {
    const marker = buf.indexOf('"pages":')
    if (marker < 0) throw new Error('snapshot: pages object missing')
    let i = skipJsonSpace(buf, marker + 8)
    if (buf[i] !== 0x7b) throw new Error('snapshot: expected pages object')
    i++
    for (;;) {
      i = skipJsonSpace(buf, i)
      if (buf[i] === 0x2c) { i++; continue } // comma
      if (buf[i] === 0x7d) { i++; break }
      const [escapedRoute, afterRoute] = readJsonString(buf, i)
      const route = JSON.parse('"' + escapedRoute + '"')
      i = skipJsonSpace(buf, afterRoute)
      if (buf[i] !== 0x3a) throw new Error('snapshot: expected colon')
      i = skipJsonSpace(buf, i + 1)
      const [escapedHtml, afterHtml] = readJsonString(buf, i)
      i = afterHtml
      const html = JSON.parse('"' + escapedHtml + '"')
      pages[route] = pageRecord(route, html)
      const categoryMatch = route.match(/^\/all\?category=([a-z-]+)/)
      if (categoryMatch) {
        for (const id of extractItemIds(html)) {
          if (!categoryByItem[id]) categoryByItem[id] = categoryMatch[1]
        }
      }
    }
    index = extractIndexObject(buf, i)
  } catch (err) {
    // Format drift fallback: parse the whole JSON object once.
    usedFastPath = false
    const doc = JSON.parse(buf.toString('utf8'))
    pages = {}
    for (const route of Object.keys(doc.pages || {})) {
      const html = String(doc.pages[route] || '')
      pages[route] = pageRecord(route, html)
      const categoryMatch = route.match(/^\/all\?category=([a-z-]+)/)
      if (categoryMatch) {
        for (const id of extractItemIds(html)) {
          if (!categoryByItem[id]) categoryByItem[id] = categoryMatch[1]
        }
      }
    }
    index = doc.index || {}
  }
  return assembleSite({ pages, index, titles, usedFastPath, categoryByItem })
}

// ----------------------------------------------- incremental snapshot parser

// A pull cursor over the decompressed JSON chunks. Strings are collected across
// chunk boundaries, so the whole 70 MB payload never has to exist as one buffer.
class JsonStreamReader {
  constructor(iter) {
    this.iter = iter
    this.chunk = Buffer.alloc(0)
    this.pos = 0
    this.done = false
  }

  async ensure() {
    while (this.pos >= this.chunk.length) {
      if (this.done) return false
      const { value, done } = await this.iter.next()
      if (done) { this.done = true; return false }
      this.chunk = value
      this.pos = 0
    }
    return true
  }

  async skipWs() {
    while (await this.ensure()) {
      const byte = this.chunk[this.pos]
      if (byte === 0x20 || byte === 0x0a || byte === 0x0d || byte === 0x09) this.pos++
      else break
    }
  }

  async peekByte() {
    if (!(await this.ensure())) throw new Error('snapshot stream ended unexpectedly')
    return this.chunk[this.pos]
  }

  async readByte() {
    if (!(await this.ensure())) throw new Error('snapshot stream ended unexpectedly')
    return this.chunk[this.pos++]
  }

  async expectByte(byte, what) {
    await this.skipWs()
    const actual = await this.readByte()
    if (actual !== byte) throw new Error('snapshot stream: expected ' + what)
  }

  // Returns the raw escaped string content (without the surrounding quotes).
  async readRawString() {
    await this.skipWs()
    if ((await this.readByte()) !== 0x22) throw new Error('snapshot stream: expected string')
    const parts = []
    let escaped = false
    for (;;) {
      if (!(await this.ensure())) throw new Error('snapshot stream: unterminated string')
      const chunk = this.chunk
      const start = this.pos
      let i = start
      while (i < chunk.length) {
        const byte = chunk[i]
        if (escaped) { escaped = false; i++; continue }
        if (byte === 0x5c) { escaped = true; i++; continue }
        if (byte === 0x22) {
          if (i > start) parts.push(chunk.subarray(start, i))
          this.pos = i + 1
          if (parts.length === 1) return parts[0].toString('utf8')
          return Buffer.concat(parts).toString('utf8')
        }
        i++
      }
      if (chunk.length > start) parts.push(chunk.subarray(start))
      this.pos = chunk.length
    }
  }

  async readJsonString() {
    return JSON.parse('"' + (await this.readRawString()) + '"')
  }

  // Reads a balanced JSON object and parses it (used for the small `index` map).
  async readIndexObject() {
    await this.skipWs()
    if ((await this.readByte()) !== 0x7b) throw new Error('snapshot stream: expected index object')
    const parts = [Buffer.from('{')]
    let depth = 1
    let inString = false
    let escaped = false
    for (;;) {
      if (!(await this.ensure())) throw new Error('snapshot stream: unterminated index object')
      const chunk = this.chunk
      const start = this.pos
      let i = start
      while (i < chunk.length) {
        const byte = chunk[i]
        if (inString) {
          if (escaped) escaped = false
          else if (byte === 0x5c) escaped = true
          else if (byte === 0x22) inString = false
        } else if (byte === 0x22) inString = true
        else if (byte === 0x7b) depth++
        else if (byte === 0x7d) {
          depth--
          if (depth === 0) {
            i++
            parts.push(chunk.subarray(start, i))
            this.pos = i
            const json = Buffer.concat(parts).toString('utf8')
            return JSON.parse(json)
          }
        }
        i++
      }
      parts.push(chunk.subarray(start))
      this.pos = chunk.length
    }
  }
}

async function* gunzipChunks(compressed) {
  const gunzip = createGunzip()
  Readable.from([compressed]).pipe(gunzip)
  for await (const chunk of gunzip) yield chunk
}

async function buildSiteFromStream(compressed, titles) {
  const reader = new JsonStreamReader(gunzipChunks(compressed))
  await reader.expectByte(0x7b, 'top-level object')
  const firstKey = await reader.readJsonString()
  if (firstKey !== 'pages') throw new Error('snapshot stream: unexpected first key ' + firstKey)
  await reader.expectByte(0x3a, 'colon')
  await reader.expectByte(0x7b, 'pages object')
  const pages = {}
  const categoryByItem = {}
  for (;;) {
    await reader.skipWs()
    const peek = await reader.peekByte()
    if (peek === 0x7d) { await reader.readByte(); break }
    if (peek === 0x2c) { await reader.readByte(); continue }
    const route = await reader.readJsonString()
    await reader.expectByte(0x3a, 'colon')
    const html = await reader.readJsonString()
    pages[route] = pageRecord(route, html)
    const categoryMatch = route.match(/^\/all\?category=([a-z-]+)/)
    if (categoryMatch) {
      for (const id of extractItemIds(html)) {
        if (!categoryByItem[id]) categoryByItem[id] = categoryMatch[1]
      }
    }
  }
  await reader.expectByte(0x2c, 'comma after pages')
  const indexKey = await reader.readJsonString()
  if (indexKey !== 'index') throw new Error('snapshot stream: unexpected key ' + indexKey)
  await reader.expectByte(0x3a, 'colon')
  const index = await reader.readIndexObject()
  return assembleSite({ pages, index, titles, usedFastPath: true, categoryByItem })
}

// Shared finish step: rebuilds the derived views (dailies, topics, routes) from
// pages + items, so both a network snapshot and a cache blob produce the same site.
function finishSite({ pages, items, usedFastPath, stamp }) {
  const routeList = Object.keys(pages)
  const dailyRoutes = routeList
    .filter((route) => /^\/daily\/\d{4}-\d{2}-\d{2}$/.test(route))
    .sort()
    .reverse()
  const dailies = dailyRoutes.map((route) => ({
    date: route.slice('/daily/'.length),
    route,
    title: pages[route].title || 'AI 影像日报 ' + route.slice('/daily/'.length),
  }))
  const topics = routeList
    .filter((route) => /^\/topics\/.+/.test(route))
    .map((route) => ({ route, title: pages[route].title || route.slice('/topics/'.length) }))
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
  return {
    pages,
    items,
    dailies,
    topics,
    latestDailyRoute: dailyRoutes[0] || '/daily',
    routes: routeList,
    usedFastPath,
    itemCount: items.length,
    stamp: stamp || '',
  }
}

function assembleSite({ pages, index, titles, usedFastPath, stamp, categoryByItem }) {
  const items = []
  for (const id of Object.keys(index)) {
    const entry = index[id] || {}
    const route = '/items/' + id
    const page = pages[route]
    if (!page) continue
    items.push({
      id,
      route,
      title: page.title || cleanTitle(entry.t) || id,
      summary: collapse(entry.s || ''),
      date: page.date || '',
      category: (categoryByItem && categoryByItem[id]) || '',
    })
  }
  items.sort((a, b) => {
    if (!a.date && !b.date) return 0
    if (!a.date) return 1
    if (!b.date) return -1
    return a.date < b.date ? 1 : a.date > b.date ? -1 : 0
  })
  return finishSite({ pages, items, usedFastPath, stamp })
}

// ------------------------------------------------------------- snapshot fetch

async function fetchText(url, exec, asBuffer) {
  const signal = exec && exec.signal ? exec.signal : undefined
  const res = await fetch(url, { signal, headers: { 'user-agent': UA, 'accept-encoding': 'gzip' } })
  if (!res.ok) return null
  return asBuffer ? Buffer.from(await res.arrayBuffer()) : await res.text()
}

async function fetchSnapshot(exec) {
  const initial = 10
  const first = await Promise.all(
    Array.from({ length: initial }, (_, i) => fetchText(SITE + '/data-' + (i + 1) + '.txt', exec).catch(() => null)),
  )
  const parts = first.filter((part) => typeof part === 'string')
  if (parts.length === 0) throw new Error('take.hk snapshot is unavailable (no data parts could be fetched)')
  let count = 0
  while (count < first.length && typeof first[count] === 'string') count++
  // Grow past 10 parts if the site ever splits the snapshot further.
  let extra = first.length
  while (extra === count && extra < MAX_PARTS) {
    const next = await fetchText(SITE + '/data-' + (extra + 1) + '.txt', exec).catch(() => null)
    if (typeof next !== 'string') break
    parts.push(next)
    extra++
    count++
  }
  const ext = JSON.parse(parts.join(''))
  const compressed = Buffer.from(String(ext.data || ''), 'base64')
  if (compressed.length === 0) throw new Error('take.hk snapshot payload is empty')
  let site
  try {
    site = await buildSiteFromStream(compressed, ext.titles || {})
  } catch {
    // Format drift fallback: decode fully and use the byte scanner.
    site = buildSiteFromBuffer(gunzipSync(compressed), ext.titles || {})
  }
  site.stamp = String(ext.v || '')
  return site
}

// --------------------------------------------------------------- site cache

let cache = { at: 0, site: null, pending: null }
let refreshing = null

function peekSite() {
  return cache.site && Date.now() - cache.at < memoryTtlMs() ? cache.site : null
}

function todayLocal() {
  const now = new Date()
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0')
}

// The disk cache holds only public take.hk content (never user data) and can be
// deleted at any time. A same-day cache answers instantly after a restart while
// a background refresh still picks up new items.
function siteToCacheBlob(site) {
  return { schema: CACHE_SCHEMA, date: todayLocal(), stamp: site.stamp || '', pages: site.pages, items: site.items }
}

function reviveSite(blob) {
  if (!blob || blob.schema !== CACHE_SCHEMA || !blob.pages || typeof blob.pages !== 'object') return null
  if (Object.keys(blob.pages).length === 0) return null
  const items = Array.isArray(blob.items) ? blob.items : []
  return finishSite({ pages: blob.pages, items, usedFastPath: true, stamp: blob.stamp || '' })
}

function readDiskCache() {
  if (!settings.diskCache) return null
  try {
    const stat = statSync(CACHE_FILE)
    if (Date.now() - stat.mtimeMs > DISK_CACHE_TTL_MS) return null
    const blob = JSON.parse(gunzipSync(readFileSync(CACHE_FILE)).toString('utf8'))
    if (blob.date !== todayLocal()) return null
    const site = reviveSite(blob)
    if (site) site.savedAt = stat.mtimeMs
    return site
  } catch {
    return null
  }
}

function writeDiskCache(site) {
  if (!settings.diskCache) return
  try {
    const payload = gzipSync(Buffer.from(JSON.stringify(siteToCacheBlob(site)), 'utf8'))
    mkdirSync(CACHE_DIR, { recursive: true })
    const tmp = CACHE_FILE + '.' + process.pid + '.tmp'
    writeFileSync(tmp, payload)
    renameSync(tmp, CACHE_FILE)
  } catch {
    // Best effort: a read-only home or a locked file must never break a tool.
  }
}

function refreshInBackground(exec) {
  if (refreshing) return
  refreshing = fetchSnapshot(exec)
    .then((site) => {
      cache = { at: Date.now(), site, pending: null }
      writeDiskCache(site)
      return site
    })
    .catch(() => undefined)
    .finally(() => { refreshing = null })
}

async function loadSite(exec) {
  const now = Date.now()
  if (cache.site && now - cache.at < memoryTtlMs()) return cache.site
  if (cache.pending) return cache.pending
  const disk = readDiskCache()
  if (disk) {
    cache = { at: now, site: disk, pending: null }
    if (now - (disk.savedAt || 0) > memoryTtlMs()) refreshInBackground(exec)
    return disk
  }
  cache.pending = fetchSnapshot(exec)
    .then((site) => {
      cache = { at: Date.now(), site, pending: null }
      writeDiskCache(site)
      return site
    })
    .catch((err) => {
      cache.pending = null
      throw err
    })
  return cache.pending
}

// ------------------------------------------------------------ route helpers

function normalizeRoute(target) {
  let value = String(target || '').trim()
  if (!value) return null
  if (value === 'today' || value === 'latest') return '/today'
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value)
      value = url.hash && url.hash.length > 1 ? url.hash.slice(1) : url.pathname
    } catch {
      return null
    }
  }
  if (value.startsWith('#')) value = value.slice(1)
  if (!value.startsWith('/')) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) value = '/daily/' + value
    else if (/^(items|daily|topics|cases|canvas|weekly|monthly|about|methodology|hot|agent|credits|changelog)\b/.test(value)) value = '/' + value
    else value = '/items/' + value
  }
  value = value.replace(/\/+$/, '')
  return value || '/'
}

function urlFor(route) {
  if (!route || route === '/') return SITE + '/'
  return SITE + '/#' + route
}

function dataLine(site) {
  return site && site.stamp ? '数据：take.hk 站点快照，更新于 ' + site.stamp : '数据：take.hk 站点快照'
}

// ------------------------------------------------------------ take_latest

const RSS_FALLBACK = { cachedAt: 0, items: [] }

async function rssDailies(exec) {
  if (Date.now() - RSS_FALLBACK.cachedAt < CACHE_TTL_MS) return RSS_FALLBACK.items
  const res = await fetch(FEED_URL, { signal: exec && exec.signal, headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error('take.hk feed request failed with HTTP ' + res.status)
  const xml = await res.text()
  const entries = []
  for (const block of xml.split('<item>').slice(1)) {
    const grab = (tag) => {
      const open = '<' + tag + '>'
      const close = '</' + tag + '>'
      const a = block.indexOf(open)
      if (a < 0) return ''
      const b = block.indexOf(close, a + open.length)
      if (b < 0) return ''
      return decodeEntities(block.slice(a + open.length, b)).trim()
    }
    const title = grab('title')
    const link = grab('link')
    if (!title || !link) continue
    const date = grab('pubDate')
    entries.push({ title, link, date, summary: htmlToText(grab('description')) })
  }
  RSS_FALLBACK.cachedAt = Date.now()
  RSS_FALLBACK.items = entries
  return entries
}

function formatNews(site, limit, category) {
  const pool = category ? site.items.filter((item) => item.category === category) : site.items
  const items = pool.filter((item) => item.date).slice(0, limit)
  const scope = category ? ' · ' + categoryLabel(category) : ''
  const lines = [
    '最新精选资讯' + scope + '（按发布时间倒序，共 ' + pool.length + ' 条，显示 ' + items.length + ' 条）',
    dataLine(site),
    '',
  ]
  items.forEach((item, idx) => {
    const tag = item.category ? '「' + categoryLabel(item.category) + '」' : ''
    lines.push(String(idx + 1) + '. ' + item.date + ' · ' + tag + item.title)
    if (item.summary) lines.push('   ' + item.summary.slice(0, 180))
    lines.push('   ' + urlFor(item.route))
  })
  if (items.length === 0) {
    lines.push(category
      ? '（「' + categoryLabel(category) + '」分类下暂时没有带日期的资讯。可用分类：' + CATEGORIES.map((item) => item.label).join(' / ') + '）'
      : '（快照中没有找到带日期的资讯）')
  }
  lines.push('')
  lines.push('想看全文：take_read target=<路径>；例如第 1 条 ' + urlFor(items[0] ? items[0].route : '/'))
  return lines.join(NL)
}

function formatDailies(site, limit) {
  const dailies = site.dailies.slice(0, limit)
  if (dailies.length === 0) return '（快照中没有找到日报）'
  const lines = [
    'AI 影像日报 · 显示最新 ' + dailies.length + ' 期（共 ' + site.dailies.length + ' 期，最新 ' + dailies[0].date + '）',
    dataLine(site),
    '',
  ]
  dailies.forEach((daily, idx) => {
    lines.push(String(idx + 1) + '. ' + daily.date + ' · ' + daily.title)
    const text = (site.pages[daily.route] && site.pages[daily.route].text) || ''
    const digestLine = text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length >= 12 && !/^帧\s/.test(line) && !/条动态/.test(line) && line !== '当日动态')
    if (digestLine) lines.push('   ' + digestLine.slice(0, 180))
    lines.push('   全文：take_read target=' + daily.route + ' ｜ ' + urlFor(daily.route))
  })
  return lines.join(NL)
}

// ------------------------------------------------------------- take_search

function searchSite(site, query, limit, category) {
  const terms = String(query || '')
    .toLowerCase()
    .split(/[\s,，、;；]+/)
    .filter((term) => term.length > 0)
    .slice(0, 6)
  if (terms.length === 0) return []
  const results = []
  const countHits = (haystack, term) => {
    if (!haystack) return 0
    let hits = 0
    let at = haystack.indexOf(term)
    while (at >= 0 && hits < 3) {
      hits++
      at = haystack.indexOf(term, at + term.length)
    }
    return hits
  }
  const makeSnippet = (text) => {
    const low = String(text || '').toLowerCase()
    let best = -1
    let bestTerm = ''
    for (const term of terms) {
      const at = low.indexOf(term)
      if (at >= 0 && (best < 0 || at < best)) { best = at; bestTerm = term }
    }
    if (best < 0) return String(text || '').slice(0, 160)
    const from = Math.max(0, best - 60)
    const to = Math.min(text.length, best + bestTerm.length + 120)
    return (from > 0 ? '…' : '') + String(text).slice(from, to).replace(/\s+/g, ' ').trim() + (to < text.length ? '…' : '')
  }
  for (const item of site.items) {
    if (category && item.category !== category) continue
    const title = item.title.toLowerCase()
    const summary = item.summary.toLowerCase()
    const itemPage = site.pages[item.route]
    const body = itemPage && itemPage.text ? itemPage.text.toLowerCase() : ''
    let score = 0
    let matched = 0
    for (const term of terms) {
      const hits = countHits(title, term) * 10 + countHits(summary, term) * 4 + countHits(body, term) * 1
      if (hits > 0) matched++
      score += hits
    }
    if (score > 0) {
      results.push({ score, matched, kind: '资讯', title: item.title, date: item.date, route: item.route, category: item.category || '', snippet: item.summary ? makeSnippet(item.summary) : '', summary: item.summary })
    }
  }
  // Listing pages repeat every item, so they would swamp real item hits: skip
  // query routes and the aggregate home/hot/archive pages, and de-weight the
  // remaining index pages.
  const SKIP_PAGES = new Set(['/', '/hot', '/daily9', '/more', '/starred', '/daily'])
  const pageWeight = (route) => {
    if (route.startsWith('/daily/') || route.startsWith('/topics/')) return 1
    if (route === '/cases' || route === '/canvas') return 0.5
    return 0.7
  }
  if (!category) for (const route of site.routes) {
    if (route.includes('?') || route.startsWith('/items/') || SKIP_PAGES.has(route)) continue
    const page = site.pages[route]
    if (!page || !page.text) continue
    const title = (page.title || route).toLowerCase()
    const lowerText = page.text.toLowerCase()
    let score = 0
    let matched = 0
    for (const term of terms) {
      const hits = countHits(title, term) * 8 + countHits(lowerText, term) * 2
      if (hits > 0) matched++
      score += hits
    }
    if (score > 0) {
      score = Math.round(score * pageWeight(route))
      results.push({ score, matched, kind: route.startsWith('/daily/') ? '日报' : route.startsWith('/topics/') ? '主题' : '页面', title: page.title || route, date: page.date || '', route, snippet: makeSnippet(page.text), summary: '' })
    }
  }
  results.sort((a, b) =>
    b.matched - a.matched || b.score - a.score || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return results.slice(0, limit)
}

function formatSearch(query, results, site, category) {
  const scope = category ? ' · 分类：' + categoryLabel(category) : ''
  if (results.length === 0) return '没有匹配「' + query + '」' + scope + '的内容。试试更短的关键词、换个分类，或用 take_latest 看最新内容。'
  const lines = ['搜索「' + query + '」' + scope + '，命中 ' + results.length + ' 条（按相关度排序）：', dataLine(site), '']
  results.forEach((hit, idx) => {
    const tag = hit.category ? categoryLabel(hit.category) : ''
    lines.push(String(idx + 1) + '. [' + hit.kind + '] ' + (tag ? '「' + tag + '」' : '') + hit.title + (hit.date ? '（' + hit.date + '）' : ''))
    if (hit.snippet) lines.push('   ' + hit.snippet)
    lines.push('   读取：take_read target=' + hit.route)
    lines.push('   链接：' + urlFor(hit.route))
  })
  return lines.join(NL)
}

// --------------------------------------------------------------- take_read

async function readPage(exec, site, target) {
  let route = normalizeRoute(target)
  if (!route || route === '/today') route = '/today'
  if (route === '/today') {
    const loaded = site || (await loadSite(exec))
    const dailyRoute = loaded.latestDailyRoute
    return { route: dailyRoute, page: loaded.pages[dailyRoute] }
  }
  if (site && site.pages[route]) return { route, page: site.pages[route] }
  // Prefer the snapshot for aggregate pages: their static HTML is only the
  // client shell, while the snapshot holds the rendered content.
  const preferSnapshot = route === '/' || route === '/daily'
  if (!preferSnapshot) {
    // Single-page read without the snapshot loaded: one ~40 KB request instead
    // of the whole 10 MB snapshot.
    const staticPage = await fetchStaticPage(exec, route)
    if (staticPage) return { route, page: staticPage }
  }
  const loaded = site || (await loadSite(exec))
  const page = loaded.pages[route]
  if (page) return { route, page }
  throw new Error(
    'take.hk 上找不到 ' + route + '。' +
    '可用 take_search 搜关键词，或 take_latest 看最新内容；也支持直接给 take.hk 的 URL。',
  )
}

async function fetchStaticPage(exec, route) {
  const url = route.includes('?') ? SITE + route : SITE + route + '/'
  try {
    const res = await fetch(url, { signal: exec && exec.signal, headers: { 'user-agent': UA } })
    if (!res.ok) return null
    const html = await res.text()
    const record = pageRecord(route, html)
    if (!record.text || record.text.length < 40) return null
    return record
  } catch (err) {
    if (err && err.name === 'AbortError') throw err
    return null
  }
}

// Drops site chrome ("原文", "点击看原视频", ...) and the repeated title line so
// a page reads like an article instead of a scraped card.
const READ_CHROME = /^(原文|看原视频|点击看原视频|查看项目归档详情\s*→?|返回|下一页|上一页)$/

function cleanReadBody(title, text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line !== title && !READ_CHROME.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function formatRead(route, page, maxChars) {
  const title = page.title || route
  const body = cleanReadBody(title, page.text)
  const lines = [title, '链接：' + urlFor(route), '']
  if (!body) {
    lines.push('（这一页没有可读正文；站点可能还没有发布内容。）')
    return lines.join(NL)
  }
  if (body.length <= maxChars) {
    lines.push(body)
    lines.push('')
    lines.push('（全文 ' + body.length + ' 字）')
  } else {
    lines.push(body.slice(0, maxChars))
    lines.push('')
    lines.push('…（已截断，全文约 ' + body.length + ' 字；需要更多请提高 maxChars）')
  }
  if (page.links && page.links.length > 0) {
    lines.push('')
    lines.push('原文/来源：')
    for (const link of page.links) lines.push('- ' + link)
  }
  return lines.join(NL)
}

// ---------------------------------------------------------------- the tools

function textOutput() {
  return {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : 'ok' }],
  }
}

function clampInt(raw, fallback, min, max) {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback
  const value = Math.floor(raw)
  if (value < min) return min
  if (value > max) return max
  return value
}

const takeLatestTool = {
  name: 'take_latest',
  description:
    'List the latest content from Take / take.hk (an AI filmmaking creator resource site): either the latest daily briefings (AI 影像日报, including today\'s) or the latest selected news items. Returns date, title, category, summary and a link for each. Use when the user asks what is new, what happened today, or about the latest Take daily news.',
  parameters: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: ['daily', 'news'],
        description: 'What to list: "daily" for AI 影像日报 briefings (default), "news" for the latest selected news items.',
      },
      category: {
        type: 'string',
        description: 'Optional category filter for kind="news": video-models, tools, works, industry, paper, tip or opinion (the site\'s own categories). Ignored for daily briefings.',
      },
      limit: {
        type: 'integer',
        description: 'How many entries to return, 1 to 20. Defaults to 5 for daily and 10 for news.',
      },
    },
  },
  output: textOutput(),
  timeoutMs: 30000,
  isConcurrencySafe() {
    return false
  },
  async execute(args, exec) {
    const kind = args && args.kind === 'news' ? 'news' : 'daily'
    const category = normalizeCategory(args && args.category)
    const limit = clampInt(args && args.limit, kind === 'news' ? 10 : 5, 1, 20)
    try {
      const site = await loadSite(exec)
      return kind === 'news' ? formatNews(site, limit, category) : formatDailies(site, limit)
    } catch (err) {
      if (kind !== 'daily') throw err
      // Feed fallback keeps the daily listing useful even if the snapshot fails.
      const entries = await rssDailies(exec)
      const lines = entries.slice(0, limit).map((entry, idx) => {
        const parts = [String(idx + 1) + '. ' + entry.title]
        if (entry.summary) parts.push('   ' + entry.summary.slice(0, 160))
        parts.push('   ' + entry.link)
        return parts.join(NL)
      })
      return lines.join(NL + NL) + (lines.length ? '' : '（没有拿到任何日报）')
    }
  },
}

const takeSearchTool = {
  name: 'take_search',
  description:
    'Full-text search across everything on Take / take.hk: 1400+ selected news items, all daily briefings and the 30 topic archives. Returns ranked hits with category, snippet, the path to read in full and a link. Use when the user asks about a model, tool, creator, film, topic or event, or wants to find something on take.hk.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Keywords to search for. Chinese and English both work; use short terms such as "可灵", "Sora", "Seedance".',
      },
      category: {
        type: 'string',
        description: 'Optional category filter: video-models, tools, works, industry, paper, tip or opinion. When set, only news items in that category are searched.',
      },
      limit: {
        type: 'integer',
        description: 'How many results to return, 1 to 20. Defaults to 8.',
      },
    },
    required: ['query'],
  },
  output: textOutput(),
  timeoutMs: 30000,
  isConcurrencySafe() {
    return false
  },
  async execute(args, exec) {
    const query = collapse(args && args.query)
    if (!query) throw new Error('take_search needs a query string')
    const category = normalizeCategory(args && args.category)
    const limit = clampInt(args && args.limit, 8, 1, 20)
    try {
      const site = await loadSite(exec)
      return formatSearch(query, searchSite(site, query, limit, category), site, category)
    } catch (err) {
      // Last-resort fallback: search the public RSS dailies when the snapshot is
      // unavailable, so a temporary site problem still gives partial results.
      const entries = await rssDailies(exec).catch(() => [])
      const terms = query.toLowerCase().split(/[\s,，、;；]+/).filter(Boolean)
      const hits = entries.filter((entry) => {
        const hay = (entry.title + ' ' + entry.summary).toLowerCase()
        return terms.length > 1 ? terms.every((term) => hay.includes(term)) : terms.some((term) => hay.includes(term))
      }).slice(0, limit)
      if (hits.length === 0) {
        throw new Error(
          '站点快照暂时不可用（' + (err && err.message ? err.message : String(err)) + '），' +
          'RSS 里也没有匹配「' + query + '」的内容。稍后重试，或先用 take_latest 看日报。',
        )
      }
      const lines = ['全站快照暂时不可用，以下是从公开 RSS（最近日报）里找到的匹配：', '']
      hits.forEach((entry, idx) => {
        lines.push(String(idx + 1) + '. ' + entry.title)
        if (entry.summary) lines.push('   ' + entry.summary.slice(0, 160))
        lines.push('   ' + entry.link)
      })
      return lines.join(NL)
    }
  },
}

const takeReadTool = {
  name: 'take_read',
  description:
    'Read any page of take.hk as clean plain text: a news item, a daily briefing (including today\'s), a topic archive, or a site page. Accepts a take.hk URL, a path like /daily/2026-11-03, /topics/google, /items/<id>, a bare item id, a date like 2026-11-03, or "today". Returns the title, link, full body text and (for news items) the original source links. Use after take_search / take_latest, or when the user pastes a take.hk link.',
  parameters: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        description: 'What to read: a take.hk URL, a site path, an item id, a daily date (2026-11-03) or "today". Defaults to the latest daily briefing.',
      },
      maxChars: {
        type: 'integer',
        description: 'Maximum body characters to return, 500 to 20000. Defaults to 8000.',
      },
    },
  },
  output: textOutput(),
  timeoutMs: 30000,
  isConcurrencySafe() {
    return false
  },
  async execute(args, exec) {
    const maxChars = clampInt(args && args.maxChars, 8000, 500, 20000)
    const target = args && args.target
    // Uses the cached snapshot when warm; otherwise a single static page.
    const { route, page } = await readPage(exec, peekSite(), target)
    return formatRead(route, page, maxChars)
  },
}

const takeTopicsTool = {
  name: 'take_topics',
  description:
    'List the topic archives (专题/主题归档库) on take.hk, such as Google, OpenAI, Kling or video models. Each topic groups selected items. Use take_read with the returned path to read a topic page.',
  parameters: {
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        description: 'How many topics to list, 1 to 40. Defaults to 40 (all).',
      },
    },
  },
  output: textOutput(),
  timeoutMs: 30000,
  isConcurrencySafe() {
    return true
  },
  async execute(args, exec) {
    const limit = clampInt(args && args.limit, 40, 1, 40)
    const site = await loadSite(exec)
    const topics = site.topics.slice(0, limit)
    const lines = ['Take 主题归档库（共 ' + site.topics.length + ' 个）：', '']
    topics.forEach((topic, idx) => {
      lines.push(String(idx + 1) + '. ' + topic.title)
      lines.push('   读取：take_read target=' + topic.route)
      lines.push('   ' + urlFor(topic.route))
    })
    return lines.join(NL)
  },
}

const takeLinksTool = {
  name: 'take_links',
  description:
    'Get the main public entry points of Take (take.hk): homepage, daily briefings, hot list, topics, cases, canvas workflows, the Agent/API page and the RSS feed. Use when the user wants to open, visit or share take.hk.',
  parameters: { type: 'object', properties: {} },
  output: textOutput(),
  timeoutMs: 5000,
  isConcurrencySafe() {
    return true
  },
  async execute() {
    return [
      'Take — AI 影像创作者资源站（take.hk）',
      '首页: https://take.hk/',
      'AI 影像日报: https://take.hk/#/daily',
      '热点: https://take.hk/#/hot',
      '主题归档: https://take.hk/#/topics',
      '镜头玩法/案例: https://take.hk/#/cases',
      '画布工作流: https://take.hk/#/canvas',
      'Agent 接入（MCP / RSS / API 说明）: https://take.hk/#/agent?tab=api',
      'RSS: https://take.hk/feed.xml',
    ].join(NL)
  },
}

const TOOLS = [takeLatestTool, takeSearchTool, takeReadTool, takeTopicsTool, takeLinksTool]

// Exported for the smoke test; not part of the plugin surface.
export const tools = {
  CATEGORIES,
  categoryLabel,
  normalizeCategory,
  extractSourceLinks,
  extractItemIds,
  pageRecord,
  buildSiteFromStream,
  decodeEntities,
  htmlToText,
  pageTitle,
  extractDate,
  normalizeRoute,
  buildSiteFromBuffer,
  searchSite,
  formatRead,
  formatSearch,
  formatNews,
  formatDailies,
  assembleSite,
  finishSite,
  siteToCacheBlob,
  reviveSite,
  dataLine,
  todayLocal,
  clampInt,
}

export function apply(ctx, config) {
  if (config && typeof config === 'object') {
    if (typeof config.diskCache === 'boolean') settings.diskCache = config.diskCache
    if (Number.isFinite(config.ttlMinutes)) {
      settings.ttlMinutes = Math.min(1440, Math.max(1, Math.floor(config.ttlMinutes)))
    }
  }
  console.log('[dsh-plugin-take] plugin loaded - Take (take.hk) snapshot reader'
    + ' (diskCache=' + settings.diskCache + ', ttl=' + settings.ttlMinutes + 'min)')
  if (!ctx || !ctx.tools || typeof ctx.tools.register !== 'function') {
    console.warn('[dsh-plugin-take] tools service not available; Take tools were not registered.')
    return
  }
  for (const definition of TOOLS) {
    ctx.effect(() => {
      try {
        const dispose = ctx.tools.register(definition)
        console.log('[dsh-plugin-take] tool registered: ' + definition.name)
        return dispose
      } catch (err) {
        console.warn('[dsh-plugin-take] failed to register tool ' + definition.name + ': ' + (err && err.message ? err.message : String(err)))
      }
    })
  }
}
