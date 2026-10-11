/**
 * 配置 store（模块级响应式，与 schedule store 同一套约定，不引入 Pinia）。
 * 架构：UI → store → storage → localStorage。
 *
 * 只管理**配置**：考试名称 / 考试日期 / 科目学习轮次预计完成日期。
 * 与任务数据完全分离：这里的日期用于倒计时展示，绝不写入任务，也不参与任务时长统计。
 */
import { computed, reactive } from 'vue'
import type { AppConfig, SubjectRound } from '../models/config'
import { DEFAULT_CONFIG } from '../models/config'
import type { SubjectId } from '../models/types'
import * as storage from '../services/storage'
import { isDateKey, todayKey } from '../utils/date'
import { buildCountdown, type Countdown } from '../utils/examCountdown'
import { generateId } from '../utils/id'

interface SettingsState {
  config: AppConfig
}

const state = reactive<SettingsState>({ config: { ...DEFAULT_CONFIG, rounds: [] } })

/** 初始化：读取本地配置（无配置时回落到默认值，不写死任何日期）。 */
export function initSettings(): void {
  state.config = storage.loadConfig()
}

export const config = computed(() => state.config)
export const examName = computed(() => state.config.examName)
export const examDate = computed(() => state.config.examDate)

/** 考试倒计时；未设置 / 非法日期返回 null（界面显示设置入口） */
export const examCountdown = computed<Countdown | null>(() =>
  buildCountdown(state.config.examDate, todayKey()),
)

/** 轮次 + 剩余天数（未设置日期的轮次 daysRemaining = null） */
export interface RoundCountdown extends SubjectRound {
  daysRemaining: number | null
  label: string | null
}

export const roundCountdowns = computed<RoundCountdown[]>(() => {
  const today = todayKey()
  return state.config.rounds.map((round) => {
    const countdown = buildCountdown(round.dueDate, today)
    return {
      ...round,
      daysRemaining: countdown === null ? null : countdown.daysRemaining,
      label: countdown === null ? null : countdown.label,
    }
  })
})

function persist(): void {
  storage.saveConfig(state.config)
}

export function setExamName(name: string): void {
  const trimmed = name.trim()
  state.config = { ...state.config, examName: trimmed === '' ? DEFAULT_CONFIG.examName : trimmed }
  persist()
}

export function setExamDate(dateKey: string | null): void {
  const next = dateKey !== null && isDateKey(dateKey) ? dateKey : null
  state.config = { ...state.config, examDate: next }
  persist()
}

export function addRound(input: {
  subjectId: SubjectId
  name: string
  dueDate: string | null
}): SubjectRound {
  const round: SubjectRound = {
    id: generateId(),
    subjectId: input.subjectId,
    name: input.name.trim() === '' ? '本轮' : input.name.trim(),
    dueDate: input.dueDate !== null && isDateKey(input.dueDate) ? input.dueDate : null,
  }
  state.config = { ...state.config, rounds: [...state.config.rounds, round] }
  persist()
  return round
}

export function updateRound(
  id: string,
  patch: { subjectId?: SubjectId; name?: string; dueDate?: string | null },
): void {
  if (!state.config.rounds.some((round) => round.id === id)) return
  state.config = {
    ...state.config,
    rounds: state.config.rounds.map((round) => {
      if (round.id !== id) return round
      const name = patch.name === undefined ? round.name : patch.name.trim() || round.name
      const dueDate =
        patch.dueDate === undefined
          ? round.dueDate
          : patch.dueDate !== null && isDateKey(patch.dueDate)
            ? patch.dueDate
            : null
      return { ...round, subjectId: patch.subjectId ?? round.subjectId, name, dueDate }
    }),
  }
  persist()
}

export function removeRound(id: string): void {
  if (!state.config.rounds.some((round) => round.id === id)) return
  state.config = { ...state.config, rounds: state.config.rounds.filter((round) => round.id !== id) }
  persist()
}

/** 整份替换配置（JSON 备份恢复时使用；数据已在服务层校验） */
export function replaceConfig(next: AppConfig): void {
  state.config = next
  persist()
}

/** 删除科目后清理其轮次计划（避免出现指向不存在科目的轮次） */
export function removeRoundsOfSubject(subjectId: SubjectId): void {
  if (!state.config.rounds.some((round) => round.subjectId === subjectId)) return
  state.config = {
    ...state.config,
    rounds: state.config.rounds.filter((round) => round.subjectId !== subjectId),
  }
  persist()
}
