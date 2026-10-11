import { describe, expect, it } from 'vitest'
import {
  addDaysKey,
  addMonthsKey,
  daysInMonth,
  formatDayTitle,
  formatWeekTitle,
  isDateKey,
  monthGridKeys,
  startOfWeekKey,
  toDateKey,
  weekdayIndexMon,
  weekdayShort,
  weekDaysKey,
} from './date'

/** 覆盖不同长度 / 起始星期 / 闰年 / 跨年的月份样本 */
const MONTH_FIXTURES: ReadonlyArray<{ year: number; month: number }> = [
  { year: 2026, month: 2 }, // 28 天，1 日为周日
  { year: 2024, month: 2 }, // 闰年 29 天
  { year: 2026, month: 8 }, // 1 日为周六 → 42 格
  { year: 2026, month: 10 }, // 当前月
  { year: 2026, month: 12 }, // 年末
  { year: 2027, month: 1 }, // 年初，网格跨到上一年
  { year: 2027, month: 4 }, // 30 天，1 日为周四
]

describe('isDateKey', () => {
  it('接受真实的本地日期', () => {
    expect(isDateKey('2026-10-10')).toBe(true)
    expect(isDateKey('2024-02-29')).toBe(true) // 闰年
  })

  it('拒绝格式错误与不存在的日期', () => {
    expect(isDateKey('2026-02-30')).toBe(false)
    expect(isDateKey('2026-13-01')).toBe(false)
    expect(isDateKey('2026-1-1')).toBe(false)
    expect(isDateKey('20261010')).toBe(false)
    expect(isDateKey(20261010)).toBe(false)
    expect(isDateKey(null)).toBe(false)
  })
})

describe('日期加减', () => {
  it('addDaysKey 正确处理跨月与跨年', () => {
    expect(addDaysKey('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDaysKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysKey('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDaysKey('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('addMonthsKey 跨年且月末收敛', () => {
    expect(addMonthsKey('2026-12-15', 1)).toBe('2027-01-15')
    expect(addMonthsKey('2027-01-15', -1)).toBe('2026-12-15')
    expect(addMonthsKey('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsKey('2024-01-31', 1)).toBe('2024-02-29') // 闰年
  })
})

describe('周起点（周一开头）', () => {
  it('2026-10-10 是周六，所在周从 10-05（周一）开始', () => {
    expect(weekdayIndexMon('2026-10-10')).toBe(5)
    expect(weekdayShort('2026-10-10')).toBe('周六')
    expect(startOfWeekKey('2026-10-10')).toBe('2026-10-05')
    expect(startOfWeekKey('2026-10-05')).toBe('2026-10-05') // 周一自身
  })

  it('weekDaysKey 恒返回周一 → 周日 7 天', () => {
    const days = weekDaysKey('2026-10-10')
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('2026-10-05')
    expect(days[6]).toBe('2026-10-11')
    expect(days.every((key) => weekdayIndexMon(key) >= 0)).toBe(true)
  })

  it('跨年周：2026-12-31（周四）所在周为 12-28 → 2027-01-03', () => {
    const days = weekDaysKey('2026-12-31')
    expect(days[0]).toBe('2026-12-28')
    expect(days[6]).toBe('2027-01-03')
  })
})

describe('monthGridKeys', () => {
  it('恒为整周对齐，首格为周一', () => {
    for (const { year, month } of MONTH_FIXTURES) {
      const grid = monthGridKeys(year, month)
      expect(grid.length % 7).toBe(0)
      expect(weekdayIndexMon(grid[0])).toBe(0)
      expect(grid.every((key) => isDateKey(key))).toBe(true)
      // 网格必须完整覆盖当月每一天
      const total = daysInMonth(year, month)
      const prefix = `${year}-${String(month).padStart(2, '0')}`
      expect(grid.filter((key) => key.startsWith(prefix))).toHaveLength(total)
    }
  })

  it('2026-02（28 天，2 月 1 日为周日）→ 35 格，1-26 起', () => {
    const grid = monthGridKeys(2026, 2)
    expect(grid).toHaveLength(35)
    expect(grid[0]).toBe('2026-01-26')
    expect(grid[34]).toBe('2026-03-01')
  })

  it('42 格月份与跨年月份正确', () => {
    // 2026-08-01 是周六 → 需要 42 格
    const grid = monthGridKeys(2026, 8)
    expect(grid).toHaveLength(42)
    expect(grid[0]).toBe('2026-07-27')

    // 2027-01 网格起点跨回 2026-12，终点落在 2027-01-31
    const jan = monthGridKeys(2027, 1)
    expect(jan[0]).toBe('2026-12-28')
    expect(jan[jan.length - 1]).toBe('2027-01-31')
    expect(jan).toHaveLength(35)
  })
})

describe('toDateKey（日期格式兼容与归一化）', () => {
  it('规范日期原样返回', () => {
    expect(toDateKey('2026-10-05')).toBe('2026-10-05')
    expect(toDateKey('2024-02-29')).toBe('2024-02-29')
  })

  it('斜杠 / 点号分隔与单位数月份补零', () => {
    expect(toDateKey('2026/10/5')).toBe('2026-10-05')
    expect(toDateKey('2026.1.31')).toBe('2026-01-31')
    expect(toDateKey(' 2026-7-4 ')).toBe('2026-07-04')
  })

  it('带时间的 ISO 串只取日期部分（不按 UTC 换算，避免差一天）', () => {
    expect(toDateKey('2026-10-05T00:00:00.000Z')).toBe('2026-10-05')
    expect(toDateKey('2026-10-05T23:59:59+08:00')).toBe('2026-10-05')
    expect(toDateKey('2026-10-05 09:30')).toBe('2026-10-05')
    expect(toDateKey('2026-10-05T00:00:00')).toBe('2026-10-05')
  })

  it('Date 对象取其本地日历日', () => {
    expect(toDateKey(new Date(2026, 9, 5, 13, 30))).toBe('2026-10-05')
    expect(toDateKey(new Date('invalid'))).toBeNull()
  })

  it('无法识别或不存在返回 null', () => {
    expect(toDateKey(null)).toBeNull()
    expect(toDateKey(undefined)).toBeNull()
    expect(toDateKey('')).toBeNull()
    expect(toDateKey('2026-02-30')).toBeNull()
    expect(toDateKey('2026-13-01')).toBeNull()
    expect(toDateKey('20261005')).toBeNull()
    expect(toDateKey('2026年10月5日')).toBeNull()
    expect(toDateKey(20261005)).toBeNull()
  })
})

describe('标题格式化', () => {
  it('formatWeekTitle 同年省略结束年份，跨年显示两侧年份', () => {
    expect(formatWeekTitle('2026-10-05', '2026-10-11')).toBe('2026年10月5日 – 10月11日')
    expect(formatWeekTitle('2026-12-28', '2027-01-03')).toBe('2026年12月28日 – 2027年1月3日')
  })

  it('formatDayTitle 含星期', () => {
    expect(formatDayTitle('2026-10-10')).toBe('2026年10月10日 周六')
  })
})
