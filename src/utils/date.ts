/**
 * 本地日期工具（纯函数，可单测）。
 * 约定：全项目日期一律使用本地日历日字符串 'YYYY-MM-DD' 传递与存储；
 * 日期算术基于 UTC 毫秒完成，避免时区 / 夏令时导致的日期偏移。
 */
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** 周索引：0 = 周一 … 6 = 周日（日历统一按周一开头） */
export const WEEKDAY_SHORT = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const

const MS_PER_DAY = 86_400_000

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function dateKeyToUtcMs(key: string): number {
  const match = DATE_KEY_PATTERN.exec(key)
  if (!match) throw new Error(`非法日期键：${key}`)
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function utcMsToDateKey(ms: number): string {
  const date = new Date(ms)
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

/** 是否为真实存在的本地日期键（拒绝 2026-02-30 这类日期） */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = DATE_KEY_PATTERN.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** 今天的本地日期键 */
export function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

export function yearOf(key: string): number {
  const match = DATE_KEY_PATTERN.exec(key)
  if (!match) throw new Error(`非法日期键：${key}`)
  return Number(match[1])
}

export function monthOf(key: string): number {
  const match = DATE_KEY_PATTERN.exec(key)
  if (!match) throw new Error(`非法日期键：${key}`)
  return Number(match[2])
}

export function dayOf(key: string): number {
  const match = DATE_KEY_PATTERN.exec(key)
  if (!match) throw new Error(`非法日期键：${key}`)
  return Number(match[3])
}

/** 日期加减天数（跨月、跨年自动进位 / 退位） */
export function addDaysKey(key: string, days: number): string {
  return utcMsToDateKey(dateKeyToUtcMs(key) + days * MS_PER_DAY)
}

/** 日期加减月份：目标月天数不足时收敛到月末（1-31 → 2-28） */
export function addMonthsKey(key: string, delta: number): string {
  const target = new Date(Date.UTC(yearOf(key), monthOf(key) - 1 + delta, 1))
  const year = target.getUTCFullYear()
  const month = target.getUTCMonth() + 1
  const day = Math.min(dayOf(key), daysInMonth(year, month))
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** 星期索引：0 = 周一 … 6 = 周日 */
export function weekdayIndexMon(key: string): number {
  return (new Date(dateKeyToUtcMs(key)).getUTCDay() + 6) % 7
}

/** '周一' … '周日' */
export function weekdayShort(key: string): string {
  return WEEKDAY_SHORT[weekdayIndexMon(key)]
}

/** 所在周的周一 */
export function startOfWeekKey(key: string): string {
  return addDaysKey(key, -weekdayIndexMon(key))
}

/** 所在周的 7 天，周一 → 周日 */
export function weekDaysKey(key: string): string[] {
  const start = startOfWeekKey(key)
  return Array.from({ length: 7 }, (_, index) => addDaysKey(start, index))
}

/** 某年某月的天数（month: 1–12） */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * 日期归一化：把各种「看似日期」的输入统一成本地日历日 'YYYY-MM-DD'；无法识别返回 null。
 *
 * 兼容场景（旧数据 / 外部导入）：
 * - '2026-10-05'      → '2026-10-05'
 * - '2026/10/5'、'2026.10.5' → '2026-10-05'
 * - '2026-10-05T00:00:00.000Z'、'2026-10-05 09:30' → '2026-10-05'
 *   （只取书写出来的日期部分：本应用的日期语义是「本地日历日」，
 *     不按 UTC 时区重新换算，避免 UTC+8 的 00:00 被算成前一天）
 * - Date 对象 → 其本地日历日
 *
 * 与 isDateKey 的区别：isDateKey 只接受严格的规范键；toDateKey 额外负责「归一化」。
 */
export function toDateKey(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`
  }
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '') return null

  // 日期部分可位于字符串开头（允许后面跟 'T' / 空格 / 时间）
  const match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[T\s])/.exec(trimmed)
  if (match === null) return null
  const key = `${match[1]}-${pad2(Number(match[2]))}-${pad2(Number(match[3]))}`
  return isDateKey(key) ? key : null
}

/** 任务类对象 canonical 的日期键：无法识别 → null（视为未安排日期） */
export function dateKeyOf(value: { date: string | null | undefined }): string | null {
  return toDateKey(value.date)
}

/**
 * 月视图网格：从当月 1 日所在周的周一开始，到月末所在周的周日结束，
 * 恒为整周对齐（35 或 42 格），自动覆盖跨月与跨年的邻月日期。
 */
export function monthGridKeys(year: number, month: number): string[] {
  const firstOfMonth = Date.UTC(year, month - 1, 1)
  const offset = (new Date(firstOfMonth).getUTCDay() + 6) % 7
  const total = daysInMonth(year, month)
  const cells = Math.ceil((offset + total) / 7) * 7
  const start = firstOfMonth - offset * MS_PER_DAY
  return Array.from({ length: cells }, (_, index) => utcMsToDateKey(start + index * MS_PER_DAY))
}

/** '2026年10月' */
export function formatMonthTitle(year: number, month: number): string {
  return `${year}年${month}月`
}

/** 周期标题：跨年显示两侧年份，同年只在起始侧显示年份。如 '2026年12月28日 – 2027年1月3日' */
export function formatWeekTitle(startKey: string, endKey: string): string {
  const startText = `${yearOf(startKey)}年${monthOf(startKey)}月${dayOf(startKey)}日`
  const endText =
    yearOf(startKey) === yearOf(endKey)
      ? `${monthOf(endKey)}月${dayOf(endKey)}日`
      : `${yearOf(endKey)}年${monthOf(endKey)}月${dayOf(endKey)}日`
  return `${startText} – ${endText}`
}

/** '2026年10月10日 周六' */
export function formatDayTitle(key: string): string {
  return `${yearOf(key)}年${monthOf(key)}月${dayOf(key)}日 ${weekdayShort(key)}`
}
