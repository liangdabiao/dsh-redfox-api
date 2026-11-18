// ============================================================================
// RedFox API 助手 · 浏览器半边（调研工作台）。
// 布局对齐「TikHub 调研工作台」：🏠 概览 / 📋 调用历史 / 🔎 端点库 / ⚙️ 设置 / 📖 指南。
// RedFox 特性：业务码三分类（2000 成功 / 3203·3801 查无数据 / 其他错误）+ 扣费提示。
// 按钮怎么工作：点击 → startPrompt(prompt) → 宿主 uiWorkspace.startSession(...)
// → 打开新对话并把指令填进输入框（不自动发送）。
// ============================================================================
const h = require('react').createElement
const { useState, useEffect } = require('react')

const PANEL_ID = 'redfox-api'
const BASE = 'redfox-api'

let startPrompt = null
function act(prompt) {
  if (startPrompt) startPrompt(prompt)
}

function PanelIcon(props) {
  return h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', ...props },
    h('rect', { x: 2.5, y: 2.5, width: 19, height: 19, rx: 5, fill: '#c2410c' }),
    h('text', { x: 12, y: 16, 'font-size': 9, fill: '#fff', 'text-anchor': 'middle' }, '🦊'))
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
  const [error, setError] = useState('')
  useEffect(() => {
    fetchJson('/api/stats')
      .then((s) => { setStats(s); if (s.configured) fetchJson('/api/balance').then(setBalance).catch(() => {}) })
      .catch((e) => setError(e.message))
    fetchJson('/api/calls').then((c) => setCalls(c.calls)).catch(() => {})
  }, [])
  if (error) return h('div', { style: styles.error }, error)
  const recent = (calls || []).slice(0, 5)
  return h('div', null,
    h('div', { style: styles.ctaCard },
      h('div', { style: styles.ctaText },
        h('div', { style: styles.ctaTitle }, '28 类 201 个红狐数据端点，随口就能查'),
        h('div', { style: styles.ctaMuted }, '点右边的按钮 → 打开新对话，输入框已填好示例；换成你的关键词回车即可。检索端点零积分，调用按次计费。')),
      h('button', {
        style: styles.ctaButton,
        onClick: () => act('帮我调研抖音上「乐高」相关的热门视频和账号：先 redfox_endpoint 找端点，再 action=detail 查参数，然后 redfox_call 调用并汇总。'),
        title: '填进对话：先找端点再调用红狐数据',
      }, '🚀 发起新调研')),

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
      !stats?.configured ? h('div', { style: styles.hint }, '还没配置 RedFox API key：去「⚙️ 设置」粘贴即可真实调用（redfox.hk/settings/api-keys 获取，或设 REDFOX_API_KEY 环境变量）。') : null),

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
        h('div', { style: styles.sectionTitle }, '最近调用'),
        h('span', { style: styles.grow }),
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

  const load = () => fetchJson('/api/calls').then((d) => setCalls(d.calls)).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

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

  if (error) return h('div', { style: styles.error }, error)
  if (calls === null) return h('div', { style: styles.muted }, '加载中…')

  const q = query.trim().toLowerCase()
  const filtered = q
    ? calls.filter((r) => `${r.method || ''} ${r.path} ${r.note || ''} ${r.kind || ''} ${JSON.stringify(r.params || {})}`.toLowerCase().includes(q))
    : calls

  return h('div', null,
    selected ? h('div', { style: styles.detailCard },
      h('div', { style: styles.row },
        h('span', { style: { ...styles.status, color: statusColor(selected) } }, statusText(selected)),
        h('span', { style: styles.callPath }, `${selected.method || 'GET'} ${selected.path}`),
        h('span', { style: styles.grow }),
        h('button', { style: styles.actionBtn, onClick: () => act(`再调用一次这个红狐端点：redfox_call method=${selected.method || 'GET'} path=${selected.path}\n参数：${JSON.stringify(selected.params || {})}${selected.note ? `\n用途：${selected.note}` : ''}`) }, '🔁 再调一次'),
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
        : h('button', { style: styles.linkBtn, onClick: () => setConfirmClear(true) }, '清空历史')),

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
// 🔎 端点库
// ---------------------------------------------------------------------------
function EndpointsTab() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [platform, setPlatform] = useState('')
  const [detail, setDetail] = useState(null)
  const load = () => fetchJson('/api/endpoints')
    .then(setData)
    .catch((e) => setError(e.message))
  useEffect(() => { load() }, [])
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
    detail ? h('div', { style: styles.detailCard },
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
        h('button', { style: styles.actionBtn, onClick: () => act(`用 redfox_call 调用红狐端点 ${detail.http_method} ${detail.path}（参数名以 redfox_endpoint action=detail 的 api_name 为准），参数：`) }, '用这个调研'))) : null,

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
    h('div', { style: styles.mutedSmall, marginBottom: 8 }, `匹配 ${endpoints.length} 个`),
    endpoints.map((e) => h('div', { key: e.path, style: styles.card },
      h('div', { style: styles.row },
        h('span', { style: styles.callPath }, `${e.method} ${e.path}`),
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
            info.configured ? `已配置 ✓（${info.tokenMasked}）· 来源：${SOURCE_LABEL[info.source] || info.source || '面板'}` : '未配置。粘贴下面并保存，即可真实调用。'),
      h('input', { type: 'password', placeholder: 'RedFox API key（ak_...）', value: key, onChange: (e) => setKey(e.target.value), style: styles.search }),
      h('div', { style: styles.row },
        h('button', { style: styles.button, onClick: save }, '保存'),
        info?.configured ? h('button', { style: styles.tab, onClick: clear }, '清除已存') : null),
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
        h('div', { style: styles.quote }, '其他 code → 真错误：1001/1002 参数问题、3103/3105 key 问题、3201 积分不足、4004 限流')),
        '退出「无数据」不等于免费：3203 常写明「积分未扣除」，3801 实测会扣 0.600 积分。'),
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
  ['history', '📋 调用历史'],
  ['endpoints', '🔎 端点库'],
  ['settings', '⚙️ 设置'],
  ['guide', '📖 指南'],
]

function Panel() {
  const [tab, setTab] = useState('home')
  const [pending, setPending] = useState(null)
  const openFromHome = (call) => { setPending(call); setTab('history') }
  const go = (id) => { setPending(null); setTab(id) }
  return h('div', { style: styles.wrap },
    h('div', { style: styles.tabBar },
      TABS.map(([id, label]) => h('button', {
        key: id, style: tab === id ? styles.tabActive : styles.tab, onClick: () => { setPending(null); setTab(id) },
      }, label))),
    tab === 'home' ? h(HomeTab, { go, open: openFromHome })
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
