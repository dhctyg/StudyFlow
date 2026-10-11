import { describe, expect, it } from 'vitest'
import type { Task } from '../models/types'
import {
  isOverdueTask,
  isTodayTask,
  isUnscheduledTask,
  partitionTasks,
  pickBufferDate,
  taskDateKey,
} from './taskGroups'

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    date: '2026-10-10',
    subjectId: 'math',
    subtaskId: null,
    startTime: '09:00',
    endTime: '10:00',
    content: '任务',
    done: false,
    ...overrides,
  }
}

describe('三类任务分组（纯函数）', () => {
  it('当日安排：安排日期为今天且未完成', () => {
    expect(isTodayTask(task(), '2026-10-10')).toBe(true)
    expect(isTodayTask(task({ done: true }), '2026-10-10')).toBe(false)
    expect(isTodayTask(task({ date: '2026-10-09' }), '2026-10-10')).toBe(false)
  })

  it('逾期：早于今天且未完成；已完成 / 未安排日期不算逾期', () => {
    expect(isOverdueTask(task({ date: '2026-10-09' }), '2026-10-10')).toBe(true)
    expect(isOverdueTask(task({ date: '2026-10-10' }), '2026-10-10')).toBe(false)
    expect(isOverdueTask(task({ date: '2026-10-11' }), '2026-10-10')).toBe(false)
    expect(isOverdueTask(task({ date: '2026-10-09', done: true }), '2026-10-10')).toBe(false)
    expect(isOverdueTask(task({ date: null }), '2026-10-10')).toBe(false)
  })

  it('分组：今日 / 逾期（按日期升序）/ 临时任务箱，已完成不进入逾期与任务箱', () => {
    const groups = partitionTasks(
      [
        task({ id: 'today-1', date: '2026-10-10' }),
        task({ id: 'overdue-old', date: '2026-09-01' }),
        task({ id: 'overdue-new', date: '2026-10-09' }),
        task({ id: 'box-1', date: null }),
        task({ id: 'done-today', date: '2026-10-10', done: true }),
        task({ id: 'done-box', date: null, done: true }),
        task({ id: 'future', date: '2026-10-20' }),
      ],
      '2026-10-10',
    )
    expect(groups.today.map((item) => item.id)).toEqual(['today-1'])
    expect(groups.overdue.map((item) => item.id)).toEqual(['overdue-old', 'overdue-new'])
    expect(groups.unscheduled.map((item) => item.id)).toEqual(['box-1'])
  })

  it('分组只读：不修改传入任务，也不生成副本', () => {
    const list = [
      task({ id: 'today-1', date: '2026-10-10' }),
      task({ id: 'overdue', date: '2026-09-01' }),
    ]
    const snapshot = list.map((item) => ({ ...item }))
    const groups = partitionTasks(list, '2026-10-10')
    expect(list).toEqual(snapshot)
    expect(groups.overdue[0]).toBe(list[1]) // 同一份原始记录的引用
  })

  it('未安排日期判断', () => {
    expect(isUnscheduledTask(task({ date: null }))).toBe(true)
    expect(isUnscheduledTask(task())).toBe(false)
  })
})

describe('日期归一化后的一致性（面板与日历同源）', () => {
  const today = '2026-10-11'

  it('带时间的 ISO 日期按归一化结果参与「今天 / 逾期」判定', () => {
    expect(isTodayTask(task({ date: '2026-10-11T00:00:00.000Z' }), today)).toBe(true)
    expect(isOverdueTask(task({ date: '2026-10-05T00:00:00.000Z' }), today)).toBe(true)
    expect(isOverdueTask(task({ date: '2026-10-12T00:00:00.000Z' }), today)).toBe(false)
    expect(isUnscheduledTask(task({ date: '2026/10/5' }))).toBe(false)
  })

  it('taskDateKey 与日历按天索引使用同一套归一化结果', () => {
    expect(taskDateKey(task({ date: '2026/10/5' }))).toBe('2026-10-05')
    expect(taskDateKey(task({ date: '2026-10-05T09:30' }))).toBe('2026-10-05')
    expect(taskDateKey(task({ date: '2026-10-05' }))).toBe('2026-10-05')
    expect(taskDateKey(task({ date: null }))).toBeNull()
    expect(taskDateKey(task({ date: 'not-a-date' }))).toBeNull()
  })

  it('分组的逾期判定与日历可见日期一致（不会只在面板看到）', () => {
    const groups = partitionTasks([task({ id: 'iso', date: '2026-10-05T00:00:00.000Z' })], today)
    expect(groups.overdue.map((item) => item.id)).toEqual(['iso'])
    expect(groups.today).toHaveLength(0)
    expect(taskDateKey(groups.overdue[0])).toBe('2026-10-05')
  })
})

describe('缓冲日挑选（纯函数）', () => {
  const today = '2026-10-10'

  it('优先今天及之后最近的缓冲日', () => {
    expect(pickBufferDate({ today, bufferDates: ['2026-10-20', '2026-10-12', '2026-10-05'] })).toBe(
      '2026-10-12',
    )
    expect(pickBufferDate({ today, bufferDates: ['2026-10-10'] })).toBe('2026-10-10')
  })

  it('没有未来缓冲日时回退到最近的历史缓冲日', () => {
    expect(pickBufferDate({ today, bufferDates: ['2026-10-01', '2026-10-05'] })).toBe('2026-10-05')
  })

  it('排除任务当前所在日期，避免原地移动', () => {
    expect(
      pickBufferDate({
        today,
        bufferDates: ['2026-10-12', '2026-10-14'],
        excludeDate: '2026-10-12',
      }),
    ).toBe('2026-10-14')
  })

  it('没有可用缓冲日返回 null（由界面提示用户先创建）', () => {
    expect(pickBufferDate({ today, bufferDates: [] })).toBeNull()
    expect(
      pickBufferDate({ today, bufferDates: ['2026-10-12'], excludeDate: '2026-10-12' }),
    ).toBeNull()
  })
})
