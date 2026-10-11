// @vitest-environment jsdom
import { DOMWrapper, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import SettingsModal from './SettingsModal.vue'
import { STORAGE_KEYS } from '../../services/storage'
import { init, subjectFilter, subjects, tasks } from '../../store/schedule'
import { initSettings } from '../../store/settings'
import { initUiTheme, savedTheme } from '../../store/uiTheme'
import { UI_THEME_DEFAULTS } from '../../models/uiTheme'
import { createTask } from '../../store/schedule'
import { todayKey } from '../../utils/date'

/**
 * 「清空数据」交互测试（阶段二）：
 * - 入口在设置里，先弹确认框，取消不改数据；
 * - 确认后清空科目与任务；
 * - 不误删 UI 自定义配置（界面偏好）。
 */

const SEED_SUBJECTS = [{ id: 'math', name: '数学', color: '#c15f5c' }]
const THEME = { cardRadius: 20, pageBg: '#f7f7f7' }

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

let storage: Storage

function useStorage(): void {
  const fake = fakeLocalStorage({
    [STORAGE_KEYS.subjects]: JSON.stringify(SEED_SUBJECTS),
    [STORAGE_KEYS.subtasks]: JSON.stringify([{ id: 'sub-1', subjectId: 'math', name: '复盘' }]),
    [STORAGE_KEYS.tasks]: '[]',
    [STORAGE_KEYS.restDays]: '[]',
    [STORAGE_KEYS.dayTypes]: JSON.stringify({ [todayKey()]: 'buffer' }),
    [STORAGE_KEYS.config]: JSON.stringify({
      examName: '考研初试',
      examDate: '2026-12-19',
      rounds: [{ id: 'r1', subjectId: 'math', name: '第一轮', dueDate: null }],
    }),
    [STORAGE_KEYS.uiTheme]: JSON.stringify(THEME),
    [STORAGE_KEYS.seeded]: '1',
  })
  storage = fake
  // 只替换 localStorage，保留 jsdom 的 window（弹窗 / 事件依赖它）
  Object.defineProperty(window, 'localStorage', { configurable: true, value: fake })
  init()
  initSettings()
  initUiTheme()
}

function mountSettings() {
  return mount(SettingsModal, {
    props: { modelValue: true },
    global: { stubs: { teleport: true } },
  })
}

/** 打开「数据」页签并点开清空确认框 */
async function openClearDialog(wrapper: ReturnType<typeof mountSettings>): Promise<DOMWrapper<Element>> {
  const dataTab = wrapper.findAll('.nav-item')[1]!
  await dataTab.trigger('click')
  const clearButton = wrapper.find('.is-danger .btn-danger')
  expect(clearButton.exists()).toBe(true)
  await clearButton.trigger('click')

  // 以「确认清空」按钮向上定位确认框本身（弹窗嵌套时外层也会包含其文本）
  const confirmButton = wrapper.findAll('button').find((button) => button.text() === '确认清空')
  expect(confirmButton, '未找到「确认清空」按钮').toBeTruthy()
  const panel = confirmButton!.element.closest('.modal-panel')
  expect(panel, '确认框未渲染').not.toBeNull()
  return new DOMWrapper(panel as Element)
}

describe('设置：清空数据', () => {
  beforeEach(() => {
    useStorage()
    createTask({
      date: todayKey(),
      subjectId: 'math',
      subtaskId: null,
      startTime: '09:00',
      endTime: '10:00',
      content: '会被清空的任务',
    })
  })

  it('清空前必须确认：确认框写明「清空所有科目和任务，且不可撤销」', async () => {
    const wrapper = mountSettings()
    const dialog = await openClearDialog(wrapper)
    expect(dialog.text()).toContain('清空所有科目和任务')
    expect(dialog.text()).toContain('不可撤销')
  })

  it('点击取消不改动任何数据', async () => {
    const wrapper = mountSettings()
    const dialog = await openClearDialog(wrapper)

    const cancel = dialog.findAll('button').find((button) => button.text() === '取消')
    expect(cancel).toBeTruthy()
    await cancel!.trigger('click')

    expect(tasks.value).toHaveLength(1)
    expect(subjects.value).toHaveLength(1)
    expect(storage.getItem(STORAGE_KEYS.tasks)).not.toBe('[]')
    expect(storage.getItem(STORAGE_KEYS.subjects)).not.toBe('[]')
  })

  it('确认后清空科目与任务，并刷新页面状态（选中科目筛选被重置）', async () => {
    const wrapper = mountSettings()
    const dialog = await openClearDialog(wrapper)

    const { setSubjectFilter } = await import('../../store/schedule')
    setSubjectFilter('math')

    const confirm = dialog.findAll('button').find((button) => button.text().includes('确认清空'))
    expect(confirm).toBeTruthy()
    await confirm!.trigger('click')

    expect(subjects.value).toEqual([])
    expect(tasks.value).toEqual([])
    expect(subjectFilter.value).toBeNull()
    expect(storage.getItem(STORAGE_KEYS.subjects)).toBe('[]')
    expect(storage.getItem(STORAGE_KEYS.tasks)).toBe('[]')
    expect(storage.getItem(STORAGE_KEYS.dayTypes)).toBe('{}')
  })

  it('不会误删 UI 自定义配置（界面偏好与业务数据分开存储）', async () => {
    const wrapper = mountSettings()
    const dialog = await openClearDialog(wrapper)
    const confirm = dialog.findAll('button').find((button) => button.text().includes('确认清空'))
    await confirm!.trigger('click')

    expect(storage.getItem(STORAGE_KEYS.uiTheme)).toBe(JSON.stringify(THEME))
    expect(savedTheme.value.cardRadius).toBe(20)
    expect(UI_THEME_DEFAULTS.cardRadius).toBe(16)
  })
})
