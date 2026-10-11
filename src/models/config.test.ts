import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, roundsOfSubject, sanitizeConfig } from './config'

describe('配置模型（考试倒计时 / 科目轮次）', () => {
  it('空配置 / 脏数据回落到默认值', () => {
    expect(sanitizeConfig(null)).toEqual({ examName: '考研初试', examDate: null, rounds: [] })
    expect(sanitizeConfig('oops')).toEqual(DEFAULT_CONFIG)
    expect(sanitizeConfig([])).toEqual(DEFAULT_CONFIG)
  })

  it('保留合法的考试名称与日期', () => {
    const config = sanitizeConfig({ examName: ' 考研初试 ', examDate: '2026-12-19', rounds: [] })
    expect(config.examName).toBe('考研初试')
    expect(config.examDate).toBe('2026-12-19')
  })

  it('非法考试日期归一为 null（不写死日期）', () => {
    expect(sanitizeConfig({ examDate: '2026-13-01' }).examDate).toBeNull()
    expect(sanitizeConfig({ examDate: 12345 }).examDate).toBeNull()
  })

  it('丢弃非法轮次，保留合法轮次并补齐名称', () => {
    const config = sanitizeConfig({
      rounds: [
        { id: 'r1', subjectId: 'math', name: '第一轮', dueDate: '2026-11-01' },
        { id: 'r2', subjectId: 'english', name: '   ', dueDate: 'bad-date' },
        { id: '', subjectId: 'math', name: '无 ID', dueDate: null },
        { id: 'r4', subjectId: '', name: '无科目', dueDate: null },
        'oops',
      ],
    })
    expect(config.rounds).toEqual([
      { id: 'r1', subjectId: 'math', name: '第一轮', dueDate: '2026-11-01' },
      { id: 'r2', subjectId: 'english', name: '本轮', dueDate: null },
    ])
  })

  it('roundsOfSubject 只取该科目的轮次并保持顺序', () => {
    const config = sanitizeConfig({
      rounds: [
        { id: 'a', subjectId: 'math', name: '一轮', dueDate: null },
        { id: 'b', subjectId: 'english', name: '一轮', dueDate: null },
        { id: 'c', subjectId: 'math', name: '二轮', dueDate: null },
      ],
    })
    expect(roundsOfSubject(config, 'math').map((round) => round.id)).toEqual(['a', 'c'])
    expect(roundsOfSubject(config, 'comm')).toEqual([])
  })
})
