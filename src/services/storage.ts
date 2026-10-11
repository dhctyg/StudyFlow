/**
 * 本地持久化（localStorage）：集中管理科目、子任务标签、任务与休息日的读写。
 *
 * 约定：
 * - 各数据集独立键存储；休息日是纯日期集合，绝不混入任务。
 * - 日期 'YYYY-MM-DD'、时间 'HH:mm'，均为本地值，不做时区换算。
 * - 首次初始化才写入默认科目 / 标签与示例任务（seeded 标记），此后绝不覆盖用户数据。
 * - 单条脏数据被丢弃、整段 JSON 损坏按空数据处理，绝不抛出导致页面不可用。
 * - 阶段一旧任务缺少 startTime / endTime / subtaskId：读取时归一为 null，
 *   不崩溃、不擅自分配时间；用户下次保存该任务时由表单要求补齐。
 */
import type { DayTypeMap, Subject, Subtask, Task } from '../models/types'
import type { AppConfig } from '../models/config'
import { sanitizeConfig } from '../models/config'
import type { UiTheme } from '../models/uiTheme'
import { sanitizeUiTheme } from '../models/uiTheme'
import { DEFAULT_SUBJECTS, DEFAULT_SUBTASKS, isValidHexColor, normalizeName } from '../models/subjects'
import { datesOfKind, mergeLegacyRestDays, sanitizeDayTypes } from '../models/dayType'
import { addDaysKey, isDateKey, toDateKey, todayKey } from '../utils/date'
import { isValidTime } from '../utils/time'

const TASKS_KEY = 'exam-schedule.tasks.v1'
const REST_DAYS_KEY = 'exam-schedule.restDays.v1'
const SUBJECTS_KEY = 'exam-schedule.subjects.v1'
const SUBTASKS_KEY = 'exam-schedule.subtasks.v1'
const SEEDED_KEY = 'exam-schedule.seeded.v1'
/** 阶段一新增：日期类型（休息日 / 缓冲日）。旧休息日键保留不动，仅作一次性迁移来源 */
const DAY_TYPES_KEY = 'exam-schedule.dayTypes.v1'
/** 阶段二新增：应用配置（考试倒计时 + 科目轮次预计完成日期） */
const CONFIG_KEY = 'exam-schedule.config.v1'
/** 阶段三新增：UI 主题（纯视觉参数，独立命名空间，不与业务数据混存） */
const UI_THEME_KEY = 'exam-schedule.uiTheme.v1'

/** localStorage 键名（导出仅供测试与调试使用） */
export const STORAGE_KEYS = {
  tasks: TASKS_KEY,
  restDays: REST_DAYS_KEY,
  dayTypes: DAY_TYPES_KEY,
  config: CONFIG_KEY,
  uiTheme: UI_THEME_KEY,
  subjects: SUBJECTS_KEY,
  subtasks: SUBTASKS_KEY,
  seeded: SEEDED_KEY,
} as const

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch (error) {
    console.warn(`[storage] 读取失败：${key}`, error)
    return null
  }
}

function writeRaw(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch (error) {
    // 隐私模式 / 配额占满：内存态仍可继续使用，仅无法跨刷新保留。
    console.warn(`[storage] 写入失败：${key}`, error)
  }
}

/**
 * 严格写入：写后回读校验，不一致直接抛错。
 * 仅供「恢复备份」路径使用 —— 让失败可被捕获并整体回滚（普通写入保持容错语义）。
 */
function writeRawStrict(key: string, value: string): void {
  window.localStorage.setItem(key, value)
  if (window.localStorage.getItem(key) !== value) {
    throw new Error(`写入校验失败：${key}`)
  }
}

function parseJson(raw: string | null): unknown {
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch (error) {
    console.warn('[storage] JSON 解析失败，按空数据处理', error)
    return null
  }
}

/** 校验单条任务；不合法返回 null（单条错误不影响其余数据）。旧任务缺新字段时归一为 null。 */
function sanitizeTask(value: unknown, subjectIds: ReadonlySet<string>, subtaskIds: ReadonlySet<string>): Task | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id === '') return null
  /**
   * 日期：null / 缺失 = 未安排日期（临时任务箱）。
   * 其它写法（YYYY/M/D、'YYYY-MM-DDT…' 的 ISO 串等）**归一化**为本地日历日后保留；
   * 只有完全无法识别的才算脏数据丢弃 —— 避免旧数据 / 外部导入的任务在读取时凭空消失。
   */
  if (record.date !== null && record.date !== undefined && toDateKey(record.date) === null) {
    return null
  }
  const date = toDateKey(record.date)
  if (typeof record.subjectId !== 'string' || !subjectIds.has(record.subjectId)) return null
  if (typeof record.content !== 'string' || record.content.trim() === '') return null
  if (typeof record.done !== 'boolean') return null

  // 阶段一兼容：新字段缺失或非法时归一为 null，不丢弃任务本身。
  const startTime = isValidTime(record.startTime) ? record.startTime : null
  const endTime = isValidTime(record.endTime) ? record.endTime : null
  // 孤立子任务引用（标签已不存在）安全清空，任务保留。
  const subtaskId =
    typeof record.subtaskId === 'string' && subtaskIds.has(record.subtaskId) ? record.subtaskId : null

  return {
    id: record.id,
    date,
    subjectId: record.subjectId,
    subtaskId,
    startTime,
    endTime,
    content: record.content,
    done: record.done,
  }
}

function sanitizeSubject(value: unknown): Subject | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id === '') return null
  if (typeof record.name !== 'string' || normalizeName(record.name) === '') return null
  if (!isValidHexColor(record.color)) return null
  return { id: record.id, name: normalizeName(record.name), color: record.color }
}

function sanitizeSubtask(value: unknown, subjectIds: ReadonlySet<string>): Subtask | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id === '') return null
  if (typeof record.subjectId !== 'string' || !subjectIds.has(record.subjectId)) return null
  if (typeof record.name !== 'string' || normalizeName(record.name) === '') return null
  return { id: record.id, subjectId: record.subjectId, name: normalizeName(record.name) }
}

/** 校验休息日集合：去除非日期项并去重。 */
function sanitizeRestDays(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const unique = new Set<string>()
  for (const item of value) {
    if (isDateKey(item)) unique.add(item)
  }
  return [...unique].sort()
}

function sanitizeList(raw: string | null, sanitize: (item: unknown) => object | null): object[] {
  const parsed = parseJson(raw)
  if (!Array.isArray(parsed)) return []
  const result: object[] = []
  for (const item of parsed) {
    const clean = sanitize(item)
    if (clean !== null) result.push(clean)
  }
  return result
}

export function loadSubjects(): Subject[] {
  return sanitizeList(readRaw(SUBJECTS_KEY), sanitizeSubject) as Subject[]
}

export function saveSubjects(subjects: readonly Subject[]): void {
  writeRaw(SUBJECTS_KEY, JSON.stringify(subjects))
}

export function loadSubtasks(): Subtask[] {
  const subjects = new Set(loadSubjects().map((subject) => subject.id))
  return sanitizeList(readRaw(SUBTASKS_KEY), (item) => sanitizeSubtask(item, subjects)) as Subtask[]
}

export function saveSubtasks(subtasks: readonly Subtask[]): void {
  writeRaw(SUBTASKS_KEY, JSON.stringify(subtasks))
}

export function loadTasks(): Task[] {
  const subjectIds = new Set(loadSubjects().map((subject) => subject.id))
  const subtaskIds = new Set(loadSubtasks().map((subtask) => subtask.id))
  const parsed = parseJson(readRaw(TASKS_KEY))
  if (!Array.isArray(parsed)) return []
  const tasks: Task[] = []
  for (const item of parsed) {
    const task = sanitizeTask(item, subjectIds, subtaskIds)
    if (task !== null) tasks.push(task)
  }
  return tasks
}

export function saveTasks(tasks: readonly Task[]): void {
  writeRaw(TASKS_KEY, JSON.stringify(tasks))
}

export function loadRestDays(): string[] {
  return sanitizeRestDays(parseJson(readRaw(REST_DAYS_KEY)))
}

export function saveRestDays(restDays: readonly string[]): void {
  writeRaw(REST_DAYS_KEY, JSON.stringify(restDays))
}

/**
 * 读取日期类型表（休息日 / 缓冲日）。
 * 迁移方案：新键不存在时，用旧的休息日集合合成一次（休息日 → rest）并立即落盘到新键；
 * 旧键原样保留（不删除、不清空），保证回退旧版本时数据仍在。
 */
export function loadDayTypes(): DayTypeMap {
  const raw = readRaw(DAY_TYPES_KEY)
  if (raw !== null) return sanitizeDayTypes(parseJson(raw))
  const migrated = mergeLegacyRestDays({}, loadRestDays())
  writeRaw(DAY_TYPES_KEY, JSON.stringify(migrated))
  return migrated
}

/** 写入日期类型表，并同步旧的休息日键（双写，兼容旧版本读取） */
export function saveDayTypes(dayTypes: Readonly<DayTypeMap>): void {
  const normalized = sanitizeDayTypes(dayTypes)
  writeRaw(DAY_TYPES_KEY, JSON.stringify(normalized))
  writeRaw(REST_DAYS_KEY, JSON.stringify(datesOfKind(normalized, 'rest')))
}

// ---------- 应用配置（考试倒计时 / 科目轮次） ----------

export function loadConfig(): AppConfig {
  return sanitizeConfig(parseJson(readRaw(CONFIG_KEY)))
}

export function saveConfig(config: AppConfig): void {
  writeRaw(CONFIG_KEY, JSON.stringify(sanitizeConfig(config)))
}

// ---------- UI 主题（纯视觉参数，独立于业务数据） ----------

export function loadUiTheme(): UiTheme {
  return sanitizeUiTheme(parseJson(readRaw(UI_THEME_KEY)))
}

export function saveUiTheme(theme: UiTheme): void {
  writeRaw(UI_THEME_KEY, JSON.stringify(sanitizeUiTheme(theme)))
}

/** 清除 UI 主题（恢复默认时使用；只影响样式，不触碰任何业务数据） */
export function clearUiTheme(): void {
  try {
    window.localStorage.removeItem(UI_THEME_KEY)
  } catch (error) {
    console.warn('[storage] 清除 UI 主题失败', error)
  }
}

// ---------- 整库读取 / 写入（供 JSON 备份与恢复使用） ----------

/** 参与备份的全部存储键（顺序固定，便于快照与回滚） */
export const BACKUP_STORAGE_KEYS: readonly string[] = [
  TASKS_KEY,
  SUBJECTS_KEY,
  SUBTASKS_KEY,
  DAY_TYPES_KEY,
  CONFIG_KEY,
]

/** 快照指定的原始字符串（默认备份键集）：清空 / 恢复数据失败时用它回滚 */
export function snapshotRaw(
  keys: readonly string[] = BACKUP_STORAGE_KEYS,
): Record<string, string | null> {
  const snapshot: Record<string, string | null> = {}
  for (const key of keys) snapshot[key] = readRaw(key)
  return snapshot
}

/** 回滚到快照（键值为 null 时删除该键） */
export function restoreRaw(snapshot: Readonly<Record<string, string | null>>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === null || value === undefined) {
      try {
        window.localStorage.removeItem(key)
      } catch (error) {
        console.warn(`[storage] 回滚失败：${key}`, error)
      }
      continue
    }
    writeRaw(key, value)
  }
}

/**
 * 「清空数据」影响的键：科目、子任务标签、任务、日期类型与配置（仅清空其中的科目轮次）。
 * 注意：不包含 UI 主题（uiTheme）、字体与其它界面偏好 —— 这些不属于业务数据。
 */
export const CLEAR_STORAGE_KEYS: readonly string[] = [
  TASKS_KEY,
  SUBJECTS_KEY,
  SUBTASKS_KEY,
  DAY_TYPES_KEY,
  REST_DAYS_KEY,
  CONFIG_KEY,
]

export interface ClearResult {
  ok: boolean
  error: string
}

/**
 * 清空全部业务数据（科目 / 子任务标签 / 任务 / 日期类型 / 科目轮次）。
 *
 * 安全性设计：
 * - 只写**空集合**而不删除键：既避免 initializeData 误判为“首次使用”而重新播种示例数据，
 *   也保证后续读取仍走正常路径；
 * - 先快照、逐步写入并在任一步失败时**整体回滚**，不会出现「任务已清空但科目还在」的中间状态；
 * - 不触碰 UI 主题键，也不影响 JSON 备份 / 恢复（备份键仍可正常读写导入导出）。
 */
export function clearBusinessData(): ClearResult {
  const snapshot = snapshotRaw(CLEAR_STORAGE_KEYS)
  try {
    writeRawStrict(TASKS_KEY, '[]')
    writeRawStrict(SUBJECTS_KEY, '[]')
    writeRawStrict(SUBTASKS_KEY, '[]')
    writeRawStrict(DAY_TYPES_KEY, '{}')
    writeRawStrict(REST_DAYS_KEY, '[]')
    // 科目轮次属于科目设置：一并清空，避免留下指向已删除科目的失效引用；
    // 考试名称 / 考试日期属于全局偏好，保留（倒计时仍可用）。
    const config = loadConfig()
    writeRawStrict(CONFIG_KEY, JSON.stringify({ ...config, rounds: [] }))
    return { ok: true, error: '' }
  } catch (error) {
    restoreRaw(snapshot)
    return {
      ok: false,
      error: error instanceof Error ? error.message : '清空失败，已回滚到原有数据',
    }
  }
}

/**
 * 一次性写入全部业务数据（恢复用）。
 * 调用方需先完成全量校验；此处只负责落盘，并在失败时由调用方回滚。
 */
export function writeAllData(data: {
  tasks: readonly Task[]
  subjects: readonly Subject[]
  subtasks: readonly Subtask[]
  dayTypes: Readonly<DayTypeMap>
  config: AppConfig
}): void {
  // 恢复路径使用严格写入：任一步失败都会抛错，由 restoreAllData 回滚
  writeRawStrict(TASKS_KEY, JSON.stringify(data.tasks))
  writeRawStrict(SUBJECTS_KEY, JSON.stringify(data.subjects))
  writeRawStrict(SUBTASKS_KEY, JSON.stringify(data.subtasks))
  const dayTypes = sanitizeDayTypes(data.dayTypes)
  writeRawStrict(DAY_TYPES_KEY, JSON.stringify(dayTypes))
  writeRawStrict(REST_DAYS_KEY, JSON.stringify(datesOfKind(dayTypes, 'rest')))
  writeRawStrict(CONFIG_KEY, JSON.stringify(sanitizeConfig(data.config)))
}

export interface RestoreResult {
  ok: boolean
  /** 实际写入的（已净化的）数据；失败时为 null */
  data: {
    tasks: Task[]
    subjects: Subject[]
    subtasks: Subtask[]
    dayTypes: DayTypeMap
    config: AppConfig
  } | null
  error: string
}

/**
 * JSON 备份恢复（尽最大努力保证“要么全部成功，要么原样回滚”）。
 *
 * 步骤：快照现有原始数据 → 写入 → 读回（读回过程会净化非法条目）→ 再写入净化后的数据。
 * 任何一步抛错 → 回滚到快照，原数据库保持不变。
 */
export function restoreAllData(input: {
  tasks: readonly Task[]
  subjects: readonly Subject[]
  subtasks: readonly Subtask[]
  dayTypes: Readonly<DayTypeMap>
  config: AppConfig
}): RestoreResult {
  const snapshot = snapshotRaw()
  try {
    writeAllData(input)
    const cleaned = {
      tasks: loadTasks(),
      subjects: loadSubjects(),
      subtasks: loadSubtasks(),
      dayTypes: loadDayTypes(),
      config: loadConfig(),
    }
    // 再写入净化后的数据，确保数据库里只有合法记录
    writeAllData(cleaned)
    return { ok: true, data: cleaned, error: '' }
  } catch (error) {
    restoreRaw(snapshot)
    return {
      ok: false,
      data: null,
      error: error instanceof Error ? error.message : '恢复失败，已回滚到原有数据',
    }
  }
}

/** 供首次体验的少量示例任务：围绕“今天”生成，仅首次初始化写入。含时间与标签以展示阶段二能力。 */
export function sampleTasks(base: string = todayKey()): Task[] {
  return [
    {
      id: 'sample-math-1',
      date: base,
      subjectId: 'math',
      subtaskId: 'sub-math-1',
      startTime: '09:00',
      endTime: '10:30',
      content: '高等数学：第三章课后题 1–15',
      done: false,
    },
    {
      id: 'sample-eng-1',
      date: base,
      subjectId: 'english',
      subtaskId: 'sub-eng-1',
      startTime: '10:00',
      endTime: '11:00',
      content: '英语：真题阅读 2010 Text 1 精读',
      done: true,
    },
    {
      id: 'sample-comm-1',
      date: addDaysKey(base, 1),
      subjectId: 'comm',
      subtaskId: 'sub-comm-2',
      startTime: '14:00',
      endTime: '16:00',
      content: '通信原理：第 2 章信道容量笔记',
      done: false,
    },
    {
      id: 'sample-math-2',
      date: addDaysKey(base, 2),
      subjectId: 'math',
      subtaskId: null,
      startTime: '19:00',
      endTime: '20:00',
      content: '线性代数：特征值专题总结',
      done: false,
    },
    {
      id: 'sample-eng-2',
      date: addDaysKey(base, 3),
      subjectId: 'english',
      subtaskId: null,
      startTime: null,
      endTime: null,
      content: '英语：作文模板整理 1 篇',
      done: false,
    },
  ]
}

/**
 * 页面初始化时调用：
 * - 科目 / 子任务标签键不存在时写入默认配置（与用户数据分离，只写一次）。
 * - 从未初始化且完全没有任务数据时写入示例任务。
 * - 有用户数据（哪怕被清空为 []）时绝不覆盖。
 * - 阶段一旧数据（无新字段）经 sanitize 安全迁移，不丢内容 / 日期 / 完成状态 / 休息日。
 * - 阶段一新增：日期类型表（休息日 / 缓冲日）首次读取时由旧休息日键迁移生成，旧键保留。
 */
export function initializeData(): {
  tasks: Task[]
  restDays: string[]
  dayTypes: DayTypeMap
  config: AppConfig
  subjects: Subject[]
  subtasks: Subtask[]
} {
  // 默认科目 / 标签：仅当对应键完全不存在时写入。
  if (readRaw(SUBJECTS_KEY) === null) {
    saveSubjects(DEFAULT_SUBJECTS)
  }
  if (readRaw(SUBTASKS_KEY) === null) {
    saveSubtasks(DEFAULT_SUBTASKS)
  }

  // 示例任务：仅当从未打过初始化标记且完全没有任务数据时写入。
  if (readRaw(SEEDED_KEY) === null && readRaw(TASKS_KEY) === null) {
    saveTasks(sampleTasks())
  }
  if (readRaw(SEEDED_KEY) === null) {
    writeRaw(SEEDED_KEY, '1')
  }

  return {
    tasks: loadTasks(),
    restDays: loadRestDays(),
    dayTypes: loadDayTypes(),
    config: loadConfig(),
    subjects: loadSubjects(),
    subtasks: loadSubtasks(),
  }
}

