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
 * - 从右侧任务列表拖入任务 → 修改**原任务**的日期（不复制任务，不顺延其它任务）。
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
 * 七列等分面板宽度：`repeat(7, minmax(0, 1fr))`。
 *
 * 不再按任务内容估算列宽，也不设置最小宽度 —— 周一至周日始终完整显示在日历卡片内，
 * 任何窗口尺寸下都不会出现横向滚动条（列只会变窄，不会把内容推出卡片）。
 * 列内空间用紧凑内边距 / 字号与可换行的任务文字消化。
 */

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
  <div class="week-view">
    <div class="week-scroll">
      <!-- 星期标题：独立圆角方框，位于日期网格上方并与列对齐（不插入日期格） -->
      <WeekdayHeader />

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
              <span class="head-day tabular" :class="{ 'is-complete': day.isComplete }">
                {{ day.day }}
              </span>
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
            <!-- 日期下方不再显示「完成」标签：完成状态由日期数字颜色 + 任务删除线表示 -->
          </header>

          <!--
            列内空白区域：整列（除任务卡片与表头按钮）都是「新增任务」的点击区，
            没有加号占位元素；点击已有任务卡片只会打开编辑（TaskCard 内部 @click.stop），
            两种操作不会互相触发。
          -->
          <div class="day-body" title="点击空白处新增任务" @click="onColumnClick(day)">
            <TaskCard
              v-for="task in day.tasks"
              :key="task.id"
              :task="task"
              draggable="true"
              @dragstart="onTaskDragStart(task, $event)"
              @edit="emit('edit', $event)"
            />
          </div>
        </section>
      </div>
    </div>
  </div>
</template>


<style scoped>
.week-view {
  /* 七列等分：宽度完全由面板决定，永不出现横向滚动 */
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--color-surface);
  overflow: hidden;
}

.week-scroll {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  /* 只允许纵向滚动；横向不滚动，七天始终完整可见 */
  overflow-x: hidden;
  overflow-y: auto;
}

.week-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  /* 占满剩余高度（内容更高时由滚动容器滚动），七天列高始终一致 */
  flex: 1 0 auto;
  min-width: 0;
}

.day-column {
  /**
   * 整列底色统一由 --column-bg 决定：日期行与任务区共用同一个变量，
   * 因此休息日 / 缓冲日的底色会贯穿整列，选中态也不会把任务区变白。
   */
  --column-bg: var(--color-surface);
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 200px;
  border-left: 1px solid var(--color-grid-divider);
  background: var(--column-bg);
  transition: background-color 0.12s ease;
}

.day-column:first-child {
  border-left: none;
}

/* 休息日 / 缓冲日：只换整列底色变量 + 表头下边缘色（不显示文字标签，也不改变行高） */
.day-column.is-rest {
  --column-bg: var(--color-rest-bg);
}

.day-column.is-buffer {
  --column-bg: var(--color-buffer-bg);
}

.day-column.is-rest .day-head {
  border-bottom-color: var(--color-rest-badge-border);
}

.day-column.is-buffer .day-head {
  border-bottom-color: var(--color-buffer-badge-border);
}

/* 悬停：普通列给中性浅底；休息 / 缓冲列保留自己的底色（只用极淡叠加层提示可点击） */
.day-column:not(.is-rest):not(.is-buffer):hover:not(.is-selected):not(.is-drop-target) {
  --column-bg: var(--color-bg);
}

.day-column.is-rest:hover:not(.is-selected):not(.is-drop-target) .day-body,
.day-column.is-buffer:hover:not(.is-selected):not(.is-drop-target) .day-body {
  box-shadow: inset 0 0 0 999px rgba(17, 20, 24, 0.03);
}

/**
 * 选中列：用伪元素绘制「覆盖整列」的直角描边。
 * - 表头是 position: sticky（z-index 2），普通 outline / border 会被它盖住顶部，
 *   因此用 ::after + 更高 z-index 画在最上层，日期行与任务区四周都完整；
 * - pointer-events: none 保证不遮挡任务文字与点击区域；
 * - 不使用圆角，与列分隔线风格统一，也避免与卡片圆角冲突。
 */
.day-column.is-selected::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 2px solid var(--color-accent);
  border-radius: 0;
  pointer-events: none;
  z-index: 5;
}

/* 键盘焦点：与选中态同款完整描边（虚线区分） */
.day-column:focus-within:not(.is-selected)::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 2px dashed var(--color-accent);
  border-radius: 0;
  pointer-events: none;
  z-index: 5;
}

/* 拖拽落点：整列描边 + 底色提示 */
.day-column.is-drop-target {
  --column-bg: var(--color-accent-soft);
}

.day-column.is-drop-target::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 2px solid var(--color-accent);
  border-radius: 0;
  pointer-events: none;
  z-index: 5;
}

.day-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 0;
  /* 表头也收紧：给任务卡片留出更多纵向空间 */
  padding: 3px 6px 5px;
  border-bottom: 1px solid var(--color-grid-divider);
  /* 与整列底色一致：sticky 滚动时不会露出白色底 */
  background: var(--column-bg);
  cursor: pointer;
}

.head-line {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
}

.head-day {
  /* 日期辨识度优先，但比原来小一档，给列宽与列高让位 */
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-medium);
  /* 非选中日期略微降低对比度（仍清晰可读） */
  color: var(--color-text-secondary);
}

/* 当天任务全部完成：日期数字用保留色（绿色），不再额外显示标签 */
.head-day.is-complete {
  color: var(--color-success);
  font-weight: var(--font-weight-semibold);
}

.day-column.is-selected .head-day,
.day-column.is-today .head-day {
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);
}

.day-column.is-selected .head-day.is-complete,
.day-column.is-today .head-day.is-complete {
  color: var(--color-success);
}

.head-menu {
  margin-left: auto;
  padding: 0 3px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
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
  /* 紧凑内边距 / 间距：七列等分后仍能容纳任务文字（文字自然换行，不做省略号截断） */
  gap: 2px;
  min-height: 0;
  padding: 4px;
  cursor: pointer;
  transition: box-shadow 0.12s ease;
}

/* 空白区域的点击反馈：极淡叠加层，不改写列底色（普通 / 休息 / 缓冲列的颜色都能保留） */
.day-body:hover {
  box-shadow: inset 0 0 0 999px rgba(17, 20, 24, 0.025);
}
</style>

