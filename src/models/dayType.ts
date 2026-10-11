/**
 * 日期类型（普通日 / 休息日 / 缓冲日）的展示配置与纯函数。
 * 与任务无关：设置日期类型绝不修改任何任务。
 */
import type { DateKind, DayType, DayTypeMap } from './types'
import { isDateKey } from '../utils/date'

export const DAY_TYPE_LABEL: Record<DayType, string> = {
  normal: '普通日',
  rest: '休息日',
  buffer: '缓冲日',
}

/** 右键 / 非右键菜单的顺序 */
export const DAY_TYPE_ORDER: readonly DayType[] = ['normal', 'rest', 'buffer']

/** 仅非普通日的类型可写入存储 */
export function isDateKind(value: unknown): value is DateKind {
  return value === 'rest' || value === 'buffer'
}

/** 归一化日期类型表：丢弃非法键 / 值，保证读取安全 */
export function sanitizeDayTypes(value: unknown): DayTypeMap {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const result: DayTypeMap = {}
  for (const [key, kind] of Object.entries(value as Record<string, unknown>)) {
    if (!isDateKey(key)) continue
    if (!isDateKind(kind)) continue
    result[key] = kind
  }
  return result
}

/** 取某天类型；无记录 = normal */
export function dayTypeFrom(map: Readonly<DayTypeMap>, dateKey: string): DayType {
  return map[dateKey] ?? 'normal'
}

/** 由「休息日集合 + 日期类型表」合成最终类型表：类型表优先，旧休息日集合补齐 */
export function mergeLegacyRestDays(map: DayTypeMap, restDays: readonly string[]): DayTypeMap {
  const merged: DayTypeMap = { ...map }
  for (const dateKey of restDays) {
    if (!isDateKey(dateKey)) continue
    if (merged[dateKey] === undefined) merged[dateKey] = 'rest'
  }
  return merged
}

/** 从类型表中筛出某类型的全部日期（升序） */
export function datesOfKind(map: Readonly<DayTypeMap>, kind: DateKind): string[] {
  return Object.keys(map)
    .filter((dateKey) => map[dateKey] === kind)
    .sort()
}
