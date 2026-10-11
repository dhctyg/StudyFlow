/**
 * UI 主题模型（阶段三）：把「界面自定义中心」的可调参数映射到现有设计令牌。
 *
 * 设计约定：
 * - **不新增并行样式系统**：所有参数最终写入 styles/tokens.css 中已有的 CSS 变量，
 *   组件样式本就依赖这些令牌，因此调整参数会真正改变首页，而不只是设置面板自身。
 * - 纯视觉参数**不进业务数据**：单独存放在 localStorage 的独立命名空间（uiTheme 键），
 *   与任务 / 科目 / 日期类型 / 配置完全分离；恢复默认只重置这份样式配置。
 * - 数值有上下限与步进，颜色必须是 #rrggbb，图标只能从现有图标注册表里选。
 */
import type { IconName } from '../components/common/icons'
import { isValidHexColor } from './subjects'

/**
 * 可自定义语义图标。
 *
 * 键 = 组件当前使用的图标名（例如「添加任务」按钮用的是 plus），
 * 这样 resolveIconName 才能真正接管这些图标；值 = 用户选择的替换图标。
 */
export type IconRole = 'calendar' | 'settings' | 'plus' | 'check' | 'trash'

export interface UiTheme {
  /* 整体布局 */
  contentMaxWidth: number
  sidebarRatio: number
  cardGap: number
  cardPadding: number
  cardRadius: number
  cardShadow: number
  cardBg: string
  pageBg: string
  /* 文字 */
  fontScale: number
  titleScale: number
  cardTitleScale: number
  bodyScale: number
  mutedScale: number
  textColor: string
  textMutedColor: string
  /* 图标 */
  iconSize: number
  iconColor: string
  icons: Record<IconRole, IconName>
  /* 卡片与控件 */
  cardBorder: boolean
  cardBorderColor: string
  buttonRadius: number
  buttonHeight: number
  controlGap: number
  rowPadding: number
}

/** 数值参数的上下限与步进（供界面滑块 / 数字输入与校验共用） */
export interface NumericSpec {
  min: number
  max: number
  step: number
  /** 默认值 */
  fallback: number
}

export const UI_THEME_NUMERIC = {
  contentMaxWidth: { min: 900, max: 2600, step: 20, fallback: 1520 },
  sidebarRatio: { min: 20, max: 40, step: 1, fallback: 25 },
  cardGap: { min: 0, max: 40, step: 2, fallback: 16 },
  cardPadding: { min: 8, max: 40, step: 2, fallback: 16 },
  cardRadius: { min: 0, max: 28, step: 2, fallback: 16 },
  cardShadow: { min: 0, max: 3, step: 1, fallback: 2 },
  fontScale: { min: 0.85, max: 1.3, step: 0.05, fallback: 1 },
  titleScale: { min: 0.9, max: 1.6, step: 0.05, fallback: 1 },
  cardTitleScale: { min: 0.85, max: 1.5, step: 0.05, fallback: 1 },
  bodyScale: { min: 0.85, max: 1.4, step: 0.05, fallback: 1 },
  mutedScale: { min: 0.85, max: 1.4, step: 0.05, fallback: 1 },
  iconSize: { min: 12, max: 32, step: 1, fallback: 18 },
  buttonRadius: { min: 0, max: 24, step: 1, fallback: 12 },
  buttonHeight: { min: 24, max: 52, step: 1, fallback: 36 },
  controlGap: { min: 0, max: 24, step: 1, fallback: 8 },
  rowPadding: { min: 0, max: 16, step: 1, fallback: 4 },
} as const satisfies Record<string, NumericSpec>

/**
 * 字号基准（px）：与 styles/tokens.css 的 --font-size-* 默认值保持一致。
 * 「字号缩放」在此基准上相乘，保证放大后仍保留原有层级关系。
 */
export const BASE_FONT_SIZES = {
  xs: 13,
  sm: 14,
  base: 15,
  md: 17,
  lg: 21,
  xl: 28,
} as const

export type NumericThemeKey = keyof typeof UI_THEME_NUMERIC

/** 内容最大宽度达到上限时表示不限宽 */
export const CONTENT_WIDTH_UNLIMITED = UI_THEME_NUMERIC.contentMaxWidth.max

/** 卡片阴影三级（0 = 无阴影）：md 为普通卡片默认强度，lg 用于弹窗 / 浮层 */
export const CARD_SHADOWS: readonly string[] = [
  'none',
  '0 1px 2px rgba(17, 20, 24, 0.04)',
  '0 2px 8px rgba(17, 20, 24, 0.06), 0 1px 2px rgba(17, 20, 24, 0.04)',
  '0 12px 32px rgba(17, 20, 24, 0.14)',
]

/** 图标候选：只从现有图标注册表里选，不让用户手输图标名 */
export const ICON_CANDIDATES: Record<IconRole, readonly IconName[]> = {
  calendar: ['calendar', 'clock', 'tasks', 'today', 'inbox', 'rest', 'buffer'],
  settings: ['settings', 'edit', 'more', 'restore', 'clock'],
  plus: ['plus', 'edit', 'inbox', 'tasks', 'check'],
  check: ['check', 'today', 'restore', 'clock', 'calendar'],
  trash: ['trash', 'close', 'more', 'edit', 'overdue'],
}

export const ICON_ROLE_LABEL: Record<IconRole, string> = {
  calendar: '日历',
  settings: '设置',
  plus: '添加任务',
  check: '完成',
  trash: '删除',
}

export const ICON_ROLES: readonly IconRole[] = ['calendar', 'settings', 'plus', 'check', 'trash']

export const UI_THEME_DEFAULTS: UiTheme = {
  contentMaxWidth: UI_THEME_NUMERIC.contentMaxWidth.fallback,
  sidebarRatio: UI_THEME_NUMERIC.sidebarRatio.fallback,
  cardGap: UI_THEME_NUMERIC.cardGap.fallback,
  cardPadding: UI_THEME_NUMERIC.cardPadding.fallback,
  cardRadius: UI_THEME_NUMERIC.cardRadius.fallback,
  cardShadow: UI_THEME_NUMERIC.cardShadow.fallback,
  cardBg: '#ffffff',
  pageBg: '#f4f5f7',
  fontScale: UI_THEME_NUMERIC.fontScale.fallback,
  titleScale: UI_THEME_NUMERIC.titleScale.fallback,
  cardTitleScale: UI_THEME_NUMERIC.cardTitleScale.fallback,
  bodyScale: UI_THEME_NUMERIC.bodyScale.fallback,
  mutedScale: UI_THEME_NUMERIC.mutedScale.fallback,
  textColor: '#1f2329',
  textMutedColor: '#939aa6',
  iconSize: UI_THEME_NUMERIC.iconSize.fallback,
  iconColor: '',
  icons: {
    calendar: 'calendar',
    settings: 'settings',
    plus: 'plus',
    check: 'check',
    trash: 'trash',
  },
  cardBorder: false,
  cardBorderColor: '#ececec',
  buttonRadius: UI_THEME_NUMERIC.buttonRadius.fallback,
  buttonHeight: UI_THEME_NUMERIC.buttonHeight.fallback,
  controlGap: UI_THEME_NUMERIC.controlGap.fallback,
  rowPadding: UI_THEME_NUMERIC.rowPadding.fallback,
}

function clampNumber(value: unknown, spec: NumericSpec): number {
  // 注意：Number(null) === 0、Number('') === 0，这类值必须按「未提供」处理并回落默认值
  if (typeof value !== 'number' && typeof value !== 'string') return spec.fallback
  const parsed = typeof value === 'number' ? value : value.trim() === '' ? Number.NaN : Number(value)
  if (!Number.isFinite(parsed)) return spec.fallback
  const clamped = Math.min(spec.max, Math.max(spec.min, parsed))
  const stepped = Math.round((clamped - spec.min) / spec.step) * spec.step + spec.min
  const decimals = spec.step < 1 ? 2 : 0
  return Number(stepped.toFixed(decimals))
}

function sanitizeColor(value: unknown, fallback: string): string {
  return isValidHexColor(value) ? value.toLowerCase() : fallback
}

function sanitizeIcon(value: unknown, role: IconRole): IconName {
  const candidates: readonly string[] = ICON_CANDIDATES[role]
  return typeof value === 'string' && candidates.includes(value)
    ? (value as IconName)
    : UI_THEME_DEFAULTS.icons[role]
}

/** 归一化主题：逐项夹取范围、校验颜色与图标；任何脏数据都不会破坏布局 */
export function sanitizeUiTheme(value: unknown): UiTheme {
  const record = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const iconsRecord = (
    typeof record.icons === 'object' && record.icons !== null ? record.icons : {}
  ) as Record<string, unknown>
  const icons = {} as Record<IconRole, IconName>
  for (const role of ICON_ROLES) icons[role] = sanitizeIcon(iconsRecord[role], role)

  return {
    contentMaxWidth: clampNumber(record.contentMaxWidth, UI_THEME_NUMERIC.contentMaxWidth),
    sidebarRatio: clampNumber(record.sidebarRatio, UI_THEME_NUMERIC.sidebarRatio),
    cardGap: clampNumber(record.cardGap, UI_THEME_NUMERIC.cardGap),
    cardPadding: clampNumber(record.cardPadding, UI_THEME_NUMERIC.cardPadding),
    cardRadius: clampNumber(record.cardRadius, UI_THEME_NUMERIC.cardRadius),
    cardShadow: clampNumber(record.cardShadow, UI_THEME_NUMERIC.cardShadow),
    cardBg: sanitizeColor(record.cardBg, UI_THEME_DEFAULTS.cardBg),
    pageBg: sanitizeColor(record.pageBg, UI_THEME_DEFAULTS.pageBg),
    fontScale: clampNumber(record.fontScale, UI_THEME_NUMERIC.fontScale),
    titleScale: clampNumber(record.titleScale, UI_THEME_NUMERIC.titleScale),
    cardTitleScale: clampNumber(record.cardTitleScale, UI_THEME_NUMERIC.cardTitleScale),
    bodyScale: clampNumber(record.bodyScale, UI_THEME_NUMERIC.bodyScale),
    mutedScale: clampNumber(record.mutedScale, UI_THEME_NUMERIC.mutedScale),
    textColor: sanitizeColor(record.textColor, UI_THEME_DEFAULTS.textColor),
    textMutedColor: sanitizeColor(record.textMutedColor, UI_THEME_DEFAULTS.textMutedColor),
    iconSize: clampNumber(record.iconSize, UI_THEME_NUMERIC.iconSize),
    iconColor:
      record.iconColor === undefined || record.iconColor === ''
        ? UI_THEME_DEFAULTS.iconColor
        : sanitizeColor(record.iconColor, '#565e6b'),
    icons,
    cardBorder:
      typeof record.cardBorder === 'boolean' ? record.cardBorder : UI_THEME_DEFAULTS.cardBorder,
    cardBorderColor: sanitizeColor(record.cardBorderColor, UI_THEME_DEFAULTS.cardBorderColor),
    buttonRadius: clampNumber(record.buttonRadius, UI_THEME_NUMERIC.buttonRadius),
    buttonHeight: clampNumber(record.buttonHeight, UI_THEME_NUMERIC.buttonHeight),
    controlGap: clampNumber(record.controlGap, UI_THEME_NUMERIC.controlGap),
    rowPadding: clampNumber(record.rowPadding, UI_THEME_NUMERIC.rowPadding),
  }
}

function px(value: number): string {
  return `${Math.round(value)}px`
}

/**
 * 主题 → CSS 变量表（全部是 tokens.css 中已有的变量）。
 * 首页、卡片、任务行、按钮与图标都会随这些变量真实变化。
 */
export function uiThemeCssVars(theme: UiTheme): Record<string, string> {
  const iconMd = theme.iconSize
  const gapSmall = Math.max(0, Math.round(theme.cardGap * 0.75))
  const padSmall = Math.max(4, Math.round(theme.cardPadding * 0.75))
  return {
    '--app-max-width':
      theme.contentMaxWidth >= CONTENT_WIDTH_UNLIMITED ? 'none' : px(theme.contentMaxWidth),
    '--home-columns': `minmax(0, ${100 - theme.sidebarRatio}fr) minmax(300px, ${theme.sidebarRatio}fr)`,
    '--card-gap': px(theme.cardGap),
    '--card-gap-sm': px(gapSmall),
    '--card-pad': px(theme.cardPadding),
    '--card-pad-sm': px(padSmall),
    '--card-radius': px(theme.cardRadius),
    '--card-shadow': CARD_SHADOWS[theme.cardShadow] ?? CARD_SHADOWS[1],
    '--card-bg': theme.cardBg,
    '--card-border': theme.cardBorderColor,
    '--color-surface': theme.cardBg,
    '--page-bg': theme.pageBg,
    '--color-bg': theme.pageBg,
    '--color-text': theme.textColor,
    '--color-text-muted': theme.textMutedColor,
    '--color-border': theme.cardBorderColor,
    '--font-size-base': px(BASE_FONT_SIZES.base * theme.fontScale * theme.bodyScale),
    '--font-size-sm': px(BASE_FONT_SIZES.sm * theme.fontScale * theme.bodyScale),
    '--font-size-xs': px(BASE_FONT_SIZES.xs * theme.fontScale * theme.mutedScale),
    '--font-size-md': px(BASE_FONT_SIZES.md * theme.fontScale * theme.cardTitleScale),
    '--font-size-lg': px(BASE_FONT_SIZES.lg * theme.fontScale * theme.titleScale),
    '--font-size-xl': px(BASE_FONT_SIZES.xl * theme.fontScale * theme.titleScale),
    /* 图标 */
    '--icon-size-md': px(iconMd),
    '--icon-size-sm': px(Math.max(10, Math.round(iconMd * 0.875))),
    '--icon-size-lg': px(Math.round(iconMd * 1.25)),
    '--icon-color': theme.iconColor === '' ? 'currentColor' : theme.iconColor,
    /* 卡片与控件 */
    '--card-border-width': theme.cardBorder ? '1px' : '0px',
    '--button-radius': px(theme.buttonRadius),
    '--button-height': px(theme.buttonHeight),
    '--control-gap': px(theme.controlGap),
    '--row-pad': `${theme.rowPadding + 2}px 10px`,
    '--row-pad-sm': `${theme.rowPadding}px 6px`,
  }
}

