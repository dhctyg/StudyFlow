import { describe, expect, it } from 'vitest'
import {
  intervalsOverlap,
  isEndTimeAfterStart,
  isValidTime,
  mergeIntervals,
  minutesToTime,
  taskDurationMinutes,
  taskInterval,
  timeToMinutes,
  unionDurationMinutes,
} from './time'

describe('isValidTime / timeToMinutes / minutesToTime', () => {
  it('接受合法 HH:mm，拒绝越界与错误格式', () => {
    expect(isValidTime('09:00')).toBe(true)
    expect(isValidTime('23:59')).toBe(true)
    expect(isValidTime('00:00')).toBe(true)
    expect(isValidTime('24:00')).toBe(false)
    expect(isValidTime('9:00')).toBe(false)
    expect(isValidTime('09:60')).toBe(false)
    expect(isValidTime('')).toBe(false)
    expect(isValidTime(null)).toBe(false)
    expect(isValidTime(undefined)).toBe(false)
  })

  it('时间与分钟数互转正确', () => {
    expect(timeToMinutes('09:30')).toBe(570)
    expect(timeToMinutes('00:00')).toBe(0)
    expect(timeToMinutes('23:59')).toBe(1439)
    expect(timeToMinutes('bad')).toBeNull()
    expect(minutesToTime(570)).toBe('09:30')
    expect(minutesToTime(0)).toBe('00:00')
  })
})

describe('taskInterval / taskDurationMinutes', () => {
  it('正常区间与时长', () => {
    expect(taskInterval({ startTime: '09:00', endTime: '10:30' })).toEqual({ start: 540, end: 630 })
    expect(taskDurationMinutes({ startTime: '09:00', endTime: '10:30' })).toBe(90)
  })

  it('缺时间（阶段一旧任务）返回 null，不抛错', () => {
    expect(taskInterval({ startTime: null, endTime: null })).toBeNull()
    expect(taskDurationMinutes({ startTime: null, endTime: null })).toBeNull()
    expect(taskDurationMinutes({ startTime: '09:00', endTime: null })).toBeNull()
  })

  it('结束不晚于开始视为无效（不支持跨午夜）', () => {
    expect(taskInterval({ startTime: '10:00', endTime: '10:00' })).toBeNull()
    expect(taskInterval({ startTime: '10:00', endTime: '09:00' })).toBeNull()
    expect(isEndTimeAfterStart('10:00', '11:00')).toBe(true)
    expect(isEndTimeAfterStart('10:00', '10:00')).toBe(false)
    expect(isEndTimeAfterStart('10:00', '09:00')).toBe(false)
  })
})

describe('mergeIntervals / unionDurationMinutes', () => {
  it('并集合并重叠区间', () => {
    expect(unionDurationMinutes([{ start: 540, end: 630 }])).toBe(90)
    expect(
      unionDurationMinutes([
        { start: 540, end: 600 },
        { start: 600, end: 660 },
      ]),
    ).toBe(120) // 相接 → 合并
    expect(
      unionDurationMinutes([
        { start: 540, end: 600 },
        { start: 570, end: 630 },
      ]),
    ).toBe(90) // 重叠 30 分钟只计一次
  })

  it('包含关系与乱序输入', () => {
    expect(
      mergeIntervals([
        { start: 600, end: 700 },
        { start: 540, end: 620 },
      ]),
    ).toEqual([{ start: 540, end: 700 }])
  })

  it('空输入返回 0', () => {
    expect(unionDurationMinutes([])).toBe(0)
  })
})

describe('intervalsOverlap', () => {
  it('边界相接不算冲突', () => {
    expect(intervalsOverlap({ start: 540, end: 600 }, { start: 600, end: 660 })).toBe(false)
  })

  it('真实重叠与包含都算冲突', () => {
    expect(intervalsOverlap({ start: 540, end: 610 }, { start: 600, end: 660 })).toBe(true)
    expect(intervalsOverlap({ start: 540, end: 700 }, { start: 600, end: 660 })).toBe(true)
    expect(intervalsOverlap({ start: 600, end: 660 }, { start: 540, end: 700 })).toBe(true)
  })
})
