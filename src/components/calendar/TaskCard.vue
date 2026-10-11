<script setup lang="ts">
import { computed } from 'vue'
import type { Task } from '../../models/types'
import { subjectOf, subtaskById } from '../../store/schedule'

/**
 * 日历任务卡片（周视图时间轴 / 折叠条 / 溢出列表共用）。
 * 固定信息顺序：
 *   第一行 `科目 | 子标签`（无标签时只显示科目）
 *   第二行 `开始时间–结束时间`
 *   第三行起 任务内容（自然换行，不做省略号截断）
 *
 * - 科目名 / 子标签名在日历展示区内最多显示 10 个字符，悬停时横向滚动显示完整名称；
 *   只限制展示宽度，不改动保存的数据。
 * - `placeholder` = 该卡片的时段是“展示用默认时段”（未安排任务的临时排布），
 *   不写回任务数据，因此时间行以虚线样式区分并在 title 中说明。
 */
const props = withDefaults(
  defineProps<{
    task: Task
    density?: 'comfortable' | 'compact'
    /** 展示用开始时间（'HH:mm'）：默认取任务自身时间 */
    displayStart?: string | null
    displayEnd?: string | null
    /** 是否为展示用默认时段（未安排任务的临时排布） */
    placeholder?: boolean
  }>(),
  { density: 'comfortable', displayStart: null, displayEnd: null, placeholder: false },
)

const emit = defineEmits<{ edit: [task: Task] }>()

const subject = computed(() => subjectOf(props.task.subjectId))
const subtaskName = computed(() => subtaskById(props.task.subtaskId)?.name ?? null)

const timeText = computed(() => {
  const start = props.displayStart ?? props.task.startTime
  const end = props.displayEnd ?? props.task.endTime
  if (start === null || end === null) return null
  return `${start}–${end}`
})

const title = computed(() => {
  const parts = [subject.value.name]
  if (subtaskName.value !== null) parts.push(subtaskName.value)
  if (timeText.value !== null) parts.push(timeText.value)
  parts.push(props.task.content)
  if (props.placeholder) parts.push('（临时展示时段，未保存到任务）')
  return parts.join(' | ')
})
</script>

<template>
  <button
    type="button"
    class="task-card"
    :class="[{ 'is-done': task.done }, `density-${density}`]"
    :style="{ '--subject-color': subject.color }"
    :title="title"
    @click.stop="emit('edit', task)"
  >
    <span class="card-bar" aria-hidden="true" />
    <span class="card-body">
      <span class="card-meta">
        <span class="meta-name">
          <span class="meta-scroll">{{ subject.name }}</span>
        </span>
        <template v-if="subtaskName !== null">
          <span class="card-sep" aria-hidden="true">|</span>
          <span class="meta-name">
            <span class="meta-scroll">{{ subtaskName }}</span>
          </span>
        </template>
      </span>

      <span v-if="timeText" class="card-time tabular" :class="{ 'is-placeholder': placeholder }">
        {{ timeText }}
      </span>
      <span v-else class="card-untimed">未安排时间</span>

      <span class="card-content">{{ task.content }}</span>
    </span>
  </button>
</template>

<style scoped>
.task-card {
  --meta-max-ch: 10ch;
  display: flex;
  gap: var(--space-2);
  width: 100%;
  padding: var(--row-pad);
  /* 无描边的浅色块：科目色仅作识别辅助，避免满屏边框与色块 */
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-surface-subtle);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  transition: background-color 0.12s ease;
}

/* 悬停回退（不支持 color-mix 的浏览器） */
.task-card:hover {
  background: var(--color-bg);
}

/* 支持 color-mix 时，用科目色浅底作为识别辅助（放在回退规则之后生效） */
@supports (background: color-mix(in srgb, red 8%, white)) {
  .task-card {
    background: color-mix(in srgb, var(--subject-color) 7%, var(--color-surface));
  }

  .task-card:hover {
    background: color-mix(in srgb, var(--subject-color) 13%, var(--color-surface));
  }
}

.task-card.density-compact {
  padding: var(--row-pad-sm);
  gap: 5px;
}

.card-bar {
  flex: 0 0 2px;
  border-radius: 1px;
  background: var(--subject-color);
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  width: 100%;
}

/* ---------- 第一行：科目 | 子标签 ---------- */

.card-meta {
  display: flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  letter-spacing: 0.02em;
  white-space: nowrap;
}

/* 名称最多占 10 个字符宽，超出部分悬停时横向滚动查看（不改动保存的数据） */
.meta-name {
  display: inline-block;
  max-width: var(--meta-max-ch);
  overflow: hidden;
  vertical-align: bottom;
}

.meta-scroll {
  display: inline-block;
  white-space: nowrap;
}

.task-card:hover .meta-scroll {
  animation: meta-name-scroll 3.6s linear infinite alternate;
}

@keyframes meta-name-scroll {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(min(0px, calc(var(--meta-max-ch) - 100%)));
  }
}

@media (prefers-reduced-motion: reduce) {
  .task-card:hover .meta-scroll {
    animation: none;
  }
}

.card-sep {
  flex-shrink: 0;
  color: var(--color-border-strong);
}

/* ---------- 第二行：开始时间–结束时间 ---------- */

.card-time {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  font-weight: var(--font-weight-regular);
  white-space: nowrap;
}

/* 展示用默认时段：虚线提示“临时排布，未写入任务” */
.card-time.is-placeholder {
  border-bottom: 1px dashed var(--color-border-strong);
  align-self: flex-start;
}

.card-untimed {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

/* ---------- 第三行起：任务内容 ---------- */

.card-content {
  font-size: var(--font-size-sm);
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.task-card.is-done .card-meta,
.task-card.is-done .card-time {
  color: var(--color-text-muted);
}

.task-card.is-done .card-content {
  color: var(--color-text-muted);
  text-decoration: line-through;
}
</style>

