import { describe, expect, it } from 'vitest'
import {
  datesOfKind,
  dayTypeFrom,
  isDateKind,
  mergeLegacyRestDays,
  sanitizeDayTypes,
} from './dayType'
import { DAY_TYPE_LABEL, DAY_TYPE_ORDER } from './dayType'

describe('日期类型工具', () => {
  it('sanitizeDayTypes 丢弃非法键与非法值', () => {
    expect(
      sanitizeDayTypes({
        '2026-10-01': 'rest',
        '2026-10-02': 'buffer',
        'bad-key': 'rest',
        '2026-10-03': 'normal',
        '2026-10-04': null,
      }),
    ).toEqual({ '2026-10-01': 'rest', '2026-10-02': 'buffer' })
    expect(sanitizeDayTypes(null)).toEqual({})
    expect(sanitizeDayTypes(['rest'])).toEqual({})
    expect(sanitizeDayTypes('rest')).toEqual({})
  })

  it('dayTypeFrom：无记录即普通日', () => {
    const map = { '2026-10-01': 'rest' as const, '2026-10-05': 'buffer' as const }
    expect(dayTypeFrom(map, '2026-10-01')).toBe('rest')
    expect(dayTypeFrom(map, '2026-10-05')).toBe('buffer')
    expect(dayTypeFrom(map, '2026-10-30')).toBe('normal')
  })

  it('datesOfKind：按类型筛选并升序返回', () => {
    const map = {
      '2026-10-05': 'buffer' as const,
      '2026-10-01': 'rest' as const,
      '2026-10-09': 'rest' as const,
    }
    expect(datesOfKind(map, 'rest')).toEqual(['2026-10-01', '2026-10-09'])
    expect(datesOfKind(map, 'buffer')).toEqual(['2026-10-05'])
  })

  it('mergeLegacyRestDays：补齐旧休息日，且不覆盖已有类型', () => {
    const merged = mergeLegacyRestDays({ '2026-10-01': 'buffer' }, [
      '2026-10-01',
      '2026-10-02',
      'bad-key',
    ])
    expect(merged).toEqual({ '2026-10-01': 'buffer', '2026-10-02': 'rest' })
  })

  it('isDateKind 只接受 rest / buffer', () => {
    expect(isDateKind('rest')).toBe(true)
    expect(isDateKind('buffer')).toBe(true)
    expect(isDateKind('normal')).toBe(false)
    expect(isDateKind(null)).toBe(false)
  })

  it('类型标签与菜单顺序完整', () => {
    expect(DAY_TYPE_ORDER).toEqual(['normal', 'rest', 'buffer'])
    expect(DAY_TYPE_ORDER.map((type) => DAY_TYPE_LABEL[type])).toEqual([
      '普通日',
      '休息日',
      '缓冲日',
    ])
  })
})
