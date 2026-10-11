/**
 * 日期完成状态（纯函数，可单测）。
 * 规则：
 * - 当天没有任何任务 → none（不显示完成状态；休息日不会让空日期变成“已完成”）。
 * - 存在任务但仍有未完成 → pending。
 * - 至少一个任务且全部完成 → completed。
 * 休息日完全不参与计算：它是独立的日期属性，与此处状态正交。
 */
import type { DayStatus, Task } from '../models/types'

export function dayStatusOf(tasks: readonly Task[]): DayStatus {
  if (tasks.length === 0) return 'none'
  return tasks.every((task) => task.done) ? 'completed' : 'pending'
}
