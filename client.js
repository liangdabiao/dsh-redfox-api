// ============================================================================
// RedFox API 助手 · 浏览器半边（调研工作台）。
// 布局对齐「TikHub 调研工作台」：🏠 概览 / 📋 调用历史 / 🔎 端点库 / ⚙️ 设置 / 📖 指南。
// RedFox 特性：业务码三分类（2000 成功 / 3203·3801 查无数据 / 其他错误）+ 扣费提示。
// 按钮怎么工作：点击 → startPrompt(prompt) → 宿主 uiWorkspace.startSession(...)
// → 打开新对话并把指令填进输入框（不自动发送）。
// ============================================================================
const h = require('react').createElement
const { useState, useEffect, useRef } = require('react')

const PANEL_ID = 'redfox-api'
const BASE = 'redfox-api'

let startPrompt = null
function act(prompt) {
  if (startPrompt) startPrompt(prompt)
}

function PanelIcon({ size = 24, ...rest } = {}) {
  // 纯几何狐狸头（不用 emoji / <text>，避免字体替换把图标画成豆腐块）。
  return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', ...rest },
    h('path', { d: 'M5 5l5 3h4l5-3-1.5 8c-1 3-3.5 5-5.5 5s-4.5-2-5.5-5z', fill: '#c2410c' }),
    h('path', { d: 'M12 14.5l2.3 1.4L12 18.7 9.7 15.9z', fill: '#fff', fillOpacity: 0.92 }),
    h('circle', { cx: 9.7, cy: 11.2, r: 1.1, fill: '#fff' }),
    h('circle', { cx: 14.3, cy: 11.2, r: 1.1, fill: '#fff' }))
}

async function fetchJson(path) {
  const res = await fetch(BASE + path)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`)
  return data
}

function fmtTime(iso) {
  try {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
  } catch { return iso || '' }
}

const SOURCE_LABEL = { panel: '面板已保存', config: '插件 Config', env: 'REDFOX_API_KEY 环境变量', none: '未配置' }

const KIND_LABEL = { ok: '✓ 成功', no_data: '◌ 无数据', error: '✗ 错误' }
const KIND_COLOR = { ok: '#1a7f37', no_data: '#b58a00', error: '#c0392b' }

function statusText(r) {
  if (r.status === 'running') return '⏳ 调用中'
  if (r.kind === 'ok') return `✓ ${r.code != null ? 'code ' + r.code : r.httpStatus || ''}`
  if (r.kind === 'no_data') return `◌ 无数据${r.code != null ? ' ' + r.code : ''}`
  return `✗ ${r.code != null ? 'code ' + r.code : r.httpStatus || (r.error || '').slice(0, 24) || ''}`
}
function statusColor(r) {
  return r.status === 'running' ? '#b58a00' : KIND_COLOR[r.kind] || (r.status === 'ok' ? '#1a7f37' : '#c0392b')
}

// ---------------------------------------------------------------------------
// 🏠 概览
// ---------------------------------------------------------------------------
const QUICK = [
  { icon: '🔥', label: '抖音热点榜', prompt: '拉取抖音最近两天的热点榜数据（redfox_endpoint 找热点榜端点 → redfox_endpoint action=detail 查参数 → redfox_call 调用），按热度汇总成今日热点简报。' },
  { icon: '📕', label: '小红书笔记搜索', prompt: '帮我调研小红书「」关键词下的笔记：先 redfox_endpoint 找小红书笔记搜索端点，再 action=detail 查必填参数，然后 redfox_call 调用并汇总。' },
  { icon: '🎵', label: '抖音账号搜索', prompt: '在抖音搜索这个关键词相关的账号并分析简介与作品数据：先用 redfox_endpoint 找账号搜索端点，再 redfox_call 调用。关键词：' },
  { icon: '🌐', label: '全网热搜关键词', prompt: '查「」这个关键词的全网热搜趋势（hotSpot getListByPlatformWithKeyword）：先 redfox_endpoint action=detail 看参数，再 redfox_call 调用。关键词：' },
]

function HomeTab(props) {
  const [stats, setStats] = useState(null)
  const [calls, setCalls] = useState(null)
  const [balance, setBalance] = useState(null)
  const [reports, setReports] = useState(null)
  const [homeDir, setHomeDir] = useState('')
  const [error, setError] = useState('')
  const load = () => {
    setError('')
    fetchJson('/api/stats')
      .then((s) => { setStats(s); if (s.configured) fetchJson('/api/balance').then(setBalance).catch(() => setBalance({ error: '余额获取失败' })) })
      .catch((e) => setError(e.message))
    fetchJson('/api/calls').then((c) => setCalls(c.calls)).catch(() => {})
  }
  useEffect(() => { load() }, [])
  // 概览上的「最新报告」：拿最近活跃工作区的前 3 篇，点进去看全部。
  useEffect(() => {
    fetchJson('/api/reports/workspaces')
      .then((d) => {
        const w = d.workspaces?.[0]
        if (!w) { setReports([]); return }
        setHomeDir(w.path)
        fetchJson('/api/reports/list?dir=' + encodeURIComponent(w.path))
          .then((r) => setReports((r.entries || []).slice(0, 3)))
          .catch(() => setReports([]))
      })
      .catch(() => setReports([]))
  }, [])
  if (error && !stats) return h('div', { style: styles.error }, error)
  const recent = (calls || []).slice(0, 5)
  const needsKey = stats != null && !stats.configured
  return h('div', null,
    error ? h('div', { style: styles.errorBox }, error) : null,
    h('div', { style: styles.ctaCard },
      h('div', { style: styles.ctaText },
        h('div', { style: styles.ctaTitle }, needsKey ? '先花 30 秒配好 API key' : '28 类 201 个红狐数据端点，随口就能查'),
        h('div', { style: styles.ctaMuted }, needsKey
          ? '没有 key 只能检索本地端点目录，redfox_call 会在最后一步报错。粘一个 key 就能真实调用（redfox.hk/settings/api-keys）。'
          : '点右边的按钮 → 打开新对话，输入框已填好示例；换成你的关键词回车即可。检索端点零积分，调用按次计费。')),
      h('button', {
        style: styles.ctaButton,
        onClick: () => (needsKey ? props.go('settings') : act('帮我调研抖音上「乐高」相关的热门视频和账号：先 redfox_endpoint 找端点，再 action=detail 查参数，然后 redfox_call 调用并汇总。')),
        title: needsKey ? '去设置里粘贴 RedFox API key' : '填进对话：先找端点再调用红狐数据',
      }, needsKey ? '⚙️ 配置 API key' : '🚀 发起新调研')),

    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '工作台'),
      h('div', { style: styles.statGrid },
        h('div', { style: styles.stat }, h('div', { style: styles.statNum }, stats ? String(stats.total) : '—'), h('div', { style: styles.mutedSmall }, '调用次数')),
        h('div', { style: styles.stat }, h('div', { style: { ...styles.statNum, color: '#1a7f37' } }, stats ? String(stats.ok) : '—'), h('div', { style: styles.mutedSmall }, '成功')),
        h('div', { style: styles.stat }, h('div', { style: { ...styles.statNum, color: '#b58a00' } }, stats ? String(stats.noData) : '—'), h('div', { style: styles.mutedSmall }, '无数据')),
        h('div', { style: styles.stat }, h('div', { style: { ...styles.statNum, color: '#c0392b' } }, stats ? String(stats.error) : '—'), h('div', { style: styles.mutedSmall }, '失败')),
        h('div', { style: styles.stat }, h('div', { style: styles.statNum }, stats ? String(stats.today) : '—'), h('div', { style: styles.mutedSmall }, '今日')),
        h('div', { style: styles.stat }, h('div', { style: { ...styles.statNum, color: stats?.configured ? '#1a7f37' : '#b58a00' } }, stats ? (stats.configured ? '✓' : '!') : '—'), h('div', { style: styles.mutedSmall }, 'Key'))),
      balance && !balance.error && balance.totalAvailablePoints != null ? h('div', { style: styles.ok }, `剩余积分 ${balance.totalAvailablePoints}（免费 ${balance.freeAvailablePoints ?? '—'} / 付费 ${balance.paidAvailablePoints ?? '—'}）`) : null,
      balance?.error ? h('div', { style: styles.errorBox }, `${balance.error}（点「刷新」重试）`) : null,
      !stats?.configured ? h('div', { style: styles.hint }, '还没配置 RedFox API key：点上面的「⚙️ 配置 API key」或去「⚙️ 设置」粘贴即可真实调用（redfox.hk/settings/api-keys 获取，或设 REDFOX_API_KEY 环境变量）。') : null),

    h('div', { style: styles.card },
      h('div', { style: styles.row },
        h('div', { style: styles.sectionTitle }, '常用调研'),
        h('span', { style: styles.grow }),
        h('span', { style: styles.mutedSmall }, '点一下 → 填进对话')),
      h('div', { style: styles.quickList },
        QUICK.map((q) => h('button', { key: q.label, style: styles.quick, onClick: () => act(q.prompt), title: `填进对话：${q.prompt}` },
          h('span', { style: styles.quickIcon }, q.icon), q.label)))),

    h('div', { style: styles.card },
      h('div', { style: styles.row },
        h('div', { style: styles.sectionTitle }, '📄 最新调研报告'),
        h('span', { style: styles.grow }),
        h('button', { style: styles.linkBtn, onClick: () => props.go('reports') }, '查看全部 →')),
      reports === null
        ? h('div', { style: styles.muted }, '加载中…')
        : reports.length === 0
          ? h('div', { style: styles.muted }, '工作区里还没有报告文件。让 agent 把这次调研写成 .md，这里就会列出来。')
          : reports.map((r) => h('div', { key: r.path, style: styles.callRow, onClick: () => props.go('reports', { dir: homeDir, path: r.path }) },
              h('span', { style: styles.reportName }, r.name),
              h('span', { style: styles.grow }),
              h('span', { style: styles.mutedSmall }, `${fmtSize(r.size)} · ${fmtDate(r.mtime)}`)))),

    h('div', { style: styles.card },
      h('div', { style: styles.row },
        h('div', { style: styles.sectionTitle }, '最近调用'),
        h('span', { style: styles.grow }),
        h('button', { style: styles.linkBtn, onClick: load }, '刷新'),
        h('button', { style: styles.linkBtn, onClick: () => props.go('history') }, '查看全部 →')),
      recent.length === 0
        ? h('div', { style: styles.muted }, '还没有调用记录。发起一次调用后，这里会按时间列出每次请求与业务码分类。')
        : recent.map((r) => h('div', { key: r.id, style: styles.callRow, onClick: () => props.open(r) },
          h('span', { style: { ...styles.status, color: statusColor(r) } }, statusText(r)),
          h('span', { style: styles.callPath }, `${r.method || 'GET'} ${r.path}`),
          h('span', { style: styles.mutedSmall }, r.note || fmtTime(r.ts))))))
}

// ---------------------------------------------------------------------------
// 📋 调用历史
// ---------------------------------------------------------------------------
function HistoryTab(props) {
  const [calls, setCalls] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(props.pending || null)
  const [confirmClear, setConfirmClear] = useState(false)
  const detailRef = useRef(null)

  const load = () => fetchJson('/api/calls').then((d) => { setCalls(d.calls); setError('') }).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])
  // 详情卡插在列表顶部，从底部点开时视口不动，等于「点了没反应」，要主动滚上去。
  useEffect(() => { if (selected) detailRef.current?.scrollIntoView?.({ block: 'nearest' }) }, [selected])

  const remove = async (id) => {
    try {
      await fetch(BASE + '/api/calls/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) })
      if (selected?.id === id) setSelected(null)
      await load()
    } catch (e) { setError(e.message) }
  }
  const clearAll = async () => {
    try {
      await fetch(BASE + '/api/calls/clear', { method: 'POST' })
      setSelected(null); setConfirmClear(false); await load()
    } catch (e) { setError(e.message) }
  }

  if (calls === null) return error ? h('div', { style: styles.error }, error) : h('div', { style: styles.muted }, '加载中…')

  const q = query.trim().toLowerCase()
  const filtered = q
    ? calls.filter((r) => `${r.method || ''} ${r.path} ${r.note || ''} ${r.kind || ''} ${JSON.stringify(r.params || {})}`.toLowerCase().includes(q))
    : calls

  return h('div', null,
    error ? h('div', { style: styles.errorBox }, error) : null,
    selected ? h('div', { ref: detailRef, style: styles.detailCard },
      h('div', { style: styles.row },
        h('span', { style: { ...styles.status, color: statusColor(selected) } }, statusText(selected)),
        h('span', { style: styles.callPath }, `${selected.method || 'GET'} ${selected.path}`),
        h('span', { style: styles.grow }),
        h('button', { style: styles.actionBtn, onClick: () => act(`再调用一次这个红狐端点（按次计费，先说明要花的积分并等我确认再调）：redfox_call method=${selected.method || 'GET'} path=${selected.path}\n参数：${JSON.stringify(selected.params || {})}${selected.note ? `\n用途：${selected.note}` : ''}`) }, '🔁 再调一次'),
        h('button', { style: styles.actionBtn, onClick: () => remove(selected.id) }, '🗑 删除'),
        h('button', { style: styles.linkBtn, onClick: () => setSelected(null) }, '关闭')),
      h('div', { style: styles.mutedSmall }, `${fmtTime(selected.ts)} · ${selected.method || 'GET'} · ${selected.ms != null ? `${selected.ms}ms` : '—'}${selected.code != null ? ` · code=${selected.code}` : ''}${selected.kind ? ` · ${KIND_LABEL[selected.kind] || selected.kind}` : ''}${selected.charge ? ` · ${selected.charge}` : ''}${selected.note ? ` · ${selected.note}` : ''}`),
      Object.keys(selected.params || {}).length ? h('pre', { style: styles.pre }, `参数\n${JSON.stringify(selected.params, null, 2)}`) : null,
      selected.error ? h('div', { style: styles.errorBox }, selected.error) : null,
      selected.responseSnippet
        ? h('pre', { style: styles.pre }, selected.responseSnippet)
        : h('div', { style: styles.muted }, '这条记录没有响应片段（旧记录或请求失败）。完整数据以工作区文件为准。')) : null,

    h('div', { style: styles.row },
      h('input', { style: styles.search, placeholder: '搜索路径 / 参数 / 用途…', value: query, onChange: (e) => setQuery(e.target.value) }),
      h('button', { style: styles.actionBtn, onClick: () => act('帮我调研小红书上的「保温杯」爆款笔记：先 redfox_endpoint 找端点，再 action=detail 查参数，然后 redfox_call 调用并汇总。') }, '🚀 新调研')),
    h('div', { style: styles.row },
      h('span', { style: styles.mutedSmall }, `共 ${calls.length} 条${q ? `，匹配 ${filtered.length} 条` : ''}`),
      h('span', { style: styles.grow }),
      confirmClear
        ? h('span', null,
            h('button', { style: styles.dangerBtn, onClick: clearAll }, '确认清空'),
            h('button', { style: styles.linkBtn, onClick: () => setConfirmClear(false) }, '取消'))
        : h('span', null,
            h('button', { style: styles.linkBtn, onClick: load }, '刷新'),
            h('button', { style: styles.linkBtn, onClick: () => setConfirmClear(true) }, '清空历史'))),

    filtered.length === 0
      ? h('div', { style: styles.card },
          h('div', { style: styles.muted }, calls.length ? '没有匹配的调用记录。' : '还没有调用历史。点「🚀 新调研」把指令填进对话，或在对话里说「搜一下抖音上的…」。'))
      : filtered.map((r) => h('div', { key: r.id, style: styles.card, onClick: () => setSelected(r) },
          h('div', { style: styles.row },
            h('span', { style: { ...styles.status, color: statusColor(r) } }, statusText(r)),
            r.ms != null ? h('span', { style: styles.mutedSmall }, `${r.ms}ms`) : null,
            h('span', { style: styles.mutedSmall }, fmtTime(r.ts)),
            r.note ? h('span', { style: styles.note }, r.note) : null,
            r.charge ? h('span', { style: styles.warnTag }, r.charge) : null,
            r.responseSnippet ? h('span', { style: styles.tag }, '可读响应') : null),
          h('div', { style: styles.callPath }, `${r.method || 'GET'} ${r.path}`),
          Object.keys(r.params || {}).length ? h('div', { style: styles.mutedSmall }, `参数 ${JSON.stringify(r.params)}`) : null)))
}

// ---------------------------------------------------------------------------
// 📄 调研报告：直接读工作区里的 Markdown（不复制副本，改了文件刷新即可见）
// ---------------------------------------------------------------------------
function fmtSize(n) {
  if (n == null) return '—'
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}
function fmtDate(ms) {
  try {
    const d = new Date(ms)
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch { return '' }
}

// 极简 Markdown → React 节点：只覆盖调研报告真会用到的语法（标题/表格/列表/引用/代码/加粗/链接）。
function inlineMd(text, key) {
  const nodes = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g
  let last = 0
  let m
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) nodes.push(h('b', { key: `${key}b${i}` }, tok.slice(2, -2)))
    else if (tok.startsWith('`')) nodes.push(h('code', { key: `${key}c${i}`, style: styles.inlineCode }, tok.slice(1, -1)))
    else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)
      // 报告内容来自抓来的网页，链接只放行安全协议，`javascript:` 之类降级成纯文本。
      if (/^(https?:|mailto:|#|\/)/i.test(link[2])) nodes.push(h('a', { key: `${key}a${i}`, href: link[2], target: '_blank', rel: 'noreferrer', style: styles.mdLink }, link[1]))
      else nodes.push(h('span', { key: `${key}a${i}` }, link[1]))
    }
    last = m.index + tok.length
    i++
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function renderMarkdown(text) {
  const lines = String(text || '').split(/\r?\n/)
  const out = []
  let i = 0
  let key = 0
  const isList = (l) => /^\s*[-*+]\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l)
  while (i < lines.length) {
    const line = lines[i]
    if (/^```/.test(line.trim())) {
      const buf = []
      i++
      while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++ }
      i++
      out.push(h('pre', { key: key++, style: styles.mdCode }, buf.join('\n')))
      continue
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim())
      const head = cells(line)
      i += 2
      const rows = []
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i++ }
      out.push(h('table', { key: key++, style: styles.mdTable },
        h('thead', null, h('tr', null, head.map((c, ci) => h('th', { key: ci, style: styles.mdTh }, inlineMd(c, `h${ci}`))))),
        h('tbody', null, rows.map((r, ri) => h('tr', { key: ri }, r.map((c, ci) => h('td', { key: ci, style: styles.mdTd }, inlineMd(c, `r${ri}c${ci}`))))))))
      continue
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      const size = [17, 15.5, 14.5, 13.5][heading[1].length - 1]
      out.push(h('div', { key: key++, style: { ...styles.mdH, fontSize: size } }, inlineMd(heading[2], `h${key}`)))
      i++
      continue
    }
    if (/^\s*([-*_]\s*){3,}$/.test(line)) { out.push(h('hr', { key: key++, style: styles.mdHr })); i++; continue }
    if (/^>\s?/.test(line)) {
      const buf = []
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++ }
      out.push(h('div', { key: key++, style: styles.mdQuote }, inlineMd(buf.join(' '), `q${key}`)))
      continue
    }
    if (isList(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line)
      const items = []
      while (i < lines.length && isList(lines[i])) {
        items.push(lines[i].replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''))
        i++
      }
      out.push(h(ordered ? 'ol' : 'ul', { key: key++, style: styles.mdList },
        items.map((t, ii) => h('li', { key: ii, style: styles.mdLi }, inlineMd(t, `l${key}_${ii}`)))))
      continue
    }
    if (!line.trim()) { i++; continue }
    const buf = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```)/.test(lines[i]) && !/^>\s?/.test(lines[i]) && !isList(lines[i]) && !/^\s*\|/.test(lines[i])) {
      buf.push(lines[i]); i++
    }
    // 以 | 开头但够不成表格的行会走到这儿：buf 为空时必须吃掉这一行，否则死循环。
    if (!buf.length) { buf.push(line); i++ }
    out.push(h('p', { key: key++, style: styles.mdP }, inlineMd(buf.join('\n'), `p${key}`)))
  }
  return out
}

function ReportsTab(props) {
  const [workspaces, setWorkspaces] = useState(null)
  const [dir, setDir] = useState(() => { try { return localStorage.getItem('redfox:reportsDir') || '' } catch { return '' } })
  const [depth, setDepth] = useState(0)
  const [query, setQuery] = useState('')
  const [data, setData] = useState(null)
  const [doc, setDoc] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const docRef = useRef(null)

  useEffect(() => {
    fetchJson('/api/reports/workspaces')
      .then((d) => {
        const list = d.workspaces || []
        setWorkspaces(list)
        const saved = (() => { try { return localStorage.getItem('redfox:reportsDir') || '' } catch { return '' } })()
        // 记住的目录可能已被删/改名：不在工作区列表里就回落到最近活跃的那个。
        const known = list.find((w) => w.path === saved && w.exists)
        const asked = list.find((w) => w.path === props.initial?.dir)
        const start = asked?.path || known?.path || list[0]?.path || saved || ''
        if (!start) return
        setDir(start)
        scan(start, 0)
        const want = props.initial?.path
        if (want) open({ path: want })
      })
      .catch((e) => setError(e.message))
  }, [])
  useEffect(() => { if (doc) docRef.current?.scrollIntoView?.({ block: 'start' }) }, [doc])

  const scan = (target = dir, nextDepth = depth) => {
    if (!target || !target.trim()) { setData(null); return }
    setBusy(true); setError('')
    setDoc(null)
    const qs = new URLSearchParams({ dir: target.trim(), depth: String(nextDepth) })
    if (query.trim()) qs.set('q', query.trim())
    fetchJson('/api/reports/list?' + qs.toString())
      .then((d) => setData(d))
      .catch((e) => { setError(e.message); setData(null) })
      .finally(() => setBusy(false))
  }
  // 搜索框打字才自动重扫，且必须用「已扫描的目录」——用输入框里没提交的路径会扫出别的结果或 403。
  useEffect(() => {
    if (!data) return undefined
    const t = setTimeout(() => scan(data.dir || dir, depth), 300)
    return () => clearTimeout(t)
  }, [query])

  const open = (entry) => {
    setError('')
    setDoc(null)
    fetchJson('/api/reports/read?path=' + encodeURIComponent(entry.path))
      .then(setDoc)
      .catch((e) => setError(e.message))
  }
  const pick = (path) => {
    const target = String(path || '').trim()
    if (!target) return
    setDir(target)
    try { localStorage.setItem('redfox:reportsDir', target) } catch { /* 隐私模式不记也行 */ }
    setDoc(null)
    scan(target, depth)
  }
  const toggleDepth = () => {
    const next = depth ? 0 : 1
    setDepth(next)
    setData(null)
    scan(dir, next)
  }
  const entries = data?.entries || []

  return h('div', null,
    h('div', { style: styles.card },
      h('div', { style: styles.row },
        h('div', { style: styles.sectionTitle }, '📄 调研报告'),
        h('span', { style: styles.grow }),
        h('span', { style: styles.mutedSmall }, data ? `${entries.length} 篇 · ${data.dir}` : '读工作区里的 .md 报告原文')),
      workspaces && workspaces.length
        ? h('div', { style: styles.quickList },
            workspaces.map((w) => h('button', {
              key: w.id,
              style: dir === w.path ? styles.quickActive : styles.quick,
              onClick: () => pick(w.path),
              title: `${w.path}${w.exists ? '' : '（目录不存在）'}`,
            }, `📁 ${w.title}`)))
        : h('div', { style: styles.mutedSmall }, workspaces ? '没有可识别的工作区（注册表为空），直接填下面的目录。' : '正在读取工作区列表…'),
      h('div', { style: styles.row, marginTop: 8 },
        h('input', {
          style: styles.search, placeholder: '报告目录（绝对路径），如 D:\\dsh-research',
          value: dir, onChange: (e) => setDir(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Enter') pick(dir.trim()) },
        }),
        h('button', { style: styles.actionBtn, onClick: () => scan() }, busy ? '扫描中…' : '↻ 扫描'),
        h('button', { style: styles.linkBtn, onClick: toggleDepth }, depth ? '只看本层' : '含子目录')),
      h('div', { style: styles.mutedSmall }, '报告就是工作区里的文件本身：对话里写完、这里刷新就能看到；面板不改动、不复制你的文件。工作区以外的目录要在插件 Config 的 reportsDir 里登记后才能列。')),
    error ? h('div', { style: styles.errorBox }, error) : null,

    doc ? h('div', { ref: docRef, style: styles.detailCard },
      h('div', { style: styles.row },
        h('span', { style: { ...styles.sectionTitle, marginBottom: 0 } }, doc.name),
        h('span', { style: styles.tag }, doc.kind.toUpperCase()),
        h('span', { style: styles.grow }),
        h('button', { style: styles.actionBtn, onClick: () => act(`读一下这份调研报告（${doc.path}），帮我提炼结论、数据依据和下一步该查什么。`) }, '🚀 让 AI 接着做'),
        h('button', { style: styles.linkBtn, onClick: () => { try { Promise.resolve(navigator.clipboard.writeText(doc.path)).catch(() => {}) } catch { /* 无剪贴板权限 */ } } }, '复制路径'),
        h('button', { style: styles.linkBtn, onClick: () => setDoc(null) }, '关闭')),
      h('div', { style: styles.mutedSmall }, `${fmtSize(doc.size)} · ${fmtDate(doc.mtime)} · ${doc.path}`),
      h('div', { style: styles.mdBody },
        doc.binary
          ? h('div', { style: styles.muted }, '这个文件是二进制内容，面板不预览。')
          : doc.kind === 'md'
            ? renderMarkdown(doc.text)
            : h('pre', { style: styles.mdPlain }, doc.text))) : null,

    data && !data.exists
      ? h('div', { style: styles.card }, h('div', { style: styles.muted }, `目录不存在或不允许访问：${data.dir}`))
      : entries.length === 0
        ? h('div', { style: styles.card },
            h('div', { style: styles.muted }, busy && !data
              ? '正在扫描…'
              : !data
                ? '先选一个工作区或填目录。'
                : query.trim()
                  ? `没有匹配「${query.trim()}」的报告。`
                  : `这个目录下还没有 Markdown 报告（只看 ${depth ? '两层' : '本层'}的 .md）。`),
            h('div', { style: { ...styles.mutedSmall, marginTop: 6 } },
              query.trim()
                ? '清空上面的搜索框即可看到全部报告。'
                : '在对话里说一句「把这次调研写成报告」，agent 会把 .md 写进工作区；回到这里点「↻ 扫描」即可看到。'))
        : [
            data?.truncated
              ? h('div', { key: '__trunc', style: styles.hint }, `只显示前 ${entries.length} 篇（目录里还有更多），用搜索框收窄范围。`)
              : null,
            ...entries.map((e) => h('div', { key: e.path, style: { ...styles.card, cursor: 'pointer' }, onClick: () => open(e) },
              h('div', { style: styles.row },
                h('span', { style: styles.reportName }, e.name),
                h('span', { style: styles.tag }, e.kind.toUpperCase()),
                h('span', { style: styles.grow }),
                h('span', { style: styles.mutedSmall }, `${fmtSize(e.size)} · ${fmtDate(e.mtime)}`)),
              e.rel !== e.name ? h('div', { style: styles.mutedSmall }, e.rel) : null)),
          ]
  )
}

// ---------------------------------------------------------------------------
// 🔎 端点库
// ---------------------------------------------------------------------------
function EndpointsTab() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [platform, setPlatform] = useState('')
  const [detail, setDetail] = useState(null)
  const detailRef = useRef(null)
  const load = () => fetchJson('/api/endpoints')
    .then((d) => { setData(d); setError('') })
    .catch((e) => setError(e.message))
  useEffect(() => { load() }, [])
  useEffect(() => { if (detail) detailRef.current?.scrollIntoView?.({ block: 'nearest' }) }, [detail])
  const loadFiltered = () => {
    const qs = new URLSearchParams()
    if (query.trim()) qs.set('q', query.trim())
    if (platform) qs.set('platform', platform)
    fetchJson('/api/endpoints?' + qs.toString()).then(setData).catch((e) => setError(e.message))
  }
  useEffect(() => {
    const t = setTimeout(loadFiltered, 250)
    return () => clearTimeout(t)
  }, [query, platform])

  if (error && data === null) return h('div', { style: styles.error }, error)
  if (data === null) return h('div', { style: styles.muted }, '加载中…')
  const endpoints = data.endpoints || []

  const openDetail = async (key) => {
    try {
      const d = await fetchJson('/api/endpoint/detail?key=' + encodeURIComponent(key))
      setDetail(d.detail)
    } catch (e) { setError(e.message) }
  }

  return h('div', null,
    error ? h('div', { style: styles.errorBox }, error) : null,
    detail ? h('div', { ref: detailRef, style: styles.detailCard },
      h('div', { style: styles.row },
        h('span', { style: { ...styles.callPath, fontWeight: 700 } }, `${detail.http_method} ${detail.path}`),
        h('span', { style: styles.tag }, detail.name),
        h('span', { style: styles.grow }),
        h('button', { style: styles.linkBtn, onClick: () => setDetail(null) }, '关闭')),
      h('div', { style: styles.mutedSmall }, `${detail.platform_label} · ${detail.summary || ''}`),
      detail.description ? h('div', { style: styles.mutedSmall, marginTop: 4 }, detail.description) : null,
      (detail.params || []).length ? h('pre', { style: styles.pre }, '参数\n' + detail.params.map((p) =>
        `${p.api_name}  ${p.required ? '【必填】' : '可选'}  ${p.type}${p.default !== null && p.default !== undefined && String(p.default) !== 'None' ? ` 默认=${JSON.stringify(p.default)}` : ''}${p.description ? ` · ${p.description}` : ''}`).join('\n')) : h('div', { style: styles.mutedSmall, marginTop: 6 }, '无参数'),
      detail.returns ? h('div', { style: styles.mutedSmall }, `返回：${detail.returns}`) : null,
      detail.example_call ? h('pre', { style: styles.pre }, detail.example_call) : null,
      h('div', { style: styles.row, marginTop: 6 },
        h('button', { style: styles.actionBtn, onClick: () => act(`用 redfox_call 调用红狐端点 ${detail.http_method} ${detail.path}（按次计费，先说明要花的积分并等我确认再调）。参数名以 detail 的 api_name 为准${detail.example_call ? `，照这个示例的默认值填参数：${detail.example_call}` : ''}，参数：`) }, '用这个调研'))) : null,

    h('div', { style: styles.card },
      h('div', { style: styles.row },
        h('span', { style: styles.sectionTitle }, '🔎 端点库'),
        h('span', { style: styles.grow }),
        h('span', { style: styles.mutedSmall }, `共 ${data.total} 个端点 · ${data.platforms.length} 个平台`)),
      h('div', { style: styles.mutedSmall }, '本地目录检索零积分；点端点看参数与必填项，再「用这个调研」。')),
    h('div', { style: styles.quickList, marginBottom: 8 },
      h('button', { key: '', style: !platform ? styles.quickActive : styles.quick, onClick: () => setPlatform('') }, '全部'),
      data.platforms.map((p) => h('button', { key: p.name, style: platform === p.name ? styles.quickActive : styles.quick, onClick: () => setPlatform(p.name), title: `${p.label} · ${p.count} 个端点` }, `${p.label} ${p.count}`))),
    h('input', { style: styles.search, placeholder: '搜索端点，如「抖音 账号」「小红书 笔记」「hot rank」「评论」…', value: query, onChange: (e) => setQuery(e.target.value) }),
    h('div', { style: styles.mutedSmall, marginBottom: 8 }, `匹配 ${data.count != null ? data.count : endpoints.length} 个${platform ? `（已筛选 ${platform}）` : ''}${data.count > endpoints.length ? `，显示前 ${endpoints.length} 个` : ''}`),
    endpoints.map((e) => h('div', { key: e.path, style: styles.card },
      h('div', { style: styles.row },
        h('span', { style: styles.callPath }, `${e.method} ${e.path}`),
        e.platformLabel ? h('span', { style: styles.tag }, e.platformLabel) : null,
        e.isUpload ? h('span', { style: styles.warnTag }, '上传') : null,
        h('span', { style: styles.grow }),
        h('button', { style: styles.linkBtn, onClick: () => openDetail(e.name) }, '参数'),
        h('button', { style: styles.actionBtn, onClick: () => act(`用 redfox_call 调用红狐端点 ${e.method} ${e.path}（先 redfox_endpoint action=detail key=${e.name} 查参数名和必填项），参数：`) }, '用这个调研')),
      e.summary ? h('div', { style: styles.mutedSmall }, e.summary) : null)))
}

// ---------------------------------------------------------------------------
// ⚙️ 设置
// ---------------------------------------------------------------------------
function SettingsTab() {
  const [info, setInfo] = useState(null)
  const [key, setKey] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const load = () => fetchJson('/api/config').then(setInfo).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const save = async () => {
    setError(''); setMsg('')
    if (!key.trim()) { setError('先粘贴 RedFox API key。'); return }
    try {
      const d = await fetch(BASE + '/api/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redfoxApiKey: key.trim() }) }).then((r) => r.json())
      if (d.error) throw new Error(d.error)
      setInfo(d.credentials); setKey('')
      setMsg('已保存（存本机 $DSH_HOME/redfox-api/settings.json，不会上传）。现在可以发起真实调用。')
    } catch (e) { setError(e.message) }
  }
  const clear = async () => {
    setError(''); setMsg('')
    try {
      const d = await fetch(BASE + '/api/config', { method: 'DELETE' }).then((r) => r.json())
      if (d.error) throw new Error(d.error)
      setInfo(d.credentials); setMsg('已清除本机保存的 key。')
    } catch (e) { setError(e.message) }
  }

  return h('div', null,
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '⚙️ RedFox API key'),
      info === null ? h('div', { style: styles.muted }, '加载中…')
        : h('div', { style: styles.muted },
            info.configured ? `已配置 ✓（${info.tokenMasked}）· 来源：${SOURCE_LABEL[info.source] || info.source || '面板'}` : '未配置。三条路都能配：① 下面粘贴保存；② 设环境变量 REDFOX_API_KEY；③ 插件 Config 的 redfoxApiKey。'),
      h('input', { type: 'password', placeholder: 'RedFox API key（ak_...）', value: key, onChange: (e) => setKey(e.target.value), style: styles.search }),
      h('div', { style: styles.row },
        h('button', { style: styles.button, onClick: save }, '保存'),
        info?.source === 'panel' ? h('button', { style: styles.tab, onClick: clear }, '清除已存') : null),
      msg ? h('div', { style: styles.ok }, msg) : null,
      error ? h('div', { style: styles.error }, error) : null,
      h('div', { style: styles.mutedSmall },
        '获取：redfox.hk/settings/api-keys。密钥只存本机，任何接口不回显明文。调用按次计费（最低约 ¥0.02/次），端点检索不消耗积分。')))
}

// ---------------------------------------------------------------------------
// 📖 指南
// ---------------------------------------------------------------------------
function GuideTab() {
  return h('div', null,
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '怎么用（三步）'),
      h('div', { style: styles.stepList },
        h('div', { style: styles.quote }, '1. redfox_endpoint action=search keyword=「抖音 账号 搜索」→ 找端点'),
        h('div', { style: styles.quote }, '2. redfox_endpoint action=detail key=douyin.search_users → 查字段名/必填/默认值'),
        h('div', { style: styles.quote }, '3. redfox_call method=POST path=/story/api/dyData/searchUser params={"keyword":"乐高"}'),
        '检索与 detail 零积分；redfox_call 按次计费，自动进「调用历史」。')),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '看懂业务码'),
      h('div', { style: styles.stepList },
        h('div', { style: styles.quote }, 'code=2000 → 成功，数据在 data'),
        h('div', { style: styles.quote }, 'code=3203/3801 且文案是「未查询到相关数据/暂未收录/暂无作品」→ 查无数据（不是失败，但看 msg 判断扣没扣积分）'),
        h('div', { style: styles.quote }, '其他 code → 真错误：1001/1002 参数问题、3103/3105/3107 key 问题、3201 积分不足、4004 限流')),
        '被判为「无数据」不等于免费：3203 常写明「积分未扣除」，3801 实测会扣 0.600 积分。'),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '调用避坑'),
      h('div', { style: styles.stepList },
        '字段名用 detail 里的 api_name（camelCase，如 sortType），不要照抄 SDK 的 snake_case；',
        h('br'), '部分「可选」参数服务端实际必填（page/offset/sourceType），照抄 example_call 默认值；',
        h('br'), '快手作品搜索关键词 ≤6 个字；抖音/小红书作品列表优质库覆盖有限，返回「暂未收录」换端点别重试；',
        h('br'), '账号搜索是模糊匹配，中文复合词会串行业，命中后按简介和作品二次筛。')),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '3 个工具'),
      h('div', { style: styles.muted, lineHeight: 2 },
        h('b', null, 'redfox_endpoint'), ' — 端点目录：platforms / platform / search / detail（本地检索，零积分）。',
        h('br'), h('b', null, 'redfox_call'), ' — 真实 GET/POST 调用（需配置 key，按次计费），自动入历史并标注业务码与扣费。',
        h('br'), h('b', null, 'redfox_history'), ' — 列表 / 详情 / 删除 / 清空调用历史。')),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '前置条件'),
      h('div', { style: styles.muted, lineHeight: 1.8 },
        '在「⚙️ 设置」粘贴 RedFox API key（redfox.hk/settings/api-keys 获取），或设 REDFOX_API_KEY 环境变量。',
        h('br'), '调用按次计费，批量抓取前先在概览里看一眼剩余积分。')))
}

// ---------- 主面板 ----------
const TABS = [
  ['home', '🏠 概览'],
  ['reports', '📄 调研报告'],
  ['history', '📋 调用历史'],
  ['endpoints', '🔎 端点库'],
  ['settings', '⚙️ 设置'],
  ['guide', '📖 指南'],
]

function Panel() {
  const [tab, setTab] = useState('home')
  const [pending, setPending] = useState(null)
  const openFromHome = (call) => { setPending(call); setTab('history') }
  const go = (id, payload) => { setPending(payload || null); setTab(id) }
  return h('div', { style: styles.wrap },
    h('div', { style: styles.tabBar },
      TABS.map(([id, label]) => h('button', {
        key: id, style: tab === id ? styles.tabActive : styles.tab, onClick: () => { setPending(null); setTab(id) },
      }, label))),
    tab === 'home' ? h(HomeTab, { go, open: openFromHome })
      : tab === 'reports' ? h(ReportsTab, { initial: pending })
        : tab === 'history' ? h(HistoryTab, { pending })
          : tab === 'endpoints' ? h(EndpointsTab)
            : tab === 'settings' ? h(SettingsTab)
              : h(GuideTab))
}

const styles = {
  wrap: { padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box', fontFamily: '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif', fontSize: 13, color: '#1a1a1a' },
  tabBar: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  tab: { padding: '8px 16px', border: '1px solid #d9d9de', borderRadius: 8, background: '#fff', color: '#1a1a1a', cursor: 'pointer', fontSize: 13 },
  tabActive: { padding: '8px 16px', border: '1px solid #c2410c', borderRadius: 8, background: '#fdf1e7', color: '#c2410c', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 },
  grow: { flex: 1 },
  card: { background: '#fff', border: '1px solid #e3e3e6', borderRadius: 10, padding: 12, marginBottom: 10, cursor: 'default' },
  detailCard: { background: '#fffaf5', border: '1px solid #f0dcc8', borderRadius: 10, padding: 12, marginBottom: 12 },
  ctaCard: { display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', background: '#fdf1e7', border: '1px solid #f0dcc8', borderRadius: 10, padding: '12px 14px', marginBottom: 12 },
  ctaText: { flex: 1, minWidth: 200 },
  ctaTitle: { fontWeight: 700, color: '#c2410c', marginBottom: 4 },
  ctaMuted: { color: '#8a6a52', lineHeight: 1.7, fontSize: 12.5 },
  ctaButton: { padding: '10px 20px', border: 'none', borderRadius: 10, background: '#c2410c', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, boxShadow: '0 2px 6px rgba(194,65,12,.25)' },
  actionBtn: { padding: '5px 12px', border: '1px solid #f0dcc8', borderRadius: 8, background: '#fffaf5', color: '#c2410c', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 },
  dangerBtn: { padding: '5px 12px', border: '1px solid #e7b4b4', borderRadius: 8, background: '#fdf2f2', color: '#c0392b', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 },
  linkBtn: { padding: '4px 8px', border: 'none', background: 'transparent', color: '#c2410c', cursor: 'pointer', fontSize: 12.5, textDecoration: 'underline' },
  button: { padding: '6px 14px', border: 'none', borderRadius: 8, background: '#c2410c', color: '#fff', cursor: 'pointer', fontSize: 13 },
  sectionTitle: { fontWeight: 700, marginBottom: 6, color: '#c2410c' },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 6 },
  stat: { background: '#fffaf5', borderRadius: 8, padding: '8px 6px', textAlign: 'center' },
  statNum: { fontSize: 18, fontWeight: 800, color: '#c2410c' },
  hint: { background: '#fff8e6', border: '1px solid #f0dca8', borderRadius: 8, padding: '8px 10px', color: '#8a6d1a', fontSize: 12, lineHeight: 1.7, marginTop: 6 },
  quickList: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  quick: { display: 'inline-flex', gap: 6, alignItems: 'center', padding: '7px 12px', border: '1px solid #f0dcc8', borderRadius: 999, background: '#fffaf5', color: '#c2410c', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 },
  quickActive: { display: 'inline-flex', gap: 6, alignItems: 'center', padding: '7px 12px', border: '1px solid #c2410c', borderRadius: 999, background: '#fdf1e7', color: '#c2410c', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 },
  quickIcon: { fontSize: 14 },
  callRow: { display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f0f2f5', cursor: 'pointer' },
  callPath: { fontFamily: 'Consolas, monospace', fontSize: 12, color: '#c2410c', wordBreak: 'break-all' },
  status: { fontWeight: 700, fontSize: 12, minWidth: 64 },
  note: { background: '#fdf1e7', color: '#c2410c', borderRadius: 4, padding: '1px 6px', fontSize: 11 },
  tag: { background: '#e7f6ec', color: '#1a7f37', borderRadius: 4, padding: '1px 6px', fontSize: 11 },
  warnTag: { background: '#fff6e0', color: '#8a6d1a', borderRadius: 4, padding: '1px 6px', fontSize: 11 },
  muted: { color: '#8a8a92', lineHeight: 1.8 },
  mutedSmall: { color: '#a0a0a8', fontSize: 11.5, lineHeight: 1.7 },
  ok: { color: '#1a7f37', marginTop: 6 },
  error: { color: '#c0392b', padding: 12 },
  errorBox: { background: '#fdf2f2', border: '1px solid #e7b4b4', borderRadius: 8, padding: '8px 10px', color: '#c0392b', fontSize: 12, marginTop: 8 },
  search: { flex: 1, minWidth: 180, boxSizing: 'border-box', padding: '8px 12px', border: '1px solid #d9d9de', borderRadius: 8, fontSize: 13, marginBottom: 10 },
  pre: { background: '#1f1308', color: '#f3d9c4', borderRadius: 8, padding: 10, fontSize: 11.5, lineHeight: 1.6, overflow: 'auto', maxHeight: 320, whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 8 },
  reportName: { fontWeight: 700, fontSize: 13, color: '#1a1a1a', wordBreak: 'break-all' },
  mdBody: { marginTop: 8, maxHeight: 460, overflow: 'auto', background: '#fff', border: '1px solid #f0dcc8', borderRadius: 8, padding: '10px 12px' },
  mdH: { fontWeight: 700, color: '#1f1308', margin: '10px 0 6px' },
  mdP: { margin: '6px 0', lineHeight: 1.75, whiteSpace: 'pre-wrap', color: '#2a2a30' },
  mdList: { margin: '6px 0', paddingLeft: 20, lineHeight: 1.75, color: '#2a2a30' },
  mdLi: { margin: '2px 0' },
  mdQuote: { borderLeft: '3px solid #f0dcc8', padding: '2px 10px', margin: '6px 0', color: '#8a6a52', background: '#fffaf5' },
  mdCode: { background: '#1f1308', color: '#f3d9c4', borderRadius: 6, padding: 8, fontSize: 11.5, overflow: 'auto', whiteSpace: 'pre-wrap', margin: '8px 0' },
  mdPlain: { background: '#fffaf5', color: '#2a2a30', borderRadius: 6, padding: 8, fontSize: 12, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  inlineCode: { background: '#fdf1e7', borderRadius: 4, padding: '0 4px', fontSize: 12, fontFamily: 'Consolas, monospace' },
  mdLink: { color: '#c2410c' },
  mdTable: { borderCollapse: 'collapse', width: '100%', margin: '8px 0', fontSize: 12 },
  mdTh: { border: '1px solid #f0dcc8', padding: '4px 6px', background: '#fffaf5', textAlign: 'left', fontWeight: 700 },
  mdTd: { border: '1px solid #eee3d6', padding: '4px 6px', verticalAlign: 'top' },
  mdHr: { border: 'none', borderTop: '1px solid #f0dcc8', margin: '10px 0' },
  stepList: { lineHeight: 1.9 },
  quote: { background: '#fdf1e7', borderRadius: 6, padding: '4px 10px', margin: '4px 0', color: '#c2410c' },
}

function apply(ctx) {
  // 启动打点：证明浏览器半边被宿主真正 apply（宿主写 client-boot.log），面板自查用。
  try { fetch(BASE + '/api/health').catch(() => {}) } catch { /* 老宿主无 fetch 也不影响面板 */ }
  startPrompt = (prompt) => {
    try {
      ctx.uiWorkspace.startSession(undefined, { prompt, whenDraftExists: 'replace' })
    } catch (err) {
      console.error('[redfox-api] 开新对话失败', err)
      alert('开新对话失败：' + ((err && err.message) || err))
    }
  }
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 16, label: () => '红狐调研' }, PanelIcon))
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: PANEL_ID }, Panel))
}

exports.isPlugin = true
exports.inject = ['slots', 'uiWorkspace']
exports.apply = apply
