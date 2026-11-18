// 冒烟测试（离线，零积分）：本地 mock RedFox 服务 → callRedFox 全链 + host 工具 + 面板 API + 产物契约。
// 运行：npm run smoke
const { mkdtempSync, rmSync, readFileSync, existsSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const { join } = await import('node:path')
import { createServer } from 'node:http'

const tmp = mkdtempSync(join(tmpdir(), 'dsh-redfox-smoke-'))
process.env.DSH_HOME = tmp

let failed = 0
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  if (!cond) failed++
}

// ── mock RedFox 服务 ───────────────────────────────────────
let sawAuth = '', sawCt = '', sawQuery = '', sawBody = ''
let four29Then200 = 0
const server = createServer((req, res) => {
  sawAuth = req.headers['redfox_api_key'] || ''
  const url = new URL(req.url, 'http://mock')
  let chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8')
    const reply = (obj, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(obj))
    }
    if (url.pathname === '/story/web/points/api-key/balance') {
      sawQuery = url.search
      return reply({ code: 2000, msg: 'success', data: { totalAvailablePoints: 837.6, freeAvailablePoints: 0, paidAvailablePoints: 837.6 } })
    }
    if (url.pathname === '/story/api/dyData/searchUser') {
      sawCt = req.headers['content-type'] || ''
      sawBody = body
      const kw = (JSON.parse(body || '{}').keyword) || ''
      if (kw === '查无数据') return reply({ code: 3203, msg: '积分未扣除: 未查询到相关数据' })
      if (kw === '参数错') return reply({ code: 3203, msg: '接口执行异常，积分未扣除: offset不能超过1000' })
      if (kw === '限流' && four29Then200++ === 0) return reply({ code: 4004, msg: '操作过于频繁' }, 429)
      return reply({ code: 2000, msg: 'success', data: [{ accountId: 1, nickname: '乐高玩家', followerCount: 12345 }] })
    }
    reply({ error: 'not found' }, 404)
  })
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const mockBase = `http://127.0.0.1:${server.address().port}`
process.env.REDFOX_BASE_URL = mockBase

// ── callRedFox 直调 ────────────────────────────────────────
const { callRedFox, classifyResult, chargeNote } = await import('../lib/client.js')
{
  const r = await callRedFox({ method: 'GET', path: '/story/web/points/api-key/balance', params: {}, token: 'ak_test' })
  check('GET 余额 + query 携带', r.status === 200 && r.json.code === 2000 && r.json.data.totalAvailablePoints === 837.6, `query=${sawQuery}`)
  check('鉴权走 REDFOX_API_KEY 头', sawAuth === 'ak_test', sawAuth)
  check('GET 参数不进 body', sawBody === '', sawBody.slice(0, 30))
}
{
  const r = await callRedFox({ method: 'POST', path: '/story/api/dyData/searchUser', params: { keyword: '乐高', offset: 0 }, token: 'ak_test' })
  check('POST body 为 JSON', sawCt.includes('application/json') && JSON.parse(sawBody).keyword === '乐高', sawCt)
  check('code 2000 → ok', classifyResult(r.json) === 'ok' && Array.isArray(r.json.data), `${r.ms}ms`)
}
{
  const r = await callRedFox({ method: 'POST', path: '/story/api/dyData/searchUser', params: { keyword: '查无数据' }, token: 'ak_test' })
  check('3203 查无数据 → no_data（非失败）', classifyResult(r.json) === 'no_data', '')
  check('扣费提示=积分未扣除', chargeNote(r.json) === '积分未扣除', chargeNote(r.json))
}
{
  const r = await callRedFox({ method: 'POST', path: '/story/api/dyData/searchUser', params: { keyword: '参数错' }, token: 'ak_test' })
  check('3203 参数文案 → error', classifyResult(r.json) === 'error', r.json.msg.slice(0, 40))
}
{
  const r = await callRedFox({ method: 'POST', path: '/story/api/dyData/searchUser', params: { keyword: '限流' }, token: 'ak_test', retries: 1, timeoutMs: 5000 })
  check('429 后重试成功（retries=1）', r.json?.code === 2000 && four29Then200 === 2, `attempts=${four29Then200}`)
}
{
  const r = await callRedFox({ method: 'GET', path: '/x', params: {}, token: '', timeoutMs: 3000 }).catch((e) => ({ thrown: true, msg: String(e?.message || e) }))
  check('无 key 明确报错不发请求', r.thrown && r.msg.includes('未配置'), r.msg.slice(0, 50))
}

// ── host 工具走 mock（真实 HTTP + 历史留痕） ───────────────
const host = await import('../src/host.js')
const data = await import('../lib/data.js')
const settings = await import('../lib/settings.js')
const { registerApi } = await import('../lib/api.js')
{
  const ctx = { tools: { register: () => {} }, skills: { registerProvider: () => {} }, webServer: { register: () => {} }, effect: (fn) => fn() }
  host.apply(ctx)
}
settings.saveSettings({ redfoxApiKey: 'ak_panel_test' })
{
  const t = host.redfoxCallTool
  const ok = await t.execute({ method: 'POST', path: 'story/api/dyData/searchUser', params: { keyword: '乐高' }, note: '冒烟' }, t.parameters)
  check('host redfox_call 成功（路径补斜杠）', ok.ok && ok.summary.includes('code=2000') && ok.data.includes('乐高玩家'), ok.summary.slice(0, 60))
  const nod = await t.execute({ method: 'POST', path: '/story/api/dyData/searchUser', params: { keyword: '查无数据' } }, t.parameters)
  check('host 无数据 ok=true（不是失败）', nod.ok && nod.summary.includes('查无数据') && nod.summary.includes('积分未扣除'), nod.summary.slice(0, 70))
  const err = await t.execute({ method: 'POST', path: '/story/api/dyData/searchUser', params: { keyword: '参数错' } }, t.parameters)
  check('host 参数错 ok=false', err.ok === false && err.summary.includes('错误'), err.summary.slice(0, 60))
  const hist = data.readHistory()
  check('历史 3 条且分类齐全', hist.length === 3 && hist.some((r) => r.kind === 'no_data' && r.charge === '积分未扣除') && hist[0].method === 'POST',
    hist.map((r) => r.kind).join(','))
}

// ── 面板 API ───────────────────────────────────────────────
const routes = {}
const SKILL_ROOT = join(import.meta.dirname ?? '.', '..')
registerApi({ get: () => undefined, webServer: { register: (r) => { routes[r.path] = r.handler } } }, { skillDirs: [join(SKILL_ROOT, 'skills')], config: host.Config })
const { Writable } = await import('node:stream')
const { EventEmitter } = await import('node:events')
const req = async (method, path, body) => {
  const reqObj = new EventEmitter()
  reqObj.method = method
  reqObj.url = `/redfox-api${path}`
  reqObj.headers = body ? { 'content-type': 'application/json', host: 'x' } : { host: 'x' }
  const chunks = []
  const resObj = new Writable({ write(c, _e, cb) { chunks.push(c); cb() } })
  resObj.statusCode = 0
  resObj.writeHead = (code) => { resObj.statusCode = code }
  const done = new Promise((resolve) => {
    const origEnd = resObj.end.bind(resObj)
    resObj.end = (...args) => {
      origEnd(...args)
      const text = () => Buffer.concat(chunks).toString('utf8')
      resolve({ status: resObj.statusCode, text, json: (() => { try { return JSON.parse(text()) } catch { return null } })() })
    }
  })
  const p = routes['/redfox-api'](reqObj, resObj)
  if (body) reqObj.emit('data', Buffer.from(JSON.stringify(body)))
  reqObj.emit('end')
  await p
  return done
}
{
  const s = await req('GET', '/api/stats')
  check('stats 含 no_data 分类', s.status === 200 && s.json.total === 3 && s.json.noData === 1 && s.json.configured === true, JSON.stringify(s.json))
  const calls = await req('GET', '/api/calls')
  check('calls 列表含响应片段', calls.json.calls.some((r) => r.responseSnippet?.includes('乐高玩家')), '')
  const eps = await req('GET', '/api/endpoints')
  check('endpoints 201 个 + 28 平台', eps.json.total === 201 && eps.json.platforms.length === 28, `total=${eps.json?.total}`)
  const filtered = await req('GET', '/api/endpoints?platform=xiaohongshu')
  check('platform 筛选', filtered.json.count > 0 && filtered.json.endpoints.every((e) => e.platform === 'xiaohongshu'), `count=${filtered.json?.count}`)
  const searched = await req('GET', '/api/endpoints?q=' + encodeURIComponent('抖音 账号 搜索'))
  check('q 搜索', searched.json.count > 0 && searched.json.endpoints.some((e) => e.path.includes('searchUser')), '')
  const detail = await req('GET', '/api/endpoint/detail?key=douyin.search_users')
  check('面板 detail', detail.status === 200 && detail.json.detail.path === '/story/api/dyData/searchUser', '')
  const miss = await req('GET', '/api/endpoint/detail?key=zzz')
  check('面板 detail 未命中 404', miss.status === 404, '')
  const cfg = await req('GET', '/api/config')
  check('config 掩码不回明文', cfg.json.configured === true && !cfg.text().includes('ak_panel_test'), cfg.json.tokenMasked)
  const del = await req('POST', '/api/calls/delete', { id: calls.json.calls[0].id })
  check('calls 删除单条', del.json.ok === true && data.readHistory().length === 2, '')
  const clr = await req('POST', '/api/calls/clear', {})
  check('calls 清空', clr.json.ok === true && data.readHistory().length === 0, '')
  const delKey = await req('DELETE', '/api/config', null)
  check('config DELETE 清 key', delKey.json.credentials.configured === false, '')
}
{
  const bal = await req('GET', '/api/balance')
  check('balance 未配置 key → configured:false（不发真实请求）', bal.json.configured === false, JSON.stringify(bal.json).slice(0, 60))
}

// ── 产物契约 ───────────────────────────────────────────────
{
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  check('client 面板 id redfox-api', client.includes("'redfox-api'") && client.includes('startSession'), '')
  check('client 五标签齐全', ['概览', '调用历史', '端点库', '设置', '指南'].every((k) => client.includes(k)), '')
  check('client 展示扣费/三分类', client.includes('KIND_LABEL') && client.includes('无数据'), '')
  check('dist 产物存在', existsSync(new URL('../dist/client.js', import.meta.url)), '')
  const skillsDir = new URL('../skills/redfox-api-helper/', import.meta.url)
  check('技能快照四件套', ['SKILL.md', 'apis.json', 'api_searcher.py', 'api_client.py'].every((f) => existsSync(new URL(f, skillsDir))), '')
}

server.close()
rmSync(tmp, { recursive: true, force: true })
delete process.env.REDFOX_BASE_URL
console.log(failed ? `\n${failed} 项失败` : '\n全部通过')
process.exit(failed ? 1 : 0)
