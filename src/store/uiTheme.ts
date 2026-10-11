/**
 * UI 主题 store（阶段三）：实时预览 + 保存 + 恢复默认。
 *
 * - saved：已保存并持久化的主题；draft：面板当前值。
 * - 任何草稿修改都会**立即写入 :root 的 CSS 变量**，所以真实首页马上变化，
 *   而不是只改设置面板自身。
 * - 保存写入独立的 localStorage 命名空间（uiTheme 键）；恢复默认只清除该键，
 *   任务 / 科目 / 日期类型 / 配置等业务数据完全不受影响。
 */
import { computed, reactive } from 'vue'
import type { IconName } from '../components/common/icons'
import {
  UI_THEME_DEFAULTS,
  sanitizeUiTheme,
  uiThemeCssVars,
  type IconRole,
  type UiTheme,
} from '../models/uiTheme'
import * as storage from '../services/storage'

interface UiThemeState {
  saved: UiTheme
  draft: UiTheme
  /** 当前真正应用到 :root 的主题（= draft） */
  applied: UiTheme
}

function cloneTheme(theme: UiTheme): UiTheme {
  return { ...theme, icons: { ...theme.icons } }
}

const state = reactive<UiThemeState>({
  saved: cloneTheme(UI_THEME_DEFAULTS),
  draft: cloneTheme(UI_THEME_DEFAULTS),
  applied: cloneTheme(UI_THEME_DEFAULTS),
})

/** 把主题映射到 :root 的 CSS 变量（组件样式本就依赖这些令牌） */
function applyToRoot(theme: UiTheme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  for (const [name, value] of Object.entries(uiThemeCssVars(theme))) {
    root.style.setProperty(name, value)
  }
  state.applied = cloneTheme(theme)
}

/** 初始化：读取已保存主题并应用（无配置时用默认值，不写盘） */
export function initUiTheme(): void {
  const loaded = storage.loadUiTheme()
  state.saved = cloneTheme(loaded)
  state.draft = cloneTheme(loaded)
  applyToRoot(loaded)
}

export const savedTheme = computed(() => state.saved)
export const draftTheme = computed(() => state.draft)

/** 是否有未保存的修改（面板据此区分「预览」与「已保存」） */
export const hasUnsavedChanges = computed(
  () => JSON.stringify(state.saved) !== JSON.stringify(state.draft),
)

/** 修改草稿：立即预览（不落盘） */
export function updateDraft(patch: Partial<UiTheme>): void {
  state.draft = sanitizeUiTheme({ ...state.draft, ...patch })
  applyToRoot(state.draft)
}

/** 设置某个语义角色的图标（只能从候选列表里选，见 models/uiTheme.ts） */
export function setDraftIcon(role: IconRole, icon: IconName): void {
  updateDraft({ icons: { ...state.draft.icons, [role]: icon } })
}

/** 保存：写入独立命名空间，并保持当前预览 */
export function saveTheme(): void {
  state.saved = sanitizeUiTheme(state.draft)
  storage.saveUiTheme(state.saved)
  applyToRoot(state.saved)
}

/** 取消未保存的修改：回到已保存配置 */
export function cancelDraft(): void {
  state.draft = cloneTheme(state.saved)
  applyToRoot(state.saved)
}

/** 恢复默认：清除主题键并回到默认样式（不影响任何业务数据） */
export function resetTheme(): void {
  state.saved = cloneTheme(UI_THEME_DEFAULTS)
  state.draft = cloneTheme(UI_THEME_DEFAULTS)
  storage.clearUiTheme()
  applyToRoot(state.saved)
}

/** 图标语义解析：可自定义的语义角色使用用户选择，其余图标按原名渲染 */
export function resolveIconName(name: IconName): IconName {
  const icons: Record<string, IconName> = state.draft.icons
  return name in icons ? icons[name] : name
}
