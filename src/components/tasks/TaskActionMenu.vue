<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import type { IconName } from '../common/icons'

export interface TaskMenuItem {
  id: string
  label: string
  icon: IconName
  hint?: string
  danger?: boolean
}

/**
 * 任务操作菜单（固定定位气泡，与日期类型菜单同一套交互）。
 * 只负责展示与选择；具体动作由父组件执行，确保连接的是现有业务逻辑。
 */
const props = defineProps<{
  title: string
  items: TaskMenuItem[]
  x: number
  y: number
}>()

const emit = defineEmits<{
  select: [id: string]
  close: []
}>()

/** 贴边回收时使用的估算尺寸（与 .task-menu 的实际宽度保持一致） */
const MENU_WIDTH = 224

/** 贴近视口边缘时向内收，避免菜单被裁掉 */
const position = computed(() => {
  const width = MENU_WIDTH
  const height = 52 + props.items.length * 30
  const left = Math.max(8, Math.min(props.x, window.innerWidth - width - 8))
  const top = Math.max(8, Math.min(props.y, window.innerHeight - height - 8))
  return { left: `${left}px`, top: `${top}px` }
})
</script>

<template>
  <div class="task-menu-backdrop" @click="emit('close')" @contextmenu.prevent="emit('close')">
    <div class="task-menu" role="menu" :style="position" @click.stop>
      <p class="menu-title">{{ title }}</p>
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        role="menuitem"
        class="menu-item"
        :class="{ 'is-danger': item.danger === true }"
        @click="emit('select', item.id)"
      >
        <AppIcon :name="item.icon" size="sm" />
        <span class="menu-label">{{ item.label }}</span>
        <span v-if="item.hint" class="menu-hint">{{ item.hint }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.task-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
}

.task-menu {
  position: fixed;
  /* 与 MENU_WIDTH 保持一致：菜单更宽，任务标题与提示不再被挤成省略号 */
  min-width: 224px;
  max-width: calc(100vw - var(--space-4));
  padding: var(--space-1);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-md);
  background: var(--card-bg);
  box-shadow: var(--shadow-modal);
}

.menu-title {
  padding: 2px var(--space-2) var(--space-1);
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
}

.menu-item:hover {
  background: var(--color-surface-subtle);
}

.menu-item.is-danger {
  color: var(--color-danger);
}

.menu-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-hint {
  margin-left: auto;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}
</style>
