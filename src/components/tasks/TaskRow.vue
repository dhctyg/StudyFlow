<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import type { Task } from '../../models/types'
import { subjectOf, subtaskById } from '../../store/schedule'
import { formatDayTitle } from '../../utils/date'
import { startTaskDrag } from '../../utils/taskDrag'

/**
 * 统一任务行（当日安排 / 逾期任务 / 临时任务箱共用）。
 * - 点击行或「⋯」→ 打开操作菜单（动作由父组件执行）；
 * - 行可拖动到日历日期改期（只传任务 ID，落点更新原任务日期）；
 * - 信息层级：任务内容（主）→ 科目 · 标签 → 日期 / 状态。
 */
const props = withDefaults(
  defineProps<{
    task: Task
    /** 是否显示日期信息（逾期 / 临时任务箱需要，当日安排可省） */
    showDate?: boolean
    /** 日期是否以“逾期”语气展示 */
    dateTone?: 'normal' | 'overdue'
  }>(),
  { showDate: false, dateTone: 'normal' },
)

const emit = defineEmits<{
  openMenu: [payload: { task: Task; x: number; y: number }]
  toggleDone: [task: Task]
}>()

const subject = computed(() => subjectOf(props.task.subjectId))
const subtaskName = computed(() => subtaskById(props.task.subtaskId)?.name ?? null)
const dateText = computed(() =>
  props.task.date === null ? '未安排日期' : formatDayTitle(props.task.date),
)

function onDragStart(event: DragEvent): void {
  startTaskDrag(event, props.task.id)
}

function onOpenMenu(event: MouseEvent): void {
  emit('openMenu', { task: props.task, x: event.clientX, y: event.clientY })
}
</script>

<template>
  <li
    class="task-row"
    :class="{ 'is-done': task.done, 'is-overdue': dateTone === 'overdue' }"
    draggable="true"
    title="可拖动到日历日期上改期"
    @dragstart="onDragStart"
  >
    <input
      class="row-check"
      type="checkbox"
      :checked="task.done"
      :aria-label="`标记完成：${task.content}`"
      @click.stop
      @change="emit('toggleDone', task)"
    />

    <button type="button" class="row-main" @click="onOpenMenu">
      <span class="row-title">{{ task.content }}</span>
      <span class="row-meta">
        <span class="row-dot" :style="{ background: subject.color }" aria-hidden="true" />
        <span class="row-subject">{{ subject.name }}</span>
        <template v-if="subtaskName !== null">
          <span class="row-sep" aria-hidden="true">·</span>
          <span class="row-subtask">{{ subtaskName }}</span>
        </template>
        <span v-if="task.done" class="row-state">已完成</span>
        <span v-if="showDate" class="row-date tabular" :class="{ 'is-overdue': dateTone === 'overdue' }">
          {{ dateText }}
        </span>
      </span>
    </button>

    <button type="button" class="icon-btn row-more" aria-label="任务操作" title="任务操作" @click.stop="onOpenMenu">
      <AppIcon name="more" size="sm" />
    </button>
  </li>
</template>

<style scoped>
.task-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--row-pad-sm);
  border-radius: var(--radius-md);
  transition: background-color 0.12s ease;
}

.task-row:hover {
  background: var(--color-surface-subtle);
}

.task-row.is-overdue {
  box-shadow: inset 2px 0 0 var(--color-overdue-border);
}

.row-check {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  margin-top: 2px;
  accent-color: var(--color-accent);
  cursor: pointer;
}

.row-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
}

/* 标题过长时换行，并允许在极窄处断词，不撑破卡片 */
.row-title {
  color: var(--text-primary);
  font-size: var(--font-size-base);
  overflow-wrap: anywhere;
}

.row-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.row-dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
}

.row-subtask {
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

.row-state {
  color: var(--color-success);
}

.row-date {
  color: var(--text-muted);
}

.row-date.is-overdue {
  color: var(--color-overdue-text);
}

.task-row.is-done .row-title {
  color: var(--text-muted);
  text-decoration: line-through;
}

.row-more {
  flex-shrink: 0;
  margin-top: -2px;
}
</style>
