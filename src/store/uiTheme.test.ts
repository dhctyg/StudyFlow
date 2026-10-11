// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '../services/storage'
import { UI_THEME_DEFAULTS } from '../models/uiTheme'
import {
  cancelDraft,
  draftTheme,
  hasUnsavedChanges,
  initUiTheme,
  resetTheme,
  resolveIconName,
  saveTheme,
  savedTheme,
  updateDraft,
} from './uiTheme'

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

const TASKS_SNAPSHOT = JSON.stringify([
  { id: 't1', date: '2026-10-11', subjectId: 'math', subtaskId: null, startTime: '09:00', endTime: '10:00', content: '任务', done: false },
])

function useStorage(extra: Record<string, string> = {}): void {
  vi.stubGlobal('window', {
    localStorage: fakeLocalStorage({ [STORAGE_KEYS.tasks]: TASKS_SNAPSHOT, ...extra }),
  })
}

beforeEach(() => {
  useStorage()
  document.documentElement.removeAttribute('style')
  initUiTheme()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('UI 主题 store：实时预览', () => {
  it('initUiTheme 无配置时使用默认值且不写盘', () => {
    expect(savedTheme.value).toEqual(UI_THEME_DEFAULTS)
    expect(window.localStorage.getItem(STORAGE_KEYS.uiTheme)).toBeNull()
    // 默认主题也已应用到 :root（真实组件据此渲染）
    expect(document.documentElement.style.getPropertyValue('--card-gap')).not.toBe('')
  })

  it('修改草稿立即写入 :root 的 CSS 变量（真实首页实时预览）', () => {
    updateDraft({ cardRadius: 20, iconSize: 24, sidebarRatio: 35 })
    const root = document.documentElement
    expect(root.style.getPropertyValue('--card-radius')).toBe('20px')
    expect(root.style.getPropertyValue('--icon-size-md')).toBe('24px')
    expect(root.style.getPropertyValue('--home-columns')).toContain('35fr')
    // 尚未保存
    expect(hasUnsavedChanges.value).toBe(true)
    expect(window.localStorage.getItem(STORAGE_KEYS.uiTheme)).toBeNull()
  })

  it('取消预览回到已保存配置', () => {
    saveTheme()
    const saved = { ...savedTheme.value }
    updateDraft({ cardRadius: 24 })
    expect(draftTheme.value.cardRadius).toBe(24)
    cancelDraft()
    expect(draftTheme.value).toEqual(saved)
    expect(document.documentElement.style.getPropertyValue('--card-radius')).toBe(
      `${saved.cardRadius}px`,
    )
    expect(hasUnsavedChanges.value).toBe(false)
  })

  it('图标语义覆盖生效，并可解析非语义图标', () => {
    updateDraft({ icons: { ...draftTheme.value.icons, trash: 'close' } })
    expect(resolveIconName('trash')).toBe('close')
    expect(resolveIconName('plus')).toBe('plus')
    expect(resolveIconName('clock')).toBe('clock')
  })
})

describe('UI 主题 store：保存与恢复默认', () => {
  it('保存后写入独立命名空间，刷新（重新 init）仍然生效', () => {
    updateDraft({ cardRadius: 22, cardBg: '#fbfbfd', iconColor: '#33467f', cardBorder: false })
    saveTheme()

    const raw = window.localStorage.getItem(STORAGE_KEYS.uiTheme)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw ?? '{}').cardRadius).toBe(22)

    // 模拟刷新
    document.documentElement.removeAttribute('style')
    initUiTheme()
    expect(draftTheme.value.cardRadius).toBe(22)
    expect(draftTheme.value.cardBg).toBe('#fbfbfd')
    expect(draftTheme.value.cardBorder).toBe(false)
    expect(document.documentElement.style.getPropertyValue('--card-border-width')).toBe('0px')
  })

  it('写入的主题键损坏时按默认值处理，不影响使用', () => {
    useStorage({ [STORAGE_KEYS.uiTheme]: '{oops' })
    initUiTheme()
    expect(draftTheme.value).toEqual(UI_THEME_DEFAULTS)
  })

  it('恢复默认只重置样式：业务数据与设置完全不受影响', () => {
    updateDraft({ cardRadius: 26 })
    saveTheme()
    expect(window.localStorage.getItem(STORAGE_KEYS.uiTheme)).not.toBeNull()

    resetTheme()

    expect(window.localStorage.getItem(STORAGE_KEYS.uiTheme)).toBeNull()
    expect(draftTheme.value).toEqual(UI_THEME_DEFAULTS)
    expect(savedTheme.value).toEqual(UI_THEME_DEFAULTS)
    // 任务数据原样保留
    expect(window.localStorage.getItem(STORAGE_KEYS.tasks)).toBe(TASKS_SNAPSHOT)
  })
})
