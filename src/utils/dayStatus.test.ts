import { describe, expect, it } from 'vitest'
import type { Task } from '../models/types'
import { dayStatusOf } from './dayStatus'

function task(done: boolean, overrides: Partial<Task> = {}): Task {
  return {
    id: Math.random().toString(36).slice(2),
    date: '2026-10-10',
    subjectId: 'math',
    subtaskId: null,
    startTime: '09:00',
    endTime: '10:00',
    content: '任务',
    done,
    ...overrides,
  }
}

describe('dayStatusOf', () => {
  it('无任务 → none（空日期永远不算完成，即使它是休息日）', () => {
    expect(dayStatusOf([])).toBe('none')
  })

  it('存在未完成任务 → pending', () => {
    expect(dayStatusOf([task(false), task(true)])).toBe('pending')
    expect(dayStatusOf([task(false)])).toBe('pending')
  })

  it('至少一个任务且全部完成 → completed', () => {
    expect(dayStatusOf([task(true)])).toBe('completed')
    expect(dayStatusOf([task(true), task(true)])).toBe('completed')
  })

  it('删除任务后重新计算：只剩已完成 → completed；删光 → none', () => {
    const tasks = [task(true), task(false)]
    expect(dayStatusOf(tasks)).toBe('pending')
    expect(dayStatusOf(tasks.filter((t) => t.done))).toBe('completed')
    expect(dayStatusOf(tasks.filter((t) => t.id !== t.id))).toBe('none')
  })
})
