<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import type { IconName } from '../common/icons'
import {
  ICON_CANDIDATES,
  ICON_ROLE_LABEL,
  ICON_ROLES,
  UI_THEME_NUMERIC,
  type IconRole,
  type NumericThemeKey,
  type UiTheme,
} from '../../models/uiTheme'
import {
  cancelDraft,
  draftTheme,
  hasUnsavedChanges,
  resetTheme,
  saveTheme,
  setDraftIcon,
  updateDraft,
} from '../../store/uiTheme'

/**
 * 界面自定义面板（设置在右侧内容区中渲染，不再是独立弹窗）。
 *
 * - 修改任何参数都会**立即**写入 :root 的 CSS 变量（真实首页实时预览）；
 * - 「保存设置」写入独立命名空间，刷新后仍然生效；
 * - 「恢复默认」只重置样式（任务 / 科目 / 日期类型 / 配置不受影响）；
 * - 「放弃修改」回到已保存配置（面板顶部明确区分预览与已保存状态）。
 */
const emit = defineEmits<{
  notice: [message: string]
}>()

interface Control {
  key: NumericThemeKey
  label: string
  unit: string
}

const LAYOUT_CONTROLS: Control[] = [
  { key: 'contentMaxWidth', label: '内容最大宽度', unit: 'px' },
  { key: 'sidebarRatio', label: '右栏占比', unit: '%' },
  { key: 'cardGap', label: '卡片间距', unit: 'px' },
  { key: 'cardPadding', label: '卡片内边距', unit: 'px' },
  { key: 'cardRadius', label: '卡片圆角', unit: 'px' },
  { key: 'cardShadow', label: '阴影强度', unit: '级' },
]

const TEXT_CONTROLS: Control[] = [
  { key: 'fontScale', label: '全局字号缩放', unit: '×' },
  { key: 'titleScale', label: '主标题字号', unit: '×' },
  { key: 'cardTitleScale', label: '卡片标题字号', unit: '×' },
  { key: 'bodyScale', label: '正文字号', unit: '×' },
  { key: 'mutedScale', label: '辅助文字字号', unit: '×' },
]

const ICON_CONTROLS: Control[] = [{ key: 'iconSize', label: '图标尺寸', unit: 'px' }]

const CONTROL_CONTROLS: Control[] = [
  { key: 'buttonRadius', label: '按钮圆角', unit: 'px' },
  { key: 'buttonHeight', label: '按钮高度', unit: 'px' },
  { key: 'controlGap', label: '控件间距', unit: 'px' },
  { key: 'rowPadding', label: '任务行间距', unit: 'px' },
]

type ColorKey = 'cardBg' | 'pageBg' | 'textColor' | 'textMutedColor' | 'cardBorderColor'

const COLORS: { key: ColorKey; label: string }[] = [
  { key: 'pageBg', label: '页面背景' },
  { key: 'cardBg', label: '卡片背景' },
  { key: 'textColor', label: '主文字' },
  { key: 'textMutedColor', label: '次要文字' },
  { key: 'cardBorderColor', label: '边框颜色' },
]

/** 参数分组（模板按分组渲染，避免重复标记） */
const SECTIONS: { title: string; controls: Control[]; colors: typeof COLORS }[] = [
  { title: '整体布局', controls: LAYOUT_CONTROLS, colors: [] },
  { title: '颜色', controls: [], colors: COLORS },
  { title: '文字', controls: TEXT_CONTROLS, colors: [] },
  { title: '图标', controls: ICON_CONTROLS, colors: [] },
  { title: '卡片与控件', controls: CONTROL_CONTROLS, colors: [] },
]

const theme = computed(() => draftTheme.value)
const dirty = computed(() => hasUnsavedChanges.value)

function specOf(key: NumericThemeKey) {
  return UI_THEME_NUMERIC[key]
}

function displayValue(key: NumericThemeKey): string | number {
  const value = theme.value[key]
  return specOf(key).step < 1 ? value.toFixed(2) : value
}

function onNumber(key: NumericThemeKey, event: Event): void {
  const raw = (event.target as HTMLInputElement).value
  if (raw === '') {
    updateDraft({ [key]: specOf(key).fallback } as Partial<UiTheme>)
    return
  }
  updateDraft({ [key]: Number(raw) } as Partial<UiTheme>)
}

function onColor(key: ColorKey, event: Event): void {
  updateDraft({ [key]: (event.target as HTMLInputElement).value } as Partial<UiTheme>)
}

function onIconColor(event: Event): void {
  updateDraft({ iconColor: (event.target as HTMLInputElement).value })
}

function onIcon(role: IconRole, icon: IconName): void {
  setDraftIcon(role, icon)
}

function onSave(): void {
  saveTheme()
  emit('notice', '界面样式已保存')
}

function onReset(): void {
  resetTheme()
  emit('notice', '已恢复默认样式（任务数据未受影响）')
}

function onCancel(): void {
  cancelDraft()
}
</script>

<template>
  <div class="customizer-panel">
    <div class="customizer">
      <p class="state-line" role="status">
        {{ dirty ? '预览中：修改尚未保存，关闭设置即回到已保存样式。' : '当前样式已保存。' }}
      </p>

      <section v-for="section in SECTIONS" :key="section.title" class="group">
        <h3 class="group-title">{{ section.title }}</h3>

        <div v-for="control in section.controls" :key="control.key" class="row">
          <label class="row-label" :for="`ui-${control.key}`">{{ control.label }}</label>
          <input :id="`ui-${control.key}`" class="range" type="range" :aria-label="control.label"
            :min="specOf(control.key).min" :max="specOf(control.key).max" :step="specOf(control.key).step"
            :value="theme[control.key]" @input="onNumber(control.key, $event)" />
          <input class="input num" type="number" :aria-label="`${control.label}数值`"
            :min="specOf(control.key).min" :max="specOf(control.key).max" :step="specOf(control.key).step"
            :value="displayValue(control.key)" @input="onNumber(control.key, $event)" />
          <span class="unit">{{ control.unit }}</span>
        </div>

        <div v-for="color in section.colors" :key="color.key" class="row">
          <label class="row-label" :for="`ui-color-${color.key}`">{{ color.label }}</label>
          <input :id="`ui-color-${color.key}`" class="color" type="color" :aria-label="color.label"
            :value="theme[color.key]" @input="onColor(color.key, $event)" />
          <span class="hex tabular">{{ theme[color.key] }}</span>
        </div>

        <!-- 图标：尺寸之外还支持更换语义图标（只能从现有图标库候选里选） -->
        <template v-if="section.title === '图标'">
          <div class="row">
            <label class="row-label" for="ui-iconColor">图标颜色</label>
            <input id="ui-iconColor" class="color" type="color" aria-label="图标颜色"
              :value="theme.iconColor === '' ? '#565e6b' : theme.iconColor" @input="onIconColor" />
            <button type="button" class="btn btn-ghost" :aria-pressed="theme.iconColor === ''"
              @click="updateDraft({ iconColor: '' })">跟随文字</button>
          </div>

          <div v-for="role in ICON_ROLES" :key="role" class="icon-row">
            <span class="row-label">{{ ICON_ROLE_LABEL[role] }}</span>
            <div class="icon-choices" role="group" :aria-label="`${ICON_ROLE_LABEL[role]}图标`">
              <button v-for="candidate in ICON_CANDIDATES[role]" :key="candidate" type="button"
                class="icon-choice" :class="{ 'is-active': theme.icons[role] === candidate }"
                :aria-label="`${ICON_ROLE_LABEL[role]}：${candidate}`" :aria-pressed="theme.icons[role] === candidate"
                @click="onIcon(role, candidate)">
                <AppIcon :name="candidate" raw />
              </button>
            </div>
          </div>
        </template>

        <!-- 卡片与控件：边框开关 -->
        <div v-if="section.title === '卡片与控件'" class="row">
          <span class="row-label">卡片边框</span>
          <button type="button" class="btn btn-ghost" :aria-pressed="theme.cardBorder"
            @click="updateDraft({ cardBorder: !theme.cardBorder })">
            {{ theme.cardBorder ? '显示' : '隐藏' }}
          </button>
        </div>
      </section>
    </div>

    <div class="customizer-actions">
      <button type="button" class="btn btn-ghost" :disabled="!dirty" @click="onCancel">放弃修改</button>
      <button type="button" class="btn btn-ghost" @click="onReset">恢复默认</button>
      <button type="button" class="btn btn-primary" @click="onSave">保存设置</button>
    </div>
  </div>
</template>


<style scoped>
.customizer-panel {
  display: flex;
  flex-direction: column;
  gap: var(--block-gap);
}

.customizer {
  display: flex;
  flex-direction: column;
  gap: var(--block-gap);
}

.state-line {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}

.group {
  display: flex;
  flex-direction: column;
  gap: var(--block-gap-sm);
  padding-bottom: var(--block-gap-sm);
}

.group:last-child {
  padding-bottom: 0;
}

.group-title {
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--control-gap);
  min-width: 0;
}

.row-label {
  flex: 0 0 96px;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.range {
  flex: 1;
  min-width: 0;
  accent-color: var(--color-accent);
}

.num {
  width: 76px;
  padding: 3px 6px;
  text-align: right;
}

.unit {
  flex: 0 0 18px;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}

.color {
  width: 42px;
  height: var(--button-height);
  padding: 2px;
  border: 1px solid var(--card-border);
  border-radius: var(--button-radius);
  background: var(--card-bg);
  cursor: pointer;
}

.hex {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}

.icon-row {
  display: flex;
  align-items: center;
  gap: var(--control-gap);
  min-width: 0;
}

.icon-choices {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.icon-choice {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--button-height) + 4px);
  height: calc(var(--button-height) + 4px);
  border: 1px solid var(--card-border);
  border-radius: var(--button-radius);
  background: var(--card-bg);
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--ease-standard),
    background-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard),
    transform var(--duration-fast) var(--ease-out);
}

.icon-choice:hover {
  color: var(--color-accent-text);
}

/* 按下：轻微收缩（选中态的描边与浅底平滑过渡） */
.icon-choice:active {
  transform: scale(0.96);
}

.icon-choice.is-active {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
  color: var(--color-accent-text);
}

.customizer-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--control-gap);
  margin-top: var(--space-4);
}
</style>

