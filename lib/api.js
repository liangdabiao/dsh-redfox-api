// 面板数据面：/redfox-api 前缀路由（端点目录 + 调用历史 + 设置 + 余额）。
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { createCatalog } from './searcher.js'
import { callRedFox } from './client.js'
import { readHistory, deleteHistory, clearHistory, DATA_DIR } from './data.js'
import { maskSettings, saveSettings, clearSettings, resolveToken, tokenSource } from './settings.js'

const BASE = '/redfox-api'

function readJson(req, max = 512 * 1024) {
  return new Promise((resolve, reject) => {
    if (req.method !== 'POST') return reject(Object.assign(new Error('只接受 POST'), { status: 405 }))
    if (!(req.headers['content-type'] || '').includes('application/json')) {
      return reject(Object.assign(new Error('要 application/json'), { status: 415 }))
    }
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > max) { reject(Object.assign(new Error('请求体过大'), { status: 413 })); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { reject(Object.assign(new Error('JSON 解析失败'), { status: 400 })) }
    })
    req.on('error', reject)
  })
}

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

export function requestRejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return false // dsh 0.2.x 宿主已 token 鉴权，服务缺席时放行（fail-closed 会把面板永久 403）
  return connection.requestRejection({ headers: req.headers })
}

// 余额查询（GET /story/web/points/api-key/balance，configurable key 未配置时返回 configured:false）。
async function fetchBalance(token) {
  const { json: result } = await callRedFox({ method: 'GET', path: '/story/web/points/api-key/balance', token, timeoutMs: 12_000 })
  const data = result?.data || {}
  return {
    code: result?.code,
    totalAvailablePoints: data.totalAvailablePoints,
    freeAvailablePoints: data.freeAvailablePoints,
    paidAvailablePoints: data.paidAvailablePoints,
    raw: result,
  }
}

export function registerApi(ctx, { skillDirs, configRef }) {
  const catalogRef = { catalog: null }
  const getCatalog = () => {
    if (!catalogRef.catalog) catalogRef.catalog = createCatalog(skillDirs)
    return catalogRef.catalog
  }
  return ctx.webServer.register({
    kind: 'prefix', path: BASE,
    async handler(req, res) {
      try {
        const r = requestRejection(ctx, req)
        if (typeof r === 'number') return json(res, r, { error: '未授权' })
        const url = new URL(req.url, 'http://x')
        const path = url.pathname.slice(BASE.length) || '/'
        const config = configRef?.config || {}
        if (path === '/api/health') {
          try { appendFileSync(join(DATA_DIR, 'client-boot.log'), `${new Date().toISOString()} client-apply\n`) } catch { /* 诊断日志失败不影响业务 */ }
          return json(res, 200, { ok: true, dataDir: DATA_DIR, credentials: maskSettings(), hasToken: Boolean(resolveToken(config)) })
        }
        if (path === '/api/config' && req.method === 'GET') {
          return json(res, 200, { ...maskSettings(), source: tokenSource(config) })
        }
        if (path === '/api/config' && req.method === 'POST') {
          const body = await readJson(req)
          return json(res, 200, { ok: true, credentials: { ...saveSettings(body), source: tokenSource(config) } })
        }
        if (path === '/api/config' && req.method === 'DELETE') {
          clearSettings()
          return json(res, 200, { ok: true, credentials: { ...maskSettings(), source: tokenSource(config) } })
        }
        if (path === '/api/balance' && req.method === 'GET') {
          const token = resolveToken(config)
          if (!token) return json(res, 200, { configured: false })
          try {
            const b = await fetchBalance(token)
            return json(res, 200, { configured: true, ...b })
          } catch (err) {
            return json(res, 200, { configured: true, error: String(err?.message || err).slice(0, 200) })
          }
        }
        if (path === '/api/endpoints') {
          const catalog = getCatalog()
          const q = (url.searchParams.get('q') || '').trim()
          const platform = (url.searchParams.get('platform') || '').trim()
          let list = catalog.endpoints
          if (platform) list = catalog.byPlatform(platform)
          if (q) list = catalog.search(q, 1000)
          const platforms = catalog.platforms()
          return json(res, 200, {
            count: list.length,
            total: catalog.endpoints.length,
            platforms,
            endpoints: list.slice(0, 300).map((e) => ({
              method: e.http_method, path: e.path, name: e.name,
              platform: e.platform, platformLabel: e.platform_label,
              summary: e.summary, example: e.example_call, isUpload: Boolean(e.is_upload),
            })),
          })
        }
        if (path === '/api/endpoint/detail') {
          const catalog = getCatalog()
          const key = url.searchParams.get('key') || ''
          const d = catalog.detail(key, false)
          if (!d) return json(res, 404, { error: `没有找到端点 ${key}` })
          return json(res, 200, { detail: d })
        }
        if (path === '/api/stats') {
          const calls = readHistory()
          const now = new Date()
          const today = calls.filter((c) => {
            const d = new Date(c.ts)
            return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
          }).length
          return json(res, 200, {
            total: calls.length,
            ok: calls.filter((c) => c.kind === 'ok').length,
            noData: calls.filter((c) => c.kind === 'no_data').length,
            error: calls.filter((c) => c.kind === 'error').length,
            today,
            configured: Boolean(resolveToken(config)),
          })
        }
        if (path === '/api/calls') {
          return json(res, 200, { calls: readHistory() })
        }
        if (path === '/api/calls/delete' && req.method === 'POST') {
          const body = await readJson(req)
          return json(res, 200, { ok: deleteHistory(body?.id || '') })
        }
        if (path === '/api/calls/clear' && req.method === 'POST') {
          clearHistory()
          return json(res, 200, { ok: true })
        }
        json(res, 404, { error: 'not found' })
      } catch (err) { json(res, 500, { error: err?.message }) }
    },
  })
}
