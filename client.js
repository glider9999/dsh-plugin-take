// dsh-plugin-take — Web UI half.
//
// Registers a left-sidebar panel icon ("Take") and the matching main panel: a
// read-only browser for take.hk with search, daily briefings, news items,
// topic archives and an in-page reader. All data comes from the Host half over
// the same-origin `/take/api/*` routes, so no cross-origin requests are made.
window.__ModuleLoader__.load({
  id: 'dsh-plugin-take',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useMemo, useRef, useState } = React

    const T = {
      bg: 'var(--bg, #ffffff)',
      surface: 'var(--surface, #f6f6f4)',
      ink: 'var(--ink, #1d1d1f)',
      ink2: 'var(--ink-2, #4b4b50)',
      ink3: 'var(--ink-3, #8a8a8f)',
      line: 'var(--line, #e5e5e3)',
      accent: 'var(--accent, #2563eb)',
      sunk: 'var(--bg-sunk, #efefec)',
    }
    const CATEGORIES = [
      ['video-models', 'AI 视频模型'],
      ['tools', 'AI 影像工具'],
      ['works', 'AI 作品与案例'],
      ['industry', '影视与 AI 行业'],
      ['paper', '研究'],
      ['tip', '教程'],
      ['opinion', '观点'],
    ]
    const PAGE_KEY = 'take'

    async function api(path) {
      const res = await fetch(path, { headers: { accept: 'application/json' } })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data && data.error ? data.error : 'HTTP ' + res.status)
      return data
    }

    function badge(text) {
      return h('span', {
        style: {
          fontSize: 11, padding: '1px 6px', borderRadius: 999, color: T.ink3,
          border: '1px solid ' + T.line, whiteSpace: 'nowrap',
        },
      }, text)
    }

    function Row(props) {
      const { item, onOpen } = props
      return h('button', {
        type: 'button',
        onClick: () => onOpen(item),
        style: {
          display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
          background: 'transparent', border: 'none', borderBottom: '1px solid ' + T.line,
          padding: '12px 4px', color: T.ink,
        },
      },
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' } },
          item.date ? h('span', { style: { fontSize: 12, color: T.ink3, fontVariantNumeric: 'tabular-nums' } }, item.date) : null,
          item.categoryLabel ? badge(item.categoryLabel) : null,
          h('span', { style: { fontSize: 14.5, fontWeight: 600, lineHeight: 1.4, color: T.ink } }, item.title),
        ),
        item.summary ? h('div', { style: { marginTop: 4, fontSize: 13, lineHeight: 1.55, color: T.ink2 } }, item.summary) : null,
      )
    }

    function Detail(props) {
      const { detail, onBack } = props
      if (!detail) return null
      return h('div', { style: { padding: '4px 4px 32px' } },
        h('button', {
          type: 'button', onClick: onBack,
          style: {
            marginBottom: 12, padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
            border: '1px solid ' + T.line, background: T.surface, color: T.ink2, fontSize: 13,
          },
        }, '← 返回列表'),
        h('h2', { style: { margin: '4px 0 6px', fontSize: 20, lineHeight: 1.35, color: T.ink } }, detail.title),
        h('div', { style: { fontSize: 12, color: T.ink3 } },
          h('a', { href: detail.url, target: '_blank', rel: 'noreferrer', style: { color: T.accent, textDecoration: 'none' } }, '在 take.hk 打开'),
        ),
        h('div', {
          style: {
            marginTop: 16, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.8,
            color: T.ink, wordBreak: 'break-word',
          },
        }, detail.text),
        detail.links && detail.links.length
          ? h('div', { style: { marginTop: 20, fontSize: 13, color: T.ink2 } },
              h('div', { style: { fontWeight: 600, marginBottom: 6 } }, '原文 / 来源'),
              detail.links.map((link, i) => h('div', { key: i, style: { marginBottom: 4, wordBreak: 'break-all' } },
                h('a', { href: link, target: '_blank', rel: 'noreferrer', style: { color: T.accent, textDecoration: 'none' } }, link),
              )),
            )
          : null,
      )
    }

    function TakePanel() {
      const [tab, setTab] = useState('daily')
      const [category, setCategory] = useState('')
      const [query, setQuery] = useState('')
      const [list, setList] = useState([])
      const [summary, setSummary] = useState(null)
      const [detail, setDetail] = useState(null)
      const [loading, setLoading] = useState(false)
      const [error, setError] = useState('')
      const requestId = useRef(0)

      async function loadDaily() {
        const data = await api('/take/api/daily?limit=12')
        setList((data.dailies || []).map((d) => ({ ...d, kind: 'daily' })))
      }
      async function loadNews(cat) {
        const data = await api('/take/api/news?limit=30' + (cat ? '&category=' + encodeURIComponent(cat) : ''))
        setList((data.items || []).map((d) => ({ ...d, kind: 'news' })))
      }
      async function loadTopics() {
        const data = await api('/take/api/topics')
        setList((data.topics || []).map((d) => ({ ...d, kind: 'topic' })))
      }
      async function doSearch(q, cat) {
        const data = await api('/take/api/search?q=' + encodeURIComponent(q) + '&limit=30' + (cat ? '&category=' + encodeURIComponent(cat) : ''))
        setList((data.results || []).map((d) => ({ ...d, kind: 'hit' })))
      }

      async function refresh(nextTab, cat, q) {
        const id = ++requestId.current
        setLoading(true)
        setError('')
        setDetail(null)
        try {
          if (q) await doSearch(q, cat)
          else if (nextTab === 'daily') await loadDaily()
          else if (nextTab === 'news') await loadNews(cat)
          else await loadTopics()
        } catch (err) {
          setError(err && err.message ? err.message : String(err))
          setList([])
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
        refresh(tab, category, query.trim())
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [tab, category])

      async function openItem(item) {
        setLoading(true)
        setError('')
        try {
          const target = item.route || item.id
          const data = await api('/take/api/read?target=' + encodeURIComponent(target))
          setDetail(data)
        } catch (err) {
          setError(err && err.message ? err.message : String(err))
        } finally {
          setLoading(false)
        }
      }

      const tabs = [
        ['daily', '日报'],
        ['news', '精选'],
        ['topics', '专题'],
      ]

      return h('div', {
        style: {
          height: '100%', overflow: 'auto', background: T.bg, color: T.ink,
          padding: '18px 22px 40px', boxSizing: 'border-box',
        },
      },
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' } },
          h('div', { style: { fontSize: 22, fontWeight: 700, letterSpacing: 0.2 } }, 'Take 云开'),
          h('div', { style: { fontSize: 12, color: T.ink3 } },
            summary && summary.stamp ? '站点快照 ' + summary.stamp : 'AI 影像创作者资源'),
          h('a', {
            href: 'https://take.hk/', target: '_blank', rel: 'noreferrer',
            style: { marginLeft: 'auto', fontSize: 13, color: T.accent, textDecoration: 'none' },
          }, '打开 take.hk ↗'),
        ),
        h('div', { style: { display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' } },
          tabs.map(([key, label]) => h('button', {
            key,
            type: 'button',
            onClick: () => { setTab(key); setQuery(''); setDetail(null) },
            style: {
              padding: '6px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13,
              border: '1px solid ' + (tab === key ? T.accent : T.line),
              background: tab === key ? T.accent : 'transparent',
              color: tab === key ? '#fff' : T.ink2,
            },
          }, label)),
          h('form', {
            onSubmit: (event) => { event.preventDefault(); refresh(tab, category, query.trim()) },
            style: { display: 'flex', gap: 6, flex: '1 1 260px', minWidth: 220 },
          },
            h('input', {
              value: query,
              onChange: (event) => setQuery(event.target.value),
              placeholder: '搜索 take.hk（模型 / 工具 / 创作者 / 主题）',
              style: {
                flex: 1, minWidth: 0, padding: '7px 11px', borderRadius: 8, fontSize: 13,
                border: '1px solid ' + T.line, background: T.surface, color: T.ink, outline: 'none',
              },
            }),
            h('button', {
              type: 'submit',
              style: {
                padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                border: '1px solid ' + T.accent, background: T.accent, color: '#fff',
              },
            }, '搜索'),
          ),
        ),
        tab === 'news'
          ? h('div', { style: { display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' } },
              h('button', {
                type: 'button', onClick: () => setCategory(''),
                style: {
                  padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 12,
                  border: '1px solid ' + (category === '' ? T.accent : T.line),
                  background: category === '' ? T.accent : 'transparent',
                  color: category === '' ? '#fff' : T.ink2,
                },
              }, '全部'),
              CATEGORIES.map(([slug, label]) => h('button', {
                key: slug, type: 'button', onClick: () => setCategory(slug),
                style: {
                  padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 12,
                  border: '1px solid ' + (category === slug ? T.accent : T.line),
                  background: category === slug ? T.accent : 'transparent',
                  color: category === slug ? '#fff' : T.ink2,
                },
              }, label)),
            )
          : null,
        error
          ? h('div', { style: { marginTop: 18, padding: '10px 12px', borderRadius: 8, background: '#fdecec', color: '#b42318', fontSize: 13 } }, '加载失败：' + error)
          : null,
        loading
          ? h('div', { style: { marginTop: 24, fontSize: 13, color: T.ink3 } }, '正在读取 take.hk 站点快照…')
          : null,
        detail
          ? h(Detail, { detail, onBack: () => setDetail(null) })
          : h('div', { style: { marginTop: 10 } },
              list.length === 0 && !loading && !error
                ? h('div', { style: { marginTop: 20, fontSize: 13, color: T.ink3 } }, '没有内容。试试换一个分类或关键词。')
                : null,
              list.map((item, index) => h(Row, {
                key: (item.route || item.id || '') + ':' + index,
                item,
                onOpen: openItem,
              })),
            ),
        h('div', { style: { marginTop: 24, fontSize: 11.5, color: T.ink3, lineHeight: 1.7 } },
          '只读浏览 · 数据来自 take.hk 公开站点快照 · 是否在 take.hk 上以站点收录为准',
        ),
      )
    }

    function TakeIcon({ size }) {
      const edge = typeof size === 'number' ? size : 20
      return h('svg', {
        viewBox: '0 0 24 24', width: edge, height: edge, 'aria-hidden': true,
        style: { display: 'block' },
      },
        h('rect', { x: 2, y: 2, width: 20, height: 20, rx: 5, fill: 'currentColor', opacity: 0.12 }),
        h('path', { d: 'M5 7h14v3h-5v9h-4v-9H5z', fill: 'currentColor' }),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: PAGE_KEY,
        }, TakePanel))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: PAGE_KEY, order: 7,
          label: () => 'Take',
        }, TakeIcon))
      },
    }
  },
})
