<script setup lang="ts">
import { computed } from 'vue'
import type { DayType } from '../../models/types'
import { DAY_TYPE_LABEL, DAY_TYPE_ORDER } from '../../models/dayType'
import { formatDayTitle } from '../../utils/date'

/**
 * 日期类型菜单（周视图 / 月视图共用）。
 * 同时服务于右键菜单与「⋯」按钮两种入口，键盘 / 触控板 / 触摸均可使用。
 * 仅负责选择，不直接改数据：由父组件调用 store 的 setDayType。
 */
const props = defineProps<{
  dateKey: string
  /** 当前类型，用于高亮 */
  current: DayType
  x: number
  y: number
}>()

const emit = defineEmits<{
  select: [type: DayType]
  close: []
}>()

/** 贴边回收时使用的估算尺寸（与 .day-type-menu 的实际宽度保持一致） */
const MENU_WIDTH = 208
const MENU_HEIGHT = 152

/** 贴近视口边缘时向内收，避免菜单被裁掉 */
const position = computed(() => {
  const width = MENU_WIDTH
  const height = MENU_HEIGHT
  const left = Math.max(8, Math.min(props.x, window.innerWidth - width - 8))
  const top = Math.max(8, Math.min(props.y, window.innerHeight - height - 8))
  return { left: `${left}px`, top: `${top}px` }
})
</script>

<template>
  <div class="day-type-backdrop" @click="emit('close')" @contextmenu.prevent="emit('close')">
    <div
      class="day-type-menu"
      role="menu"
      :style="position"
      @click.stop
      @contextmenu.prevent.stop
    >
      <p class="menu-title">{{ formatDayTitle(dateKey) }}</p>
      <button
        v-for="type in DAY_TYPE_ORDER"
        :key="type"
        type="button"
        role="menuitem"
        class="menu-item"
        :class="{ 'is-current': type === current }"
        @click="emit('select', type)"
      >
        <span class="menu-dot" :class="`is-${type}`" aria-hidden="true" />
        <span>{{ DAY_TYPE_LABEL[type] }}</span>
        <span v-if="type === current" class="menu-current">当前</span>
      </button>
      <p class="menu-hint">仅修改日期类型，不改动任何任务。</p>
    </div>
  </div>
</template>

<style scoped>
.day-type-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
}

.day-type-menu {
  position: fixed;
  /* 与 MENU_WIDTH 保持一致：菜单更宽，日期标题与「当前」标记不再拥挤 */
  min-width: 208px;
  padding: var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: var(--shadow-panel);
}

.menu-title {
  padding: 2px var(--space-2) var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: 5px var(--space-2);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard);
}

.menu-item:hover {
  background: var(--color-surface-subtle);
}

.menu-item:active {
  background: var(--color-accent-soft);
}

.menu-item.is-current {
  color: var(--color-accent-text);
  font-weight: var(--font-weight-medium);
}

.menu-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--color-border-strong);
}

.menu-dot.is-rest {
  background: var(--color-rest-badge-text);
}

.menu-dot.is-buffer {
  background: var(--color-buffer-text);
}

.menu-current {
  margin-left: auto;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-regular);
}

.menu-hint {
  padding: 2px var(--space-2) 4px;
  color: var(--color-text-muted);
  font-size: 10px;
}

/**
 * ---------- 进入 / 退出动效（name="menu"） ----------
 * 过渡类由父组件的 <Transition name="menu"> 加在组件根节点（.day-type-backdrop）上，
 * 因此这里能直接命中间层面板：菜单轻微位移 + 淡入淡出，与弹窗动效保持同一套节奏。
 * 根节点与面板的过渡时长一致，退出时 Vue 以根节点时长为准，面板不会中途被截断。
 */
.menu-enter-active {
  transition: opacity var(--duration-base) var(--ease-out);
}

.menu-leave-active {
  transition: opacity var(--duration-base) var(--ease-in);
  /* 退出动画期间不再拦截点击：避免快速连续操作时这一下被透明的菜单背板吞掉 */
  pointer-events: none;
}

.menu-enter-active .day-type-menu {
  transition:
    opacity var(--duration-base) var(--ease-out),
    transform var(--duration-base) var(--ease-out);
}

.menu-leave-active .day-type-menu {
  transition:
    opacity var(--duration-base) var(--ease-in),
    transform var(--duration-base) var(--ease-in);
}

.menu-enter-from,
.menu-leave-to {
  opacity: 0;
}

.menu-enter-from .day-type-menu,
.menu-leave-to .day-type-menu {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
