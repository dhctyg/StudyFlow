import { describe, expect, it } from 'vitest'
import {
  CARD_SHADOWS,
  ICON_CANDIDATES,
  UI_THEME_DEFAULTS,
  UI_THEME_NUMERIC,
  sanitizeUiTheme,
  uiThemeCssVars,
} from './uiTheme'

describe('UI 主题模型：默认值与校验', () => {
  it('脏数据一律回落到默认值（不会破坏布局）', () => {
    expect(sanitizeUiTheme(null)).toEqual(UI_THEME_DEFAULTS)
    expect(sanitizeUiTheme('oops')).toEqual(UI_THEME_DEFAULTS)
    expect(sanitizeUiTheme([])).toEqual(UI_THEME_DEFAULTS)
  })

  it('数值按上下限夹取并对齐步进', () => {
    const theme = sanitizeUiTheme({
      contentMaxWidth: 100,
      sidebarRatio: 99,
      cardGap: -20,
      cardRadius: 999,
      fontScale: 5,
      iconSize: 0,
      buttonHeight: 1000,
    })
    expect(theme.contentMaxWidth).toBe(UI_THEME_NUMERIC.contentMaxWidth.min)
    expect(theme.sidebarRatio).toBe(UI_THEME_NUMERIC.sidebarRatio.max)
    expect(theme.cardGap).toBe(UI_THEME_NUMERIC.cardGap.min)
    expect(theme.cardRadius).toBe(UI_THEME_NUMERIC.cardRadius.max)
    expect(theme.fontScale).toBe(UI_THEME_NUMERIC.fontScale.max)
    expect(theme.iconSize).toBe(UI_THEME_NUMERIC.iconSize.min)
    expect(theme.buttonHeight).toBe(UI_THEME_NUMERIC.buttonHeight.max)
  })

  it('非数字 / NaN 回落到默认值', () => {
    const theme = sanitizeUiTheme({ cardGap: 'abc', iconSize: Number.NaN, fontScale: null })
    expect(theme.cardGap).toBe(UI_THEME_DEFAULTS.cardGap)
    expect(theme.iconSize).toBe(UI_THEME_DEFAULTS.iconSize)
    expect(theme.fontScale).toBe(UI_THEME_DEFAULTS.fontScale)
  })

  it('颜色必须是 #rrggbb，非法值回落', () => {
    const theme = sanitizeUiTheme({ cardBg: 'red', pageBg: '#abc', textColor: '#123456' })
    expect(theme.cardBg).toBe(UI_THEME_DEFAULTS.cardBg)
    expect(theme.pageBg).toBe(UI_THEME_DEFAULTS.pageBg)
    expect(theme.textColor).toBe('#123456')
  })

  it('图标只接受候选列表中的值', () => {
    const theme = sanitizeUiTheme({
      icons: { calendar: 'clock', settings: '不存在', plus: 'inbox' },
    })
    expect(theme.icons.calendar).toBe('clock')
    expect(ICON_CANDIDATES.calendar).toContain('clock')
    // 不在候选列表中的图标名（即使是注册表里的其它图标）会被回落
    expect(ICON_CANDIDATES.calendar).not.toContain('trash')
    expect(sanitizeUiTheme({ icons: { calendar: 'trash' } }).icons.calendar).toBe(
      UI_THEME_DEFAULTS.icons.calendar,
    )
    expect(theme.icons.settings).toBe(UI_THEME_DEFAULTS.icons.settings)
    expect(theme.icons.plus).toBe('inbox')
    expect(theme.icons.check).toBe(UI_THEME_DEFAULTS.icons.check)
    expect(theme.icons.trash).toBe(UI_THEME_DEFAULTS.icons.trash)
  })

  it('卡片边框开关与图标跟随文字色', () => {
    expect(sanitizeUiTheme({ cardBorder: false }).cardBorder).toBe(false)
    expect(sanitizeUiTheme({ cardBorder: true }).cardBorder).toBe(true)
    // 非法值回落到默认（默认不显示边框）
    expect(sanitizeUiTheme({ cardBorder: 'x' }).cardBorder).toBe(UI_THEME_DEFAULTS.cardBorder)
    expect(UI_THEME_DEFAULTS.cardBorder).toBe(false)
    expect(sanitizeUiTheme({ iconColor: '' }).iconColor).toBe('')
    expect(sanitizeUiTheme({ iconColor: 'nope' }).iconColor).not.toBe('')
  })
})

describe('UI 主题模型：令牌映射', () => {
  it('映射到真实存在的设计令牌（布局 / 文字 / 图标 / 控件）', () => {
    const vars = uiThemeCssVars(UI_THEME_DEFAULTS)
    for (const key of [
      '--home-columns',
      '--card-gap',
      '--card-pad',
      '--card-radius',
      '--card-shadow',
      '--card-bg',
      '--page-bg',
      '--color-text',
      '--color-text-muted',
      '--font-size-base',
      '--font-size-md',
      '--font-size-xs',
      '--icon-size-md',
      '--icon-color',
      '--card-border-width',
      '--button-radius',
      '--button-height',
      '--control-gap',
      '--row-pad',
    ]) {
      expect(vars[key]).toBeDefined()
    }
  })

  it('参数改变会真实改变对应令牌值', () => {
    const base = uiThemeCssVars(UI_THEME_DEFAULTS)
    const changed = uiThemeCssVars(
      sanitizeUiTheme({
        sidebarRatio: 40,
        cardRadius: 24,
        iconSize: 24,
        cardBorder: false,
        fontScale: 1.2,
        rowPadding: 12,
      }),
    )
    expect(changed['--home-columns']).not.toBe(base['--home-columns'])
    expect(changed['--home-columns']).toContain('40fr')
    expect(changed['--card-radius']).toBe('24px')
    expect(changed['--icon-size-md']).toBe('24px')
    expect(changed['--card-border-width']).toBe('0px')
    expect(changed['--font-size-base']).not.toBe(base['--font-size-base'])
    expect(changed['--row-pad']).not.toBe(base['--row-pad'])
  })

  it('阴影强度映射到预设档位，内容宽度到达上限表示不限宽', () => {
    const none = uiThemeCssVars(sanitizeUiTheme({ cardShadow: 0 }))
    expect(none['--card-shadow']).toBe(CARD_SHADOWS[0])
    const strong = uiThemeCssVars(sanitizeUiTheme({ cardShadow: 3 }))
    expect(strong['--card-shadow']).toBe(CARD_SHADOWS[3])
    const unlimited = uiThemeCssVars(
      sanitizeUiTheme({ contentMaxWidth: UI_THEME_NUMERIC.contentMaxWidth.max }),
    )
    expect(unlimited['--app-max-width']).toBe('none')
    const limited = uiThemeCssVars(sanitizeUiTheme({ contentMaxWidth: 1000 }))
    expect(limited['--app-max-width']).toBe('1000px')
  })
})
