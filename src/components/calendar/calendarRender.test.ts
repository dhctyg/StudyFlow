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
  setDayType,
  setSubjectFilter,
  switchView,
  tasksOf,
  toggleTaskDone,
  visibleTasksOf,
} from '../../store/schedule'
import { dayOf, todayKey, weekDaysKey } from '../../utils/date'
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

  it('未排期的历史任务不出现在日历任何一天（只在任务面板的兼容提示里）', () => {
    mathTask(null, '未安排的任务')
    const wrapper = mount(WeekView)
    expect(wrapper.text()).not.toContain('未安排的任务')
    for (const key of weekDaysKey(todayKey())) expect(visibleTasksOf(key)).toHaveLength(0)
  })

  it('周视图列内不再有「＋」加号占位元素（空白区直接可点）', () => {
    const wrapper = mount(WeekView)
    expect(wrapper.find('.day-empty').exists()).toBe(false)
    // 整列仍是可点击的新增区域
    const body = wrapper.find('.day-body')
    expect(body.exists()).toBe(true)
    expect(body.attributes('title')).toContain('新增任务')
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
  it('月视图：任务只显示科目主题色小圆点（不显示任务文字）', () => {
    mathTask(todayKey(), '月视图任务')
    switchView('month')
    const wrapper = mount(MonthView)
    const todayCell = wrapper
      .findAll('.month-cell')
      .find((cell) => cell.attributes('aria-label') === todayKey())

    const dots = todayCell?.findAll('.cell-dot') ?? []
    expect(dots).toHaveLength(1)
    // 圆点用科目主题色（jsdom 会把 #c15f5c 规范成 rgb 形式），任务内容进入悬停提示
    expect(dots[0]!.attributes('style')).toContain('rgb(193, 95, 92)')
    expect(dots[0]!.attributes('title')).toContain('月视图任务')
    expect(todayCell?.text()).not.toContain('月视图任务')
  })

  it('月视图：同一天多个任务 = 多个圆点，且不产生溢出文字', () => {
    createTask({
      date: todayKey(),
      subjectId: 'math',
      subtaskId: null,
      startTime: '09:00',
      endTime: '10:00',
      content: '第一个任务',
    })
    createTask({
      date: todayKey(),
      subjectId: 'english',
      subtaskId: null,
      startTime: '11:00',
      endTime: '12:00',
      content: '第二个任务',
    })
    switchView('month')
    const wrapper = mount(MonthView)
    const todayCell = wrapper
      .findAll('.month-cell')
      .find((cell) => cell.attributes('aria-label') === todayKey())

    const dots = todayCell?.findAll('.cell-dot') ?? []
    expect(dots).toHaveLength(2)
    // 两个科目 → 两种颜色（jsdom 规范化后的 rgb 形式）
    expect(dots[0]!.attributes('style')).toContain('rgb(193, 95, 92)')
    expect(dots[1]!.attributes('style')).toContain('rgb(64, 89, 168)')
    // 没有任务文字与「＋」占位，但日期数字仍在（辨识度不受影响）
    expect(todayCell?.text()).toContain(String(dayOf(todayKey())))
    expect(todayCell?.text()).not.toContain('第一个任务')
    expect(todayCell?.text()).not.toContain('第二个任务')
    expect(wrapper.find('.cell-blank').text()).toBe('')
  })

  it('未排期的历史任务在月视图中同样不出现', () => {
    mathTask(null, '未安排任务')
    switchView('month')
    const wrapper = mount(MonthView)
    expect(wrapper.text()).not.toContain('未安排任务')
  })
})

describe('休息日 / 缓冲日与选中态（背景与描边层级）', () => {
  it('选中休息日：整列同时保留 is-rest 与 is-selected（选中态不再把底色改成白）', () => {
    const target = weekDaysKey(todayKey())[2]!
    setDayType(target, 'rest')
    selectDate(target)
    const wrapper = mount(WeekView)

    const column = columnOf(wrapper, target)
    expect(column).toBeDefined()
    expect(column!.classes()).toContain('is-rest')
    expect(column!.classes()).toContain('is-selected')
    // 底色统一由列级 CSS 变量 / 类控制，组件不再给根节点写死背景色
    expect(column!.attributes('style')).toBeUndefined()
  })

  it('选中缓冲日：同样保留 is-buffer 与 is-selected', () => {
    const target = weekDaysKey(todayKey())[4]!
    setDayType(target, 'buffer')
    selectDate(target)
    const wrapper = mount(WeekView)

    const column = columnOf(wrapper, target)
    expect(column!.classes()).toContain('is-buffer')
    expect(column!.classes()).toContain('is-selected')
  })

  it('周视图 / 月视图的日期格里不再有「完成」标签（改用日期数字颜色）', () => {
    const task = mathTask(todayKey(), '已完成的任务')
    toggleTaskDone(task.id)

    switchView('week')
    const week = mount(WeekView)
    expect(week.findAll('.badge-complete')).toHaveLength(0)
    expect(week.find('.head-day.is-complete').exists()).toBe(true)

    switchView('month')
    const month = mount(MonthView)
    expect(month.findAll('.badge-complete')).toHaveLength(0)
    expect(month.find('.cell-day.is-complete').exists()).toBe(true)
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

