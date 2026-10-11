// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import TaskPanelCard from './TaskPanelCard.vue'
import { STORAGE_KEYS } from '../../services/storage'
import { createTask, init, selectDate, toggleTaskDone } from '../../store/schedule'
import { addDaysKey, todayKey } from '../../utils/date'

/**
 * 任务面板三页签测试（阶段六）：
 * 1 当日安排 = 当前选定日期的任务；2 逾期任务 = 未完成且已逾期；3 临时任务箱 = 未指定日期。
 * 同时验证：已完成任务不再出现在逾期页；已排期的任务不会重复出现在临时任务箱。
 */

const SEED_SUBJECTS = [{ id: 'math', name: '数学', color: '#c15f5c' }]

function fakeLocalStorage(initial: Record<string, string>): Storage {
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

function useStorage(): void {
  const fake = fakeLocalStorage({
    [STORAGE_KEYS.subjects]: JSON.stringify(SEED_SUBJECTS),
    [STORAGE_KEYS.subtasks]: '[]',
    [STORAGE_KEYS.tasks]: '[]',
    [STORAGE_KEYS.restDays]: '[]',
    [STORAGE_KEYS.dayTypes]: '{}',
    [STORAGE_KEYS.seeded]: '1',
  })
  // 只替换 localStorage，保留 jsdom 的 window（组件挂载 / 事件触发依赖它）
  Object.defineProperty(window, 'localStorage', { configurable: true, value: fake })
  init()
}

/** 同一日期不能有两个时间重叠的任务，这里逐条错开时间 */
let slot = 0

function addTask(date: string | null, content: string, done = false): void {
  slot += 1
  const start = `${String(8 + (slot % 12)).padStart(2, '0')}:00`
  const end = `${String(9 + (slot % 12)).padStart(2, '0')}:00`
  const task = createTask({
    date,
    subjectId: 'math',
    subtaskId: null,
    startTime: date === null ? '' : start,
    endTime: date === null ? '' : end,
    content,
  })
  if (done) toggleTaskDone(task.id)
}

const today = todayKey()
const yesterday = addDaysKey(today, -1)
const tomorrow = addDaysKey(today, 1)

function mountPanel() {
  return mount(TaskPanelCard)
}

function rowTexts(wrapper: ReturnType<typeof mountPanel>): string[] {
  return wrapper.findAll('.row-list .task-row').map((row) => row.text())
}

async function switchTo(wrapper: ReturnType<typeof mountPanel>, label: string): Promise<void> {
  const tab = wrapper.findAll('.tab-btn').find((btn) => btn.text().startsWith(label))
  expect(tab, `未找到页签 ${label}`).toBeTruthy()
  await tab!.trigger('click')
}

describe('任务面板：三个可切换页面', () => {
  beforeEach(() => {
    useStorage()
  })

  it('三个页签按 当日安排 / 逾期任务 / 临时任务箱 排列，默认显示当日安排', () => {
    const wrapper = mountPanel()
    expect(wrapper.findAll('.tab-btn').map((btn) => btn.text().replace(/\d+$/, ''))).toEqual([
      '当日安排',
      '逾期任务',
      '临时任务箱',
    ])
    expect(wrapper.findAll('.tab-btn')[0]!.attributes('aria-selected')).toBe('true')
  })

  it('当日安排显示当前选定日期的任务（跟随日历选中日期）', async () => {
    addTask(today, '今天的任务')
    addTask(tomorrow, '明天的任务')
    addTask(yesterday, '昨天的任务')
    selectDate(today)

    const wrapper = mountPanel()
    expect(rowTexts(wrapper).join(' ')).toContain('今天的任务')
    expect(rowTexts(wrapper).join(' ')).not.toContain('昨天的任务')

    // 切换日历选中日期后，当日安排随之变化（沿用既有日期关联逻辑）
    selectDate(tomorrow)
    await wrapper.vm.$nextTick()
    expect(rowTexts(wrapper).join(' ')).toContain('明天的任务')
    expect(rowTexts(wrapper).join(' ')).not.toContain('今天的任务')
  })

  it('逾期任务只包含“未完成且已过期”，已完成的不再出现', async () => {
    addTask(yesterday, '逾期未完成')
    addTask(yesterday, '逾期已完成', true)
    addTask(today, '今天任务未完成')
    selectDate(today)

    const wrapper = mountPanel()
    await switchTo(wrapper, '逾期任务')

    const texts = rowTexts(wrapper).join(' ')
    expect(texts).toContain('逾期未完成')
    expect(texts).not.toContain('逾期已完成')
    expect(texts).not.toContain('今天任务未完成')
  })

  it('临时任务箱只包含未指定日期的任务，已排期任务不重复出现', async () => {
    addTask(null, '临时任务')
    addTask(today, '今天的任务')
    addTask(yesterday, '逾期未完成')
    selectDate(today)

    const wrapper = mountPanel()
    await switchTo(wrapper, '临时任务箱')

    const texts = rowTexts(wrapper).join(' ')
    expect(texts).toContain('临时任务')
    expect(texts).not.toContain('今天的任务')
    expect(texts).not.toContain('逾期未完成')
  })

  it('切换页签只替换面板内容（三个分组不会同时渲染）', async () => {
    addTask(null, '临时任务')
    addTask(today, '今天的任务')
    selectDate(today)

    const wrapper = mountPanel()
    expect(wrapper.findAll('.panel-section')).toHaveLength(1)
    await switchTo(wrapper, '临时任务箱')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.panel-section')).toHaveLength(1)
    expect(rowTexts(wrapper).join(' ')).not.toContain('今天的任务')
  })
})
