// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../models/types'
import { STORAGE_KEYS } from '../../services/storage'
import {
  createTask,
  deleteTask,
  init,
  moveTaskToDate,
  selectDate,
  setSubjectFilter,
  switchView,
  tasksOf,
  toggleTaskDone,
  visibleTasksOf,
} from '../../store/schedule'
import { todayKey, weekDaysKey } from '../../utils/date'
import MonthView from './MonthView.vue'
import WeekView from './WeekView.vue'

/** 日历渲染与同步测试：真实组件 + 真实 store（jsdom）。 */

const SEED_SUBJECTS = [
  { id: 'math', name: '数学', color: '#c15f5c' },
  { id: 'english', name: '英语', color: '#4059a8' },
]
const SEED_SUBTASKS = [{ id: 'sub-math-1', subjectId: 'math', name: '复盘' }]

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

function baseStorage(
  tasks: unknown[] = [],
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    [STORAGE_KEYS.subjects]: JSON.stringify(SEED_SUBJECTS),
    [STORAGE_KEYS.subtasks]: JSON.stringify(SEED_SUBTASKS),
    [STORAGE_KEYS.tasks]: JSON.stringify(tasks),
    [STORAGE_KEYS.restDays]: '[]',
    [STORAGE_KEYS.dayTypes]: '{}',
    [STORAGE_KEYS.seeded]: '1',
    ...extra,
  }
}

function useStorage(tasks: unknown[] = [], extra: Record<string, string> = {}): void {
  vi.stubGlobal('window', { localStorage: fakeLocalStorage(baseStorage(tasks, extra)) })
  init()
}

function rawTask(overrides: Partial<Task> = {}): Record<string, unknown> {
  return {
    id: 't1',
    date: todayKey(),
    subjectId: 'math',
    subtaskId: null,
    startTime: '09:00',
    endTime: '10:00',
    content: '今天的任务',
    done: false,
    ...overrides,
  }
}

function columnOf(wrapper: ReturnType<typeof mount>, key: string) {
  return wrapper.findAll('.day-column').find((column) => column.attributes('aria-label') === key)
}

function mathTask(date: string | null, content: string) {
  return createTask({
    date,
    subjectId: 'math',
    subtaskId: null,
    startTime: date === null ? '' : '09:00',
    endTime: date === null ? '' : '10:00',
    content,
  })
}

beforeEach(() => {
  useStorage()
  switchView('week')
  selectDate(todayKey())
  setSubjectFilter(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('日历渲染：任务必须在对应日期可见', () => {
  it('周视图显示今天的任务卡片（与任务面板同源）', () => {
    mathTask(todayKey(), '复习卷积码')
    const wrapper = mount(WeekView)

    expect(wrapper.text()).toContain('复习卷积码')
    expect(wrapper.findAll('.task-card')).toHaveLength(1)
    expect(columnOf(wrapper, todayKey())?.text()).toContain('复习卷积码')
  })

  it('已持久化任务刷新后仍显示在正确日期（带时间的 ISO 日期也能归一化）', () => {
    useStorage([
      rawTask({ id: 'legacy-iso', date: `${todayKey()}T00:00:00.000Z`, content: '旧格式任务' }),
    ])
    expect(tasksOf(todayKey())).toHaveLength(1)
    expect(tasksOf(todayKey())[0].content).toBe('旧格式任务')

    const wrapper = mount(WeekView)
    expect(wrapper.text()).toContain('旧格式任务')
  })

  it('无日期的任务不出现在日历任何一天（只在临时任务箱）', () => {
    mathTask(null, '未安排的任务')
    const wrapper = mount(WeekView)
    expect(wrapper.text()).not.toContain('未安排的任务')
    for (const key of weekDaysKey(todayKey())) expect(visibleTasksOf(key)).toHaveLength(0)
  })

  it('科目筛选生效：筛选其他科目时任务从日历消失，取消筛选后恢复', async () => {
    mathTask(todayKey(), '数学任务')
    const wrapper = mount(WeekView)
    expect(wrapper.text()).toContain('数学任务')

    setSubjectFilter('english')
    await nextTick()
    expect(wrapper.text()).not.toContain('数学任务')
    expect(tasksOf(todayKey())).toHaveLength(1)

    setSubjectFilter('math')
    await nextTick()
    expect(wrapper.text()).toContain('数学任务')
  })
})

describe('月视图与周视图的一致性', () => {
  it('月视图：任务以任务条目显示在对应日期格（不只是科目色条）', () => {
    mathTask(todayKey(), '月视图任务')
    switchView('month')
    const wrapper = mount(MonthView)
    const todayCell = wrapper
      .findAll('.month-cell')
      .find((cell) => cell.attributes('aria-label') === todayKey())
    expect(todayCell?.text()).toContain('月视图任务')
  })

  it('无日期的任务在月视图中同样不出现', () => {
    mathTask(null, '未安排任务')
    switchView('month')
    const wrapper = mount(MonthView)
    expect(wrapper.text()).not.toContain('未安排任务')
  })
})

describe('日历同步：改期 / 完成 / 删除', () => {
  it('改期后立即出现在新日期列，旧日期列不再显示', async () => {
    const task = mathTask(todayKey(), '待改期')
    const wrapper = mount(WeekView)
    // 同周内的另一天：保证目标列一定存在于当前周视图
    const target = weekDaysKey(todayKey()).find((key) => key !== todayKey())
    expect(target).toBeDefined()
    if (target === undefined) return

    moveTaskToDate(task.id, target)
    await nextTick()

    expect(columnOf(wrapper, target)?.text()).toContain('待改期')
    expect(columnOf(wrapper, todayKey())?.text()).not.toContain('待改期')
  })

  it('完成后日历仍显示该任务（完成状态语义不变）', async () => {
    const task = mathTask(todayKey(), '会完成的任务')
    const wrapper = mount(WeekView)

    toggleTaskDone(task.id)
    await nextTick()

    expect(wrapper.text()).toContain('会完成的任务')
    expect(wrapper.find('.task-card.is-done').exists()).toBe(true)
  })

  it('删除后日历与数据同步', async () => {
    const task = mathTask(todayKey(), '将被删除')
    const wrapper = mount(WeekView)
    expect(wrapper.text()).toContain('将被删除')

    deleteTask(task.id)
    await nextTick()

    expect(wrapper.text()).not.toContain('将被删除')
    expect(wrapper.findAll('.task-card')).toHaveLength(0)
  })
})

