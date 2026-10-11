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

/** 贴近视口边缘时向内收，避免菜单被裁掉 */
const position = computed(() => {
  const width = 168
  const height = 148
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
  min-width: 168px;
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
}

.menu-item:hover {
  background: var(--color-surface-subtle);
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
</style>
