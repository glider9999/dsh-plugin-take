// dsh-plugin-take — Web UI half.
//
// Left-sidebar "Take" panel + main page: a magazine-style read-only browser for
// take.hk (daily briefings, selected news, topic archives) with designed cover
// fallbacks, bookmarks (localStorage), share-text copy, category filters,
// search and an in-page reader. Data comes from the Host half over
// same-origin `/take/api/*` routes.
window.__ModuleLoader__.load({
  id: 'dsh-plugin-take',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useRef, useState } = React
    const PAGE_KEY = 'take'
    const SAVED_KEY = 'take-bookmarks-v1'

    const CATEGORIES = [
      ['video-models', 'AI 视频模型'],
      ['tools', 'AI 影像工具'],
      ['works', 'AI 作品与案例'],
      ['industry', '影视与 AI 行业'],
      ['paper', '研究'],
      ['tip', '教程'],
      ['opinion', '观点'],
    ]
    const CATEGORY_LABELS = Object.fromEntries(CATEGORIES)
    const TABS = [
      ['daily', '日报'],
      ['news', '精选'],
      ['topics', '专题'],
      ['saved', '收藏'],
    ]
    const PALETTES = {
      'video-models': ['#0b1220', '#1e3a8a', '#6d28d9'],
      tools: ['#061a1f', '#0e7490', '#22d3ee'],
      works: ['#1c0f12', '#9a3412', '#f59e0b'],
      industry: ['#0d1117', '#334155', '#64748b'],
      paper: ['#071a12', '#166534', '#34d399'],
      tip: ['#151a06', '#4d7c0f', '#a3e635'],
      opinion: ['#1a0a17', '#9d174d', '#f472b6'],
    }
    const GLYPHS = {
      'video-models': 'AI', tools: 'TOOL', works: 'WORK', industry: 'INDUSTRY',
      paper: 'PAPER', tip: 'TIP', opinion: 'OPINION',
    }

    const CSS = `
.tk-root{height:100%;overflow:auto;background:
  radial-gradient(1200px 500px at 12% -10%, rgba(37,99,235,.06), transparent 60%),
  radial-gradient(900px 420px at 92% 0%, rgba(124,58,237,.06), transparent 55%),
  var(--bg,#fff);color:var(--ink,#1d1d1f);font-feature-settings:"tnum";}
.tk-wrap{max-width:1120px;margin:0 auto;padding:26px 30px 90px}
.tk-bar{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:22px}
.tk-brand{display:flex;align-items:baseline;gap:10px}
.tk-brand h1{font-size:23px;font-weight:750;letter-spacing:.2px;margin:0}
.tk-stamp{font-size:11.5px;color:var(--ink-3,#8a8a8f)}
.tk-spacer{flex:1}
.tk-link{font-size:13px;color:var(--accent,#2563eb);text-decoration:none}
.tk-link:hover{text-decoration:underline}
.tk-search{display:flex;gap:8px;flex:1 1 300px;min-width:240px}
.tk-input{flex:1;min-width:0;padding:9px 13px;border-radius:11px;border:1px solid var(--line,#e5e5e3);
  background:var(--surface,#f6f6f4);color:var(--ink,#1d1d1f);font-size:13.5px;outline:none;transition:.2s}
.tk-input:focus{border-color:var(--accent,#2563eb);background:var(--bg,#fff);box-shadow:0 0 0 3px rgba(37,99,235,.10)}
.tk-btn{padding:9px 16px;border-radius:11px;border:1px solid var(--accent,#2563eb);background:var(--accent,#2563eb);
  color:#fff;font-size:13.5px;cursor:pointer;transition:.15s}
.tk-btn:hover{filter:brightness(1.06)}
.tk-tabs{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:18px}
.tk-tab{padding:7px 16px;border-radius:999px;border:1px solid var(--line,#e5e5e3);background:transparent;
  color:var(--ink-2,#4b4b50);font-size:13px;cursor:pointer;transition:.18s}
.tk-tab:hover{border-color:var(--accent,#2563eb);color:var(--accent,#2563eb)}
.tk-tab.on{background:var(--accent,#2563eb);border-color:var(--accent,#2563eb);color:#fff}
.tk-chips{display:flex;gap:7px;flex-wrap:wrap;margin:0 0 18px}
.tk-chip{padding:5px 12px;border-radius:999px;border:1px solid var(--line,#e5e5e3);background:transparent;
  color:var(--ink-3,#8a8a8f);font-size:12px;cursor:pointer;transition:.16s}
.tk-chip:hover{color:var(--ink,#1d1d1f);border-color:var(--ink-3,#8a8a8f)}
.tk-chip.on{background:var(--ink,#1d1d1f);border-color:var(--ink,#1d1d1f);color:var(--bg,#fff)}
.tk-hero{position:relative;overflow:hidden;border-radius:22px;padding:30px 32px;color:#fff;margin-bottom:26px;
  background:linear-gradient(118deg,#0b1220 0%,#12224a 38%,#1f3f8f 68%,#6d28d9 100%);
  box-shadow:0 22px 60px rgba(15,23,42,.22)}
.tk-hero:before{content:"";position:absolute;inset:-40% -20% auto auto;width:560px;height:560px;
  background:radial-gradient(circle,rgba(255,255,255,.20),transparent 62%);pointer-events:none}
.tk-hero:after{content:"";position:absolute;inset:auto auto -60% -10%;width:420px;height:420px;
  background:radial-gradient(circle,rgba(255,255,255,.10),transparent 60%);pointer-events:none}
.tk-kicker{font-size:11px;letter-spacing:.32em;text-transform:uppercase;opacity:.7}
.tk-hero h2{font-size:25px;line-height:1.35;font-weight:750;margin:10px 0 8px;max-width:760px}
.tk-hero p{margin:0;font-size:13.5px;line-height:1.75;opacity:.82;max-width:680px}
.tk-hero-actions{display:flex;gap:10px;margin-top:18px;position:relative;z-index:1;flex-wrap:wrap}
.tk-btn-ghost{padding:8px 16px;border-radius:11px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.08);
  color:#fff;font-size:13px;cursor:pointer;transition:.16s;text-decoration:none}
.tk-btn-ghost:hover{background:rgba(255,255,255,.16)}
.tk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(255px,1fr));gap:16px}
.tk-card{position:relative;display:flex;flex-direction:column;border-radius:16px;overflow:hidden;cursor:pointer;
  border:1px solid var(--line,#e5e5e3);background:var(--surface,#f6f6f4);
  transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease;animation:tkIn .4s both}
.tk-card:hover{transform:translateY(-3px);box-shadow:0 16px 36px rgba(15,23,42,.12);border-color:rgba(37,99,235,.35)}
.tk-cover{position:relative;aspect-ratio:16/9;overflow:hidden;background:linear-gradient(135deg,#1e2a4a,#3b4d7d 55%,#7c3aed)}
.tk-cover img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .35s ease}
.tk-card:hover .tk-cover img{transform:scale(1.04)}
.tk-poster{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;padding:14px 16px;color:#fff}
.tk-poster .glyph{font-size:38px;font-weight:800;letter-spacing:.04em;line-height:1;opacity:.92;position:relative}
.tk-poster .cap{font-size:10px;letter-spacing:.3em;text-transform:uppercase;opacity:.7;position:relative}
.tk-poster:before{content:"";position:absolute;inset:-40% -15% auto auto;width:240px;height:240px;border-radius:50%;
  background:radial-gradient(circle,rgba(255,255,255,.20),transparent 62%)}
.tk-body{display:flex;flex-direction:column;gap:7px;padding:13px 15px 16px;flex:1}
.tk-meta{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--ink-3,#8a8a8f);flex-wrap:wrap}
.tk-pill{font-size:10.5px;padding:1px 8px;border-radius:999px;border:1px solid var(--line,#e5e5e3);color:var(--ink-3,#8a8a8f)}
.tk-title{font-size:14.5px;font-weight:650;line-height:1.5;color:var(--ink,#1d1d1f);
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.tk-sum{font-size:12.5px;line-height:1.65;color:var(--ink-3,#8a8a8f);
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.tk-star{position:absolute;top:8px;right:8px;z-index:3;width:30px;height:30px;border-radius:50%;border:none;cursor:pointer;
  display:flex;align-items:center;justify-content:center;background:rgba(10,15,30,.45);color:#fff;font-size:15px;
  transition:.15s;backdrop-filter:blur(6px)}
.tk-star:hover{transform:scale(1.08);background:rgba(10,15,30,.68)}
.tk-star.on{color:#fbbf24}
.tk-issue{display:flex;gap:16px;align-items:flex-start;padding:16px 18px;border-radius:16px;cursor:pointer;
  border:1px solid var(--line,#e5e5e3);background:var(--surface,#f6f6f4);transition:.18s;animation:tkIn .35s both;position:relative}
.tk-issue:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(15,23,42,.10);border-color:rgba(37,99,235,.35)}
.tk-issue-date{min-width:92px;font-size:19px;font-weight:750;color:var(--ink,#1d1d1f);font-variant-numeric:tabular-nums}
.tk-issue-date small{display:block;font-size:11px;font-weight:500;color:var(--ink-3,#8a8a8f);margin-top:2px}
.tk-issue h3{margin:0 0 4px;font-size:14.5px;line-height:1.5;font-weight:650}
.tk-issue p{margin:0;font-size:12.5px;line-height:1.65;color:var(--ink-3,#8a8a8f)}
.tk-stack{display:flex;flex-direction:column;gap:14px}
.tk-reader{max-width:820px;margin:0 auto;animation:tkIn .35s both}
.tk-reader-cover{border-radius:18px;overflow:hidden;margin-bottom:22px;max-height:340px}
.tk-reader-cover img{width:100%;height:100%;object-fit:cover;display:block}
.tk-reader h2{font-size:27px;line-height:1.4;margin:0 0 10px;letter-spacing:.1px}
.tk-reader-meta{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12px;color:var(--ink-3,#8a8a8f);margin-bottom:18px}
.tk-reader-hero{position:relative;overflow:hidden;border-radius:20px;padding:26px 28px;color:#fff;margin-bottom:22px;
  background:linear-gradient(118deg,#0b1220 0%,#12224a 38%,#1f3f8f 68%,#6d28d9 100%);
  box-shadow:0 18px 44px rgba(15,23,42,.20)}
.tk-reader-hero:before{content:"";position:absolute;inset:-50% -15% auto auto;width:460px;height:460px;
  background:radial-gradient(circle,rgba(255,255,255,.18),transparent 62%);pointer-events:none}
.tk-reader-hero h2{position:relative;font-size:24px;line-height:1.38;margin:8px 0 8px;font-weight:750}
.tk-reader-hero p{position:relative;margin:0;font-size:13px;opacity:.78;line-height:1.7}
.tk-reader-hero .tk-kicker{position:relative;font-size:11px;letter-spacing:.3em;text-transform:uppercase;opacity:.7}
.tk-reader-hero .tk-hero-actions{position:relative;margin-top:16px}
.tk-entry{display:flex;gap:14px;align-items:flex-start;padding:14px;cursor:pointer;animation:tkIn .35s both;position:relative;
  border:1px solid var(--line,#e5e5e3);border-radius:16px;background:var(--surface,#f6f6f4);
  transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease}
.tk-entry:hover{transform:translateY(-2px);box-shadow:0 12px 26px rgba(15,23,42,.10);border-color:rgba(37,99,235,.35)}
.tk-thumb{flex:none;width:104px;height:78px;border-radius:11px;overflow:hidden;
  background:linear-gradient(135deg,#1e2a4a,#3b4d7d 55%,#7c3aed)}
.tk-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.tk-entry-main{min-width:0;flex:1}
.tk-entry-meta{display:flex;gap:8px;align-items:center;font-size:11.5px;color:var(--ink-3,#8a8a8f);margin-bottom:5px;flex-wrap:wrap}
.tk-entry-title{font-size:14.5px;font-weight:650;line-height:1.5;color:var(--ink,#1d1d1f);margin-bottom:4px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.tk-entry-sum{font-size:12.5px;line-height:1.65;color:var(--ink-3,#8a8a8f);
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.tk-reader-body{white-space:pre-wrap;font-size:14.5px;line-height:1.95;color:var(--ink,#1d1d1f);word-break:break-word}
.tk-sources{margin-top:26px;padding-top:16px;border-top:1px solid var(--line,#e5e5e3);font-size:12.5px}
.tk-sources h4{margin:0 0 8px;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-3,#8a8a8f)}
.tk-sources a{display:block;color:var(--accent,#2563eb);text-decoration:none;margin-bottom:6px;word-break:break-all}
.tk-sources a:hover{text-decoration:underline}
.tk-back{display:inline-flex;align-items:center;gap:6px;margin-bottom:20px;padding:7px 14px;border-radius:999px;
  border:1px solid var(--line,#e5e5e3);background:var(--surface,#f6f6f4);color:var(--ink-2,#4b4b50);
  font-size:12.5px;cursor:pointer;transition:.16s}
.tk-back:hover{border-color:var(--accent,#2563eb);color:var(--accent,#2563eb)}
.tk-empty{margin-top:26px;padding:34px;text-align:center;border:1px dashed var(--line,#e5e5e3);
  border-radius:16px;color:var(--ink-3,#8a8a8f);font-size:13px}
.tk-error{margin:0 0 18px;padding:11px 14px;border-radius:12px;background:#fdecec;color:#b42318;font-size:13px}
.tk-skel{border-radius:16px;overflow:hidden;border:1px solid var(--line,#e5e5e3);background:var(--surface,#f6f6f4)}
.tk-skel .a{aspect-ratio:16/9;background:linear-gradient(90deg,var(--bg-sunk,#efefec) 25%,var(--surface,#f6f6f4) 37%,var(--bg-sunk,#efefec) 63%);
  background-size:400% 100%;animation:tkSh 1.3s infinite}
.tk-skel .b{padding:14px}
.tk-skel .l{height:11px;border-radius:6px;background:var(--bg-sunk,#efefec);margin-bottom:9px;animation:tkSh 1.3s infinite}
.tk-skel .l.w60{width:60%}
.tk-toast{position:fixed;left:50%;bottom:38px;transform:translateX(-50%);z-index:60;
  background:rgba(15,23,42,.94);color:#fff;padding:10px 20px;border-radius:999px;font-size:13px;
  box-shadow:0 10px 30px rgba(0,0,0,.25);animation:tkIn .25s both}
.tk-action{padding:6px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.10);
  color:#fff;font-size:12px;cursor:pointer;transition:.15s}
.tk-action:hover{background:rgba(255,255,255,.2)}
.tk-action-ink{padding:6px 12px;border-radius:999px;border:1px solid var(--line,#e5e5e3);background:var(--surface,#f6f6f4);
  color:var(--ink-2,#4b4b50);font-size:12px;cursor:pointer;transition:.15s}
.tk-action-ink:hover{border-color:var(--accent,#2563eb);color:var(--accent,#2563eb)}
@keyframes tkIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes tkSh{0%{background-position:100% 0}100%{background-position:0 0}}
@media (max-width:720px){.tk-wrap{padding:18px 16px 70px}.tk-hero{padding:22px 20px}.tk-hero h2{font-size:20px}}
@media (max-width:520px){.tk-thumb{width:76px;height:60px}.tk-reader-hero{padding:20px}}
`

    async function api(path) {
      const res = await fetch(path, { headers: { accept: 'application/json' } })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data && data.error ? data.error : 'HTTP ' + res.status)
      return data
    }

    function loadSaved() {
      try {
        const raw = window.localStorage.getItem(SAVED_KEY)
        const list = raw ? JSON.parse(raw) : []
        return Array.isArray(list) ? list : []
      } catch {
        return []
      }
    }

    function saveSaved(list) {
      try { window.localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, 200))) } catch { /* noop */ }
    }

    function dateParts(date) {
      const m = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (!m) return { main: date || '', sub: '' }
      return { main: m[2] + '/' + m[3], sub: m[1] }
    }

    function Cover(props) {
      const { image, label, category } = props
      if (image) {
        return h('div', { className: 'tk-cover' },
          h('img', { src: image, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }))
      }
      const palette = PALETTES[category] || ['#0b1220', '#1e3a8a', '#6d28d9']
      return h('div', {
        className: 'tk-cover',
        style: { background: 'linear-gradient(135deg,' + palette[0] + ' 0%,' + palette[1] + ' 58%,' + palette[2] + ' 100%)' },
      }, h('div', { className: 'tk-poster' },
        h('div', { className: 'glyph' }, GLYPHS[category] || 'TAKE'),
        h('div', { className: 'cap' }, label || 'TAKE'),
      ))
    }

    function Star(props) {
      const { on, onClick } = props
      return h('button', {
        type: 'button',
        className: 'tk-star' + (on ? ' on' : ''),
        title: on ? '取消收藏' : '收藏',
        onClick: (event) => { event.stopPropagation(); onClick() },
      }, on ? '★' : '☆')
    }

    function Card(props) {
      const { item, index, onOpen, saved, onToggle } = props
      return h('article', {
        className: 'tk-card',
        style: { animationDelay: Math.min(index || 0, 12) * 28 + 'ms' },
        onClick: () => onOpen(item),
        role: 'button', tabIndex: 0,
        onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') onOpen(item) },
      },
        h(Cover, { image: item.image, label: item.categoryLabel || (item.kind === 'topic' ? 'TOPIC' : 'TAKE'), category: item.category }),
        h(Star, { on: saved, onClick: () => onToggle(item) }),
        h('div', { className: 'tk-body' },
          h('div', { className: 'tk-meta' },
            item.date ? h('span', null, item.date) : null,
            item.categoryLabel ? h('span', { className: 'tk-pill' }, item.categoryLabel) : null,
            item.kind === 'topic' ? h('span', { className: 'tk-pill' }, '专题') : null,
          ),
          h('div', { className: 'tk-title' }, item.title),
          item.summary ? h('div', { className: 'tk-sum' }, item.summary) : null,
        ),
      )
    }

    function IssueCard(props) {
      const { item, index, onOpen, saved, onToggle } = props
      const parts = dateParts(item.date)
      return h('article', {
        className: 'tk-issue',
        style: { animationDelay: Math.min(index || 0, 12) * 28 + 'ms' },
        onClick: () => onOpen(item),
        role: 'button', tabIndex: 0,
        onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') onOpen(item) },
      },
        h('div', { className: 'tk-issue-date' }, parts.main, h('small', null, parts.sub)),
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('h3', null, item.title),
          item.summary ? h('p', null, item.summary) : null,
        ),
        h(Star, { on: saved, onClick: () => onToggle(item) }),
      )
    }

    function SkeletonGrid(props) {
      const count = props.count || 6
      return h('div', { className: 'tk-grid' },
        Array.from({ length: count }).map((_, i) => h('div', { key: i, className: 'tk-skel' },
          h('div', { className: 'a' }),
          h('div', { className: 'b' },
            h('div', { className: 'l' }),
            h('div', { className: 'l w60' }),
          ),
        )),
      )
    }

    function EntryRow(props) {
      const { entry, index, onOpen, saved, onToggle } = props
      function open() { onOpen({ route: entry.route, id: entry.id }) }
      return h('article', {
        className: 'tk-entry',
        style: { animationDelay: Math.min(index || 0, 14) * 24 + 'ms' },
        onClick: open, role: 'button', tabIndex: 0,
        onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') open() },
      },
        h('div', { className: 'tk-thumb' },
          entry.image ? h('img', { src: entry.image, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }) : null,
        ),
        h('div', { className: 'tk-entry-main' },
          h('div', { className: 'tk-entry-meta' },
            entry.date ? h('span', null, entry.date) : null,
            entry.categoryLabel ? h('span', { className: 'tk-pill' }, entry.categoryLabel) : null,
          ),
          h('div', { className: 'tk-entry-title' }, entry.title),
          entry.summary ? h('div', { className: 'tk-entry-sum' }, entry.summary) : null,
        ),
        h(Star, { on: saved, onClick: () => onToggle(entry) }),
      )
    }

    function Reader(props) {
      const { detail, onBack, onOpenEntry, saved, onToggle, onCopy } = props
      const entries = Array.isArray(detail.entries) ? detail.entries : []
      const digest = () => [detail.title]
        .concat(entries.slice(0, 5).map((entry, i) => (i + 1) + '. ' + entry.title))
        .concat([detail.url])
        .join('\n')
      if (entries.length > 0) {
        const kicker = detail.kind === 'daily' ? 'AI 影像日报' : detail.kind === 'topic' ? '主题归档' : 'Take'
        return h('div', { className: 'tk-reader' },
          h('button', { type: 'button', className: 'tk-back', onClick: onBack }, '← 返回'),
          h('div', { className: 'tk-reader-hero' },
            h('div', { className: 'tk-kicker' }, kicker),
            h('h2', null, detail.title),
            h('p', null, entries.length + ' 条内容 · 点击任意条目阅读全文'),
            h('div', { className: 'tk-hero-actions' },
              h('button', { type: 'button', className: 'tk-action', onClick: () => onCopy(digest(), '分享文案已复制') }, '复制分享文案'),
              h('a', {
                className: 'tk-btn-ghost', href: detail.url, target: '_blank', rel: 'noreferrer',
                style: { textDecoration: 'none' },
              }, '在 take.hk 打开 ↗'),
            ),
          ),
          h('div', { className: 'tk-stack' },
            entries.map((entry, index) => h(EntryRow, {
              key: (entry.route || '') + index, entry, index, onOpen: onOpenEntry,
              saved: saved(entry.route), onToggle,
            })),
          ),
        )
      }
      return h('div', { className: 'tk-reader' },
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' } },
          h('button', { type: 'button', className: 'tk-back', style: { marginBottom: 0 }, onClick: onBack }, '← 返回'),
          h('button', { type: 'button', className: 'tk-action-ink', onClick: () => onToggle({ route: detail.route, id: detail.route, title: detail.title, url: detail.url, kind: 'saved' }) }, saved(detail.route) ? '★ 已收藏' : '☆ 收藏'),
          h('button', { type: 'button', className: 'tk-action-ink', onClick: () => onCopy(detail.title + '\n' + detail.url, '链接已复制') }, '复制标题+链接'),
        ),
        detail.image
          ? h('div', { className: 'tk-reader-cover' }, h('img', { src: detail.image, alt: '', referrerPolicy: 'no-referrer' }))
          : null,
        h('h2', null, detail.title),
        h('div', { className: 'tk-reader-meta' },
          detail.totalChars ? h('span', null, detail.totalChars + ' 字') : null,
          detail.truncated ? h('span', null, '（已截断）') : null,
          h('a', { className: 'tk-link', href: detail.url, target: '_blank', rel: 'noreferrer' }, '在 take.hk 打开 ↗'),
        ),
        h('div', { className: 'tk-reader-body' }, detail.text),
        detail.links && detail.links.length
          ? h('div', { className: 'tk-sources' },
              h('h4', null, '原文 / 来源'),
              detail.links.map((link, i) => h('a', { key: i, href: link, target: '_blank', rel: 'noreferrer' }, link)),
            )
          : null,
      )
    }

    function TakePanel() {
      const [tab, setTab] = useState('daily')
      const [category, setCategory] = useState('')
      const [query, setQuery] = useState('')
      const [submitted, setSubmitted] = useState('')
      const [list, setList] = useState([])
      const [summary, setSummary] = useState(null)
      const [detail, setDetail] = useState(null)
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState('')
      const [savedList, setSavedList] = useState(loadSaved)
      const [toast, setToast] = useState('')
      const requestId = useRef(0)
      const scroller = useRef(null)
      const toastTimer = useRef(null)

      function scrollTop() {
        try { if (scroller.current) scroller.current.scrollTo({ top: 0, behavior: 'smooth' }) } catch { /* noop */ }
      }

      function showToast(text) {
        setToast(text)
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToast(''), 1800)
      }

      function toggleSaved(item) {
        const route = item.route || item.id
        if (!route) return
        setSavedList((prev) => {
          const exists = prev.some((row) => row.route === route)
          const next = exists
            ? prev.filter((row) => row.route !== route)
            : [{ route, id: item.id || route, title: item.title || route, date: item.date || '', summary: item.summary || '', category: item.category || '', categoryLabel: item.categoryLabel || '', image: item.image || '', url: item.url || '', kind: item.kind || 'saved' }].concat(prev)
          saveSaved(next)
          showToast(exists ? '已取消收藏' : '已收藏')
          return next
        })
      }

      const isSaved = (route) => savedList.some((row) => row.route === route)

      async function copy(text, message) {
        try {
          await navigator.clipboard.writeText(text)
          showToast(message || '已复制')
        } catch {
          showToast('复制失败，请手动选择文本')
        }
      }

      async function loadTab(nextTab, cat, q) {
        if (nextTab === 'saved') return savedList
        if (q) {
          const data = await api('/take/api/search?q=' + encodeURIComponent(q) + '&limit=30' + (cat ? '&category=' + encodeURIComponent(cat) : ''))
          return (data.results || []).map((row) => ({ ...row, kind: 'hit' }))
        }
        if (nextTab === 'daily') {
          const data = await api('/take/api/daily?limit=14')
          return (data.dailies || []).map((row) => ({ ...row, kind: 'daily' }))
        }
        if (nextTab === 'news') {
          const data = await api('/take/api/news?limit=36' + (cat ? '&category=' + encodeURIComponent(cat) : ''))
          return (data.items || []).map((row) => ({ ...row, kind: 'news' }))
        }
        const data = await api('/take/api/topics')
        return (data.topics || []).map((row) => ({ ...row, kind: 'topic' }))
      }

      async function refresh(nextTab, cat, q) {
        const id = ++requestId.current
        setLoading(true)
        setError('')
        setDetail(null)
        try {
          const rows = await loadTab(nextTab, cat, q)
          if (id === requestId.current) setList(rows)
        } catch (err) {
          if (id === requestId.current) { setList([]); setError(err && err.message ? err.message : String(err)) }
        } finally {
          if (id === requestId.current) setLoading(false)
        }
      }

      useEffect(() => {
        api('/take/api/summary').then(setSummary).catch(() => {})
        refresh('daily', '', '')
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      useEffect(() => {
        refresh(tab, category, submitted)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [tab, category])

      async function openItem(item) {
        const target = item.route || item.id
        if (!target) return
        setLoading(true)
        setError('')
        scrollTop()
        try {
          const data = await api('/take/api/read?target=' + encodeURIComponent(target))
          setDetail(data)
        } catch (err) {
          setError(err && err.message ? err.message : String(err))
        } finally {
          setLoading(false)
        }
      }

      function openToday() {
        const route = summary && summary.latestDaily ? summary.latestDaily.route : '/today'
        openItem({ route })
      }

      const hero = summary && summary.latestDaily
        ? h('section', { className: 'tk-hero' },
            h('div', { className: 'tk-kicker' }, 'AI 影像日报 · ' + summary.latestDaily.date),
            h('h2', null, summary.latestDaily.title),
            h('p', null, '今天 Take 收录了 ' + (summary.counts ? summary.counts.items : '') + ' 条精选资讯、' + (summary.counts ? summary.counts.dailies : '') + ' 期日报与 ' + (summary.counts ? summary.counts.topics : '') + ' 个主题库，数据来自 take.hk 公开快照。'),
            h('div', { className: 'tk-hero-actions' },
              h('button', { type: 'button', className: 'tk-btn', onClick: openToday }, '阅读今日日报'),
              h('a', { className: 'tk-btn-ghost', href: 'https://take.hk/', target: '_blank', rel: 'noreferrer' }, '打开 take.hk ↗'),
            ),
          )
        : null

      const isNews = tab === 'news' && !submitted
      const showSkeleton = loading && !detail

      return h('div', { className: 'tk-root', ref: scroller },
        h('style', null, CSS),
        h('div', { className: 'tk-wrap' },
          h('header', { className: 'tk-bar' },
            h('div', { className: 'tk-brand' },
              h('h1', null, 'Take 云开'),
              h('span', { className: 'tk-stamp' }, summary && summary.stamp ? '快照 ' + summary.stamp : 'AI 影像创作者资源'),
            ),
            h('div', { className: 'tk-spacer' }),
            h('form', {
              className: 'tk-search',
              onSubmit: (event) => { event.preventDefault(); setSubmitted(query.trim()); refresh(tab, category, query.trim()); scrollTop() },
            },
              h('input', {
                className: 'tk-input', value: query,
                placeholder: '搜索模型 / 工具 / 创作者 / 主题…',
                onChange: (event) => setQuery(event.target.value),
              }),
              h('button', { type: 'submit', className: 'tk-btn' }, '搜索'),
            ),
          ),
          h('nav', { className: 'tk-tabs' },
            TABS.map(([key, label]) => h('button', {
              key, type: 'button',
              className: 'tk-tab' + (tab === key && !submitted ? ' on' : ''),
              onClick: () => { setTab(key); setQuery(''); setSubmitted(''); setDetail(null); scrollTop() },
            }, label + (key === 'saved' && savedList.length ? ' ' + savedList.length : ''))),
            submitted
              ? h('button', {
                  type: 'button', className: 'tk-tab on',
                  onClick: () => { setQuery(''); setSubmitted(''); refresh(tab, category, ''); scrollTop() },
                }, '搜索：' + submitted + ' ✕')
              : null,
          ),
          isNews
            ? h('div', { className: 'tk-chips' },
                h('button', { type: 'button', className: 'tk-chip' + (category === '' ? ' on' : ''), onClick: () => setCategory('') }, '全部'),
                CATEGORIES.map(([slug, label]) => h('button', {
                  key: slug, type: 'button',
                  className: 'tk-chip' + (category === slug ? ' on' : ''),
                  onClick: () => setCategory(slug),
                }, label)),
              )
            : null,
          error ? h('div', { className: 'tk-error' }, '加载失败：' + error) : null,
          detail
            ? h(Reader, {
                detail,
                onBack: () => setDetail(null),
                onOpenEntry: openItem,
                saved: (route) => isSaved(route || (detail && detail.route)),
                onToggle: toggleSaved,
                onCopy: copy,
              })
            : h('div', null,
                tab === 'daily' && !submitted && !loading ? hero : null,
                showSkeleton
                  ? h(SkeletonGrid, { count: tab === 'daily' ? 4 : 6 })
                  : h('div', { className: tab === 'daily' ? 'tk-stack' : 'tk-grid' },
                      list.map((item, index) => tab === 'daily'
                        ? h(IssueCard, {
                            key: (item.route || item.date || '') + index, item, index, onOpen: openItem,
                            saved: isSaved(item.route), onToggle: toggleSaved,
                          })
                        : h(Card, {
                            key: (item.route || item.id || '') + index, item, index, onOpen: openItem,
                            saved: isSaved(item.route), onToggle: toggleSaved,
                          })),
                    ),
                !loading && !error && list.length === 0
                  ? h('div', { className: 'tk-empty' },
                      tab === 'saved'
                        ? '还没有收藏。在卡片右上角点 ☆，或打开文章后点「收藏」。'
                        : '没有内容。换一个分类或关键词试试。')
                  : null,
              ),
          h('footer', { style: { marginTop: 34, fontSize: 11.5, color: 'var(--ink-4,#a8a8ad)', lineHeight: 1.7 } },
            '只读浏览 · 数据来自 take.hk 公开站点快照 · 与 take_* 工具同源',
          ),
        ),
        toast ? h('div', { className: 'tk-toast' }, toast) : null,
      )
    }

    function TakeIcon({ size }) {
      const edge = typeof size === 'number' ? size : 20
      return h('svg', {
        viewBox: '0 0 24 24', width: edge, height: edge, 'aria-hidden': true,
        style: { display: 'block' },
      },
        h('rect', { x: 2, y: 2, width: 20, height: 20, rx: 6, fill: 'currentColor', opacity: 0.12 }),
        h('path', { d: 'M5 7h14v3h-5v9h-4v-9H5z', fill: 'currentColor' }),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PAGE_KEY }, TakePanel))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: PAGE_KEY, order: 7, label: () => 'Take',
        }, TakeIcon))
      },
    }
  },
})
