// RedFox API 助手 · 端点目录检索（api_searcher.py 的 JS 移植）。
// 数据源是 skills/redfox-api-helper/apis.json（201 端点，由官方 SDK 生成）。
// 纯本地文件检索，不联网、不消耗积分。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const TOKEN_RE = /[a-z0-9_]+|[\u4e00-\u9fff]+/g
const CJK_RE = /[\u4e00-\u9fff]/

export function findSpec(skillDirs, explicit) {
  const candidates = []
  if (explicit) candidates.push(explicit)
  if (process.env.REDFOX_APIS_PATH) candidates.push(process.env.REDFOX_APIS_PATH)
  for (const dir of [].concat(skillDirs)) {
    candidates.push(join(dir, 'redfox-api-helper', 'apis.json'))
    candidates.push(join(dir, 'apis.json'))
  }
  for (const c of candidates) {
    if (c && existsSync(c)) return c
  }
  throw new Error('apis.json 未找到（skills/redfox-api-helper/apis.json）')
}

let cachedSpec = null
export function loadSpec(skillDirs) {
  if (cachedSpec?.key === findSpec(skillDirs)) return cachedSpec.data
  const file = findSpec(skillDirs)
  cachedSpec = { key: file, data: JSON.parse(readFileSync(file, 'utf8')) }
  return cachedSpec.data
}

// 分词：普通 token 权重 1；中文长串额外产出低权重二元组。
export function tokenize(query) {
  const tokens = []
  for (const raw of String(query).toLowerCase().trim().match(TOKEN_RE) || []) {
    tokens.push([raw, 1.0])
    if (CJK_RE.test(raw) && raw.length > 2) {
      for (let i = 0; i < raw.length - 1; i++) tokens.push([raw.slice(i, i + 2), 0.4])
    }
  }
  const best = new Map()
  for (const [token, weight] of tokens) {
    best.set(token, Math.max(best.get(token) || 0, weight))
  }
  return [...best.entries()]
}

export function defaultsPresent(e) {
  return (e.params || []).some(
    (p) => !p.required && p.default !== null && p.default !== undefined
      && String(p.default) !== 'None' && p.api_name)
}

export class RedFoxAPISearcher {
  constructor(skillDirs, specPath) {
    this.specPath = findSpec(skillDirs, specPath)
    this.data = JSON.parse(readFileSync(this.specPath, 'utf8'))
    this.endpoints = this.data.endpoints
    this.lastTotal = 0
  }

  platforms() {
    const counts = new Map()
    const labels = new Map()
    for (const e of this.endpoints) {
      counts.set(e.platform, (counts.get(e.platform) || 0) + 1)
      labels.set(e.platform, e.platform_label)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .map(([name, count]) => ({ name, label: labels.get(name), count }))
  }

  byPlatform(platform) {
    const p = String(platform).toLowerCase().trim()
    const out = this.endpoints.filter((e) => e.platform === p || (e.platform_label || '').toLowerCase().includes(p))
    return out.sort((a, b) => (a.sdk_method < b.sdk_method ? -1 : 1))
  }

  _fields(e) {
    const paramNames = (e.params || [])
      .map((p) => [p.sdk_name, p.api_name, p.description].filter(Boolean).join(' '))
      .join(' ')
    return {
      name: e.name.toLowerCase(),
      path: e.path.toLowerCase(),
      summary: e.summary.toLowerCase(),
      platform: (e.platform + ' ' + e.platform_label).toLowerCase(),
      description: (e.description || '').toLowerCase().slice(0, 1200),
      params: paramNames.toLowerCase(),
    }
  }

  search(keyword, limit = 15) {
    const tokens = tokenize(keyword)
    if (!tokens.length) return []
    const phrase = String(keyword).toLowerCase().trim()
    const weights = { name: 3.0, path: 3.0, summary: 4.0, platform: 2.5, description: 1.0, params: 2.0 }
    const totalWeight = tokens.reduce((s, [, w]) => s + w, 0) || 1.0
    const primary = tokens.filter(([, w]) => w === 1.0).map(([t]) => t)
    const scored = []
    for (const e of this.endpoints) {
      const f = this._fields(e)
      const values = Object.values(f)
      const hit = tokens.filter(([t]) => values.some((v) => v.includes(t)))
      if (!hit.length || hit.reduce((s, [, w]) => s + w, 0) / totalWeight <= 0.6) continue
      let score = 0
      for (const [t, w] of hit) for (const [k, v] of Object.entries(f)) if (v.includes(t)) score += w * weights[k]
      if (score <= 0) continue
      if (primary.length && primary.every((t) => values.some((v) => v.includes(t)))) score += 6.0
      if (phrase && f.summary.includes(phrase)) score += 8.0
      if (phrase && f.path.includes(phrase)) score += 8.0
      // 裸平台名要命中该平台自己的端点（实测裸名权重需要 >13.5 才压过无关 get_account）。
      if (primary.length === 1 && primary[0] === e.platform) score += 15.0
      if (/^(search|get_|query)/.test(e.sdk_method)) score += 2.0
      scored.push([score, e.path.length, e.name, e])
    }
    scored.sort((a, b) => b[0] - a[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : 1))
    this.lastTotal = scored.length
    return scored.slice(0, limit).map((x) => x[3])
  }

  detail(key, full = false) {
    const raw = String(key ?? '').trim()
    let e = this.endpoints.find((c) => raw === c.name || raw === c.path || raw === c.sdk_method)
    if (!e) {
      // 大小写不敏感 + 「平台.sdk_method」写法（如 hotspot.getListByPlatform，工具文档就是这么教的）。
      const low = raw.toLowerCase()
      const tail = low.includes('.') ? low.slice(low.lastIndexOf('.') + 1) : low
      const loose = this.endpoints.filter((c) =>
        raw === c.sdk_method || low === c.name.toLowerCase() || low === String(c.sdk_method).toLowerCase()
        || tail === String(c.sdk_method).toLowerCase() || tail === String(c.name).toLowerCase()
        || String(c.path).toLowerCase().endsWith('/' + tail))
      if (loose.length === 1) e = loose[0]
    }
    if (!e && raw.startsWith('/')) {
      const hits = this.endpoints.filter((x) => x.path.includes(raw))
      if (hits.length === 1) e = hits[0]
    }
    if (!e) {
      const low = raw.toLowerCase()
      const hits = this.endpoints.filter((x) => x.name.toLowerCase().includes(low) || x.path.toLowerCase().includes(low))
      if (hits.length === 1) e = hits[0]
    }
    if (!e) return null
    const out = {}
    for (const k of ['name', 'platform', 'platform_label', 'http_method', 'path', 'summary', 'description', 'returns', 'example_call', 'body_fields', 'query_fields', 'internal_fields']) out[k] = e[k]
    out.params = (e.params || []).map((p) => ({
      api_name: p.api_name, sdk_name: p.sdk_name, required: p.required,
      type: p.type, default: p.default, description: p.description,
    }))
    out.tips = []
    if (defaultsPresent(e)) out.tips.push('部分标为可选的参数服务端实际必填；请照抄 example_call 里给出的默认值')
    if (e.is_upload) out.tips.push('这是 multipart 上传接口：redfox_call 里传 file=<本地文件路径>，其他参数照常写 params')
    if (full) out.raw = e
    return out
  }
}

// 便捷封装：目录检索（面向工具/路由），复用单例 searcher。
export function createCatalog(skillDirs) {
  const searcher = new RedFoxAPISearcher(skillDirs)
  return {
    spec: searcher.data,
    endpoints: searcher.endpoints,
    platforms: () => searcher.platforms(),
    byPlatform: (p) => searcher.byPlatform(p),
    search: (kw, limit) => searcher.search(kw, limit),
    lastTotal: () => searcher.lastTotal,
    detail: (key, full) => searcher.detail(key, full),
  }
}
