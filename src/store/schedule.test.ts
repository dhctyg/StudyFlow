import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskInput } from '../models/types'
import { STORAGE_KEYS, loadRestDays, loadSubtasks, loadSubjects, loadTasks } from '../services/storage'
import { addDaysKey, todayKey, weekdayIndexMon } from '../utils/date'
import { formatDurationCompact } from '../utils/studyDuration'
import {
  BufferUnavailableError,
  ConflictError,
  FieldError,
  RestDayError,
  bufferDays,
  createSubject,
  createSubtask,
  createTask,
  dayTypeOf,
  deleteSubject,
  deleteSubtask,
  deleteTask,
  detectTimeConflicts,
  durationOf,
  goNext,
  goPrev,
  goToday,
  init,
  isBufferDay,
  isRestDay,
  moveTaskToBox,
  moveTaskToBufferDay,
  moveTaskToDate,
  overdueTasks,
  setDayType,
  todayTasks,
  unscheduledTasks,
  monthCells,
  periodTitle,
  restDays,
  selectDate,
  selectedDate,
  selectedDuration,
  selectedStatus,
  selectedTasks,
  setRestDay,
  setSubjectFilter,
  sortTasksByTime,
  statusOf,
  subjectById,
  subjectFilter,
  subjects,
  subtaskCountOfSubject,
  subtaskById,
  subtasks,
  subtasksOfSubject,
  switchView,
  taskById,
  taskCountUsingSubject,
  taskCountUsingSubtask,
  tasks,
  tasksOf,
  toggleRestDay,
  toggleTaskDone,
  updateSubject,
  updateSubtask,
  updateTask,
  viewMode,
  visibleTasksOf,
  weekDays,
} from './schedule'

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

/** 测试用默认科目 / 标签，避免每次依赖示例数据 */
const SEED_SUBJECTS = [
  { id: 'math', name: '数学', color: '#c15f5c' },
  { id: 'english', name: '英语', color: '#4059a8' },
]
const SEED_SUBTASKS = [
  { id: 'sub-math-1', subjectId: 'math', name: '复盘' },
  { id: 'sub-eng-1', subjectId: 'english', name: '单词' },
]

function baseStorage(extra: Record<string, string> = {}): Record<string, string> {
  return {
    [STORAGE_KEYS.subjects]: JSON.stringify(SEED_SUBJECTS),
    [STORAGE_KEYS.subtasks]: JSON.stringify(SEED_SUBTASKS),
    [STORAGE_KEYS.tasks]: '[]',
    [STORAGE_KEYS.restDays]: '[]',
    [STORAGE_KEYS.seeded]: '1',
    ...extra,
  }
}

/** 每个用例都从“确定数据 + 已完成初始化”的状态开始 */
beforeEach(() => {
  vi.stubGlobal('window', { localStorage: fakeLocalStorage(baseStorage()) })
  init()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function input(overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    date: '2026-10-10',
    subjectId: 'math',
    subtaskId: null,
    startTime: '09:00',
    endTime: '10:00',
    content: '任务',
    ...overrides,
  }
}

describe('任务 CRUD 与时间校验', () => {
  it('正常开始 / 结束时间可以保存并落盘', () => {
    const task = createTask(input({ startTime: '09:00', endTime: '10:30' }))
    expect(task.startTime).toBe('09:00')
    expect(task.endTime).toBe('10:30')
    expect(tasksOf('2026-10-10')).toHaveLength(1)
    expect(loadTasks()[0].startTime).toBe('09:00')
  })

  it('结束时间早于或等于开始时间时拒绝保存', () => {
    expect(() => createTask(input({ startTime: '10:00', endTime: '10:00' }))).toThrow(FieldError)
    expect(() => createTask(input({ startTime: '11:00', endTime: '09:00' }))).toThrow(FieldError)
    expect(() => createTask(input({ startTime: '11:00', endTime: '09:00' }))).toThrow(/结束时间必须晚于开始时间/)
    expect(tasks.value).toHaveLength(0) // 非法数据不写入
  })

  it('非法时间格式拒绝保存，任务内容为空也拒绝', () => {
    expect(() => createTask(input({ startTime: '9:00' }))).toThrow(FieldError)
    expect(() => createTask(input({ endTime: '24:00' }))).toThrow(FieldError)
    expect(() => createTask(input({ content: '   ' }))).toThrow(FieldError)
    expect(tasks.value).toHaveLength(0)
  })

  it('编辑可修改日期、时间、科目与内容', () => {
    const created = createTask(input())
    updateTask(created.id, {
      date: '2026-10-12',
      subjectId: 'english',
      subtaskId: 'sub-eng-1',
      startTime: '14:00',
      endTime: '15:30',
      content: '新内容',
    })
    expect(tasksOf('2026-10-10')).toHaveLength(0)
    const updated = tasksOf('2026-10-12')[0]
    expect(updated.content).toBe('新内容')
    expect(updated.subjectId).toBe('english')
    expect(updated.subtaskId).toBe('sub-eng-1')
    expect(updated.startTime).toBe('14:00')
    expect(updated.done).toBe(false) // 完成状态不因编辑丢失
  })

  it('删除 / 完成后重新计算状态与时长', () => {
    const a = createTask(input({ endTime: '10:00' }))
    const b = createTask(input({ startTime: '11:00', endTime: '12:00' }))
    toggleTaskDone(a.id)
    toggleTaskDone(b.id)
    expect(statusOf('2026-10-10')).toBe('completed')

    deleteTask(a.id)
    expect(statusOf('2026-10-10')).toBe('completed')
    expect(durationOf('2026-10-10').plannedMinutes).toBe(60)
    deleteTask(b.id)
    expect(statusOf('2026-10-10')).toBe('none')
    expect(durationOf('2026-10-10').plannedMinutes).toBe(0)
    expect(loadTasks()).toHaveLength(0)
  })

  it('按开始时间排序，无时间任务排最后', () => {
    const late = createTask(input({ startTime: '15:00', endTime: '16:00', content: '下午' }))
    const early = createTask(input({ startTime: '08:00', endTime: '09:00', content: '早上' }))
    const sorted = sortTasksByTime(tasksOf('2026-10-10'))
    expect(sorted.map((task) => task.id)).toEqual([early.id, late.id])
    // 无时间的旧任务（直接注入）排最后
    expect(sortTasksByTime([...tasksOf('2026-10-10'), { ...late, id: 'untimed', startTime: null, endTime: null }]).at(-1)?.id).toBe('untimed')
  })
})

describe('时间冲突', () => {
  it('同一天的时间冲突可以被检测（边界相接不算）', () => {
    const existing = createTask(input({ startTime: '09:00', endTime: '10:00' }))
    expect(detectTimeConflicts(input({ startTime: '09:30', endTime: '10:30' }))).toHaveLength(1)
    expect(detectTimeConflicts(input({ startTime: '10:00', endTime: '11:00' }))).toHaveLength(0)
    // 排除自身（编辑场景）
    expect(detectTimeConflicts(input({ startTime: '09:30', endTime: '10:30' }), existing.id)).toHaveLength(0)
  })

  it('不检测其他日期的任务', () => {
    createTask(input({ date: '2026-10-11', startTime: '09:00', endTime: '10:00' }))
    expect(detectTimeConflicts(input({ date: '2026-10-10', startTime: '09:00', endTime: '10:00' }))).toHaveLength(0)
  })

  it('保存冲突时报 ConflictError，且不会覆盖或删除已有任务', () => {
    const existing = createTask(input({ startTime: '09:00', endTime: '10:00', content: '已有任务' }))
    let error: unknown = null
    try {
      createTask(input({ startTime: '09:30', endTime: '10:30', content: '冲突任务' }))
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(ConflictError)
    expect((error as ConflictError).conflicts.map((task) => task.id)).toEqual([existing.id])
    // 已有任务原样保留，新任务未写入
    expect(tasksOf('2026-10-10')).toHaveLength(1)
    expect(tasksOf('2026-10-10')[0].content).toBe('已有任务')
  })

  it('用户确认（allowConflict）后可保留重叠任务', () => {
    createTask(input({ startTime: '09:00', endTime: '10:00' }))
    createTask(input({ startTime: '09:30', endTime: '10:30', content: '重叠' }), { allowConflict: true })
    expect(tasksOf('2026-10-10')).toHaveLength(2)
  })

  it('编辑任务时也检测冲突（排除自身）', () => {
    const first = createTask(input({ startTime: '09:00', endTime: '10:00' }))
    const second = createTask(input({ startTime: '11:00', endTime: '12:00' }))
    expect(() =>
      updateTask(second.id, input({ startTime: '09:30', endTime: '09:45', content: '移动后冲突' })),
    ).toThrow(ConflictError)
    // 自身时间范围内的正常修改不冲突
    updateTask(first.id, input({ startTime: '09:15', endTime: '09:45', content: '自身调整' }))
    expect(tasksOf('2026-10-10').find((task) => task.id === first.id)?.startTime).toBe('09:15')
  })

  it('未安排时间的任务不参与冲突检测（展示用默认时段不产生新冲突）', () => {
    // 通过持久层写入一个无时间的旧任务，再重新初始化 store
    vi.stubGlobal('window', {
      localStorage: fakeLocalStorage(
        baseStorage({
          [STORAGE_KEYS.tasks]: JSON.stringify([
            {
              id: 'legacy-untimed',
              date: '2026-10-10',
              subjectId: 'math',
              content: '旧任务（无时间）',
              done: false,
            },
            {
              id: 'timed',
              date: '2026-10-10',
              subjectId: 'math',
              subtaskId: null,
              startTime: '09:00',
              endTime: '10:00',
              content: '定时任务',
              done: false,
            },
          ]),
        }),
      ),
    })
    init()
    expect(tasksOf('2026-10-10')).toHaveLength(2)

    // 与 09:00–10:00 重叠的新任务只与「定时任务」冲突；无时间任务不会凭空产生冲突
    const conflicts = detectTimeConflicts(
      input({ startTime: '09:30', endTime: '10:30', content: '新任务' }),
    )
    expect(conflicts.map((task) => task.id)).toEqual(['timed'])
  })

})

describe('休息日与时长汇总', () => {
  it('休息日仍可显示学习时长，且不影响任务', () => {
    const task = createTask(input({ startTime: '09:00', endTime: '10:30' }))
    setRestDay('2026-10-10', true)
    expect(isRestDay('2026-10-10')).toBe(true)
    expect(durationOf('2026-10-10').plannedMinutes).toBe(90)
    expect(tasksOf('2026-10-10')).toHaveLength(1)
    expect(task.done).toBe(false)
    expect(statusOf('2026-10-10')).toBe('pending')

    // 全部完成 + 休息日：两个状态并存，时长不变
    toggleTaskDone(task.id)
    expect(isRestDay('2026-10-10')).toBe(true)
    expect(statusOf('2026-10-10')).toBe('completed')
    expect(durationOf('2026-10-10').plannedMinutes).toBe(90)
  })

  it('休息日切换保留任务，取消后任务与时长不变', () => {
    createTask(input())
    toggleRestDay('2026-10-11')
    expect(restDays.value).toEqual(['2026-10-11'])
    toggleRestDay('2026-10-11')
    expect(restDays.value).toEqual([])
    expect(durationOf('2026-10-10').plannedMinutes).toBe(60)
  })

  it('无任务时长为 0', () => {
    expect(durationOf('2026-10-10').plannedMinutes).toBe(0)
    expect(statusOf('2026-10-10')).toBe('none')
  })

  it('未安排时间的阶段一旧任务不计入时长，但仍参与完成状态与计数', () => {
    vi.stubGlobal('window', {
      localStorage: fakeLocalStorage(
        baseStorage({
          [STORAGE_KEYS.tasks]: JSON.stringify([
            {
              id: 'legacy-1',
              date: '2026-10-10',
              subjectId: 'math',
              content: '旧任务（无时间）',
              done: true,
            },
          ]),
        }),
      ),
    })
    init()
    const summary = durationOf('2026-10-10')
    expect(summary.plannedMinutes).toBe(0)
    expect(summary.timedTaskCount).toBe(0)
    expect(summary.untimedTaskCount).toBe(1)
    expect(statusOf('2026-10-10')).toBe('completed') // 完成状态不受影响
    expect(tasksOf('2026-10-10')[0].startTime).toBeNull()
  })

  it('重叠任务按并集计算每日时长，任务安排时长单独可见', () => {
    createTask(input({ startTime: '09:00', endTime: '10:30' })) // 90
    createTask(input({ startTime: '10:00', endTime: '11:00' }), { allowConflict: true }) // 60，与上一个重叠 30
    selectDate('2026-10-10')
    const summary = selectedDuration.value
    expect(summary.plannedMinutes).toBe(120) // 并集 09:00–11:00
    expect(summary.scheduledMinutes).toBe(150) // 各任务之和
    expect(summary.overlapMinutes).toBe(30)
    expect(selectedTasks.value).toHaveLength(2)
    expect(formatDurationCompact(summary.plannedMinutes)).toBe('2h')
  })

  it('完成状态不改变计划时长', () => {
    const task = createTask(input({ startTime: '09:00', endTime: '10:00' }))
    const before = durationOf('2026-10-10')
    toggleTaskDone(task.id)
    const after = durationOf('2026-10-10')
    expect(after.plannedMinutes).toBe(before.plannedMinutes)
    expect(after.scheduledMinutes).toBe(before.scheduledMinutes)
    expect(selectedStatus.value).toBe('completed')
  })
})


describe('科目筛选', () => {
  it('默认显示全部科目，筛选只影响日历可见任务', () => {
    createTask(input({ subjectId: 'math', startTime: '09:00', endTime: '10:00' }))
    createTask(input({ subjectId: 'english', startTime: '11:00', endTime: '12:00' }), {
      allowConflict: true,
    })

    expect(subjectFilter.value).toBeNull()
    expect(visibleTasksOf('2026-10-10')).toHaveLength(2)

    setSubjectFilter('math')
    expect(subjectFilter.value).toBe('math')
    expect(visibleTasksOf('2026-10-10')).toHaveLength(1)
    expect(visibleTasksOf('2026-10-10')[0].subjectId).toBe('math')
    // 原始数据不被修改；详情 / 状态 / 时长基于全部任务
    expect(tasksOf('2026-10-10')).toHaveLength(2)
    expect(durationOf('2026-10-10').plannedMinutes).toBe(120)
    expect(statusOf('2026-10-10')).toBe('pending')
    expect(selectedTasks.value).toHaveLength(2)
  })

  it('休息日标记不受筛选影响', () => {
    setRestDay('2026-10-10', true)
    setSubjectFilter('math')
    expect(isRestDay('2026-10-10')).toBe(true)
  })

  it('筛选到不存在的科目时回退为全部', () => {
    setSubjectFilter('ghost')
    expect(subjectFilter.value).toBeNull()
  })

  it('删除科目后筛选状态同步清理', () => {
    setSubjectFilter('math')
    deleteSubject('math')
    expect(subjectFilter.value).toBeNull()
  })
})

describe('科目管理', () => {
  it('新增科目并持久化（含颜色）', () => {
    const created = createSubject({ name: '  专业课  ', color: '#123456' })
    expect(created.name).toBe('专业课') // 去除首尾空格
    expect(created.color).toBe('#123456')
    expect(subjects.value).toHaveLength(3)
    expect(loadSubjects().map((item) => item.name)).toContain('专业课')
    expect(loadSubjects().find((item) => item.id === created.id)?.color).toBe('#123456')
  })

  it('科目名称为空或重复时拒绝保存', () => {
    expect(() => createSubject({ name: '   ', color: '#123456' })).toThrow(FieldError)
    expect(() => createSubject({ name: '数学', color: '#123456' })).toThrow(/科目名称已存在/)
    // 忽略大小写与首尾空格
    expect(() => createSubject({ name: '  数学  ', color: '#123456' })).toThrow(FieldError)
    expect(subjects.value).toHaveLength(2)
  })

  it('修改名称 / 颜色；与其他科目重名被拒绝，改回自身名称可以', () => {
    updateSubject('english', { name: '英语一', color: '#abcdef' })
    expect(subjectById('english')?.name).toBe('英语一')
    expect(subjectById('english')?.color).toBe('#abcdef')
    expect(() => updateSubject('english', { name: '数学', color: '#abcdef' })).toThrow(FieldError)
    updateSubject('english', { name: '英语一', color: '#abcdef' }) // 自身名称不算重复
    expect(subjectById('english')?.name).toBe('英语一')
  })

  it('删除科目级联清理其任务与标签，并统计影响范围', () => {
    createTask(input({ subjectId: 'math', subtaskId: 'sub-math-1' }))
    createTask(input({ subjectId: 'english', startTime: '11:00', endTime: '12:00' }), {
      allowConflict: true,
    })

    expect(taskCountUsingSubject('math')).toBe(1)
    expect(subtaskCountOfSubject('math')).toBe(1)

    deleteSubject('math')

    // 不留悬空引用
    expect(subjectById('math')).toBeUndefined()
    expect(subtasksOfSubject('math')).toHaveLength(0)
    expect(tasks.value.some((item) => item.subjectId === 'math')).toBe(false)
    expect(tasks.value.some((item) => item.subtaskId === 'sub-math-1')).toBe(false)
    // 其他科目 / 任务不受影响
    expect(subjectById('english')).toBeDefined()
    expect(tasksOf('2026-10-10')).toHaveLength(1)
    expect(tasksOf('2026-10-10')[0].subjectId).toBe('english')
    expect(loadSubjects().some((item) => item.id === 'math')).toBe(false)
    expect(loadSubtasks().some((item) => item.id === 'sub-math-1')).toBe(false)
  })
})

describe('子任务标签管理', () => {
  it('新增标签并持久化；不存在的科目被拒绝', () => {
    const created = createSubtask({ subjectId: 'math', name: '  真题  ' })
    expect(created.name).toBe('真题')
    expect(subtasksOfSubject('math').map((item) => item.name)).toEqual(['复盘', '真题'])
    expect(loadSubtasks().map((item) => item.id)).toContain(created.id)
    expect(() => createSubtask({ subjectId: 'ghost', name: '标签' })).toThrow(FieldError)
  })

  it('同一科目下标签重名被拒绝（忽略大小写 / 空格），不同科目允许同名', () => {
    expect(() => createSubtask({ subjectId: 'math', name: ' 复盘 ' })).toThrow(/同名标签/)
    // 英语下允许叫「复盘」（数学已有）
    const created = createSubtask({ subjectId: 'english', name: '复盘' })
    expect(created.subjectId).toBe('english')
    expect(() => createSubtask({ subjectId: 'english', name: '   ' })).toThrow(FieldError)
    expect(subtasks.value.length).toBe(3)
  })

  it('修改标签名称只改名称，任务引用保持不变', () => {
    const task = createTask(input({ subjectId: 'math', subtaskId: 'sub-math-1' }))
    updateSubtask('sub-math-1', { name: '总结' })
    expect(subtaskById('sub-math-1')?.name).toBe('总结')
    expect(tasksOf('2026-10-10')[0].subtaskId).toBe('sub-math-1')
    expect(subtaskById(task.subtaskId)).toBeDefined()
    // 与同科目其他标签重名被拒绝
    createSubtask({ subjectId: 'math', name: '提高' })
    expect(() => updateSubtask('sub-math-1', { name: '提高' })).toThrow(FieldError)
  })

  it('删除标签：关联任务保留，引用被清空（无悬空引用）', () => {
    createTask(input({ subjectId: 'math', subtaskId: 'sub-math-1', content: '保留我' }))
    expect(taskCountUsingSubtask('sub-math-1')).toBe(1)

    deleteSubtask('sub-math-1')

    expect(subtaskById('sub-math-1')).toBeUndefined()
    const task = tasksOf('2026-10-10')[0]
    expect(task.content).toBe('保留我')
    expect(task.subtaskId).toBeNull()
    expect(task.startTime).toBe('09:00') // 时间不丢失
    expect(loadTasks()[0].subtaskId).toBeNull()
  })

  it('保存任务时拒绝无效或跨科目的标签 ID', () => {
    expect(() => createTask(input({ subjectId: 'math', subtaskId: 'ghost' }))).toThrow(FieldError)
    // sub-eng-1 属于英语，不能挂在数学任务上
    expect(() => createTask(input({ subjectId: 'math', subtaskId: 'sub-eng-1' }))).toThrow(/不属于当前科目/)
    expect(() => createTask(input({ subjectId: 'ghost' }))).toThrow(/科目不存在/)
    // 合法标签可保存
    const ok = createTask(input({ subjectId: 'english', subtaskId: 'sub-eng-1' }))
    expect(ok.subtaskId).toBe('sub-eng-1')
    // 「不分类」（subtaskId = null）同样可以保存
    expect(() =>
      createTask(input({ subtaskId: null, startTime: '13:00', endTime: '14:00' })),
    ).not.toThrow()
  })
})


describe('视图与周期导航', () => {
  it('周视图恒为周一 → 周日', () => {
    expect(viewMode.value).toBe('week')
    expect(weekDays.value).toHaveLength(7)
    expect(weekdayIndexMon(weekDays.value[0])).toBe(0)
  })

  it('上一周 / 下一周以 7 天为步长，月视图跨年', () => {
    const before = [...weekDays.value]
    goNext()
    expect(weekDays.value[0]).not.toBe(before[0])
    goPrev()
    expect(weekDays.value).toEqual(before)

    selectDate('2026-12-15')
    switchView('month')
    expect(periodTitle.value).toBe('2026年12月')
    expect(monthCells.value[0].startsWith('2026-11')).toBe(true)
    goNext()
    expect(periodTitle.value).toBe('2027年1月')
    goPrev()
    expect(periodTitle.value).toBe('2026年12月')
  })

  it('返回今天：选中日期回到今天；点击日期立即更新选中日期', () => {
    goPrev()
    goToday()
    expect(selectedDate.value).toBe(todayKey())
    selectDate('2026-10-20')
    expect(selectedDate.value).toBe('2026-10-20')
  })
})

describe('本地持久化（刷新恢复）', () => {
  it('科目、标签、任务时间、完成状态与休息日全部恢复', () => {
    const created = createSubject({ name: '专业课', color: '#654321' })
    createSubtask({ subjectId: created.id, name: '真题' })
    const tag = subtasksOfSubject(created.id)[0]
    const task = createTask(
      input({
        subjectId: created.id,
        subtaskId: tag.id,
        startTime: '19:00',
        endTime: '20:30',
        content: '持久化任务',
      }),
    )
    toggleTaskDone(task.id)
    setRestDay('2026-10-10', true)

    init() // 模拟刷新

    expect(subjects.value.some((item) => item.name === '专业课')).toBe(true)
    expect(subtasksOfSubject(created.id).map((item) => item.name)).toEqual(['真题'])
    const restored = tasksOf('2026-10-10')[0]
    expect(restored.content).toBe('持久化任务')
    expect(restored.startTime).toBe('19:00')
    expect(restored.endTime).toBe('20:30')
    expect(restored.done).toBe(true)
    expect(restored.subtaskId).toBe(tag.id)
    expect(restDays.value).toEqual(['2026-10-10'])
    expect(loadSubjects().some((item) => item.name === '专业课')).toBe(true)
    expect(loadRestDays()).toEqual(['2026-10-10'])
  })
})


// ---------- 阶段一：日期类型（普通日 / 休息日 / 缓冲日） ----------

describe('日期类型（普通日 / 休息日 / 缓冲日）', () => {
  it('设置 / 切换 / 取消日期类型，并持久化到独立键', () => {
    expect(dayTypeOf('2026-10-12')).toBe('normal')

    setDayType('2026-10-12', 'rest')
    expect(isRestDay('2026-10-12')).toBe(true)
    expect(dayTypeOf('2026-10-12')).toBe('rest')

    // 同一天只能有一种类型：改为缓冲日后不再是休息日
    setDayType('2026-10-12', 'buffer')
    expect(isRestDay('2026-10-12')).toBe(false)
    expect(isBufferDay('2026-10-12')).toBe(true)

    // 可取消，恢复普通日
    setDayType('2026-10-12', 'normal')
    expect(dayTypeOf('2026-10-12')).toBe('normal')

    setDayType('2026-10-20', 'buffer')
    expect(window.localStorage.getItem(STORAGE_KEYS.dayTypes)).toBe(
      JSON.stringify({ '2026-10-20': 'buffer' }),
    )
    // 旧休息日键同步为纯休息日集合（兼容旧版本读取，键本身不被删除）
    expect(window.localStorage.getItem(STORAGE_KEYS.restDays)).toBe('[]')
  })

  it('休息日 / 缓冲日集合分别派生，既有 restDays 视图不变', () => {
    setDayType('2026-10-12', 'rest')
    setDayType('2026-10-13', 'buffer')
    expect([...restDays.value]).toEqual(['2026-10-12'])
    expect([...bufferDays.value]).toEqual(['2026-10-13'])
  })

  it('设置日期类型不改动任何任务', () => {
    const task = createTask(input({ date: '2026-10-12' }))
    setDayType('2026-10-12', 'buffer')
    expect(tasksOf('2026-10-12')).toHaveLength(1)
    expect(tasksOf('2026-10-12')[0]).toEqual(task)
  })

  it('旧数据的休息日迁移为日期类型，且不删除旧键', () => {
    const legacy = JSON.stringify(['2026-10-05'])
    vi.stubGlobal('window', {
      localStorage: fakeLocalStorage(baseStorage({ [STORAGE_KEYS.restDays]: legacy })),
    })
    init()
    expect(isRestDay('2026-10-05')).toBe(true)
    expect(dayTypeOf('2026-10-06')).toBe('normal')
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEYS.dayTypes) ?? '{}')).toEqual({
      '2026-10-05': 'rest',
    })
    expect(window.localStorage.getItem(STORAGE_KEYS.restDays)).toBe(legacy)
  })

  it('休息日保护：默认拒绝安排任务，用户确认后才写入', () => {
    setDayType('2026-10-12', 'rest')
    expect(() => createTask(input({ date: '2026-10-12' }))).toThrow(RestDayError)
    expect(tasksOf('2026-10-12')).toHaveLength(0)

    const task = createTask(input({ date: '2026-10-12' }), { allowRestDay: true })
    expect(tasksOf('2026-10-12').map((item) => item.id)).toEqual([task.id])

    // 拖到休息日同样先拦截
    setDayType('2026-10-13', 'rest')
    expect(() => moveTaskToDate(task.id, '2026-10-13')).toThrow(RestDayError)
    expect(taskById(task.id)?.date).toBe('2026-10-12')
    moveTaskToDate(task.id, '2026-10-13', { allowRestDay: true })
    expect(taskById(task.id)?.date).toBe('2026-10-13')

    // 已在休息日上的任务，编辑其它字段不会被拦截
    updateTask(task.id, input({ date: '2026-10-13', content: '改了内容' }))
    expect(taskById(task.id)?.content).toBe('改了内容')
  })
})

// ---------- 阶段一：三类任务（当日安排 / 逾期 / 临时任务箱） ----------

describe('三类任务：当日安排 / 逾期 / 临时任务箱', () => {
  it('逾期由「原任务日期 + 完成状态」动态计算：不生成副本，完成后移出列表', () => {
    const today = todayKey()
    const overdue = createTask(input({ date: addDaysKey(today, -3), content: '三天前' }))
    createTask(input({ date: addDaysKey(today, -1), content: '昨天' }))
    const todayTask = createTask(input({ date: today, content: '今天' }))

    expect(overdueTasks.value.map((item) => item.content)).toEqual(['三天前', '昨天'])
    expect(todayTasks.value.map((item) => item.id)).toEqual([todayTask.id])
    expect(tasks.value).toHaveLength(3) // 没有为逾期生成任何副本

    toggleTaskDone(overdue.id)
    expect(overdueTasks.value.map((item) => item.id)).not.toContain(overdue.id)
    expect(tasks.value).toHaveLength(3) // 完成只改状态，记录数不变
  })

  it('未安排日期的任务进入临时任务箱，不属于任何一天', () => {
    const boxed = createTask(
      input({ date: null, startTime: '', endTime: '', content: '临时任务' }),
    )
    expect(boxed.date).toBeNull()
    expect(unscheduledTasks.value.map((item) => item.id)).toEqual([boxed.id])
    expect(tasksOf(todayKey())).toHaveLength(0)
    expect(durationOf(todayKey()).untimedTaskCount).toBe(0)

    // 落盘后仍是 null，可被 storage 安全读回
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.tasks) ?? '[]')
    expect(raw[0].date).toBeNull()
  })

  it('已安排日期的任务仍要求填写时间（原校验不变）', () => {
    expect(() => createTask(input({ startTime: '', endTime: '' }))).toThrow(FieldError)
  })
})

// ---------- 阶段一：任务日期调整（改期 / 缓冲日 / 任务箱） ----------

describe('任务日期调整', () => {
  it('改期只更新原任务的日期：不复制任务、不影响其它任务', () => {
    const today = todayKey()
    const task = createTask(input({ date: today }))
    const other = createTask(input({ date: addDaysKey(today, 1), content: '另一天' }))

    moveTaskToDate(task.id, addDaysKey(today, 5))

    expect(tasks.value).toHaveLength(2)
    expect(taskById(task.id)?.date).toBe(addDaysKey(today, 5))
    expect(taskById(other.id)?.date).toBe(addDaysKey(today, 1))
    expect(unscheduledTasks.value).toHaveLength(0)
  })

  it('移入缓冲日：优先选择今天及之后最近的缓冲日', () => {
    const today = todayKey()
    setDayType(addDaysKey(today, 10), 'buffer')
    setDayType(addDaysKey(today, 3), 'buffer')
    const task = createTask(input({ date: addDaysKey(today, -2) }))

    const target = moveTaskToBufferDay(task.id)

    expect(target).toBe(addDaysKey(today, 3))
    expect(taskById(task.id)?.date).toBe(addDaysKey(today, 3))
    expect(tasks.value).toHaveLength(1)
  })

  it('没有可用缓冲日时明确报错，绝不默默改日期', () => {
    const today = todayKey()
    const task = createTask(input({ date: today }))
    expect(() => moveTaskToBufferDay(task.id)).toThrow(BufferUnavailableError)
    expect(taskById(task.id)?.date).toBe(today)
  })

  it('显式指定非缓冲日会被拒绝；指定缓冲日则生效', () => {
    const today = todayKey()
    const task = createTask(input({ date: today }))
    expect(() => moveTaskToBufferDay(task.id, { dateKey: addDaysKey(today, 2) })).toThrow(FieldError)

    setDayType(addDaysKey(today, 2), 'buffer')
    expect(moveTaskToBufferDay(task.id, { dateKey: addDaysKey(today, 2) })).toBe(
      addDaysKey(today, 2),
    )
  })

  it('移入临时任务箱：清空日期，时间字段原样保留', () => {
    const task = createTask(input({ date: todayKey() }))
    moveTaskToBox(task.id)
    const stored = taskById(task.id)
    expect(stored?.date).toBeNull()
    expect(stored?.startTime).toBe('09:00')
    expect(unscheduledTasks.value.map((item) => item.id)).toEqual([task.id])
  })

  it('改期与日期类型刷新后仍然有效', () => {
    const today = todayKey()
    const target = addDaysKey(today, 4)
    const task = createTask(input({ date: today }))
    moveTaskToDate(task.id, target)
    setDayType(target, 'buffer')

    init() // 模拟刷新：重新从 localStorage 读取

    expect(taskById(task.id)?.date).toBe(target)
    expect(isBufferDay(target)).toBe(true)
  })
})

