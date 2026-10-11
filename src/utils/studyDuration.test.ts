import { describe, expect, it } from 'vitest'
import type { Task } from '../models/types'
import { formatDuration, formatDurationCompact, summarizeDayDuration } from './studyDuration'

function task(startTime: string | null, endTime: string | null, overrides: Partial<Task> = {}): Task {
  return {
    id: Math.random().toString(36).slice(2),
    date: '2026-10-10',
    subjectId: 'math',
    subtaskId: null,
    startTime,
    endTime,
    content: '任务',
    done: false,
    ...overrides,
  }
}

describe('summarizeDayDuration', () => {
  it('单个任务：09:00–10:30 → 90 分钟，无重叠', () => {
    const summary = summarizeDayDuration([task('09:00', '10:30')])
    expect(summary.plannedMinutes).toBe(90)
    expect(summary.scheduledMinutes).toBe(90)
    expect(summary.overlapMinutes).toBe(0)
    expect(summary.timedTaskCount).toBe(1)
    expect(summary.untimedTaskCount).toBe(0)
  })

  it('多个不重叠任务：总时长等于各自之和', () => {
    const summary = summarizeDayDuration([
      task('09:00', '10:00'), // 60
      task('10:00', '11:00'), // 60（相接）
      task('14:00', '15:30'), // 90
    ])
    expect(summary.plannedMinutes).toBe(210)
    expect(summary.scheduledMinutes).toBe(210)
    expect(summary.overlapMinutes).toBe(0)
  })

  it('重叠时间按并集计算，不重复累计', () => {
    const summary = summarizeDayDuration([
      task('09:00', '10:30'), // 90
      task('10:00', '11:00'), // 60，与上一个重叠 30
    ])
    // 并集 09:00–11:00 = 120，而不是 150
    expect(summary.plannedMinutes).toBe(120)
    expect(summary.scheduledMinutes).toBe(150)
    expect(summary.overlapMinutes).toBe(30)
  })

  it('完全包含的重叠也只计一次', () => {
    const summary = summarizeDayDuration([task('09:00', '12:00'), task('10:00', '11:00')])
    expect(summary.plannedMinutes).toBe(180)
    expect(summary.scheduledMinutes).toBe(240)
    expect(summary.overlapMinutes).toBe(60)
  })

  it('多个互相重叠的区间（三重叠）', () => {
    const summary = summarizeDayDuration([
      task('09:00', '10:00'),
      task('09:30', '10:30'),
      task('10:00', '11:00'),
    ])
    // 并集 09:00–11:00 = 120；之和 = 60+60+60 = 180 → 重叠 60
    expect(summary.plannedMinutes).toBe(120)
    expect(summary.scheduledMinutes).toBe(180)
    expect(summary.overlapMinutes).toBe(60)
  })

  it('无合法时间的旧任务不计入时长，只计数', () => {
    const summary = summarizeDayDuration([task('09:00', '10:00'), task(null, null), task('11:00', null)])
    expect(summary.plannedMinutes).toBe(60)
    expect(summary.timedTaskCount).toBe(1)
    expect(summary.untimedTaskCount).toBe(2)
  })

  it('完成状态不影响计划时长（同数据不同 done 结果一致）', () => {
    const base = [task('09:00', '10:00'), task('10:30', '11:30')]
    const undone = summarizeDayDuration(base.map((item) => ({ ...item, done: false })))
    const done = summarizeDayDuration(base.map((item) => ({ ...item, done: true })))
    expect(done.plannedMinutes).toBe(undone.plannedMinutes)
    expect(done.scheduledMinutes).toBe(undone.scheduledMinutes)
    expect(done.overlapMinutes).toBe(undone.overlapMinutes)
  })

  it('无任务时为 0，不抛错', () => {
    const summary = summarizeDayDuration([])
    expect(summary).toEqual({
      plannedMinutes: 0,
      scheduledMinutes: 0,
      overlapMinutes: 0,
      timedTaskCount: 0,
      untimedTaskCount: 0,
    })
  })
})

describe('formatDuration / formatDurationCompact', () => {
  it('可读格式', () => {
    expect(formatDuration(0)).toBe('0 分钟')
    expect(formatDuration(90)).toBe('1 小时 30 分钟')
    expect(formatDuration(180)).toBe('3 小时')
    expect(formatDuration(45)).toBe('45 分钟')
  })

  it('紧凑格式', () => {
    expect(formatDurationCompact(0)).toBe('0m')
    expect(formatDurationCompact(45)).toBe('45m')
    expect(formatDurationCompact(180)).toBe('3h')
    expect(formatDurationCompact(210)).toBe('3h30m')
  })
})
