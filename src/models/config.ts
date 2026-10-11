/**
 * 应用配置模型（阶段二）：考试倒计时 + 科目学习轮次预计完成日期。
 *
 * 与任务数据严格区分：
 * - 这里是**配置**（日期 / 名称 / 轮次计划），不参与任何任务的字段；
 * - 任务的 startTime / endTime 是任务自身的时间，**不是**预计完成时间；
 *   轮次预计完成日期只用于倒计时展示，绝不回写任务。
 *
 * 纯函数可单测：sanitizeConfig 对任何脏数据都不抛异常。
 */
import type { SubjectId } from './types'
import { isDateKey } from '../utils/date'

/** 科目学习轮次：名字 + 预计完成日期（日期可留空 = 未设置） */
export interface SubjectRound {
  id: string
  subjectId: SubjectId
  /** 轮次名称，如「第一轮」「强化」 */
  name: string
  /** 预计完成日期 YYYY-MM-DD；null = 未设置 */
  dueDate: string | null
}

export interface AppConfig {
  /** 考试名称，用于倒计时标题 */
  examName: string
  /** 考试日期 YYYY-MM-DD；null = 未设置（界面显示设置入口，绝不写死日期） */
  examDate: string | null
  /** 各科目轮次计划（顺序即展示顺序） */
  rounds: SubjectRound[]
}

export const DEFAULT_CONFIG: AppConfig = {
  examName: '考研初试',
  examDate: null,
  rounds: [],
}

function sanitizeRound(value: unknown): SubjectRound | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id === '') return null
  if (typeof record.subjectId !== 'string' || record.subjectId === '') return null
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const dueDate = isDateKey(record.dueDate) ? record.dueDate : null
  return { id: record.id, subjectId: record.subjectId, name: name === '' ? '本轮' : name, dueDate }
}

/** 归一化配置：丢弃非法轮次、非法日期；缺失字段回落到默认值 */
export function sanitizeConfig(value: unknown): AppConfig {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_CONFIG, rounds: [] }
  const record = value as Record<string, unknown>
  const examName =
    typeof record.examName === 'string' && record.examName.trim() !== ''
      ? record.examName.trim()
      : DEFAULT_CONFIG.examName
  // 只接受真实存在的日期（如 2026-13-01 视为非法），绝不在代码里写死日期
  const examDate = isDateKey(record.examDate) ? record.examDate : null
  const rounds: SubjectRound[] = []
  if (Array.isArray(record.rounds)) {
    for (const item of record.rounds) {
      const round = sanitizeRound(item)
      if (round !== null) rounds.push(round)
    }
  }
  return { examName, examDate, rounds }
}

/** 某个科目的轮次计划（保持配置中的顺序） */
export function roundsOfSubject(config: AppConfig, subjectId: SubjectId): SubjectRound[] {
  return config.rounds.filter((round) => round.subjectId === subjectId)
}
