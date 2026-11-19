// dsh-redfox-api 单测（node test/lib.test.mjs 直接跑）。零网络：不真实调用 RedFox API。
process.env.DSH_HOME = new URL('../.tmp/test-home/', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:')

import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKILL_DIRS = [join(ROOT, 'skills')]

rmSync(process.env.DSH_HOME, { recursive: true, force: true })

let passed = 0, failed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (err) { failed++; console.error(`  ✗ ${name}\n    ${err?.message?.split('\n')[0]}`) }
}

// ── searcher.js ────────────────────────────────────────────
const { createCatalog, tokenize, defaultsPresent } = await import('../lib/searcher.js')
const cat = createCatalog(SKILL_DIRS)

await test('searcher: 目录加载 201 端点 / 28 平台', async () => {
  assert.equal(cat.endpoints.length, 201)
  const platforms = cat.platforms()
  assert.equal(platforms.length, 28)
  const total = platforms.reduce((s, p) => s + p.count, 0)
  assert.equal(total, 201)
  assert.ok(platforms.some((p) => p.name === 'douyin' && p.label === '抖音'))
})

await test('searcher: 中文关键词搜索命中小红书', async () => {
  const hits = cat.search('小红书 搜索 笔记', 10)
  assert.ok(hits.some((e) => e.platform === 'xiaohongshu'), hits.map((e) => e.name).join(','))
  assert.ok(cat.search('douyin hot rank', 10).some((e) => e.platform === 'douyin' || e.path.includes('dyData')))
})

await test('searcher: 裸平台名 surface 该平台自己的端点', async () => {
  const hits = cat.search('account', 5)
  assert.ok(hits.some((e) => e.platform === 'account'), hits.map((e) => e.name).join(','))
})

await test('searcher: detail 给真实 api_name 与 example_call 提示', async () => {
  const d = cat.detail('douyin.search_users')
  assert.ok(d, 'detail 应命中 douyin.search_users')
  assert.equal(d.http_method, 'POST')
  assert.equal(d.path, '/story/api/dyData/searchUser')
  assert.ok(d.params.some((p) => p.api_name === 'keyword'))
  assert.ok(d.example_call.includes('api_client.py'), d.example_call)
  const d2 = cat.detail('/story/api/dyData/searchUser')
  assert.equal(d2?.name, 'douyin.search_users')
  assert.equal(cat.detail('zzz-不存在'), null)
})

await test('searcher: detail 容忍「平台.接口名」与大小写写法', async () => {
  // 用户和模型很常照 URL 写 hotspot.getListByPlatform（真实 sdk_method 为 get_platform_rank）。
  const d = cat.detail('hotspot.getListByPlatform')
  assert.equal(d?.name, 'hotspot.get_platform_rank', '应按路径末段唯一定位')
  assert.equal(cat.detail('hotSpot.getListByPlatform')?.name, 'hotspot.get_platform_rank')
  assert.equal(cat.detail('DOUYIN.SEARCH_USERS')?.name, 'douyin.search_users')
  // 仍然必须唯一：多处重名要留给用户/模型自己选，不能乱猜。
  assert.equal(cat.detail('dyData.searchUser'), null)
})

await test('searcher: platform 列端点 + defaultsPresent', async () => {
  const items = cat.byPlatform('douyin')
  assert.ok(items.length >= 5)
  assert.ok(items.every((e) => e.platform === 'douyin'))
  assert.equal(typeof defaultsPresent({ params: [{ required: false, default: 0, api_name: 'page' }] }), 'boolean')
})

await test('searcher: 中文分词带二元组', async () => {
  const tokens = tokenize('小红书搜索')
  assert.ok(tokens.some(([t]) => t === '小红书搜索' || t === '搜索'))
  assert.ok(tokens.some(([t, w]) => w < 1), '长中文串应产出低权重二元组')
})

// ── client.js ──────────────────────────────────────────────
const { normalizePath, classifyResult, chargeNote, chargeMention, buildUrl, summarize } = await import('../lib/client.js')

await test('client: normalizePath 补斜杠', async () => {
  assert.equal(normalizePath('/story/api/x'), '/story/api/x')
  assert.equal(normalizePath('story/api/x'), '/story/api/x')
  assert.equal(normalizePath('story//api/x'), '/story//api/x')
})

await test('client: 业务码三分类', async () => {
  assert.equal(classifyResult({ code: 2000, data: {} }), 'ok')
  assert.equal(classifyResult({ code: 3203, msg: '积分未扣除: 未查询到相关数据' }), 'no_data')
  assert.equal(classifyResult({ code: 3801, msg: '已扣除 0.600 积分。暂无作品' }), 'no_data')
  assert.equal(classifyResult({ code: 3203, msg: '关键词长度请不要超过6个字' }), 'error', '参数文案的真错误不能算无数据')
  assert.equal(classifyResult({ code: 1001, msg: '缺少必要参数' }), 'error')
  assert.equal(classifyResult({ error: '网络错误' }), 'error')
  assert.equal(classifyResult('raw string'), 'ok')
})

await test('client: chargeNote 区分未扣除与已扣除', async () => {
  assert.equal(chargeNote({ msg: '积分未扣除: API错误: 所请求的资源在平台上未找到。' }), '积分未扣除')
  assert.equal(chargeNote({ msg: '已扣除 0.600 积分。暂无作品' }), '已扣除 0.600 积分')
  assert.equal(chargeNote({ msg: '其他' }), '扣费情况见 msg')
})

await test('client: chargeMention 只记真正的扣费信息', async () => {
  // 成功调用的 msg 常为空，不能每条都挂「扣费情况见 msg」；只有 msg 提到积分才记。
  assert.equal(chargeMention({ msg: '' }), '')
  assert.equal(chargeMention({ msg: 'success' }), '')
  assert.equal(chargeMention({ msg: '已扣除 0.600 积分。' }), '已扣除 0.600 积分')
  assert.equal(chargeMention({ msg: '积分未扣除: API错误' }), '积分未扣除')
})

await test('client: buildUrl query 编码', async () => {
  const url = buildUrl('/story/api/hotSpot/getListByPlatform', { platform: 2, startDate: '2026-11-13' })
  assert.ok(url.startsWith('https://redfox.hk/story/api/hotSpot/getListByPlatform?'))
  assert.ok(url.includes('platform=2'))
  assert.ok(url.includes('startDate=2026-11-13'))
})

await test('client: summarize 只留结构+标量', async () => {
  const s = summarize({ code: 2000, msg: 'ok', data: { total: 3, items: [1, 2] } })
  assert.equal(s.code, 2000)
  assert.equal(s.data.keys[0], 'total')
  assert.equal(s.data.length, undefined)
  const list = summarize({ code: 2000, data: [1, 2, 3] })
  assert.equal(list.data.type, 'list')
  assert.equal(list.data.length, 3)
})

// ── data.js ────────────────────────────────────────────────
const data = await import('../lib/data.js')

await test('data: 调用历史 追加/更新/清空', async () => {
  assert.equal(data.readHistory().length, 0)
  data.appendHistory({ id: 'c1', path: '/story/api/x', status: 'running' })
  data.updateHistory('c1', { status: 'ok', kind: 'ok', code: 2000, ms: 300, charge: '' })
  assert.equal(data.readHistory()[0].code, 2000)
  data.appendHistory({ id: 'c2', path: '/story/api/y', status: 'ok', kind: 'no_data', charge: '已扣除 0.600 积分' })
  const got = data.getHistory('c2')
  assert.equal(got.charge, '已扣除 0.600 积分')
  assert.equal(data.getHistory('zz'), null)
  assert.equal(data.deleteHistory('c1'), true)
  assert.equal(data.deleteHistory('c1'), false)
  data.clearHistory()
  assert.equal(data.readHistory().length, 0)
})

// ── settings.js ────────────────────────────────────────────
const settings = await import('../lib/settings.js')

await test('settings: 面板优先，回落 Config 与环境变量，掩码不回明文', async () => {
  assert.equal(settings.resolveToken({}), '')
  assert.equal(settings.tokenSource({}), 'none')
  settings.saveSettings({ redfoxApiKey: 'ak_test_1234567890' })
  assert.equal(settings.resolveToken({}), 'ak_test_1234567890')
  assert.equal(settings.tokenSource({}), 'panel')
  const masked = settings.maskSettings()
  assert.ok(!JSON.stringify(masked).includes('ak_test_1234567890'), '掩码绝不回明文')
  assert.ok(masked.tokenMasked.startsWith('ak_te') && masked.tokenMasked.endsWith('7890'))
  assert.equal(settings.resolveToken({ redfoxApiKey: 'ak_cfg' }), 'ak_test_1234567890', '面板优先于 Config')
  settings.clearSettings()
  assert.equal(settings.resolveToken({ redfoxApiKey: 'ak_cfg' }), 'ak_cfg')
  assert.equal(settings.tokenSource({ redfoxApiKey: 'ak_cfg' }), 'config')
})

// ── skills.js ──────────────────────────────────────────────
const skills = await import('../lib/skills.js')

await test('skills: 快照提供方 list/get 带 DSH 使用说明', async () => {
  const provider = skills.createSkillProvider(SKILL_DIRS)
  const list = await provider.list()
  assert.ok(list.length >= 1, '应至少一个技能快照')
  const s = list[0]
  assert.equal(s.name, 'redfox-api-helper')
  assert.ok(s.description.includes('RedFoxHub'))
  const got = await provider.get({ locator: s.locator, name: s.name })
  assert.ok(got.content.includes('redfox_call'), 'addendum 应引导用插件工具替代 python 命令')
  assert.ok(got.content.includes('3203'))
})

// ── host 工具 ──────────────────────────────────────────────
process.env.REDFOX_API_KEY = ''
const host = await import('../src/host.js')

// 先 apply 一次（假 ctx）设置 skillDirsRef，工具的懒加载 catalog 才能找到 apis.json。
{
  const ctx = {
    tools: { register: () => {} },
    skills: { registerProvider: () => {} },
    webServer: { register: () => {} },
    effect: (fn) => fn(),
  }
  host.apply(ctx)
}
data.clearHistory()

await test('host: redfox_endpoint 四个动作', async () => {
  const t = host.redfoxEndpointTool
  const plats = await t.execute({ action: 'platforms' }, t.parameters)
  assert.equal(plats.ok, true)
  assert.ok(plats.data.includes('douyin'))
  const platform = await t.execute({ action: 'platform', platform: 'douyin' }, t.parameters)
  assert.ok(platform.data.includes('/story/api/dyData/'))
  const bad = await t.execute({ action: 'platform', platform: 'zzz' }, t.parameters)
  assert.equal(bad.ok, false)
  assert.ok(bad.summary.includes('可用平台'))
  const search = await t.execute({ action: 'search', keyword: '抖音 账号 搜索' }, t.parameters)
  assert.ok(search.data.includes('searchUser'))
  const detail = await t.execute({ action: 'detail', key: 'douyin.search_users' }, t.parameters)
  assert.equal(detail.ok, true)
  assert.ok(detail.data.includes('keyword'))
  assert.ok(detail.data.includes('api_name') || detail.data.includes('keyword='))
  assert.ok(!detail.data.includes('原始记录'), '不传 full 不应带原始记录')
  const fullOn = await t.execute({ action: 'detail', key: 'douyin.search_users', full: 'true' }, t.parameters)
  assert.ok(fullOn.data.includes('原始记录：{'), 'full="true" 要带完整原始记录')
  const fullOff = await t.execute({ action: 'detail', key: 'douyin.search_users', full: 'false' }, t.parameters)
  assert.ok(!fullOff.data.includes('原始记录'), 'full="false" 字符串不能被当成 true')
  assert.ok(!fullOff.data.includes('undefined'), 'full="false" 不能印出「原始记录：undefined」')
  const miss = await t.execute({ action: 'detail', key: 'dyData.searchUser' }, t.parameters)
  assert.equal(miss.ok, false)
  assert.ok(miss.summary.includes('相近候选'), 'detail 未命中要给搜索候选')
  const miss2 = await t.execute({ action: 'detail', key: 'zzz' }, t.parameters)
  assert.equal(miss2.ok, false)
  assert.ok(miss2.summary.includes('action=search'))
})

await test('host: 参数校验拒绝未知参数与非法枚举', async () => {
  const t = host.redfoxEndpointTool
  await assert.rejects(() => t.execute({ action: 'search', keyword: 'x', extra: 1 }, t.parameters), /未知参数/)
  await assert.rejects(() => t.execute({ action: 'bogus' }, t.parameters), /只能是/)
  await assert.rejects(() => t.execute({}, t.parameters), /缺少必填参数/)
})

await test('host: redfox_call 无 key 直接报错不发请求', async () => {
  const t = host.redfoxCallTool
  await assert.rejects(() => t.execute({ method: 'GET', path: '/story/web/points/api-key/balance' }, t.parameters), /未配置 RedFox API key/)
})

await test('host: redfox_call params 校验', async () => {
  const t = host.redfoxCallTool
  process.env.REDFOX_API_KEY = 'ak_unitest' // 只为走到参数校验段
  await assert.rejects(() => t.execute({ method: 'GET', path: '/x', params: '{bad json' }, t.parameters), /不是合法 JSON/)
  await assert.rejects(() => t.execute({ method: 'GET', path: '/x', params: '"string"' }, t.parameters), /JSON 对象/)
  await assert.rejects(() => t.execute({ method: 'PUT', path: '/x' }, t.parameters), /只能是/)
  await assert.rejects(() => t.execute({ method: 'GET', path: '/x', file: 'D:/不存在/文件.bin' }, t.parameters), /ENOENT|no such file|不存在/i)
  delete process.env.REDFOX_API_KEY
})

await test('host: redfox_history 增查删清', async () => {
  const t = host.redfoxHistoryTool
  data.clearHistory()
  data.appendHistory({ id: 'h1', ts: 'now', method: 'POST', path: '/story/api/x', params: {}, status: 'ok', kind: 'no_data', code: 3203, charge: '积分未扣除' })
  const list = await t.execute({ action: 'list' }, t.parameters)
  assert.ok(list.data.includes('h1') && list.data.includes('积分未扣除'))
  const noConfirm = await t.execute({ action: 'clear' }, t.parameters)
  assert.equal(noConfirm.ok, false, '清空必须 confirm')
  const got = await t.execute({ action: 'get', id: 'h1' }, t.parameters)
  assert.ok(got.data.includes('3203'))
  await t.execute({ action: 'delete', id: 'h1' }, t.parameters)
  assert.equal(data.readHistory().length, 0)
  await t.execute({ action: 'clear', confirm: 'yes' }, t.parameters)
})

await test('host: apply 注册工具与路由', async () => {
  const registered = { tools: [], effects: [] }
  const ctx = {
    tools: { register: (t) => registered.tools.push(t.name) },
    skills: { registerProvider: () => {} },
    webServer: { register: () => {} },
    effect: (fn, label) => { fn(); registered.effects.push(label) },
  }
  host.apply(ctx)
  assert.deepEqual(registered.tools, ['redfox_endpoint', 'redfox_call', 'redfox_history'])
  assert.equal(registered.effects.length, 5, '工具 3 + 技能 + 路由')
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
