<script setup lang="ts">
import AppIcon from '../common/AppIcon.vue'
import {
  goNext,
  goPrev,
  goToday,
  periodTitle,
  switchView,
  viewMode,
} from '../../store/schedule'

/**
 * 日历卡片头部：周期导航（上一 / 下一 / 今天）+ 视图切换（周 / 月）。
 * 科目筛选等卡片内工具通过 #filter 插槽传入，保证工具栏只有一处实现。
 */
</script>

<template>
  <header class="panel-head calendar-toolbar">
    <div class="period-nav">
      <button type="button" class="btn btn-quiet nav-arrow" aria-label="上一周期" @click="goPrev()">
        <AppIcon name="prev" size="sm" />
      </button>
      <span class="period-title tabular">{{ periodTitle }}</span>
      <button type="button" class="btn btn-quiet nav-arrow" aria-label="下一周期" @click="goNext()">
        <AppIcon name="next" size="sm" />
      </button>
      <button type="button" class="btn btn-ghost btn-today" @click="goToday()">今天</button>
    </div>

    <div class="toolbar-right">
      <slot name="filter" />

      <div class="view-switch" role="group" aria-label="视图切换">
        <button
          type="button"
          class="view-btn"
          :aria-pressed="viewMode === 'week'"
          @click="switchView('week')"
        >
          周
        </button>
        <button
          type="button"
          class="view-btn"
          :aria-pressed="viewMode === 'month'"
          @click="switchView('month')"
        >
          月
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.calendar-toolbar {
  gap: var(--space-2) var(--space-3);
  padding: var(--space-2) var(--space-3);
}

.period-nav {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-width: 0;
}

.nav-arrow {
  display: inline-flex;
  align-items: center;
  padding: 4px 7px;
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  line-height: 1;
}

.period-title {
  padding: 0 var(--space-2);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
  white-space: nowrap;
}

.btn-today {
  margin-left: var(--space-2);
  padding: 4px 10px;
}

.view-switch {
  display: flex;
  padding: 2px;
  border-radius: var(--radius-md);
  background: var(--color-bg);
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-left: auto;
  min-width: 0;
}

.view-btn {
  min-height: var(--button-height);
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-base);
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    color 0.12s ease;
}

.view-btn:hover {
  color: var(--color-text);
}

.view-btn[aria-pressed='true'] {
  background: var(--color-surface);
  color: var(--color-accent-text);
  font-weight: var(--font-weight-medium);
  box-shadow: var(--shadow-panel);
}

@media (max-width: 640px) {
  .period-title {
    font-size: var(--font-size-base);
    padding: 0 var(--space-1);
  }

  .btn-today {
    margin-left: 0;
  }
}
</style>

