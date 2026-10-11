/**
 * 默认科目 / 子任务标签配置。
 * 与用户运行时数据分离：仅在首次初始化（对应键不存在）时写入 localStorage，
 * 之后用户可自由增删改，绝不回写覆盖。
 * 主题色刻意避开绿色——绿色在整个应用中专属于“当天任务全部完成”状态。
 */
import type { Subject, Subtask } from './types'

export const DEFAULT_SUBJECTS: readonly Subject[] = [
  { id: 'math', name: '数学', color: '#c15f5c' },
  { id: 'english', name: '英语', color: '#4059a8' },
  { id: 'comm', name: '通信原理', color: '#c0914e' },
]

export const DEFAULT_SUBTASKS: readonly Subtask[] = [
  { id: 'sub-math-1', subjectId: 'math', name: '学习' },
  { id: 'sub-math-2', subjectId: 'math', name: '复盘' },
  { id: 'sub-math-3', subjectId: 'math', name: '习题' },
  { id: 'sub-eng-1', subjectId: 'english', name: '单词' },
  { id: 'sub-eng-2', subjectId: 'english', name: '语法' },
  { id: 'sub-eng-3', subjectId: 'english', name: '阅读' },
  { id: 'sub-comm-1', subjectId: 'comm', name: '学习' },
  { id: 'sub-comm-2', subjectId: 'comm', name: '推导' },
  { id: 'sub-comm-3', subjectId: 'comm', name: '真题' },
]

/**
 * 科目主题色固定色板（新增 / 改色只能从这里选，不再使用系统调色盘）。
 *
 * 设计约定：
 * - 都是中等明度、低饱和度的颜色：浅色背景下作色点 / 边框 / 文字都清晰可辨；
 * - 刻意避开绿色（绿色在整个应用中专属于“当天任务全部完成”状态），
 *   并与休息日蓝、缓冲日青保持区分；
 * - 颜色值是唯一来源：周视图 / 月视图 / 任务列表 / 科目筛选按钮都读取科目自身的 color，
 *   因此换色板只需改本文件。
 * - 兼容性：色板只约束**界面可选范围**，既不校验也不改写已有数据 ——
 *   历史自定义色的科目照常读取与显示（见 SubjectManagerModal 的「当前（自定义）」色块），
 *   不会因为换色板而丢数据或报错。
 */
export interface SubjectColorPreset {
  /** 展示名（只出现在 title / aria-label，界面不显示 HEX / RGB） */
  name: string
  color: string
}

export const SUBJECT_COLOR_PRESETS: readonly SubjectColorPreset[] = [
  { name: '朱红', color: '#c15f5c' },
  { name: '赭金', color: '#c0914e' },
  { name: '棕褐', color: '#8a6242' },
  { name: '玫紫', color: '#b3577f' },
  { name: '紫罗兰', color: '#7a5ea8' },
  { name: '靛蓝', color: '#4059a8' },
  { name: '青蓝', color: '#4a7c94' },
  { name: '石墨', color: '#5c6b7a' },
  { name: '墨黑', color: '#3a3f45' },
]

/** 新科目的默认颜色（固定色板的第一个颜色） */
export const DEFAULT_SUBJECT_COLOR = SUBJECT_COLOR_PRESETS[0].color

/** 颜色是否属于固定色板；仅用于界面高亮判断，不做任何数据校验 */
export function isPresetSubjectColor(color: string): boolean {
  const target = color.toLowerCase()
  return SUBJECT_COLOR_PRESETS.some((preset) => preset.color === target)
}

/**
 * 颜色是否偏暗（按 sRGB 加权亮度判断）。
 * 供色板的选中勾选标记选择前景色：暗色块用白勾、亮色块用深勾，保证对比度。
 * 非法输入按「偏暗」处理（白勾在任何底色上都比深勾安全）。纯函数，可单测。
 */
export function isDarkSubjectColor(color: string): boolean {
  const match = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(color)
  if (match === null) return true
  const luminance = (0.299 * parseInt(match[1], 16) + 0.587 * parseInt(match[2], 16) + 0.114 * parseInt(match[3], 16)) / 255
  return luminance < 0.62
}

/** 去除首尾空格 */
export function normalizeName(raw: string): string {
  return raw.trim()
}

/**
 * 重名检测：忽略大小写与首尾空格。
 * excludeId 用于编辑场景排除自身。
 */
export function isDuplicateName(
  items: readonly { id: string; name: string }[],
  rawName: string,
  excludeId?: string,
): boolean {
  const target = normalizeName(rawName).toLowerCase()
  return items.some((item) => item.id !== excludeId && normalizeName(item.name).toLowerCase() === target)
}

/** #rrggbb 十六进制颜色校验（原生 color 输入器产出格式） */
export function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
}
