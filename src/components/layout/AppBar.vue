<script setup lang="ts">
import AppIcon from '../common/AppIcon.vue'

/**
 * 顶部标题栏：左侧产品名，右侧「倒计时 / 轮次 / 科目 / 设置」四个独立入口。
 * 四个入口统一为「图标 + 文字」：同一套高度、圆角、间距、图标尺寸与交互状态
 * （窄屏自动压缩为图标，保留 aria-label 与 title）。
 */
const emit = defineEmits<{
  openSettings: []
  openCountdown: []
  openRounds: []
  openSubjects: []
}>()

const ENTRIES = [
  { id: 'countdown', label: '倒计时', icon: 'clock' },
  { id: 'rounds', label: '轮次', icon: 'calendar' },
  { id: 'subjects', label: '科目', icon: 'tasks' },
  { id: 'settings', label: '设置', icon: 'settings' },
] as const

function onEntry(id: (typeof ENTRIES)[number]['id']): void {
  if (id === 'countdown') emit('openCountdown')
  else if (id === 'rounds') emit('openRounds')
  else if (id === 'subjects') emit('openSubjects')
  else emit('openSettings')
}
</script>

<template>
  <header class="app-bar">
    <h1 class="brand">StudyFlow</h1>

    <nav class="bar-entries" aria-label="快捷管理">
      <button
        v-for="entry in ENTRIES"
        :key="entry.id"
        type="button"
        class="bar-entry"
        :class="{ 'is-settings': entry.id === 'settings' }"
        :title="entry.label"
        :aria-label="entry.label"
        @click="onEntry(entry.id)"
      >
        <AppIcon :name="entry.icon" size="sm" />
        <span class="entry-label">{{ entry.label }}</span>
      </button>
    </nav>
  </header>
</template>

<style scoped>
.app-bar {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  height: var(--header-height);
  flex-shrink: 0;
  padding: 0 var(--card-gap);
  background: var(--card-bg);
}
.brand {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.01em;
  color: var(--text-primary);
  white-space: nowrap;
}

/* 三个入口：高度、圆角、间距、字体与图标风格统一 */
.bar-entries {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin-left: auto;
  min-width: 0;
  overflow-x: auto;
}

.bar-entry {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: var(--button-height);
  padding: 0 10px;
  border: none;
  border-radius: var(--button-radius);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    color 0.12s ease;
}

.bar-entry:hover {
  background: var(--color-bg);
  color: var(--text-primary);
}

.bar-entry:active {
  background: var(--color-accent-soft);
}

/* 窄屏：入口压缩为图标（语义由 title / aria-label 保留），不造成标题栏溢出 */
@media (max-width: 760px) {
  .app-bar {
    gap: var(--space-2);
    padding: 0 var(--card-gap-sm);
  }

  .entry-label {
    display: none;
  }

  .bar-entry {
    padding: 0 8px;
  }
}
</style>
