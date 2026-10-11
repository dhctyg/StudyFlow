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
import type { Task } from '../../models/types'
import { dayOf, todayKey } from '../../utils/date'
import { hasTaskDrag, readTaskDragId } from '../../utils/taskDrag'

/**
 * 月视图：标准月历网格（周一开头，整周对齐），只展示任务，没有时间轴。
 *
 * - 任务**极简显示**：一个任务 = 一个科目主题色小圆点（不再显示任务文字 / 时间），
 *   同一天多个任务按开始时间排序后依次排列，圆点自动换行、互不重叠、不会溢出格子；
 *   超过 MAX_DOTS 个时只多出一个「+N」计数，不额外占用空间。
 * - 已完成任务保留（圆点降低透明度），完成状态语义不变。
 * - 休息日（蓝）/ 缓冲日（青）/ 全部完成（绿）仍以底色与文字标记展示，不只靠颜色。
 * - 点击日期数字选中该日；点击圆点区域同样只「选中该日」——右侧任务面板会列出当天任务，
 *   可继续查看 / 编辑（月视图不再显示任务文字，也不需要额外弹窗）；
 * - 点击格子其它空白处 = 为该日期新增任务；右键或「⋯」设置日期类型；从任务面板拖入任务可改期。
 * - 圆点只受科目筛选影响，颜色与周视图 / 任务列表同源（科目主题色）。
 */
const MAX_DOTS = 12

const emit = defineEmits<{
  create: [dateKey: string]
  moveTask: [taskId: string, dateKey: string]
  openDayMenu: [dateKey: string, x: number, y: number]
}>()

const today = todayKey()
/** 拖拽悬停的日期格（纯界面状态） */
const dropTarget = ref<string | null>(null)

const anchorMonth = computed(() => anchorDate.value.slice(0, 7))

/** 圆点悬停提示：科目 · 时间 · 任务内容（文字不进格子，信息仍可查看） */
function dotLabel(task: Task): string {
  const parts: string[] = [task.done ? `${subjectOf(task.subjectId).name}（已完成）` : subjectOf(task.subjectId).name]
  if (task.startTime !== null) {
    parts.push(task.endTime === null ? task.startTime : `${task.startTime}–${task.endTime}`)
  }
  parts.push(task.content)
  return parts.join(' · ')
}

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
      dots: tasks.slice(0, MAX_DOTS).map((task) => ({
        id: task.id,
        color: subjectOf(task.subjectId).color,
        done: task.done,
        label: dotLabel(task),
      })),
      overflowCount: Math.max(0, tasks.length - MAX_DOTS),
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
    <WeekdayHeader />

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
          <!-- 日期下方不再显示「完成」标签：完成状态由日期数字颜色表示 -->
        </header>

        <!--
          任务圆点：每个任务一个科目主题色圆点（极简，不显示文字）。
          点击圆点区域只「选中该日」——右侧任务面板会列出当天任务，可继续查看 / 编辑。
        -->
        <div v-if="cell.dots.length > 0" class="cell-dots" @click.stop="onCellClick(cell.key)">
          <span
            v-for="dot in cell.dots"
            :key="dot.id"
            class="cell-dot"
            :class="{ 'is-done': dot.done }"
            :style="{ background: dot.color }"
            :title="dot.label"
          />
          <span v-if="cell.overflowCount > 0" class="cell-dots-more tabular" title="当天任务较多">
            +{{ cell.overflowCount }}
          </span>
        </div>

        <!-- 空白区域：点击即为该日期新增任务（默认日期 = 该格日期），不再有「＋」占位图标 -->
        <div
          class="cell-blank"
          :aria-label="`为 ${cell.key} 新增任务`"
          title="点击空白处新增任务"
          @click.stop="onBlankClick(cell.key)"
        />
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
  min-width: 0;
  /* 只允许纵向滚动（月视图内容比卡片高时才滚动），横向永不滚动 */
  overflow-x: hidden;
  overflow-y: auto;
  /* 视图切换：整块淡入（与周视图同一节奏；任务更新时不会重播） */
  animation: calendar-view-in var(--duration-base) var(--ease-out);
}

/* 与周视图同名的切换动效（组件作用域内独立声明，避免跨组件依赖） */
@keyframes calendar-view-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.month-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  grid-auto-rows: 1fr;
  flex: 1;
  /* 七列等分：不设最小宽度，窄屏压缩列宽而不是产生横向滚动条 */
  min-width: 0;
  min-height: 400px;
}

.month-cell {
  /**
   * 与周视图一致：整格底色由 --column-bg 决定，选中态不会把格子变白，
   * 休息日 / 缓冲日的底色在选中后依然保留。
   */
  --column-bg: var(--color-surface);
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  min-height: 0;
  padding: var(--space-1) var(--space-2) var(--space-2);
  /* 每个格子只画右 / 上两条线，避免相邻格子重复描边形成粗线 */
  border-right: 1px solid var(--color-grid-divider);
  border-top: 1px solid var(--color-grid-divider);
  background: var(--column-bg);
  cursor: pointer;
  overflow: hidden;
  /* 底色 / 上边缘色 / 悬停叠加层都平滑过渡，选中与日期类型切换不再突然跳变 */
  transition:
    background-color var(--duration-base) var(--ease-standard),
    border-top-color var(--duration-base) var(--ease-standard),
    box-shadow var(--duration-fast) var(--ease-standard);
}

/* 最后一列不画右线（由面板边框收口）；第一行不画上线（由表头下边框收口） */
.month-cell:nth-child(7n) {
  border-right: none;
}

.month-cell:nth-child(-n + 7) {
  border-top: none;
}

/* 休息日 / 缓冲日：只换整格底色变量 + 上边缘色（不显示文字标签，也不改变行高） */
.month-cell.is-rest {
  --column-bg: var(--color-rest-bg);
  border-top-color: var(--color-rest-badge-border);
}

.month-cell.is-buffer {
  --column-bg: var(--color-buffer-bg);
  border-top-color: var(--color-buffer-badge-border);
}

/* 悬停：极淡叠加层，不改写底色（休息 / 缓冲格的自身颜色也能保留） */
.month-cell:hover:not(.is-selected):not(.is-drop-target) {
  box-shadow: inset 0 0 0 999px rgba(17, 20, 24, 0.02);
}

/**
 * 选中日期 / 键盘焦点 / 拖拽落点：统一用一个**常驻**伪元素绘制覆盖整格的直角描边
 * （与周视图同款）。pointer-events: none 不遮挡日期格内的点击；
 * 只用 opacity 过渡显隐，不改尺寸，因此格宽与描边位置不会因动画而错位。
 */
.month-cell::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 2px solid var(--color-accent);
  border-radius: 0;
  opacity: 0;
  pointer-events: none;
  z-index: 5;
  transition: opacity var(--duration-fast) var(--ease-standard);
}

.month-cell.is-selected::after,
.month-cell.is-drop-target::after {
  opacity: 1;
}

/* 键盘焦点：同款完整描边（虚线区分） */
.month-cell:focus-within:not(.is-selected)::after {
  border-style: dashed;
  opacity: 1;
}

.month-cell.is-drop-target {
  --column-bg: var(--color-accent-soft);
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

.cell-day {
  margin-right: auto;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  /* 非选中日期略微降低对比度（仍清晰可读） */
  color: var(--color-text-secondary);
  /* 选中 / 今日 / 完成状态之间颜色平滑过渡 */
  transition: color var(--duration-base) var(--ease-standard);
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
  transition:
    opacity var(--duration-fast) var(--ease-standard),
    background-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard);
}

.month-cell:hover .cell-menu,
.cell-menu:focus-visible {
  opacity: 1;
}

.cell-menu:hover {
  background: var(--color-bg);
  color: var(--color-accent-text);
}

.cell-menu:active {
  background: var(--color-accent-soft);
}

/* ---------- 任务圆点（极简显示：只有科目主题色圆点） ---------- */

.cell-dots {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  /* 圆点之间留 4px 间距：多个任务清晰可数，也不重叠 */
  gap: 4px;
  min-width: 0;
  padding: 1px 0;
  cursor: pointer;
}

.cell-dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;
  /* 浅色底上的小面积色块：加一层极淡描边保证边界清晰 */
  box-shadow: 0 0 0 1px rgba(17, 20, 24, 0.08);
  /* 完成状态切换时透明度平滑变化 */
  transition: opacity var(--duration-base) var(--ease-standard);
}

/* 已完成任务：圆点保留但降低透明度（完成状态语义不变） */
.cell-dot.is-done {
  opacity: 0.3;
}

.cell-dots-more {
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1;
}

/* 空白区域：点击即为该日期新增任务（没有加号图标，悬停反馈由格子统一的叠加层提供） */

.cell-blank {
  flex: 1;
  min-height: 16px;
  margin-top: 2px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
</style>
