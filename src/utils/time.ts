/**
 * 时间与时间轴工具（纯函数，可单测）。
 * 约定：任务时间为本地 'HH:mm'；不支持跨午夜，结束必须晚于开始。
 * 区间以“分钟数”参与运算；布局以“分钟偏移 × 每分钟像素”换算。
 */

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * 时间轴布局常量（集中定义，便于整体调节密度）：
 * - 全天边界 00:00–24:00；默认只展开主要时段 08:00–22:00，其余时段折叠。
 * - 主刻度每 2 小时一个（08:00、10:00…22:00），但任务仍按真实分钟精确定位。
 * - 行高较阶段二显著压缩：1 小时 = 30px（主刻度 2 小时 = 60px）。
 */
export const TIMELINE_DAY_START_HOUR = 0
export const TIMELINE_DAY_END_HOUR = 24

/** 默认展开的主要时段 */
export const TIMELINE_MAIN_START_HOUR = 8
export const TIMELINE_MAIN_END_HOUR = 22

/** 主刻度间隔（小时） */
export const TIMELINE_MAIN_TICK_HOURS = 2

/** 默认布局范围 = 主要时段（layoutDayBlocks / pixelOffsetToHour 的默认值） */
export const TIMELINE_START_HOUR = TIMELINE_MAIN_START_HOUR
export const TIMELINE_END_HOUR = TIMELINE_MAIN_END_HOUR

/** 1 小时对应的像素高度（紧凑布局） */
export const TIMELINE_HOUR_HEIGHT = 30
/** 折叠区单行高度（可容纳一张紧凑任务卡片，更多可滚动） */
export const TIMELINE_COLLAPSED_HEIGHT = 44
/** 任务块最小高度，保证短任务可读、可点击 */
export const TIMELINE_MIN_BLOCK_HEIGHT = 18

/** 'HH:mm' 是否为合法时间 */
export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value)
}

/** 'HH:mm' → 当天分钟数；非法返回 null */
export function timeToMinutes(value: string | null | undefined): number | null {
  if (!isValidTime(value)) return null
  const match = TIME_PATTERN.exec(value)
  if (match === null) return null
  return Number(match[1]) * 60 + Number(match[2])
}

/** 当天分钟数 → 'HH:mm'（输入需在 [0, 1440) 内） */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 任务区间（分钟）；开始 / 结束任一非法或结束不晚于开始 → null（旧任务无时间也返回 null） */
export function taskInterval(task: { startTime: string | null; endTime: string | null }): {
  start: number
  end: number
} | null {
  const start = timeToMinutes(task.startTime)
  const end = timeToMinutes(task.endTime)
  if (start === null || end === null || end <= start) return null
  return { start, end }
}

/** 单个任务时长（分钟）；无合法时间 → null */
export function taskDurationMinutes(task: { startTime: string | null; endTime: string | null }): number | null {
  const interval = taskInterval(task)
  return interval === null ? null : interval.end - interval.start
}

/** 结束时间是否晚于开始时间（校验用） */
export function isEndTimeAfterStart(start: string, end: string): boolean {
  const s = timeToMinutes(start)
  const e = timeToMinutes(end)
  return s !== null && e !== null && e > s
}

/**
 * 区间并集：合并重叠 / 相邻区间。
 * 用于每日学习时长——重叠任务只计一次，避免排课冲突导致总时长虚高。
 */
export function mergeIntervals(
  intervals: readonly { start: number; end: number }[],
): { start: number; end: number }[] {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: { start: number; end: number }[] = [{ ...sorted[0] }]
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const last = merged[merged.length - 1]
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end)
    } else {
      merged.push({ ...current })
    }
  }
  return merged
}

/** 区间并集总时长（分钟） */
export function unionDurationMinutes(
  intervals: readonly { start: number; end: number }[],
): number {
  return mergeIntervals(intervals).reduce((sum, item) => sum + (item.end - item.start), 0)
}

/**
 * 两个区间是否重叠（边界相接不算：09:00–10:00 与 10:00–11:00 不冲突）。
 */
export function intervalsOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end
}

/** 表单默认结束时间：开始时间 + 60 分钟，收敛到当天 23:59（不支持跨午夜）。 */
export function defaultEndTimeFor(startTime: string): string {
  const start = timeToMinutes(startTime)
  if (start === null) return ''
  return minutesToTime(Math.min(start + 60, 23 * 60 + 59))
}

/** 顶部新增任务时的默认开始时间：今天取当前时刻的下一个整点（收敛到 8–22 点），其他日期默认 09:00。 */
export function defaultStartTimeFor(dateKey: string, todayDateKey: string, now: Date = new Date()): string {
  if (dateKey !== todayDateKey) return '09:00'
  const nextHour = Math.min(Math.max(now.getHours() + 1, 8), 22)
  return minutesToTime(nextHour * 60)
}

