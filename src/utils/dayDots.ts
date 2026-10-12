/**
 * 紧凑日期选择器（窄屏竖屏）的展示模型与纯函数。
 *
 * 背景：日历区域宽度不足时不再强行铺七列任务卡片，改为「日期选择器」——
 * 日期下方只用**科目主题色圆点**表示当天有任务，不显示任务名称 / 描述 / 时长。
 *
 * 这里的函数全部是只读计算：
 * - 不修改任务、不修改完成状态、不写任何存储；
 * - 只把「某天的可见任务」汇总成「按科目去重」的圆点序列，供界面渲染。
 */
import type { Task } from '../models/types'

/**
 * 一个日期格最多显示几个科目圆点。
 * 同一科目的多个任务合并成一个圆点，因此上限约束的是**科目数量**；
 * 超出部分只显示「+N」，避免窄屏下日期格拥挤或换行导致高度抖动。
 */
export const MAX_SUBJECT_DOTS = 3

export interface SubjectDot {
  subjectId: string
  /** 科目主题色（与周视图 / 月视图 / 任务列表同源） */
  color: string
  /** 该科目当天的任务是否**全部**完成（仅用于降低圆点透明度，不改变任务状态） */
  done: boolean
}

export interface DayDots {
  dots: SubjectDot[]
  /** 因超过上限而未显示的科目数量（>0 时界面显示「+N」） */
  overflow: number
}

/**
 * 把某天的可见任务汇总为「按科目去重」的圆点序列（纯函数）。
 *
 * - 同一科目有多个任务 → 只保留一个圆点（颜色取科目主题色）；
 * - 圆点顺序与传入的任务顺序一致（调用方已按开始时间排序），保证多次渲染顺序稳定；
 * - 该科目当天任务全部完成 → `done: true`（界面淡化显示）；只要有一个未完成就不淡化；
 * - 科目数超过 MAX_SUBJECT_DOTS → 只取前 N 个，其余计入 `overflow`。
 */
export function subjectDotsOf(
  tasks: readonly Task[],
  colorOf: (subjectId: string) => string,
): DayDots {
  const dots: SubjectDot[] = []
  const indexBySubject = new Map<string, number>()

  for (const task of tasks) {
    const existing = indexBySubject.get(task.subjectId)
    if (existing === undefined) {
      indexBySubject.set(task.subjectId, dots.length)
      dots.push({ subjectId: task.subjectId, color: colorOf(task.subjectId), done: task.done })
      continue
    }
    // 合并到已有圆点：只要还有一个未完成任务，就不算「全部完成」
    const dot = dots[existing]
    if (dot !== undefined && !task.done) dot.done = false
  }

  if (dots.length <= MAX_SUBJECT_DOTS) return { dots, overflow: 0 }
  return { dots: dots.slice(0, MAX_SUBJECT_DOTS), overflow: dots.length - MAX_SUBJECT_DOTS }
}

/** 紧凑日期选择器的单个日期格（周视图 / 月视图共用同一套字段） */
export interface PickerCell {
  /** 日期键（YYYY-MM-DD） */
  key: string
  /** 日期数字 */
  day: number
  /** 月视图：是否属于当前锚点月份（邻月日期淡显）；周视图恒为 true */
  inMonth: boolean
  isToday: boolean
  isSelected: boolean
  isRest: boolean
  isBuffer: boolean
  /** 当天任务是否全部完成（沿用「日期数字变绿」的既有语义） */
  isComplete: boolean
  /** 当天任务总数：只用于 title 提示 / 无障碍描述，不显示在界面上 */
  total: number
  dots: SubjectDot[]
  overflow: number
}

/** 日期选择器形态：周 = 单行 7 天；月 = 整月网格 */
export type PickerVariant = 'week' | 'month'
