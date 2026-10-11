/**
 * 倒计时计算（纯函数，可单测）。
 *
 * 约定：日期一律按**本地日历日**（YYYY-MM-DD）比较，用 UTC 毫秒差换算天数，
 * 避免夏令时 / 时区导致的 ±1 天误差。
 */
import { isDateKey } from './date'

export interface Countdown {
  /** 目标日期 */
  targetDate: string
  /** 剩余天数：0 = 今天，负数 = 已过期 */
  daysRemaining: number
  /** 展示文案 */
  label: string
}

/** 目标日期距今天的天数差（正整数 = 还剩；0 = 今天；负数 = 已过） */
export function daysUntil(targetDate: string, today: string): number {
  if (!isDateKey(targetDate) || !isDateKey(today)) return 0
  const [ty, tm, td] = targetDate.split('-').map(Number)
  const [cy, cm, cd] = today.split('-').map(Number)
  const targetUtc = Date.UTC(ty, tm - 1, td)
  const todayUtc = Date.UTC(cy, cm - 1, cd)
  return Math.round((targetUtc - todayUtc) / 86400000)
}

/** 倒计时文案（不装饰、不含图标） */
export function countdownLabel(days: number): string {
  if (days > 1) return `还剩 ${days} 天`
  if (days === 1) return '明天'
  if (days === 0) return '就是今天'
  const passed = Math.abs(days)
  if (passed === 1) return '已过 1 天'
  return `已过 ${passed} 天`
}

/** 目标日期是否已过 */
export function isPastTarget(days: number): boolean {
  return days < 0
}

/** 组合成倒计时对象；目标日期非法或未设置返回 null（由界面显示设置入口） */
export function buildCountdown(targetDate: string | null, today: string): Countdown | null {
  if (targetDate === null || !isDateKey(targetDate)) return null
  const daysRemaining = daysUntil(targetDate, today)
  return { targetDate, daysRemaining, label: countdownLabel(daysRemaining) }
}
