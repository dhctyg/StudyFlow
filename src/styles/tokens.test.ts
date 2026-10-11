import { describe, expect, it } from 'vitest'
// 直接以文本方式读取样式源码（Vite ?raw），不引入 Node 类型依赖
import baseCss from './base.css?raw'
import tokensCss from './tokens.css?raw'
import { BASE_FONT_SIZES, CARD_SHADOWS, UI_THEME_DEFAULTS } from '../models/uiTheme'

/**
 * 全局设计规范回归测试（阶段四）。
 *
 * 这些断言锁住「页面背景 / 圆角 / 阴影三级 / 字号放大 1.15 倍 / 图标同步 / 按钮 36px / 卡片无边框 /
 * MiSans 字体 / 滚动条」这些视觉约定，避免后续改动把它们悄悄改回去。
 * 同时校验「界面自定义中心」的默认值与之保持一致（否则运行时会把令牌覆盖回旧值）。
 */

function token(name: string): string {
  const match = tokensCss.match(new RegExp(`--${name}:\\s*([^;]+);`))
  expect(match, `缺少设计令牌 --${name}`).not.toBeNull()
  return (match?.[1] ?? '').trim()
}

describe('全局设计令牌：阶段四视觉规范', () => {
  it('页面背景为 #f7f7f7', () => {
    expect(token('color-bg')).toBe('#f7f7f7')
    expect(token('page-bg')).toBe('var(--color-bg)')
  })

  it('卡片与弹窗统一 16px 圆角', () => {
    expect(token('radius-lg')).toBe('16px')
    expect(token('card-radius')).toBe('var(--radius-lg)')
    expect(UI_THEME_DEFAULTS.cardRadius).toBe(16)
  })

  it('按钮圆角 12px、高度 36px，且界面自定义默认值与令牌一致', () => {
    expect(token('button-radius')).toBe('12px')
    expect(token('button-height')).toBe('36px')
    expect(UI_THEME_DEFAULTS.buttonRadius).toBe(12)
    expect(UI_THEME_DEFAULTS.buttonHeight).toBe(36)
  })

  it('卡片默认不显示边框', () => {
    expect(token('card-border-width')).toBe('0px')
    expect(token('card-border')).toBe('var(--color-border)')
    expect(UI_THEME_DEFAULTS.cardBorder).toBe(false)
  })

  it('阴影分三级：普通卡片用中等柔和阴影，弹窗 / 浮层用更强阴影', () => {
    expect(token('shadow-sm')).not.toBe('')
    expect(token('shadow-md')).not.toBe('')
    expect(token('shadow-lg')).not.toBe('')
    expect(token('card-shadow')).toBe('var(--shadow-panel)')
    expect(token('shadow-panel')).toBe('var(--shadow-md)')
    expect(token('shadow-modal')).toBe('var(--shadow-lg)')
    expect(UI_THEME_DEFAULTS.cardShadow).toBe(2)
    expect(CARD_SHADOWS[1]).toBe(token('shadow-sm'))
    expect(CARD_SHADOWS[2]).toBe(token('shadow-md'))
    expect(CARD_SHADOWS[3]).toBe(token('shadow-lg'))
  })

  it('字号整体放大 1.15 倍并保留原有层级', () => {
    const previous: Record<keyof typeof BASE_FONT_SIZES, number> = {
      xs: 11,
      sm: 12,
      base: 13,
      md: 15,
      lg: 18,
      xl: 24,
    }
    const scaled = Object.entries(previous).map(([key, before]) => {
      const value = Number(token(`font-size-${key}`).replace('px', ''))
      expect(value).toBe(Math.round(before * 1.15))
      expect(BASE_FONT_SIZES[key as keyof typeof BASE_FONT_SIZES]).toBe(value)
      return value
    })
    // 层级关系不变（逐级递增）
    expect([...scaled].sort((a, b) => a - b)).toEqual(scaled)
  })

  it('图标尺寸与字号同步放大', () => {
    expect(token('icon-size-sm')).toBe('16px')
    expect(token('icon-size-md')).toBe('18px')
    expect(token('icon-size-lg')).toBe('23px')
    expect(UI_THEME_DEFAULTS.iconSize).toBe(18)
  })

  it('仍使用自托管 MiSans 全局字体（未被覆盖回系统默认）', () => {
    expect(token('font-sans').startsWith('MiSans')).toBe(true)
    expect(token('font-sans')).toContain('sans-serif')
  })

  it('滚动条：Chromium 规则 + 标准属性回退，且不隐藏滚动条本体', () => {
    expect(baseCss).toContain('::-webkit-scrollbar')
    expect(baseCss).toContain('::-webkit-scrollbar-track')
    expect(baseCss).toContain('::-webkit-scrollbar-thumb')
    expect(baseCss).toContain('::-webkit-scrollbar-thumb:hover')
    expect(baseCss).toContain('border-radius: 999px')
    expect(baseCss).toContain('scrollbar-width: thin')
    expect(baseCss).toContain('scrollbar-color: var(--scrollbar-thumb) transparent')
    expect(baseCss).not.toContain('scrollbar-width: none')
    expect(token('scrollbar-thumb')).not.toBe('')
    expect(token('scrollbar-thumb-hover')).not.toBe('')
  })

  it('整体以中性色为主：强调色不再是高饱和彩色', () => {
    // 主色为近黑中性灰（#2f3336），不是饱和蓝 / 紫等装饰色
    expect(token('color-accent')).toBe('#2f3336')
    const rgb = tokensCss.match(/--color-accent:\s*#(\w\w)(\w\w)(\w\w)/)
    const [r, g, b] = [rgb?.[1], rgb?.[2], rgb?.[3]].map((hex) => Number.parseInt(hex ?? '0', 16))
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(16)
  })
})
