import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../services/storage'
import { addDaysKey, todayKey } from '../utils/date'
import {
  addRound,
  config,
  examCountdown,
  initSettings,
  removeRound,
  removeRoundsOfSubject,
  replaceConfig,
  roundCountdowns,
  setExamDate,
  setExamName,
  updateRound,
} from './settings'

function fakeLocalStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    get length() {
      return store.size
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
  }
}

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: fakeLocalStorage() })
  initSettings()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('配置 store（考试倒计时 / 科目轮次）', () => {
  it('默认不写死考试日期，倒计时为空（界面显示设置入口）', () => {
    expect(config.value.examName).toBe('考研初试')
    expect(config.value.examDate).toBeNull()
    expect(examCountdown.value).toBeNull()
    expect(loadConfig().examDate).toBeNull()
  })

  it('设置考试名称与日期后立即计算倒计时并持久化', () => {
    setExamName('考研初试')
    const target = addDaysKey(todayKey(), 30)
    setExamDate(target)

    expect(examCountdown.value?.daysRemaining).toBe(30)
    expect(examCountdown.value?.targetDate).toBe(target)
    expect(loadConfig().examDate).toBe(target)

    setExamDate(null)
    expect(examCountdown.value).toBeNull()
    expect(loadConfig().examDate).toBeNull()
  })

  it('空白考试名称回落默认值，非法日期不写入', () => {
    setExamName('   ')
    expect(config.value.examName).toBe('考研初试')
    setExamDate('2026-99-99')
    expect(config.value.examDate).toBeNull()
  })

  it('轮次：新增 / 修改 / 删除，并计算剩余天数（未设置日期为 null）', () => {
    const round = addRound({
      subjectId: 'math',
      name: '第一轮',
      dueDate: addDaysKey(todayKey(), 10),
    })
    expect(roundCountdowns.value).toHaveLength(1)
    expect(roundCountdowns.value[0].daysRemaining).toBe(10)
    expect(loadConfig().rounds).toHaveLength(1)

    updateRound(round.id, { name: '强化', dueDate: null })
    expect(roundCountdowns.value[0].name).toBe('强化')
    expect(roundCountdowns.value[0].dueDate).toBeNull()
    expect(roundCountdowns.value[0].daysRemaining).toBeNull()
    expect(roundCountdowns.value[0].label).toBeNull()

    updateRound(round.id, { subjectId: 'english' })
    expect(roundCountdowns.value[0].subjectId).toBe('english')

    removeRound(round.id)
    expect(config.value.rounds).toEqual([])
    expect(loadConfig().rounds).toEqual([])
  })

  it('删除科目时清理该科目的轮次计划', () => {
    addRound({ subjectId: 'math', name: '一轮', dueDate: null })
    addRound({ subjectId: 'english', name: '一轮', dueDate: null })
    removeRoundsOfSubject('math')
    expect(config.value.rounds.map((round) => round.subjectId)).toEqual(['english'])
  })

  it('replaceConfig 供备份恢复使用并立即持久化', () => {
    replaceConfig({
      examName: '考研',
      examDate: '2026-12-19',
      rounds: [{ id: 'r1', subjectId: 'math', name: '一轮', dueDate: '2026-11-01' }],
    })
    expect(config.value.examName).toBe('考研')
    expect(roundCountdowns.value[0].dueDate).toBe('2026-11-01')
    expect(loadConfig().rounds).toHaveLength(1)
  })
})
