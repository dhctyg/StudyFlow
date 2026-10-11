<script setup lang="ts">
import { computed, ref } from 'vue'
import TaskCard from './TaskCard.vue'
import WeekdayHeader from './WeekdayHeader.vue'
import type { Task } from '../../models/types'
import {
  dayTypeOf,
  selectDate,
  selectedDate,
  statusOf,
  visibleTasksOf,
  weekDays,
} from '../../store/schedule'
import { dayOf, todayKey } from '../../utils/date'
import { hasTaskDrag, readTaskDragId, startTaskDrag } from '../../utils/taskDrag'

/**
 * 周视图：日历只展示任务，不再渲染每日时间轴。
 *
 * - 星期标题是网格上方独立的圆角方框（不写进日期格），与列对齐；
 * - 每列 = 一天：日期 + 日期类型颜色标记（休息日 / 缓冲日，不再显示文字标签）+ 任务卡片；
 * - 不打日期数量 / 时长统计；选中日期用描边 + 轻微光晕；
 * - 点击列内空白区域 → 新增任务并默认填入该日期（点击任务卡片只打开编辑，不会误触发新增）；
 * - 右键列内任意位置，或点击表头的「⋯」，都可设置日期类型（普通日 / 休息日 / 缓冲日）；
 * - 从右侧任务列表或任务箱拖入任务 → 修改**原任务**的日期（不复制任务，不顺延其它任务）。
 */
const emit = defineEmits<{
  edit: [task: Task]
  create: [dateKey: string]
  moveTask: [taskId: string, dateKey: string]
  openDayMenu: [dateKey: string, x: number, y: number]
}>()

const today = todayKey()

interface DayColumn {
  key: string
  day: number
  isToday: boolean
  isSelected: boolean
  isRest: boolean
  isBuffer: boolean
  isComplete: boolean
  tasks: Task[]
}

const days = computed<DayColumn[]>(() =>
  weekDays.value.map((key) => {
    const type = dayTypeOf(key)
    return {
      key,
      day: dayOf(key),
      isToday: key === today,
      isSelected: key === selectedDate.value,
      isRest: type === 'rest',
      isBuffer: type === 'buffer',
      isComplete: statusOf(key) === 'completed',
      tasks: visibleTasksOf(key),
    }
  }),
)

/**
 * 列宽按本周最长任务内容估算（七天统一），超出面板宽度时在日历内部横向滚动，
 * 保证任务文字不被压成省略号，且日期表头 / 网格线与任务卡片始终对齐。
 */
const COLUMN_MIN_WIDTH = 132
const COLUMN_MAX_WIDTH = 260
const CHAR_WIDTH_ESTIMATE = 13
const COLUMN_EXTRA_WIDTH = 40

const columnWidth = computed(() => {
  let longest = 0
  for (const day of days.value) {
    for (const task of day.tasks) {
      if (task.content.length > longest) longest = task.content.length
    }
  }
  const estimated = longest * CHAR_WIDTH_ESTIMATE + COLUMN_EXTRA_WIDTH
  return Math.max(COLUMN_MIN_WIDTH, Math.min(COLUMN_MAX_WIDTH, estimated))
})

const weekMinWidth = computed(() => `${Math.round(columnWidth.value) * 7}px`)

/** 拖拽悬停的列（纯界面状态，不写入任何数据） */
const dropTarget = ref<string | null>(null)

function onColumnClick(day: DayColumn): void {
  selectDate(day.key)
  emit('create', day.key)
}

function onColumnContextMenu(day: DayColumn, event: MouseEvent): void {
  selectDate(day.key)
  emit('openDayMenu', day.key, event.clientX, event.clientY)
}

/** 非右键入口：表头「⋯」按钮 / 键盘激活 */
function openDayMenuByButton(day: DayColumn, event: MouseEvent): void {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  emit('openDayMenu', day.key, rect.left, rect.bottom + 4)
}

function onDragOver(day: DayColumn, event: DragEvent): void {
  if (!hasTaskDrag(event)) return
  event.preventDefault()
  if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move'
  dropTarget.value = day.key
}

function onDragLeave(day: DayColumn): void {
  if (dropTarget.value === day.key) dropTarget.value = null
}

function onDrop(day: DayColumn, event: DragEvent): void {
  dropTarget.value = null
  const taskId = readTaskDragId(event)
  if (taskId === null) return
  event.preventDefault()
  emit('moveTask', taskId, day.key)
}

/** 日历内的任务卡片同样可拖动改期（拖到任意日期列即可） */
function onTaskDragStart(task: Task, event: DragEvent): void {
  startTaskDrag(event, task.id)
}
</script>

<template>
  <div class="week-view" :style="{ '--week-min-width': weekMinWidth }">
    <div class="week-scroll">
      <!-- 星期标题：独立圆角方框，位于日期网格上方并与列对齐（不插入日期格） -->
      <WeekdayHeader :min-width="weekMinWidth" />

      <div class="week-grid">
        <section
          v-for="day in days"
          :key="day.key"
          class="day-column"
          :class="{
            'is-today': day.isToday,
            'is-selected': day.isSelected,
            'is-rest': day.isRest,
            'is-buffer': day.isBuffer,
            'is-drop-target': dropTarget === day.key,
          }"
          :aria-label="day.key"
          @contextmenu.prevent="onColumnContextMenu(day, $event)"
          @dragover="onDragOver(day, $event)"
          @dragleave="onDragLeave(day)"
          @drop="onDrop(day, $event)"
        >
          <header class="day-head" @click="selectDate(day.key)">
            <div class="head-line">
              <span class="head-day tabular">{{ day.day }}</span>
              <button
                type="button"
                class="head-menu"
                :aria-label="`设置 ${day.key} 的日期类型`"
                title="日期类型：普通日 / 休息日 / 缓冲日"
                @click.stop="openDayMenuByButton(day, $event)"
              >
                ⋯
              </button>
            </div>

            <span v-if="day.isComplete" class="badge-complete head-badge">完成</span>
          </header>

          <div class="day-body" @click="onColumnClick(day)">
            <TaskCard
              v-for="task in day.tasks"
              :key="task.id"
              :task="task"
              draggable="true"
              @dragstart="onTaskDragStart(task, $event)"
              @edit="emit('edit', $event)"
            />
            <p v-if="day.tasks.length === 0" class="day-empty">＋</p>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>


<style scoped>
.week-view {
  /* 窄屏时在日历面板内部横向滚动（实际宽度由组件按最长内容估算），七天共用同一列宽 */
  --week-min-width: 924px;
  height: 100%;
  min-height: 0;
  background: var(--color-surface);
  overflow: hidden;
}

.week-scroll {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: auto;
}

.week-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  min-width: var(--week-min-width);
  /* 占满剩余高度（内容更高时由滚动容器滚动），七天列高始终一致 */
  flex: 1 0 auto;
}

.day-column {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 240px;
  border-left: 1px solid var(--color-grid-divider);
  transition:
    background-color 0.12s ease,
    box-shadow 0.12s ease;
}

.day-column:first-child {
  border-left: none;
}

/* 休息日 / 缓冲日：用单元格底色 + 表头下边缘色低调区分（不再显示文字标签，也不改变行高） */
.day-column.is-rest {
  background: var(--color-rest-bg);
}

.day-column.is-buffer {
  background: var(--color-buffer-bg);
}

.day-column.is-rest .day-head {
  border-bottom-color: var(--color-rest-badge-border);
}

.day-column.is-buffer .day-head {
  border-bottom-color: var(--color-buffer-badge-border);
}

/* 悬停：与选中态明显不同（浅底，无描边） */
.day-column:hover:not(.is-selected):not(.is-drop-target) {
  background: var(--color-bg);
}

/* 选中日期：清晰描边 + 轻微光晕（不改变尺寸、不产生重叠） */
.day-column.is-selected {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
  box-shadow: 0 0 12px rgba(47, 51, 54, 0.16);
  background: var(--color-surface);
}

/* 键盘焦点：列内任一控件获得焦点时也给出可见提示 */
.day-column:focus-within:not(.is-selected) {
  outline: 2px dashed var(--color-accent);
  outline-offset: -2px;
}

.day-column.is-drop-target {
  background: var(--color-accent-soft);
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.day-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-1) var(--space-2) var(--space-2);
  border-bottom: 1px solid var(--color-grid-divider);
  background: var(--color-surface);
  cursor: pointer;
}

.day-column.is-rest .day-head {
  background: var(--color-rest-bg);
}

.day-column.is-buffer .day-head {
  background: var(--color-buffer-bg);
}

.head-line {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
}

.head-day {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-medium);
  /* 非选中日期略微降低对比度（仍清晰可读） */
  color: var(--color-text-secondary);
}

.day-column.is-selected .head-day,
.day-column.is-today .head-day {
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);
}

.head-badge {
  align-self: flex-start;
}

.head-menu {
  margin-left: auto;
  padding: 0 4px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-base);
  line-height: 1;
  cursor: pointer;
}

.head-menu:hover {
  background: var(--color-bg);
  color: var(--color-accent-text);
}

.day-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-height: 0;
  padding: var(--space-2);
  cursor: pointer;
}

.day-empty {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  margin: 0;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-size: var(--font-size-base);
  opacity: 0.6;
}
</style>

