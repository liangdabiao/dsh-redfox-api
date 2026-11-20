// RedFox API 助手 · 技能快照提供方（skills/redfox-api-helper/）。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const RANK = 600
const INVOCATION = { modelInvocable: true, userInvocable: true }

function parse(file) {
  const text = readFileSync(file, 'utf8')
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return null
  const block = m[1]
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  let description = block.match(/^description:\s*(.+)$/m)?.[1]?.trim().replace(/^(["'])(.*)\1$/, '$2') || null
  if (!description) {
    const lines = block.split(/\r?\n/)
    const start = lines.findIndex((l) => /^description:\s*>/.test(l))
    if (start !== -1) {
      const collected = []
      for (let i = start + 1; i < lines.length; i++) { if (/^\S/.test(lines[i])) break; collected.push(lines[i].replace(/^\s+/, '')) }
      description = collected.join(' ').trim()
    }
  }
  return name && description ? { name, description, body: text.slice(m[0].length) } : null
}

function readDir(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    const sf = join(dir, e.name, 'SKILL.md')
    if (!existsSync(sf)) continue
    const p = parse(sf)
    if (p) out.push({ dir: join(dir, e.name), file: sf, ...p, dirName: e.name })
  }
  return out
}

function addendum(skill) {
  return ['', '---', '', '## 在 DSH 插件里使用', '',
    `- 技能目录：\`${skill.dir}\`。apis.json（201 端点目录）与两个 Python 脚本按需加载；目录里没有 openapi 同步，apis.json 就是唯一数据源。`,
    '- 正文里的 `python api_searcher.py / api_client.py` 命令在 DSH 里优先用插件原生工具替代：`redfox_endpoint`（platforms/platform/search/detail）对应 api_searcher.py，`redfox_call` 对应 api_client.py。',
    '- **调用前必须先找端点再查 detail**：`redfox_endpoint action=detail key=<name 或路径>` 给出真实字段名（camelCase 的 api_name，不是 SDK 的 snake_case）、必填项和 example_call 默认值；照抄默认值才不会报 1002/3203。',
    '- `redfox_call` 需要用户 key（面板「⚙️ 设置」/ 插件 Config / REDFOX_API_KEY 环境变量）。没有 key 时只输出调用说明，不实际发请求。',
    '- **按次计费**：不要无意义重复调用；`redfox_call` 默认不重试。回执里 code=3203/3801 且文案是「未查询到相关数据/暂未收录/暂无作品/资源在平台上未找到」= 查无数据（不是失败），但要按 msg 判断扣费；其它 code 是真错误。',
    '- 快手作品搜索关键词 ≤6 个字；抖音/小红书作品列表优质库覆盖有限，返回「暂未收录」时换端点或换关键词，别当接口故障重试。',
    '- 账号搜索是模糊匹配（中文复合词会串行业），命中后按简介和作品二次筛。',
    '- 产出文件写到当前工作区，大响应建议让 agent 摘要后落盘「关键词_序号.json」。',
    '- **调研报告要落成工作区里的 `.md`**（如 `关键词_调研报告_YYYY-MM-DD.md`）：面板「📄 调研报告」直接读这些文件给用户回看，写完不用再额外登记；只在对话里贴结论、不落盘，面板里就什么都看不到。', ''].join('\n')
}

export function createSkillProvider(dirs) {
  const list = [].concat(dirs)
  const candidate = (s) => ({ name: s.name, description: s.description, path: s.file, invocation: INVOCATION, source: 'bundled', provider: 'redfox-api', rank: RANK, locator: s.dir, resourceBase: { kind: 'directory', path: s.dir } })
  return {
    name: 'redfox-api',
    async list() { return list.flatMap(readDir).map(candidate) },
    async get(c) {
      const s = list.flatMap(readDir).find((x) => x.dir === c.locator && x.name === c.name)
      if (!s) return undefined
      const content = s.body + addendum(s)
      const { rank, locator, ...summary } = candidate(s)
      return { ...summary, content }
    },
  }
}
export { readDir, addendum }
