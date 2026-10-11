/**
 * 每日学习时长汇总（纯函数，可单测）。
 *
 * 口径：
 * - plannedMinutes：当天所有合法时间任务的“区间并集”时长——重叠只计一次，
 *   即真实覆盖的时间跨度，避免排课冲突导致总时长虚高。
 * - scheduledMinutes：各任务时长之和（含重复），与并集区分展示。
 * - overlapMinutes：scheduled − planned，即重叠掉的分钟数。
 * - 无合法时间的旧任务不计入任何时长，单独计数提示。
 * - 只依赖任务数据：与科目筛选、完成状态、休息日均无关。
 */
import type { Task } from '../models/types'
import { taskInterval, unionDurationMinutes } from './time'

export interface DayDurationSummary {
  /** 去重后的实际时间跨度（分钟） */
  plannedMinutes: number
  /** 各任务时长之和（分钟，含重叠） */
  scheduledMinutes: number
  /** 重叠分钟数 = scheduled − planned */
  overlapMinutes: number
  /** 参与统计的任务数（有合法时间） */
  timedTaskCount: number
  /** 无合法时间、未计入统计的任务数 */
  untimedTaskCount: number
}

export function summarizeDayDuration(tasks: readonly Task[]): DayDurationSummary {
  const intervals: { start: number; end: number }[] = []
  let untimedTaskCount = 0
  for (const task of tasks) {
    const interval = taskInterval(task)
    if (interval === null) {
      untimedTaskCount += 1
      continue
    }
    intervals.push(interval)
  }
  const plannedMinutes = unionDurationMinutes(intervals)
  const scheduledMinutes = intervals.reduce((sum, item) => sum + (item.end - item.start), 0)
  return {
    plannedMinutes,
    scheduledMinutes,
    overlapMinutes: scheduledMinutes - plannedMinutes,
    timedTaskCount: intervals.length,
    untimedTaskCount,
  }
}

/** '3 小时 30 分钟' / '45 分钟' / '0 分钟' */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  const hours = Math.floor(total / 60)
  const rest = total % 60
  if (hours === 0) return `${rest} 分钟`
  if (rest === 0) return `${hours} 小时`
  return `${hours} 小时 ${rest} 分钟`
}

/** '3h30m' / '45m' / '0m'（月视图等紧凑场景） */
export function formatDurationCompact(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  const hours = Math.floor(total / 60)
  const rest = total % 60
  if (hours === 0) return `${rest}m`
  if (rest === 0) return `${hours}h`
  return `${hours}h${rest}m`
}
