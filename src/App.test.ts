// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App.vue'
import { STORAGE_KEYS } from './services/storage'
import { init } from './store/schedule'
import { initSettings } from './store/settings'
import { initUiTheme } from './store/uiTheme'

/**
 * 首页整体编排回归测试（真实组件 + 真实 store）：
 * 覆盖本轮 UI / 交互调整中最容易被改坏、且只靠单测看不到的部分 ——
 * 标题栏入口形态、周视图七列、任务面板页签、日类型分段控件、任务表单字段集合。
 */

const SEED_SUBJECTS = [
  { id: 'math', name: '数学', color: '#c15f5c' },
  { id: 'english', name: '英语', color: '#4059a8' },
]

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
  // 只替换 localStorage，保留 jsdom 的 window（Modal 会用到 addEventListener）
  Object.defineProperty(window, 'localStorage', { configurable: true, value: fake })
  init()
  initSettings()
  initUiTheme()
}

/** 弹窗使用 Teleport 到 body，这里改为就地渲染，方便断言 */
function mountApp() {
  return mount(App, { global: { stubs: { teleport: true } } })
}

describe('首页整体编排', () => {
  beforeEach(() => {
    useStorage()
  })

  it('标题栏四个入口都是「图标 + 文字」，含设置', () => {
    const wrapper = mountApp()
    const entries = wrapper.findAll('.bar-entry')

    expect(entries.map((entry) => entry.text())).toEqual(['倒计时', '轮次', '科目', '设置'])
    expect(entries.every((entry) => entry.find('.app-icon').exists())).toBe(true)
    expect(wrapper.find('.bar-btn').exists()).toBe(false)
  })

  it('周视图固定七列；任务面板两个页签；日类型控件与视图切换同为分段控件', () => {
    const wrapper = mountApp()

    expect(wrapper.findAll('.day-column')).toHaveLength(7)
    // 七列等分、不设最小宽度（不横向滚动）
    expect(wrapper.find('.week-grid').attributes('style')).toBeUndefined()
    expect(wrapper.findAll('.view-btn')).toHaveLength(2)
    expect(wrapper.findAll('.date-type-switch .seg-btn')).toHaveLength(3)
    expect(wrapper.findAll('.tab-btn')).toHaveLength(2)
  })

  it('周 / 月视图都没有「＋」占位元素（空白区仍可点击新增）', async () => {
    const wrapper = mountApp()
    expect(wrapper.find('.day-empty').exists()).toBe(false)

    // 切到月视图：没有加号文本，空白区仍带新增提示
    const monthBtn = wrapper.findAll('.view-btn')[1]!
    await monthBtn.trigger('click')
    expect(wrapper.text()).not.toContain('＋')
    expect(wrapper.find('.cell-blank').attributes('title')).toContain('新增任务')
  })

  it('新增任务表单只保留 日期 / 科目 / 子标签 / 内容（无开始、结束时间，无「暂不安排日期」）', async () => {
    const wrapper = mountApp()
    await wrapper.find('.add-btn').trigger('click')

    const form = wrapper.find('.task-form')
    expect(form.exists()).toBe(true)
    expect(form.find('input[type="date"]').exists()).toBe(true)
    expect(form.find('input[type="time"]').exists()).toBe(false)
    expect(form.text()).not.toContain('开始时间')
    expect(form.text()).not.toContain('结束时间')
    expect(form.text()).not.toContain('暂不安排日期')
    expect(form.text()).not.toContain('临时任务箱')
  })
})
