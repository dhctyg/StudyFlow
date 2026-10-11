import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Subject, Subtask, Task } from '../models/types'
import {
  STORAGE_KEYS,
  clearBusinessData,
  initializeData,
  loadConfig,
  loadDayTypes,
  loadRestDays,
  loadSubjects,
  loadSubtasks,
  loadTasks,
  restoreAllData,
  sampleTasks,
  saveDayTypes,
  saveRestDays,
  saveSubjects,
  saveSubtasks,
  saveTasks,
} from './storage'
import { buildBackup } from './backup'

/**
 * storage 层通过 window.localStorage 读写；
 * 测试注入内存版假 localStorage，验证持久化、迁移与容错逻辑。
 */
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

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't-1',
    date: '2026-10-10',
    subjectId: 'math',
    subtaskId: null,
    startTime: '09:00',
    endTime: '10:00',
    content: '高数课后题',
    done: false,
    ...overrides,
  }
}

function subject(overrides: Partial<Subject> = {}): Subject {
  return { id: 'math', name: '数学', color: '#c15f5c', ...overrides }
}

function subtask(overrides: Partial<Subtask> = {}): Subtask {
  return { id: 'sub-1', subjectId: 'math', name: '复盘', ...overrides }
}

/** 预置默认科目 / 标签键，避免 initializeData 影响用例断言 */
function withDefaults(extra: Record<string, string> = {}): Record<string, string> {
  return {
    [STORAGE_KEYS.subjects]: JSON.stringify([subject()]),
    [STORAGE_KEYS.subtasks]: JSON.stringify([subtask()]),
    ...extra,
  }
}

function useStorage(initial: Record<string, string> = {}): void {
  vi.stubGlobal('window', { localStorage: fakeLocalStorage(initial) })
}

beforeEach(() => {
  useStorage()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('任务持久化', () => {
  it('保存后可读回（含时间与标签）', () => {
    useStorage(withDefaults())
    const value = task({ subtaskId: 'sub-1' })
    saveTasks([value])
    expect(loadTasks()).toEqual([value])
  })

  it('从未写入时返回空数组', () => {
    expect(loadTasks()).toEqual([])
  })

  it('损坏的 JSON 按空数据处理，不抛异常', () => {
    useStorage(withDefaults({ [STORAGE_KEYS.tasks]: '{not-json' }))
    expect(loadTasks()).toEqual([])
  })

  it('丢弃单条脏数据，保留其余合法任务', () => {
    useStorage(
      withDefaults({
        [STORAGE_KEYS.tasks]: JSON.stringify([
          task({ id: 'ok' }),
          null,
          'string',
          task({ id: 'bad-date', date: '2026-99-99' }),
          task({ id: 'bad-content', content: '   ' }),
          task({ id: 'bad-done', done: 'yes' as unknown as boolean }),
          { id: 'missing-fields' },
          task({ id: 'ok2', done: true }),
        ]),
      }),
    )
    expect(loadTasks().map((t) => t.id)).toEqual(['ok', 'ok2'])
  })
})

describe('阶段一旧数据兼容（迁移）', () => {
  it('缺少 startTime / endTime / subtaskId 的旧任务仍可读取，新字段归一为 null', () => {
    useStorage(
      withDefaults({
        [STORAGE_KEYS.tasks]: JSON.stringify([
          // 阶段一结构：无 subtaskId / startTime / endTime
          { id: 'legacy-1', date: '2026-10-10', subjectId: 'math', content: '旧任务', done: true },
        ]),
      }),
    )
    const tasks = loadTasks()
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toEqual({
      id: 'legacy-1',
      date: '2026-10-10',
      subjectId: 'math',
      subtaskId: null,
      startTime: null,
      endTime: null,
      content: '旧任务',
      done: true, // 完成状态不丢失
    })
  })

  it('非法时间字段归一为 null，不丢弃任务', () => {
    useStorage(
      withDefaults({
        [STORAGE_KEYS.tasks]: JSON.stringify([
          task({ id: 'bad-time', startTime: '25:00', endTime: 'abc' as unknown as string }),
        ]),
      }),
    )
    const tasks = loadTasks()
    expect(tasks).toHaveLength(1)
    expect(tasks[0].startTime).toBeNull()
    expect(tasks[0].endTime).toBeNull()
  })

  it('孤立标签引用被清空，任务本身保留', () => {
    useStorage(
      withDefaults({
        [STORAGE_KEYS.tasks]: JSON.stringify([task({ id: 'orphan', subtaskId: 'deleted-tag' })]),
      }),
    )
    const tasks = loadTasks()
    expect(tasks).toHaveLength(1)
    expect(tasks[0].subtaskId).toBeNull()
    expect(tasks[0].content).toBe('高数课后题')
  })

  it('引用不存在科目的任务被安全丢弃（不崩溃）', () => {
    useStorage(
      withDefaults({
        [STORAGE_KEYS.tasks]: JSON.stringify([
          task({ id: 'unknown-subject', subjectId: 'ghost' }),
          task({ id: 'valid' }),
        ]),
      }),
    )
    expect(loadTasks().map((t) => t.id)).toEqual(['valid'])
  })
})

describe('科目与子任务标签持久化', () => {
  it('科目保存后读回，非法项被丢弃', () => {
    useStorage({
      [STORAGE_KEYS.subjects]: JSON.stringify([
        subject({ id: 's1' }),
        subject({ id: 's2', color: 'red' }), // 非法颜色
        subject({ id: 's3', name: '   ' }), // 空名称
        null,
        subject({ id: 's4', name: '  英语  ', color: '#4059a8' }),
      ]),
    })
    expect(loadSubjects()).toEqual([
      { id: 's1', name: '数学', color: '#c15f5c' },
      { id: 's4', name: '英语', color: '#4059a8' }, // 名称去除首尾空格
    ])
  })

  it('标签保存后读回；所属科目不存在的标签被丢弃', () => {
    useStorage({
      [STORAGE_KEYS.subjects]: JSON.stringify([subject()]),
      [STORAGE_KEYS.subtasks]: JSON.stringify([
        subtask({ id: 'sub-1', subjectId: 'math' }),
        subtask({ id: 'sub-2', subjectId: 'ghost' }),
        subtask({ id: 'sub-3', name: '   ' }),
      ]),
    })
    expect(loadSubtasks().map((item) => item.id)).toEqual(['sub-1'])
  })

  it('round-trip：saveSubjects / saveSubtasks 后可原样读回', () => {
    const subjectList: Subject[] = [
      { id: 'a', name: '物理', color: '#123456' },
      { id: 'b', name: '化学', color: '#abcdef' },
    ]
    const subtaskList: Subtask[] = [{ id: 'st-1', subjectId: 'a', name: '实验' }]
    saveSubjects(subjectList)
    saveSubtasks(subtaskList)
    expect(loadSubjects()).toEqual(subjectList)
    expect(loadSubtasks()).toEqual(subtaskList)
  })
})

describe('休息日持久化', () => {
  it('与任务 / 科目存储相互独立', () => {
    useStorage(withDefaults())
    saveTasks([task()])
    saveRestDays(['2026-10-11'])
    expect(loadRestDays()).toEqual(['2026-10-11'])
    expect(loadTasks()).toEqual([task()])

    saveRestDays([])
    expect(loadRestDays()).toEqual([])
    expect(loadTasks()).toEqual([task()])
  })

  it('过滤非法日期、去重并排序', () => {
    saveRestDays(['2026-10-12', 'bad-date', '2026-10-12', '2026-01-01', '2026-02-30'])
    expect(loadRestDays()).toEqual(['2026-01-01', '2026-10-12'])
  })
})

describe('initializeData', () => {
  it('首次初始化写入默认科目 / 标签与示例任务', () => {
    const result = initializeData()
    expect(result.subjects.length).toBe(3)
    expect(result.subtasks.length).toBeGreaterThan(0)
    expect(result.tasks).toEqual(sampleTasks())
    expect(loadSubjects()).toEqual(result.subjects)
    expect(loadSubtasks()).toEqual(result.subtasks)
    expect(window.localStorage.getItem(STORAGE_KEYS.seeded)).toBe('1')
  })

  it('已有用户任务时不覆盖，但会补齐缺失的默认科目', () => {
    useStorage({
      [STORAGE_KEYS.tasks]: JSON.stringify([task({ id: 'user-1' })]),
      [STORAGE_KEYS.seeded]: '1',
    })
    const result = initializeData()
    expect(result.tasks.map((t) => t.id)).toEqual(['user-1'])
    expect(result.subjects.length).toBe(3)
  })

  it('用户清空任务后再次初始化不回填示例数据', () => {
    useStorage({ [STORAGE_KEYS.tasks]: '[]', [STORAGE_KEYS.seeded]: '1' })
    expect(initializeData().tasks).toEqual([])
  })

  it('用户删光科目后不会被默认科目覆盖（键存在即视为用户数据）', () => {
    useStorage({
      [STORAGE_KEYS.subjects]: '[]',
      [STORAGE_KEYS.subtasks]: '[]',
      [STORAGE_KEYS.tasks]: '[]',
      [STORAGE_KEYS.seeded]: '1',
    })
    const result = initializeData()
    expect(result.subjects).toEqual([])
    expect(result.subtasks).toEqual([])
  })

  it('示例任务含合法日期、时间与标签引用', () => {
    const subjects = new Set(initializeData().subjects.map((item) => item.id))
    const subtasks = new Set(loadSubtasks().map((item) => item.id))
    for (const item of sampleTasks()) {
      expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(item.content.trim()).not.toBe('')
      expect(subjects.has(item.subjectId)).toBe(true)
      if (item.subtaskId !== null) expect(subtasks.has(item.subtaskId)).toBe(true)
    }
  })
})

describe('日期类型（阶段一：休息日 / 缓冲日）', () => {
  it('新键不存在时由旧休息日迁移，旧键保持原样', () => {
    const legacy = JSON.stringify(['2026-10-05', 'bad-date'])
    useStorage(withDefaults({ [STORAGE_KEYS.restDays]: legacy }))

    expect(loadDayTypes()).toEqual({ '2026-10-05': 'rest' })
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEYS.dayTypes) ?? '{}')).toEqual({
      '2026-10-05': 'rest',
    })
    expect(window.localStorage.getItem(STORAGE_KEYS.restDays)).toBe(legacy)
  })

  it('写入日期类型时同步旧的休息日键（兼容旧版本读取）', () => {
    useStorage(withDefaults())
    saveDayTypes({ '2026-10-06': 'buffer', '2026-10-07': 'rest', 'bad-key': 'rest' as never })

    expect(loadDayTypes()).toEqual({ '2026-10-06': 'buffer', '2026-10-07': 'rest' })
    expect(loadRestDays()).toEqual(['2026-10-07'])
    // 再次读取以新键为准（不会重复迁移）
    expect(loadDayTypes()).toEqual({ '2026-10-06': 'buffer', '2026-10-07': 'rest' })
  })

  it('日期类型键损坏时按空表处理，不抛异常', () => {
    useStorage(withDefaults({ [STORAGE_KEYS.dayTypes]: '{oops' }))
    expect(loadDayTypes()).toEqual({})
  })

  it('无日期的任务（临时任务箱）可安全读写', () => {
    useStorage(withDefaults())
    saveTasks([{ ...task(), date: null, startTime: null, endTime: null }])
    const loaded = loadTasks()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].date).toBeNull()
    expect(loaded[0].startTime).toBeNull()
  })
})




describe('任务日期读取兼容（不再丢数据）', () => {
  it('带时间的 ISO 日期归一化为本地日历日并保留任务', () => {
    useStorage(
      withDefaults({
        [STORAGE_KEYS.tasks]: JSON.stringify([
          { ...task(), id: 'iso', date: '2026-10-10T00:00:00.000Z', content: 'ISO 日期任务' },
          { ...task(), id: 'slash', date: '2026/10/11', content: '斜杠日期任务' },
        ]),
      }),
    )
    const loaded = loadTasks()
    expect(loaded).toHaveLength(2)
    expect(loaded.map((item) => item.date)).toEqual(['2026-10-10', '2026-10-11'])
  })

  it('完全无法识别的日期仍按脏数据丢弃（不影响其余任务）', () => {
    useStorage(
      withDefaults({
        [STORAGE_KEYS.tasks]: JSON.stringify([
          { ...task(), id: 'bad', date: '2026-99-99' },
          { ...task(), id: 'ok', date: '2026-10-10' },
        ]),
      }),
    )
    expect(loadTasks().map((item) => item.id)).toEqual(['ok'])
  })
})

describe('清空业务数据（clearBusinessData）', () => {
  it('清空任务 / 科目 / 子任务 / 日期类型 / 科目轮次，保留考试目标', () => {
    useStorage(
      withDefaults({
        [STORAGE_KEYS.tasks]: JSON.stringify([task()]),
        [STORAGE_KEYS.dayTypes]: JSON.stringify({ '2026-10-12': 'buffer' }),
        [STORAGE_KEYS.config]: JSON.stringify({
          examName: '考研初试',
          examDate: '2026-12-19',
          rounds: [{ id: 'r1', subjectId: 'math', name: '第一轮', dueDate: null }],
        }),
      }),
    )
    expect(loadTasks()).toHaveLength(1)

    const result = clearBusinessData()

    expect(result.ok).toBe(true)
    expect(loadTasks()).toEqual([])
    expect(loadSubjects()).toEqual([])
    expect(loadSubtasks()).toEqual([])
    expect(loadDayTypes()).toEqual({})
    expect(loadRestDays()).toEqual([])
    // 科目轮次属于科目设置，一并清空；考试名称 / 日期是全局偏好，保留
    expect(loadConfig().rounds).toEqual([])
    expect(loadConfig().examDate).toBe('2026-12-19')
    // 写入的是空集合而非删键：再次初始化不会重新播种示例数据
    expect(window.localStorage.getItem(STORAGE_KEYS.tasks)).toBe('[]')
    expect(initializeData().tasks).toEqual([])
    expect(initializeData().subjects).toEqual([])
  })

  it('不影响 UI 自定义配置（界面偏好不属于业务数据）', () => {
    const theme = JSON.stringify({ cardRadius: 20, pageBg: '#f7f7f7' })
    useStorage(withDefaults({ [STORAGE_KEYS.uiTheme]: theme, [STORAGE_KEYS.tasks]: JSON.stringify([task()]) }))

    clearBusinessData()

    expect(window.localStorage.getItem(STORAGE_KEYS.uiTheme)).toBe(theme)
  })

  it('清空后仍可用 JSON 备份恢复原数据（备份 / 恢复能力不受影响）', () => {
    useStorage(withDefaults({ [STORAGE_KEYS.tasks]: JSON.stringify([task()]) }))
    const backup = buildBackup({
      tasks: loadTasks(),
      subjects: loadSubjects(),
      subtasks: loadSubtasks(),
      dayTypes: loadDayTypes(),
      config: loadConfig(),
    })

    expect(clearBusinessData().ok).toBe(true)
    expect(loadTasks()).toEqual([])

    const restored = restoreAllData(backup.data)
    expect(restored.ok).toBe(true)
    expect(loadTasks()).toHaveLength(1)
    expect(loadSubjects()).toHaveLength(1)
  })

  it('写入失败时整体回滚：不会出现“任务清空但科目还在”的不一致状态', () => {
    useStorage(withDefaults({ [STORAGE_KEYS.tasks]: JSON.stringify([task()]) }))
    const storage = window.localStorage
    const setItem = storage.setItem.bind(storage)
    let writes = 0
    storage.setItem = (key: string, value: string) => {
      writes += 1
      if (writes === 2) throw new Error('写入失败（模拟）')
      setItem(key, value)
    }

    const result = clearBusinessData()

    expect(result.ok).toBe(false)
    expect(result.error).not.toBe('')
    expect(loadTasks()).toHaveLength(1)
    expect(loadSubjects()).toHaveLength(1)
  })
})

describe('JSON 恢复（写入校验与回滚）', () => {
  it('restoreAllData 一次写入全部数据，并净化非法条目', () => {
    useStorage(withDefaults({ [STORAGE_KEYS.tasks]: JSON.stringify([task()]) }))

    const result = restoreAllData({
      tasks: [
        { ...task(), date: null, startTime: null, endTime: null, content: '临时任务' },
        { id: 'bad' } as never,
      ],
      subjects: [subject()],
      subtasks: [subtask()],
      dayTypes: { '2026-10-12': 'buffer' },
      config: { examName: '考研', examDate: '2026-12-19', rounds: [] },
    })

    expect(result.ok).toBe(true)
    expect(result.data?.tasks).toHaveLength(1)
    expect(loadTasks()).toHaveLength(1)
    expect(loadTasks()[0].date).toBeNull()
    expect(loadDayTypes()).toEqual({ '2026-10-12': 'buffer' })
    expect(loadRestDays()).toEqual([])
    expect(loadConfig().examName).toBe('考研')
    expect(loadConfig().examDate).toBe('2026-12-19')
  })

  it('写入失败时整体回滚：原有数据保持可用，不会被清空', () => {
    const original = JSON.stringify([task({ content: '原有任务' })])
    useStorage(withDefaults({ [STORAGE_KEYS.tasks]: original }))
    expect(loadTasks()).toHaveLength(1)

    const storage = window.localStorage
    const setItem = storage.setItem.bind(storage)
    let writes = 0
    storage.setItem = (key: string, value: string) => {
      writes += 1
      if (writes === 3) throw new Error('写入失败（模拟）')
      setItem(key, value)
    }

    const result = restoreAllData({
      tasks: [],
      subjects: [subject()],
      subtasks: [],
      dayTypes: {},
      config: { examName: 'X', examDate: null, rounds: [] },
    })

    expect(result.ok).toBe(false)
    expect(result.error).not.toBe('')
    expect(loadTasks().map((item) => item.content)).toEqual(['原有任务'])
  })
})
