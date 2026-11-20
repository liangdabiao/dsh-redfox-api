// RedFox API 助手 · Host 半边（技能 + redfox_endpoint / redfox_call / redfox_history 原生工具 + 面板数据面）。
// 数据源是 skills/redfox-api-helper/apis.json（201 端点本地目录，检索零积分）。
// 调用按次计费：业务码 2000 成功；3203/3801 且文案为查无数据 = 空结果（非失败，但要按 msg 判断扣费）。
import Schema from '@deepseek-ai/schemastery'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { createCatalog } from '../lib/searcher.js'
import { createSkillProvider } from '../lib/skills.js'
import { registerApi } from '../lib/api.js'
import { callRedFox, classifyResult, chargeNote, chargeMention, normalizePath } from '../lib/client.js'
import { readHistory, appendHistory, updateHistory, clearHistory, getHistory, deleteHistory } from '../lib/data.js'
import { resolveToken, maskSettings, saveSettings, clearSettings } from '../lib/settings.js'

export const name = 'redfox-api'
export const inject = ['tools', 'skills', 'webServer', 'connection']

export const Config = Schema.object({
  redfoxApiKey: Schema.string().default('').description('RedFoxHub API key（redfox.hk/settings/api-keys 获取；敏感，仅本插件使用）'),
  reportsDir: Schema.string().default('').description('可选：额外登记一个调研报告目录（面板「📄 调研报告」也能扫到它，默认只列 DSH 工作区）'),
})

const configRef = { config: Config }

function check(args, spec) {
  const problems = []
  for (const key of spec.required || []) {
    if (args?.[key] === undefined) problems.push(`缺少必填参数 ${key}`)
  }
  for (const [key, rule] of Object.entries(spec.properties || {})) {
    const value = args?.[key]
    if (value === undefined) continue
    if (rule.enum && !rule.enum.includes(value)) problems.push(`${key} 只能是 ${rule.enum.join(' / ')} 之一`)
  }
  for (const key of Object.keys(args || {})) {
    if (!spec.properties || !(key in spec.properties)) problems.push(`未知参数 ${key}`)
  }
  if (problems.length) throw new Error(`参数有误：${problems.join('；')}。`)
}

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const num = (description, extra = {}) => ({ type: 'number', description, ...extra })
const text = (value) => [{ type: 'text', text: value }]

const OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'summary'],
    properties: {
      ok: { type: 'boolean' },
      summary: { type: 'string', description: '给模型看的回执' },
      data: { type: 'string', description: '可选：端点列表/响应 JSON' },
    },
  },
  render: (_args, value) => text(value.data ? `${value.summary}\n\n${value.data}` : value.summary),
}

const result = (ok, summary, data = '') => ({ ok, summary, data })

const catalogRef = { catalog: null }
function catalog() {
  if (!catalogRef.catalog) catalogRef.catalog = createCatalog(skillDirsRef.dirs)
  return catalogRef.catalog
}

// ---------------------------------------------------------------------------
// 工具 1：redfox_endpoint —— 201 端点本地目录检索（零积分、离线）
// ---------------------------------------------------------------------------
export const redfoxEndpointTool = {
  name: 'redfox_endpoint',
  description:
    '检索 RedFoxHub（红狐数据）API 端点目录（抖音/小红书/公众号/B站/快手/TikTok/YouTube/X/微博/知乎/热点榜/AI 搜索等 28 类 201 个端点）。' +
    '纯本地目录，不联网不消耗积分。调 redfox_call 之前**必须**先 search 找端点、再用 action=detail 查真实字段名（camelCase 的 api_name，不是 SDK 文档的 snake_case）、必填项和 example_call 默认值——照抄默认值才不会报 1002/3203。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: str('platforms 列平台及端点数；platform 列某平台全部端点；search 关键词搜索；detail 查端点参数/必填/示例', { enum: ['platforms', 'platform', 'search', 'detail'] }),
      platform: str('platform 动作：平台名（如 douyin / xiaohongshu / bilibili / tiktok / youtube / weibo / zhihu / hotSpot / account）'),
      keyword: str('search 动作：关键词，中英文均可，如「小红书 搜索 笔记」「hot rank」「评论」'),
      key: str('detail 动作：端点 name（如 douyin.search_users）、完整路径或 sdk_method'),
      full: str('detail 动作：传 true 附带完整原始记录'),
      limit: num('search/platform 最多返回条数，默认 15'),
    },
  },
  output: OUTPUT,
  async execute(args) {
    check(args, this.parameters)
    const cat = catalog()
    const limit = args.limit || 15
    const fmt = (e) => `- ${e.http_method} ${e.path} [${e.platform_label}] ${e.name}${e.summary ? ` · ${e.summary}` : ''}`

    if (args.action === 'platforms') {
      const list = cat.platforms()
      return result(true, `共 ${cat.endpoints.length} 个端点 / ${list.length} 个平台：`,
        list.map((p) => `- ${p.name}（${p.label}）：${p.count} 个端点`).join('\n'))
    }
    if (args.action === 'platform') {
      if (!args.platform) throw new Error('platform 动作需要 platform 参数。')
      const items = cat.byPlatform(args.platform)
      if (!items.length) {
        const known = cat.platforms().map((p) => p.name).join(' / ')
        return result(false, `平台「${args.platform}」没有端点。可用平台：${known}。`)
      }
      const shown = items.slice(0, limit)
      return result(true, `平台「${args.platform}」共 ${items.length} 个端点，显示 ${shown.length} 个（要参数细节用 action=detail key=<name>）：`,
        shown.map(fmt).join('\n'))
    }
    if (args.action === 'detail') {
      if (!args.key) throw new Error('detail 动作需要 key 参数（端点 name / 路径 / sdk_method）。')
      // full 传字符串 "false" 时 Boolean("false") 也是 true，会莫名多出整段原始记录。
      // 而且查询用这个布尔、拼输出也必须用同一个，否则会印出「原始记录：undefined」。
      const full = args.full === true || String(args.full ?? '').trim().toLowerCase() === 'true'
      const d = cat.detail(args.key, full)
      if (!d) {
        const hits = cat.search(args.key, 5)
        return result(false, `没有找到端点「${args.key}」。${hits.length ? `相近候选：\n${hits.map(fmt).join('\n')}` : '先用 action=search 换个关键词找。'}`)
      }
      const params = d.params?.length
        ? d.params.map((p) => `  - ${p.api_name}${p.sdk_name && p.sdk_name !== p.api_name ? `（SDK 名 ${p.sdk_name}）` : ''} ${p.required ? '【必填】' : '可选'} ${p.type}${p.default !== null && p.default !== undefined && String(p.default) !== 'None' ? ` 默认 ${JSON.stringify(p.default)}` : ''}${p.description ? ` · ${p.description}` : ''}`).join('\n')
        : '  （无参数）'
      return result(true,
        `${d.http_method} ${d.path} · [${d.platform_label}] ${d.name} · ${d.summary}${d.is_upload ? ' · multipart 上传接口（redfox_call 传 file=<本地文件>）' : ''}`,
        [`参数（字段名以 api_name 为准，不要用 SDK 的 snake_case）：`, params,
          d.returns ? `返回：${d.returns}` : '',
          d.example_call ? `示例：${d.example_call}` : '',
          d.tips?.length ? `注意：${d.tips.join('；')}` : '',
          full ? `原始记录：${JSON.stringify(d.raw, null, 2)}` : ''].filter(Boolean).join('\n'))
    }
    // search
    const kw = args.keyword || ''
    if (!kw) throw new Error('search 动作需要 keyword 参数。')
    const items = cat.search(kw, limit)
    if (!items.length) {
      return result(false, `没有匹配「${kw}」的端点。试试更少的关键词、单个平台名（action=platforms 可列全部平台）。`)
    }
    return result(true, `匹配 ${cat.lastTotal()} 条，显示 ${items.length} 条（要参数细节用 action=detail key=<name>）：`,
      items.map(fmt).join('\n'))
  },
}

// ---------------------------------------------------------------------------
// 工具 2：redfox_call —— 真实 GET/POST 调用（按次计费）+ 历史留痕
// ---------------------------------------------------------------------------
export const redfoxCallTool = {
  name: 'redfox_call',
  description:
    '真实调用 RedFoxHub API（https://redfox.hk）。key 在面板「⚙️ 设置」配置（或插件 Config / REDFOX_API_KEY 环境变量），**按次计费，默认不重试**。' +
    '先 redfox_endpoint action=detail 查清字段名和必填项再调用：method=GET 时 params 进 query，method=POST 时 params 进 JSON body；params 的字段名用 detail 给的 api_name。' +
    '回执区分三种结果：code=2000 成功；code=3203/3801 且文案是「未查询到相关数据/暂未收录/暂无作品」= 查无数据（不是失败，注意按 msg 判断是否扣费）；其他 code 是真错误。响应超 6000 字符会截断，建议把分析重点写进工作区文件。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['method', 'path'],
    properties: {
      method: str('GET 或 POST（以 detail 给的 http_method 为准）', { enum: ['GET', 'POST'] }),
      path: str('端点路径，如 /story/api/dyData/searchUser'),
      params: str('参数 JSON 字符串，如 {"keyword":"乐高","offset":0}。GET 进 query、POST 进 body；数组/对象/数字/布尔直接用 JSON 类型'),
      file: str('仅 multipart 上传接口（detail 会标注）：本地文件路径'),
      fileField: str('上传表单字段名，默认 file'),
      timeout: num('超时秒数，默认 30'),
      retries: num('429/5xx 重试次数，默认 0（按次计费，别随便重试）'),
      note: str('可选：本次调用用途标注（进历史）'),
    },
  },
  timeoutMs: 60_000,
  output: OUTPUT,
  async execute(args) {
    check(args, this.parameters)
    let params = {}
    if (args.params !== undefined) {
      if (typeof args.params === 'object' && args.params !== null && !Array.isArray(args.params)) {
        params = args.params
      } else {
        try { params = JSON.parse(args.params) } catch { throw new Error('params 不是合法 JSON，如 {"keyword":"保温杯","offset":0}。') }
      }
      if (typeof params !== 'object' || params === null || Array.isArray(params)) {
        throw new Error('params 必须是 JSON 对象，如 {"keyword":"乐高"}。')
      }
    }
    const cfg = configRef.config
    const token = resolveToken(cfg)
    // 没 key 就没发起过真实请求，不进历史（历史只留真实调用痕迹）。
    if (!token) {
      throw new Error('未配置 RedFox API key（redfoxApiKey / REDFOX_API_KEY）：在面板「⚙️ 设置」粘贴即可（redfox.hk/settings/api-keys 获取）。')
    }
    const path = normalizePath(args.path)
    // 文件在进入网络层之前读好：读不到要立刻明确报错，不能被网络 catch 吞成「请求失败」。
    let upload
    if (args.file) {
      try {
        upload = { filename: basename(args.file), content: readFileSync(args.file), field: args.fileField || 'file' }
      } catch (err) {
        throw new Error(`读不到上传文件 ${args.file}：${err?.message || err}。`)
      }
    }
    const record = {
      id: `call-${Date.now()}`,
      ts: new Date().toISOString(),
      method: args.method,
      path,
      params,
      note: args.note || '',
      status: 'running',
    }
    appendHistory(record)
    try {
      const { status, json, ms } = await callRedFox({
        method: args.method, path, params, token,
        timeoutMs: (args.timeout || 30) * 1000,
        retries: args.retries || 0,
        upload,
      })
      const kind = classifyResult(json)
      const body = typeof json === 'string' ? json : JSON.stringify(json, null, 2)
      const code = json && typeof json === 'object' ? json.code : undefined
      updateHistory(record.id, {
        status: kind === 'error' ? 'error' : 'ok',
        kind, code, httpStatus: status, ms,
        // 成功调用也会写「已扣除 X 积分」——扣费要能看到，不能只在无数据时记。
        charge: chargeMention(json),
        responseSnippet: body.slice(0, 4000),
      })
      const truncated = body.length > 6000
        ? `${body.slice(0, 6000)}\n…（响应过长已截断 ${body.length} 字符，建议把分析重点写进工作区文件）`
        : body
      const kindNote = kind === 'ok' ? '成功' : kind === 'no_data' ? `查无数据（不是失败；${chargeNote(json)}）` : '业务错误'
      return result(kind !== 'error',
        `${args.method} ${path} → HTTP ${status} · code=${code} · ${kindNote}（${ms}ms）${args.note ? ` · ${args.note}` : ''}。完整响应可在面板「调用历史」查看。`,
        truncated)
    } catch (err) {
      updateHistory(record.id, { status: 'error', kind: 'error', error: String(err?.message || err).slice(0, 300) })
      throw err
    }
  },
}

// ---------------------------------------------------------------------------
// 工具 3：redfox_history —— 调用历史（列表 / 详情 / 删除 / 清空）
// ---------------------------------------------------------------------------
export const redfoxHistoryTool = {
  name: 'redfox_history',
  description:
    '查询/读取/删除 RedFox API 调用历史（每次调用的方法、路径、参数、业务码、结果分类、扣费说明、响应片段）。' +
    'list 看列表；get 按 id 读详情（含响应片段）；delete 删单条；clear 清空。用户问「刚才调了什么接口/花了多少积分/结果是什么」时使用。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: str('list 列表；get 详情；delete 删单条；clear 清空（需 confirm）', { enum: ['list', 'get', 'delete', 'clear'] }),
      id: str('get/delete：记录 id（list 里能看到）'),
      limit: num('list：最多返回条数，默认 15'),
      confirm: str('clear 必须传 "yes"', { enum: ['yes'] }),
    },
  },
  output: OUTPUT,
  async execute(args) {
    check(args, this.parameters)
    if (args.action === 'clear') {
      if (args.confirm !== 'yes') return result(false, '清空历史请用 confirm:"yes" 确认。')
      clearHistory()
      return result(true, '调用历史已清空。')
    }
    if (args.action === 'get') {
      if (!args.id) throw new Error('get 需要 id（从 list 里找）。')
      const record = getHistory(args.id)
      if (!record) return result(false, `没有找到记录 ${args.id}。`)
      return result(true, `记录 ${args.id}（${record.status}${record.kind ? '/' + record.kind : ''}）`, JSON.stringify(record, null, 2))
    }
    if (args.action === 'delete') {
      if (!args.id) throw new Error('delete 需要 id（从 list 里找）。')
      const removed = deleteHistory(args.id)
      return result(removed, removed ? `已删除记录 ${args.id}。` : `没有找到记录 ${args.id}。`)
    }
    const all = readHistory()
    const list = all.slice(0, args.limit || 15)
    if (!list.length) return result(true, '还没有调用历史。先用 redfox_endpoint 找端点，再 redfox_call 调用。')
    return result(true, `共 ${all.length} 条，最近 ${list.length} 条：`,
      list.map((r) => `- ${r.ts} [${r.method} ${r.status}${r.kind ? '/' + r.kind : ''}${r.code != null ? ' code=' + r.code : ''}] ${r.path} ${JSON.stringify(r.params)}${r.note ? ` · ${r.note}` : ''}${r.charge ? ` · ${r.charge}` : ''}\n  id=${r.id}`).join('\n'))
  },
}

const skillDirsRef = { dirs: [] }

export function apply(ctx, config) {
  // 之前这里是 schema 对象，Config 里填的 key / reportsDir 永远读不到；宿主的 apply 第二参才是解析后的配置。
  configRef.config = config ?? {}
  const skillDirs = [join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')]
  skillDirsRef.dirs = skillDirs
  ctx.effect(() => ctx.tools.register(redfoxEndpointTool), `${name}: tool endpoint`)
  ctx.effect(() => ctx.tools.register(redfoxCallTool), `${name}: tool call`)
  ctx.effect(() => ctx.tools.register(redfoxHistoryTool), `${name}: tool history`)
  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(skillDirs)), `${name}: skills`)
  ctx.effect(() => registerApi(ctx, { skillDirs, configRef }), `${name}: routes`)
}
