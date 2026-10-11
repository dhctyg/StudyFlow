<script setup lang="ts">
import { computed } from 'vue'
import CalendarHeader from '../calendar/CalendarHeader.vue'
import MonthView from '../calendar/MonthView.vue'
import WeekView from '../calendar/WeekView.vue'
import type { DayType, Task } from '../../models/types'
import { DAY_TYPE_LABEL, DAY_TYPE_ORDER } from '../../models/dayType'
import {
  selectedDate,
  selectedDayType,
  selectedStatus,
  selectedTitle,
  setDayType,
  setSubjectFilter,
  subjectFilter,
  subjects,
  viewMode,
} from '../../store/schedule'

/** 日期类型按钮的短标签（完整名称见 title，减少视觉噪声） */
const DAY_TYPE_SHORT: Record<DayType, string> = {
  normal: '普通',
  rest: '休息',
  buffer: '缓冲',
}

/**
 * 卡片二：日历（首页主要工作区域）。
 *
 * - 只展示日历与任务，**没有每日时间轴**；
 * - 科目筛选为单选按钮组（边框 / 文字用科目主题色，选中用该色的淡化填充），位置不变；
 * - 视图切换、日期导航集成在卡片内部；日期类型通过单元格底色 / 边缘色区分（不再显示文字标签）；
 * - 点击日期空白区域新增任务（自动带入日期），点击任务只打开操作，不会误触发新增；
 * - 任务可拖动到目标日期改期；右键或「⋯」设置日期类型。
 */
const emit = defineEmits<{
  edit: [task: Task]
  create: [dateKey: string]
  moveTask: [taskId: string, dateKey: string]
  openDayMenu: [dateKey: string, x: number, y: number]
}>()

const isWeek = computed(() => viewMode.value === 'week')
const isAllSubjects = computed(() => subjectFilter.value === null)

function onMoveTask(taskId: string, dateKey: string): void {
  emit('moveTask', taskId, dateKey)
}

function onOpenDayMenu(dateKey: string, x: number, y: number): void {
  emit('openDayMenu', dateKey, x, y)
}
</script>

<template>
  <section class="home-card calendar-card">
    <CalendarHeader>
      <template #filter>
        <!-- 科目筛选：单选按钮组（同一时间只能选一个；「全部」保留原筛选逻辑） -->
        <div class="subject-filter" role="group" aria-label="科目筛选">
          <button
            type="button"
            class="subject-chip is-all"
            :class="{ 'is-active': isAllSubjects }"
            :aria-pressed="isAllSubjects"
            @click="setSubjectFilter(null)"
          >
            全部
          </button>
          <button
            v-for="subject in subjects"
            :key="subject.id"
            type="button"
            class="subject-chip"
            :class="{ 'is-active': subjectFilter === subject.id }"
            :style="{ '--subject-color': subject.color }"
            :aria-pressed="subjectFilter === subject.id"
            @click="setSubjectFilter(subject.id)"
          >
            {{ subject.name }}
          </button>
        </div>
      </template>
    </CalendarHeader>

    <!-- 选中日期 + 可见的日期类型入口（类型区分靠日历单元格颜色，不再显示文字标签） -->
    <div class="date-actions">
      <span class="selected-date">{{ selectedTitle }}</span>

      <span v-if="selectedStatus === 'completed'" class="badge-complete">全部完成</span>

      <div class="date-type-group" role="group" aria-label="设置日期类型">
        <button
          v-for="type in DAY_TYPE_ORDER"
          :key="type"
          type="button"
          class="icon-btn type-btn"
          :class="`is-${type}`"
          :aria-pressed="selectedDayType === type"
          :title="`设为${DAY_TYPE_LABEL[type]}`"
          @click="setDayType(selectedDate, type)"
        >
          {{ DAY_TYPE_SHORT[type] }}
        </button>
      </div>

      <button
        type="button"
        class="btn btn-primary add-btn"
        @click="emit('create', selectedDate)"
      >
        新增任务
      </button>
    </div>

    <div class="calendar-view">
      <WeekView
        v-if="isWeek"
        @edit="emit('edit', $event)"
        @create="emit('create', $event)"
        @move-task="onMoveTask"
        @open-day-menu="onOpenDayMenu"
      />
      <MonthView
        v-else
        @create="emit('create', $event)"
        @move-task="onMoveTask"
        @open-day-menu="onOpenDayMenu"
      />
    </div>
  </section>
</template>


<style scoped>
.calendar-card {
  min-height: 0;
}

/* 科目筛选：圆角单选按钮；未选中＝透明底 + 科目主题色边框与文字，选中＝主题色淡化填充 */
.subject-filter {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  min-width: 0;
}

.subject-chip {
  display: inline-flex;
  align-items: center;
  height: var(--button-height);
  padding: 0 10px;
  border: 1px solid var(--subject-color, var(--color-border-strong));
  border-radius: var(--button-radius);
  background: transparent;
  color: var(--subject-color, var(--text-secondary));
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    color 0.12s ease,
    border-color 0.12s ease;
}

.subject-chip.is-all {
  --subject-color: var(--color-border-strong);
  color: var(--text-secondary);
}

/* 悬停回退（不支持 color-mix 的浏览器用中性浅底） */
.subject-chip:hover {
  background: var(--color-bg);
}

.subject-chip.is-active {
  border-color: var(--subject-color, var(--color-accent));
  color: var(--text-primary);
  background: var(--color-accent-soft);
}

/* 支持 color-mix 时，选中态用该科目主题色的淡化版本作填充，文字保持清晰 */
@supports (background: color-mix(in srgb, red 12%, white)) {
  .subject-chip:hover {
    background: color-mix(in srgb, var(--subject-color) 10%, var(--color-surface));
  }

  .subject-chip.is-active {
    background: color-mix(in srgb, var(--subject-color) 16%, var(--color-surface));
  }
}

.date-actions {
  display: flex;
  align-items: center;
  gap: var(--block-gap-sm);
  flex-shrink: 0;
  flex-wrap: wrap;
  padding: var(--space-2) var(--card-pad);
  /* 不加分隔线：用背景层次区分区域 */
  background: var(--color-surface-subtle);
}

.selected-date {
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
}

.date-type-group {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin-left: auto;
}

.type-btn {
  font-size: var(--font-size-xs);
}

.type-btn.is-rest[aria-pressed='true'] {
  border-color: var(--color-rest-badge-border);
  background: var(--color-rest-badge-bg);
  color: var(--color-rest-badge-text);
}

.type-btn.is-buffer[aria-pressed='true'] {
  border-color: var(--color-buffer-badge-border);
  background: var(--color-buffer-badge-bg);
  color: var(--color-buffer-badge-text);
}

.add-btn {
  padding: 5px 12px;
}

.calendar-view {
  display: flex;
  flex: 1;
  min-height: 0;
}

.calendar-view > * {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

@media (max-width: 1100px) {
  .subject-chip {
    padding: 0 8px;
  }
}
</style>

