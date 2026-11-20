// 调研报告档案（面板「📄 调研报告」数据面）。
// 报告是 agent 写进工作区的 Markdown 文件；面板不复制副本，直接扫目录 + 读原文，
// 所以在对话里改一次文件，面板刷新就能看到最新内容。
// 难点是「当前工作区是哪个」：web 路由拿不到 Session 身份，这里用
//   $DSH_HOME/storages/workspace.json（工作区注册表：path + sessionIds）
//   + $DSH_HOME/sessions/<编码目录> 的最新 mtime 推出「最近活跃的工作区」。
// 读文件只允许在已知工作区 / 插件数据目录内，避免面板变成任意文件读取器。
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { DATA_DIR } from './data.js'

// 面板只收 Markdown 报告：json/csv 是数据不是报告，html 是课件/页面，列出来只会淹掉正文。
export const REPORT_EXTS = ['.md', '.markdown']

// 这些目录名里全是别人的插件/构建产物，扫进来会把真正的调研报告淹掉。
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', '.git', '.svn', '__pycache__',
  '.venv', 'venv', 'cache', 'logs', '.tmp', 'coverage',
])
// 插件自己的密钥文件绝不出现在「报告」里——它恰好也是 .json，躺在允许根目录内。
const BLOCKED_FILES = new Set(['settings.json', 'calls.json', '.credentials.yaml'])
const MAX_READ_BYTES = 1024 * 1024
const HOME = process.env.DSH_HOME || join(homedir(), '.dsh')

// 符号链接/目录联接会把「看起来在里面」的路径指到外面，判断与读取都走 realpath。
function canonical(p) {
  try { return realpathSync(p) } catch { return resolve(p) }
}

function storagesFile() {
  return join(HOME, 'storages', 'workspace.json')
}

// DSH 用 cwd 编码会话目录名：C:\a\b → --C-a-b--
export function encodeSessionDir(dir) {
  return '--' + String(dir).replace(/:/g, '').replace(/[\\/]/g, '-') + '--'
}

function maxMtime(dir) {
  try {
    const st = statSync(dir)
    return st.mtimeMs
  } catch {
    return 0
  }
}

/**
 * 已知工作区列表，按「最近有会话活动」排序。
 * 注册表读不到时返回空数组，面板退化成手填目录。
 */
export function listWorkspaces() {
  let raw
  try {
    raw = JSON.parse(readFileSync(storagesFile(), 'utf8'))
  } catch {
    return []
  }
  const table = raw?.tables?.workspaces
  if (!table || typeof table !== 'object') return []
  const order = Array.isArray(raw?.global?.workspaceIds) ? raw.global.workspaceIds : Object.keys(table)
  const sessionsRoot = join(HOME, 'sessions')
  const out = []
  for (const id of order) {
    const rec = table[id]
    if (!rec || typeof rec.path !== 'string' || !isAbsolute(rec.path)) continue
    const sessionDir = join(sessionsRoot, encodeSessionDir(rec.path))
    let lastActiveAt = 0
    try {
      for (const name of readdirSync(sessionDir)) lastActiveAt = Math.max(lastActiveAt, maxMtime(join(sessionDir, name)))
    } catch {
      lastActiveAt = 0
    }
    out.push({
      id,
      title: rec.title || rec.path,
      path: rec.path,
      exists: existsSync(rec.path),
      lastActiveAt: lastActiveAt || Date.parse(rec.updatedAt || rec.createdAt || '') || 0,
      sessions: Array.isArray(rec.sessionIds) ? rec.sessionIds.length : 0,
    })
  }
  out.sort((a, b) => b.lastActiveAt - a.lastActiveAt)
  return out
}

/** 面板允许读取的根目录：已知工作区 + 插件数据目录。 */
export function allowedRoots(extra = []) {
  const roots = new Set([DATA_DIR])
  for (const w of listWorkspaces()) if (w.exists) roots.add(resolve(w.path))
  for (const dir of extra) {
    if (typeof dir === 'string' && dir.trim()) {
      const abs = resolve(dir.trim())
      if (existsSync(abs)) roots.add(abs)
    }
  }
  return [...roots]
}

function insideAny(target, roots) {
  const abs = canonical(target)
  for (const root of roots) {
    const rel = relative(canonical(root), abs)
    if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) return true
  }
  return false
}

/** 目录/文件是否落在允许根内（/list 与 /read 共用同一把尺子）。 */
export function isAllowed(target, extra = []) {
  if (typeof target !== 'string' || !target.trim()) return false
  if (!isAbsolute(target.trim())) return false
  return insideAny(resolve(target.trim()), allowedRoots(extra))
}

// 只收 Markdown，类型固定就是 md（面板渲染器也只认 md）。
function kindOf() {
  return 'md'
}

/**
 * 扫一个目录下的报告文件。
 * depth=0 只扫本层，depth=1 再进一层子目录（跳过插件目录/构建产物/隐藏目录）。
 */
export function scanReports(dir, { depth = 0, q = '', limit = 300 } = {}) {
  const root = resolve(dir)
  if (!existsSync(root)) return { dir: root, exists: false, entries: [], truncated: false }
  let isDir = false
  try { isDir = statSync(root).isDirectory() } catch { /* 悬空链接 */ }
  if (!isDir) return { dir: root, exists: false, entries: [], truncated: false }

  const needle = q.trim().toLowerCase()
  const entries = []
  const walk = (current, level) => {
    let names = []
    try { names = readdirSync(current) } catch { return }
    for (const name of names) {
      if (entries.length >= limit) return
      if (name.startsWith('.')) continue
      const full = join(current, name)
      let st
      // lstat：链接一律跳过，别让一个指向工作区外的 junction 把外面的文件列进来。
      try { st = lstatSync(full) } catch { continue }
      if (st.isSymbolicLink()) continue
      if (st.isDirectory()) {
        if (level < depth && !SKIP_DIRS.has(name.toLowerCase())) walk(full, level + 1)
        continue
      }
      if (!REPORT_EXTS.includes(extname(name).toLowerCase())) continue
      if (BLOCKED_FILES.has(name.toLowerCase())) continue
      if (needle && !name.toLowerCase().includes(needle)) continue
      entries.push({
        name,
        path: full,
        rel: relative(root, full) || name,
        kind: kindOf(name),
        size: st.size,
        mtime: st.mtimeMs,
      })
    }
  }
  walk(root, 0)
  entries.sort((a, b) => b.mtime - a.mtime)
  return { dir: root, exists: true, entries, truncated: entries.length >= limit }
}

/** 读一篇报告正文（超限截断，二进制拒读）。 */
export function readReport(target, extraRoots = []) {
  if (typeof target !== 'string' || !target.trim()) throw Object.assign(new Error('缺少 path'), { status: 400 })
  if (!isAbsolute(target)) throw Object.assign(new Error('path 必须是绝对路径'), { status: 400 })
  const abs = resolve(target)
  const baseName = abs.slice(abs.lastIndexOf(sep) + 1).toLowerCase()
  if (BLOCKED_FILES.has(baseName)) throw Object.assign(new Error('这个文件不当作报告预览'), { status: 403 })
  if (!insideAny(abs, allowedRoots(extraRoots))) {
    throw Object.assign(new Error('只允许读取工作区内的报告文件'), { status: 403 })
  }
  const real = canonical(abs)
  let st
  try { st = statSync(real) } catch { throw Object.assign(new Error('文件不存在'), { status: 404 }) }
  if (!st.isFile()) throw Object.assign(new Error('不是普通文件'), { status: 400 })
  if (!REPORT_EXTS.includes(extname(real).toLowerCase())) throw Object.assign(new Error('只支持 Markdown 报告（.md）'), { status: 415 })
  if (st.size > MAX_READ_BYTES) throw Object.assign(new Error(`文件过大（${Math.round(st.size / 1024)}KB），请在编辑器里打开`), { status: 413 })
  const text = readFileSync(real, 'utf8')
  return {
    path: abs,
    name: abs.slice(abs.lastIndexOf(sep) + 1),
    kind: kindOf(abs),
    size: st.size,
    mtime: st.mtimeMs,
    text: text.includes('\u0000') ? '' : text,
    binary: text.includes('\u0000'),
  }
}
