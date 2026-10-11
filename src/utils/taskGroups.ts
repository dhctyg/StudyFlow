/**
 * 任务分组与日期调整（纯函数，可单测）。
 *
 * 阶段一的三类任务：
 * - 当日安排：安排日期 = 今天且未完成；
 * - 逾期任务：安排日期早于今天且未完成 —— 由「原任务日期 + 完成状态」动态计算，
 *   绝不按天生成副本，同一任务在任意时刻只有一份原始记录；
 * - 临时任务箱：尚未设置安排日期（date === null）。
 *
 * 已完成任务不进入逾期列表与临时任务箱；移动日期只更新原任务的 date 字段。
 */
import type { Task } from '../models/types'
import { toDateKey } from './date'

export interface TaskGroups {
  /** 今日待办（未完成） */
  today: Task[]
  /** 逾期（原计划日期早于今天且未完成），按日期升序 */
  overdue: Task[]
  /** 临时任务箱（无安排日期且未完成） */
  unscheduled: Task[]
}

/**
 * 任务的有效日期键（归一化）。
 *
 * 关键点：面板与日历必须使用**同一套**日期判定 ——
 * 日历按天取任务时用规范键匹配，面板判断「今天 / 逾期」时也必须先归一化，
 * 否则像 '2026-10-05T00:00:00.000Z' 这类历史值会被面板算成逾期、
 * 却在日历里匹配不到任何一天（任务「只在面板可见」的根因）。
 */
export function taskDateKey(task: Pick<Task, 'date'>): string | null {
  return toDateKey(task.date)
}

/** 尚未设置安排日期 */
export function isUnscheduledTask(task: Pick<Task, 'date'>): boolean {
  return taskDateKey(task) === null
}

/** 逾期：有安排日期、早于今天、且未完成 */
export function isOverdueTask(task: Pick<Task, 'date' | 'done'>, today: string): boolean {
  if (task.done) return false
  const key = taskDateKey(task)
  if (key === null) return false
  return key < today
}

/** 今日待办：安排日期 = 今天且未完成 */
export function isTodayTask(task: Pick<Task, 'date' | 'done'>, today: string): boolean {
  if (task.done) return false
  return taskDateKey(task) === today
}

/** 按（日期, ID）稳定排序，避免列表顺序抖动 */
function dateKeyOf(task: Task): string {
  return taskDateKey(task) ?? ''
}

export function partitionTasks(tasks: readonly Task[], today: string): TaskGroups {
  const groups: TaskGroups = { today: [], overdue: [], unscheduled: [] }
  for (const task of tasks) {
    if (isUnscheduledTask(task)) {
      if (!task.done) groups.unscheduled.push(task)
      continue
    }
    if (isOverdueTask(task, today)) {
      groups.overdue.push(task)
      continue
    }
    if (isTodayTask(task, today)) groups.today.push(task)
  }
  groups.overdue.sort(
    (a, b) => dateKeyOf(a).localeCompare(dateKeyOf(b)) || a.id.localeCompare(b.id),
  )
  return groups
}

export interface BufferPickOptions {
  today: string
  /** 全部缓冲日（顺序不限，内部会去重排序） */
  bufferDates: readonly string[]
  /** 需排除的日期（通常是任务当前日期，避免“原地移动”） */
  excludeDate?: string | null
}

/**
 * 为任务挑选合适的缓冲日（只读计算，不修改任何数据）：
 * 1. 优先取今天及之后最近的缓冲日（不含任务当前所在日期）；
 * 2. 其次取今天之前最近的缓冲日（用于补记历史）；
 * 3. 没有任何可用缓冲日 → null，交由界面提示用户先创建缓冲日或手动选择日期。
 */
export function pickBufferDate(options: BufferPickOptions): string | null {
  const excluded = new Set<string>()
  if (options.excludeDate !== null && options.excludeDate !== undefined) {
    excluded.add(options.excludeDate)
  }
  const candidates = [...new Set(options.bufferDates)]
    .filter((dateKey) => !excluded.has(dateKey))
    .sort()
  if (candidates.length === 0) return null

  const upcoming = candidates.find((dateKey) => dateKey >= options.today)
  if (upcoming !== undefined) return upcoming

  return candidates[candidates.length - 1] ?? null
}
