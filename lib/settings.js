// RedFox API 助手 · 面板侧密钥配置（$DSH_HOME/redfox-api/settings.json）。
// 安全：API 只回掩码与是否已配置，绝不回明文。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DATA_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'redfox-api')
const SETTINGS_FILE = join(DATA_DIR, 'settings.json')

function load() {
  try {
    const raw = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'))
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

function save(settings) {
  mkdirSync(DATA_DIR, { recursive: true })
  const tmp = `${SETTINGS_FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8')
  renameSync(tmp, SETTINGS_FILE)
  try { chmodSync(SETTINGS_FILE, 0o600) } catch { /* Windows 上忽略 */ }
}

export function getSettings() {
  const s = load()
  return { redfoxApiKey: typeof s.redfoxApiKey === 'string' ? s.redfoxApiKey : '' }
}

export function saveSettings({ redfoxApiKey }) {
  const next = { redfoxApiKey: typeof redfoxApiKey === 'string' && redfoxApiKey.trim() ? redfoxApiKey.trim() : getSettings().redfoxApiKey }
  save(next)
  return maskSettings(next)
}

export function clearSettings() {
  save({ redfoxApiKey: '' })
}

// 解析生效 key：面板 settings.json 优先，回落插件 Config，再回落 REDFOX_API_KEY 环境变量。
export function resolveToken(config = {}) {
  const s = getSettings()
  return (typeof s.redfoxApiKey === 'string' && s.redfoxApiKey)
    || (typeof config?.redfoxApiKey === 'string' && config.redfoxApiKey)
    || process.env.REDFOX_API_KEY
    || ''
}

export function tokenSource(config = {}) {
  const s = getSettings()
  if (typeof s.redfoxApiKey === 'string' && s.redfoxApiKey) return 'panel'
  if (typeof config?.redfoxApiKey === 'string' && config.redfoxApiKey) return 'config'
  if (process.env.REDFOX_API_KEY) return 'env'
  return 'none'
}

export function maskSettings(s = getSettings()) {
  const t = s.redfoxApiKey || ''
  return {
    configured: Boolean(t),
    tokenMasked: t ? `${t.slice(0, 5)}****${t.slice(-4)}` : '',
  }
}
