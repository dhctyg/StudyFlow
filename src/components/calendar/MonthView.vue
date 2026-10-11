<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  anchorDate,
  dayTypeOf,
  monthCells,
  selectDate,
  selectedDate,
  sortTasksByTime,
  statusOf,
  subjectOf,
  visibleTasksOf,
} from '../../store/schedule'
import WeekdayHeader from './WeekdayHeader.vue'
import { dayOf, todayKey } from '../../utils/date'
import { hasTaskDrag, readTaskDragId } from '../../utils/taskDrag'

/**
 * 月视图：标准月历网格（周一开头，整周对齐），只展示任务，没有时间轴。
 *
 * - 每个日期格直接列出当天任务（任务标题 + 科目色点），最多 3 条，超出显示「+N」；
 *   这样月视图里能看到**任务本身**，而不是只有科目色条。
 * - 已完成任务保留（加删除线），完成状态语义不变。
 * - 休息日（蓝）/ 缓冲日（青）/ 全部完成（绿）仍以文字标记展示，不只靠颜色。
 * - 点击日期数字选中该日；点击格子空白处（＋）为该日期新增任务；
 *   右键或「⋯」设置日期类型；从任务面板拖入任务可改期。
 * - 列表只受科目筛选影响。
 */
const MAX_TASKS = 3

const emit = defineEmits<{
  create: [dateKey: string]
  moveTask: [taskId: string, dateKey: string]
  openDayMenu: [dateKey: string, x: number, y: number]
}>()

const today = todayKey()
/** 拖拽悬停的日期格（纯界面状态） */
const dropTarget = ref<string | null>(null)

const anchorMonth = computed(() => anchorDate.value.slice(0, 7))

const cells = computed(() =>
  monthCells.value.map((key) => {
    const tasks = sortTasksByTime(visibleTasksOf(key))
    const type = dayTypeOf(key)
    return {
      key,
      day: dayOf(key),
      inMonth: key.slice(0, 7) === anchorMonth.value,
      isToday: key === today,
      isSelected: key === selectedDate.value,
      isRest: type === 'rest',
      isBuffer: type === 'buffer',
      isComplete: statusOf(key) === 'completed',
      total: tasks.length,
      visibleTasks: tasks.slice(0, MAX_TASKS).map((task) => ({
        id: task.id,
        content: task.content,
        subject: subjectOf(task.subjectId),
        time:
          task.startTime === null
            ? ''
            : task.endTime === null
              ? task.startTime
              : `${task.startTime}–${task.endTime}`,
        done: task.done,
      })),
      overflowCount: Math.max(0, tasks.length - MAX_TASKS),
    }
  }),
)

function onCellClick(key: string): void {
  selectDate(key)
}

/** 点击格子空白处：为该日期新增任务（默认日期 = 该格日期） */
function onBlankClick(key: string): void {
  selectDate(key)
  emit('create', key)
}

/** 右键：设置日期类型 */
function onCellContextMenu(key: string, event: MouseEvent): void {
  selectDate(key)
  emit('openDayMenu', key, event.clientX, event.clientY)
}

/** 非右键入口：格子右上角「⋯」按钮 / 键盘激活 */
function openDayMenuByButton(key: string, event: MouseEvent): void {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  emit('openDayMenu', key, rect.left, rect.bottom + 4)
}

function onDragOver(key: string, event: DragEvent): void {
  if (!hasTaskDrag(event)) return
  event.preventDefault()
  if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move'
  dropTarget.value = key
}

function onDragLeave(key: string): void {
  if (dropTarget.value === key) dropTarget.value = null
}

function onDrop(key: string, event: DragEvent): void {
  dropTarget.value = null
  const taskId = readTaskDragId(event)
  if (taskId === null) return
  event.preventDefault()
  emit('moveTask', taskId, key)
}
</script>

<template>
  <div class="month-view">
    <!-- 星期标题：独立圆角方框（只显示一个汉字），与日期列对齐，不插入日期格 -->
    <WeekdayHeader min-width="620px" />

    <div class="month-grid">
      <section
        v-for="cell in cells"
        :key="cell.key"
        class="month-cell"
        :class="{
          'is-outside': !cell.inMonth,
          'is-today': cell.isToday,
          'is-selected': cell.isSelected,
          'is-rest': cell.isRest,
          'is-buffer': cell.isBuffer,
          'is-drop-target': dropTarget === cell.key,
        }"
        :aria-label="cell.key"
        @contextmenu.prevent="onCellContextMenu(cell.key, $event)"
        @dragover="onDragOver(cell.key, $event)"
        @dragleave="onDragLeave(cell.key)"
        @drop="onDrop(cell.key, $event)"
      >
        <header class="cell-head" @click="onCellClick(cell.key)">
          <div class="cell-headline">
            <span class="cell-day tabular" :class="{ 'is-complete': cell.isComplete }">
              {{ cell.day }}
            </span>
            <button
              type="button"
              class="cell-menu"
              :aria-label="`设置 ${cell.key} 的日期类型`"
              title="日期类型：普通日 / 休息日 / 缓冲日"
              @click.stop="openDayMenuByButton(cell.key, $event)"
            >
              ⋯
            </button>
          </div>
          <span v-if="cell.isComplete" class="badge-complete cell-badge">完成</span>
        </header>

        <ul v-if="cell.visibleTasks.length > 0" class="cell-tasks" @click="onCellClick(cell.key)">
          <li
            v-for="task in cell.visibleTasks"
            :key="task.id"
            class="cell-task"
            :class="{ 'is-done': task.done }"
            :title="`${task.subject.name}${task.time === '' ? '' : ` · ${task.time}`} · ${task.content}`"
          >
            <span
              class="cell-task-dot"
              :style="{ background: task.subject.color }"
              aria-hidden="true"
            />
            <span class="cell-task-text">{{ task.content }}</span>
          </li>
          <li v-if="cell.overflowCount > 0" class="cell-task-more tabular" title="更多任务">
            +{{ cell.overflowCount }}
          </li>
        </ul>

        <!-- 空白区域：点击即为该日期新增任务（默认日期 = 该格日期） -->
        <button
          type="button"
          class="cell-blank"
          :aria-label="`为 ${cell.key} 新增任务`"
          title="点击新增任务"
          @click.stop="onBlankClick(cell.key)"
        >
          ＋
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.month-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  /* 窄屏时在日历面板内部滚动，保证日期网格可用 */
  overflow: auto;
}

.month-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  grid-auto-rows: 1fr;
  flex: 1;
  min-width: 620px;
  min-height: 400px;
}

.month-cell {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  min-height: 0;
  padding: var(--space-1) var(--space-2) var(--space-2);
  /* 每个格子只画右 / 上两条线，避免相邻格子重复描边形成粗线 */
  border-right: 1px solid var(--color-grid-divider);
  border-top: 1px solid var(--color-grid-divider);
  cursor: pointer;
  overflow: hidden;
}

/* 最后一列不画右线（由面板边框收口）；第一行不画上线（由表头下边框收口） */
.month-cell:nth-child(7n) {
  border-right: none;
}

.month-cell:nth-child(-n + 7) {
  border-top: none;
}

/* 休息日 / 缓冲日：格子底色 + 上边缘色低调区分（不再显示文字标签，也不改变行高） */
.month-cell.is-rest {
  background: var(--color-rest-bg);
  border-top-color: var(--color-rest-badge-border);
}

.month-cell.is-buffer {
  background: var(--color-buffer-bg);
  border-top-color: var(--color-buffer-badge-border);
}

/* 悬停：与选中态明显不同（浅底，无描边） */
.month-cell:hover:not(.is-selected):not(.is-drop-target) {
  background: var(--color-bg);
}

/* 选中日期：清晰描边 + 轻微光晕（不改变尺寸、不产生重叠） */
.month-cell.is-selected {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
  box-shadow: 0 0 12px rgba(47, 51, 54, 0.16);
  background: var(--color-surface);
}

/* 键盘焦点：格内任一控件获得焦点时也给出可见提示 */
.month-cell:focus-within:not(.is-selected) {
  outline: 2px dashed var(--color-accent);
  outline-offset: -2px;
}

.month-cell.is-drop-target {
  background: var(--color-accent-soft);
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.cell-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.cell-headline {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
  min-width: 0;
}

.cell-badge {
  align-self: center;
}

.cell-day {
  margin-right: auto;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  /* 非选中日期略微降低对比度（仍清晰可读） */
  color: var(--color-text-secondary);
}

.cell-duration {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  white-space: nowrap;
}

.cell-day.is-complete {
  color: var(--color-success);
  font-weight: var(--font-weight-semibold);
}

.month-cell.is-outside .cell-day {
  color: var(--color-text-muted);
  font-weight: var(--font-weight-regular);
}

.month-cell.is-selected .cell-day,
.month-cell.is-today .cell-day {
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);
}

/* 今日标记：数字后缀小圆点，面积小、不抢视觉 */
.month-cell.is-today .cell-day::after {
  content: '';
  display: inline-block;
  width: 4px;
  height: 4px;
  margin-left: 4px;
  border-radius: 50%;
  background: var(--color-accent);
  vertical-align: middle;
}

/* 日期类型入口：默认淡显，悬停 / 聚焦时清晰（触屏与键盘同样可用） */
.cell-menu {
  flex-shrink: 0;
  padding: 0 3px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  line-height: 1.4;
  cursor: pointer;
  opacity: 0.45;
  transition: opacity 0.12s ease;
}

.month-cell:hover .cell-menu,
.cell-menu:focus-visible {
  opacity: 1;
}

.cell-menu:hover {
  background: var(--color-bg);
  color: var(--color-accent-text);
}

/* 空白区域：点击即为该日期新增任务 */
.cell-blank {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 18px;
  margin-top: 2px;
  border: 1px dashed transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  cursor: pointer;
  opacity: 0.35;
  transition: opacity 0.12s ease;
}

.month-cell:hover .cell-blank,
.cell-blank:focus-visible {
  border-color: var(--color-border);
  opacity: 1;
}

.cell-tasks {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  padding: 0;
  margin: 0;
  overflow: hidden;
  list-style: none;
}

/* 任务条目：科目色点 + 任务标题（超出省略，完整内容见 title） */
.cell-task {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 1px 4px;
  border-radius: var(--radius-sm);
  background: var(--color-surface-subtle);
  font-size: var(--font-size-xs);
  line-height: 1.6;
  cursor: pointer;
}

.cell-task:hover {
  background: var(--color-bg);
}

.cell-task-dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
}

.cell-task-text {
  min-width: 0;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-task.is-done .cell-task-text {
  color: var(--text-muted);
  text-decoration: line-through;
}

.cell-task-more {
  padding-left: 4px;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}
</style>
