/**
 * JSON 备份与恢复（纯函数，可单测）。
 *
 * 备份内容：任务、科目、子任务标签、日期类型（休息日 / 缓冲日）、应用配置（考试倒计时 + 科目轮次）。
 * 备份**不含**临时 UI 状态（选中日期、视图模式、筛选条件等都不属于业务数据）。
 * 文件带格式版本号，便于未来迁移：{ format, version, exportedAt, data }。
 *
 * 恢复策略：先校验 → 给出概览 → 用户确认后写入；写入前由调用方快照，失败可整体回滚。
 * 不支持的版本会明确报错，绝不半途写入。
 */
import type { DayTypeMap, Subject, Subtask, Task } from '../models/types'
import type { AppConfig } from '../models/config'
import { DEFAULT_CONFIG, sanitizeConfig } from '../models/config'
import { sanitizeDayTypes } from '../models/dayType'

export const BACKUP_FORMAT = 'studyflow-backup'
export const BACKUP_VERSION = 1

export interface BackupData {
  tasks: Task[]
  subjects: Subject[]
  subtasks: Subtask[]
  dayTypes: DayTypeMap
  config: AppConfig
}

export interface BackupFile {
  format: string
  version: number
  exportedAt: string
  data: BackupData
}

/** 恢复前给用户看的数据概览 */
export interface BackupOverview {
  version: number
  exportedAt: string
  taskCount: number
  doneCount: number
  unscheduledCount: number
  subjectCount: number
  subtaskCount: number
  restDayCount: number
  bufferDayCount: number
  roundCount: number
  examDate: string | null
}

/** 丢弃无法识别的字段，只保留业务数据 */
export function sanitizeBackupData(value: unknown): BackupData {
  const record = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const tasks = Array.isArray(record.tasks) ? (record.tasks as Task[]) : []
  const subjects = Array.isArray(record.subjects) ? (record.subjects as Subject[]) : []
  const subtasks = Array.isArray(record.subtasks) ? (record.subtasks as Subtask[]) : []
  return {
    tasks,
    subjects,
    subtasks,
    dayTypes: sanitizeDayTypes(record.dayTypes),
    config: sanitizeConfig(record.config),
  }
}

export function buildBackup(data: BackupData, exportedAt: string = new Date().toISOString()): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    data: sanitizeBackupData(data),
  }
}

export function serializeBackup(file: BackupFile): string {
  return `${JSON.stringify(file, null, 2)}\n`
}

export function backupOverview(file: BackupFile): BackupOverview {
  const { data } = file
  const dayTypes = data.dayTypes
  const kinds = Object.values(dayTypes)
  return {
    version: file.version,
    exportedAt: file.exportedAt,
    taskCount: data.tasks.length,
    doneCount: data.tasks.filter((task) => task.done === true).length,
    unscheduledCount: data.tasks.filter((task) => task.date === null || task.date === undefined).length,
    subjectCount: data.subjects.length,
    subtaskCount: data.subtasks.length,
    restDayCount: kinds.filter((kind) => kind === 'rest').length,
    bufferDayCount: kinds.filter((kind) => kind === 'buffer').length,
    roundCount: data.config.rounds.length,
    examDate: data.config.examDate,
  }
}

export function backupFileName(today: string): string {
  return `studyflow-backup-${today}.json`
}

export type BackupParseResult =
  | {
      ok: true
      file: BackupFile
      overview: BackupOverview
      /** 兼容迁移说明（如旧版本被升级读取） */
      migratedFrom: number | null
      /** 非致命提示（如缺失的可选字段按默认值处理） */
      warnings: string[]
    }
  | { ok: false; error: string }

/**
 * 校验并解析备份文本：JSON 语法 → 格式标识 → 版本 → 必要字段。
 * 任何一步失败都返回明确原因，不写入任何数据。
 */
export function parseBackup(text: string): BackupParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: '文件不是有效的 JSON，请确认选择了正确的备份文件。' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: '备份内容结构不正确（应为对象）。' }
  }
  const record = parsed as Record<string, unknown>
  if (record.format !== BACKUP_FORMAT) {
    return { ok: false, error: `不是 StudyFlow 备份文件（format 应为「${BACKUP_FORMAT}」）。` }
  }
  const version = record.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: '备份缺少有效的版本号。' }
  }
  if (version > BACKUP_VERSION) {
    return {
      ok: false,
      error: `备份版本 v${version} 高于当前支持的 v${BACKUP_VERSION}，请升级应用后再恢复。`,
    }
  }

  const warnings: string[] = []
  const dataRecord = (typeof record.data === 'object' && record.data !== null ? record.data : null) as
    | Record<string, unknown>
    | null
  if (dataRecord === null) {
    return { ok: false, error: '备份缺少 data 数据段。' }
  }
  for (const field of ['tasks', 'subjects', 'subtasks'] as const) {
    if (!Array.isArray(dataRecord[field])) {
      return { ok: false, error: `备份缺少必要字段「${field}」或类型不正确。` }
    }
  }
  if (dataRecord.dayTypes === undefined) warnings.push('备份中没有日期类型（休息日 / 缓冲日），按空处理。')
  if (dataRecord.config === undefined) warnings.push('备份中没有配置（考试倒计时 / 科目轮次），按默认值处理。')

  const exportedAt = typeof record.exportedAt === 'string' ? record.exportedAt : ''
  if (exportedAt === '') warnings.push('备份没有导出时间，按未知时间显示。')

  // 版本迁移入口：当前只有 v1；未来新增版本时在此按 fromVersion 逐级升级。
  let migratedFrom: number | null = null
  if (version < BACKUP_VERSION) {
    migratedFrom = version
    warnings.push(`已按 v${version} 兼容读取，保存时会写入当前格式 v${BACKUP_VERSION}。`)
  }

  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    data: sanitizeBackupData(dataRecord),
  }
  return { ok: true, file, overview: backupOverview(file), migratedFrom, warnings }
}

/** 新任务默认配置（恢复缺失 config 时使用） */
export function fallbackConfig(): AppConfig {
  return { ...DEFAULT_CONFIG, rounds: [] }
}
