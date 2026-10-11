import { describe, expect, it } from 'vitest'
import { buildCountdown, countdownLabel, daysUntil, isPastTarget } from './examCountdown'

describe('倒计时计算（纯函数）', () => {
  it('按本地日历日计算天数差（未来 / 今天 / 过去）', () => {
    expect(daysUntil('2026-10-20', '2026-10-10')).toBe(10)
    expect(daysUntil('2026-10-10', '2026-10-10')).toBe(0)
    expect(daysUntil('2026-10-01', '2026-10-10')).toBe(-9)
  })

  it('跨月 / 跨年计算正确', () => {
    expect(daysUntil('2026-11-01', '2026-10-31')).toBe(1)
    expect(daysUntil('2027-01-01', '2026-12-31')).toBe(1)
    expect(daysUntil('2026-03-01', '2026-02-28')).toBe(1)
  })

  it('非法日期返回 0，不抛异常', () => {
    expect(daysUntil('2026-99-99', '2026-10-10')).toBe(0)
    expect(daysUntil('2026-10-10', 'bad')).toBe(0)
  })

  it('文案：未来 / 明天 / 今天 / 过去', () => {
    expect(countdownLabel(42)).toBe('还剩 42 天')
    expect(countdownLabel(1)).toBe('明天')
    expect(countdownLabel(0)).toBe('就是今天')
    expect(countdownLabel(-1)).toBe('已过 1 天')
    expect(countdownLabel(-30)).toBe('已过 30 天')
  })

  it('buildCountdown：未设置或非法日期返回 null（由界面显示设置入口）', () => {
    expect(buildCountdown(null, '2026-10-10')).toBeNull()
    expect(buildCountdown('', '2026-10-10')).toBeNull()
    expect(buildCountdown('2026-13-40', '2026-10-10')).toBeNull()
  })

  it('buildCountdown：组合结果包含目标日期、天数与文案', () => {
    const countdown = buildCountdown('2026-12-19', '2026-10-10')
    expect(countdown).toEqual({
      targetDate: '2026-12-19',
      daysRemaining: 70,
      label: '还剩 70 天',
    })
    expect(isPastTarget(70)).toBe(false)
    expect(isPastTarget(-3)).toBe(true)
  })
})
