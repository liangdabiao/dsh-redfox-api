// RedFox API 助手 · 真实调用封装（api_client.py 的 JS 移植，fetch 版）。
// 鉴权走 REDFOX_API_KEY 请求头（绝不拼进 URL）。按次计费，默认不重试。

export const BASE_URL = 'https://redfox.hk'
export const AUTH_HEADER = 'REDFOX_API_KEY'
export const SUCCESS_CODE = 2000
// 3203/3801 既可能是查无数据也可能是参数错误，只有这些实测文案片段才算空结果。
export const NO_DATA_CODES = new Set([3203, 3801])
export const NO_DATA_PHRASES = [
  '未查询到相关数据', '暂未收录', '不在库', '库内不存在',
  '未找到该账号', '数据不存在', '暂无作品', '账号不存在', '无相关数据',
  '资源在平台上未找到',
]
export const RETRYABLE = new Set([429, 500, 502, 503, 504])
const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// 归一化路径：确保以 / 开头。
export function normalizePath(path) {
  let p = String(path || '').trim()
  if (!p.startsWith('/')) p = '/' + p.replace(/^\/+/, '')
  return p
}

export function classifyResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return 'ok'
  if (result.error) return 'error'
  const code = result.code
  if (code === undefined || code === null || code === SUCCESS_CODE) return 'ok'
  const msg = String(result.msg || result.message || '')
  const numeric = Number(code)
  if (NO_DATA_CODES.has(numeric) && NO_DATA_PHRASES.some((p) => msg.includes(p))) return 'no_data'
  return 'error'
}

// 查无数据时的扣费说明：退出「没失败」不等于免费——3203 常写明积分未扣除，3801 实测会扣 0.600 积分。
export function chargeNote(result) {
  const msg = result && typeof result === 'object' ? String(result.msg || result.message || '') : ''
  if (/积分未扣除|未消耗积分|不扣费|未扣除/.test(msg)) return '积分未扣除'
  const paid = msg.match(/已扣除\s*([\d.]+\s*积分)?/)
  if (paid) return '已扣除 ' + (paid[1] || '积分')
  return '扣费情况见 msg'
}

// 只有 msg 真的提到积分/扣费才记录，避免成功调用每条都挂一句「扣费情况见 msg」。
export function chargeMention(result) {
  const msg = result && typeof result === 'object' ? String(result.msg || result.message || '') : ''
  return /积分|扣费/.test(msg) ? chargeNote(result) : ''
}

export function buildUrl(path, query, baseUrl = BASE_URL) {
  const url = new URL(normalizePath(path), baseUrl)
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null) continue
    url.searchParams.set(key, String(value))
  }
  return url.toString()
}

function decode(text) {
  try { return JSON.parse(text) } catch { return { raw: String(text).slice(0, 4000) } }
}

// params：GET 进 query，POST 进 JSON body（k=v 类型已由调用方 JSON 决定）。
// upload：{ filename, content: Buffer, field } —— multipart 上传（仅 POST），params 变成表单字段。
// baseUrl：默认 https://redfox.hk（可用 REDFOX_BASE_URL 环境变量整体覆盖，测试/代理用），参数级再压一层。
export async function callRedFox({ method = 'GET', path, params, token, timeoutMs = 30_000, retries = 0, upload, baseUrl = process.env.REDFOX_BASE_URL || BASE_URL }) {
  if (!token) {
    throw new Error('未配置 RedFox API key（redfoxApiKey / REDFOX_API_KEY）：在面板「⚙️ 设置」粘贴即可（redfox.hk/settings/api-keys 获取）。')
  }
  const m = String(method).toUpperCase()
  if (m !== 'GET' && m !== 'POST') throw new Error(`不支持的方法 ${method}（只支持 GET / POST）。`)
  if (upload && m !== 'POST') throw new Error('上传接口请用 method=POST。')
  const p = normalizePath(path)
  const started = Date.now()
  let lastError = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const headers = {
        accept: 'application/json',
        'user-agent': process.env.REDFOX_USER_AGENT || DEFAULT_UA,
        [AUTH_HEADER]: token,
      }
      let body
      if (upload) {
        const form = new FormData()
        for (const [k, v] of Object.entries(params || {})) form.append(k, String(v))
        form.append(upload.field || 'file', new Blob([upload.content]), upload.filename)
        // fetch 会自动按 FormData 设置 multipart boundary。
        body = form
      } else if (m === 'POST') {
        headers['content-type'] = 'application/json'
        body = JSON.stringify(params || {})
      }
      const res = await fetch(buildUrl(p, m === 'GET' ? params : null, baseUrl), { headers, body, method: m, signal: controller.signal })
      const text = await res.text()
      const json = decode(text)
      if (res.status >= 400 || (json && typeof json === 'object' && json.error)) {
        lastError = { status: res.status, json, ms: Date.now() - started, httpError: true }
        if (RETRYABLE.has(res.status) && attempt < retries) continue
        return lastError
      }
      return { status: res.status, json, ms: Date.now() - started }
    } catch (err) {
      lastError = { status: 0, json: { error: `网络错误：${err?.cause?.message || err?.message || err}` }, ms: Date.now() - started }
      if (attempt < retries) continue
      return lastError
    } finally {
      clearTimeout(timer)
    }
  }
  return lastError || { status: 0, json: { error: '请求失败' }, ms: Date.now() - started }
}

// --summary 等价物：只看结构 + 标量。
export function summarize(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return { value: result }
  const out = {}
  for (const [k, v] of Object.entries(result)) {
    if (typeof v !== 'object' || v === null) out[k] = v
  }
  for (const key of ['data', 'details']) {
    const v = result[key]
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[key] = {
        keys: Object.keys(v).slice(0, 15),
        scalars: Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x !== 'object' || x === null)),
      }
    } else if (Array.isArray(v)) {
      out[key] = { type: 'list', length: v.length }
    }
  }
  return out
}
