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
