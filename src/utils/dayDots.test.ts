import { describe, expect, it } from 'vitest'
import type { Task } from '../models/types'
import { MAX_SUBJECT_DOTS, subjectDotsOf } from './dayDots'

/**
 * 紧凑日期选择器的圆点计算（纯函数）：
 * 同一科目合并、全部完成才算 done、超过上限只保留前 N 个并给出 overflow。
 */

const COLORS: Record<string, string> = {
  math: '#111111',
  english: '#222222',
  comm: '#333333',
  physics: '#444444',
  cs: '#555555',
}

function colorOf(subjectId: string): string {
  return COLORS[subjectId] ?? '#999999'
}

function task(subjectId: string, done = false, id = `${subjectId}-${Math.random()}`): Task {
  return {
    id,
    date: '2026-10-10',
    subjectId,
    subtaskId: null,
    startTime: '09:00',
    endTime: '10:00',
    content: `${subjectId} 任务`,
    done,
  }
}

describe('subjectDotsOf：按科目去重的任务圆点', () => {
  it('没有任务时不产生任何圆点', () => {
    expect(subjectDotsOf([], colorOf)).toEqual({ dots: [], overflow: 0 })
  })

  it('同一科目的多个任务合并为一个圆点，颜色取科目主题色', () => {
    const result = subjectDotsOf([task('math', false, 'a'), task('math', false, 'b')], colorOf)
    expect(result.dots).toHaveLength(1)
    expect(result.dots[0]).toEqual({ subjectId: 'math', color: '#111111', done: false })
    expect(result.overflow).toBe(0)
  })

  it('不同科目各占一个圆点，顺序与传入任务顺序一致（渲染稳定）', () => {
    const result = subjectDotsOf(
      [task('english', false, 'a'), task('math', false, 'b'), task('english', false, 'c')],
      colorOf,
    )
    expect(result.dots.map((dot) => dot.subjectId)).toEqual(['english', 'math'])
    expect(result.dots.map((dot) => dot.color)).toEqual(['#222222', '#111111'])
  })

  it('该科目当天任务全部完成才标记 done；只要有一个未完成就不淡化', () => {
    const allDone = subjectDotsOf([task('math', true, 'a'), task('math', true, 'b')], colorOf)
    expect(allDone.dots[0]?.done).toBe(true)

    const partlyDone = subjectDotsOf([task('math', true, 'a'), task('math', false, 'b')], colorOf)
    expect(partlyDone.dots[0]?.done).toBe(false)

    // 顺序反过来同样成立（先遇到未完成的任务）
    const reversed = subjectDotsOf([task('math', false, 'a'), task('math', true, 'b')], colorOf)
    expect(reversed.dots[0]?.done).toBe(false)
  })

  it('科目数超过上限时只保留前 N 个，其余计入 overflow（界面显示 +N）', () => {
    const result = subjectDotsOf(
      ['math', 'english', 'comm', 'physics', 'cs'].map((id, index) => task(id, false, `t${index}`)),
      colorOf,
    )
    expect(result.dots).toHaveLength(MAX_SUBJECT_DOTS)
    expect(result.dots.map((dot) => dot.subjectId)).toEqual(['math', 'english', 'comm'])
    expect(result.overflow).toBe(2)
  })

  it('科目数正好等于上限时没有 overflow', () => {
    const result = subjectDotsOf(
      ['math', 'english', 'comm'].map((id, index) => task(id, false, `t${index}`)),
      colorOf,
    )
    expect(result.dots).toHaveLength(MAX_SUBJECT_DOTS)
    expect(result.overflow).toBe(0)
  })

  it('不修改传入的任务对象（只读计算，不影响完成状态与数据）', () => {
    const tasks = [task('math', true, 'a'), task('math', false, 'b')]
    const snapshot = JSON.stringify(tasks)
    subjectDotsOf(tasks, colorOf)
    expect(JSON.stringify(tasks)).toBe(snapshot)
  })
})
