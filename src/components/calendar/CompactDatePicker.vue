<script setup lang="ts">
import { computed } from 'vue'
import WeekdayHeader from './WeekdayHeader.vue'
import { DAY_TYPE_LABEL } from '../../models/dayType'
import type { PickerCell, PickerVariant } from '../../utils/dayDots'
import { formatDayTitle } from '../../utils/date'

/**
 * 紧凑日期选择器（窄屏竖屏专用）。
 *
 * 只做「选日期」这一件事：**不显示任务卡片 / 任务名称 / 描述 / 时长**，
 * 日期下方用科目主题色圆点提示当天有任务（同一科目合并为一个圆点）。
 *
 * - 选中日期：整格内描边（不改变尺寸，不会引起网格抖动）；
 * - 今天：日期数字用实心圆标记；全部完成：日期数字变绿（沿用既有语义）；
 * - 休息日 / 缓冲日：沿用既有底色语义（蓝 / 青），仅作提示，不改变任何数据；
 * - 点击日期只「选中」——当天任务照常在日任务区域查看与操作；
 *   右键 / 长按仍可通过 contextmenu 打开日期类型菜单。
 */
const props = withDefaults(
  defineProps<{
    cells: PickerCell[]
    /** week = 单行 7 天；month = 整月网格 */
    variant?: PickerVariant
    /** 正在被拖动悬停的日期（拖拽改期反馈；null = 无） */
    dropTargetKey?: string | null
  }>(),
  { variant: 'month', dropTargetKey: null },
)

const emit = defineEmits<{
  select: [dateKey: string]
  openDayMenu: [dateKey: string, x: number, y: number]
  /** 拖拽改期：沿用与宽屏日期列相同的判定逻辑（由父组件处理） */
  dragOver: [dateKey: string, event: DragEvent]
  dragLeave: [dateKey: string]
  drop: [dateKey: string, event: DragEvent]
}>()

/** 无障碍 / 悬停提示：日期 + 日期类型 + 任务数量（界面本身不显示这些文字） */
function titleOf(cell: PickerCell): string {
  const parts = [formatDayTitle(cell.key)]
  if (cell.isRest) parts.push(DAY_TYPE_LABEL.rest)
  else if (cell.isBuffer) parts.push(DAY_TYPE_LABEL.buffer)
  parts.push(cell.total === 0 ? '无任务' : `${cell.total} 个任务`)
  return parts.join(' · ')
}

const classes = computed(() => (cell: PickerCell) => ({
  'is-outside': !cell.inMonth,
  'is-today': cell.isToday,
  'is-selected': cell.isSelected,
  'is-rest': cell.isRest,
  'is-buffer': cell.isBuffer,
  'is-drop-target': props.dropTargetKey === cell.key,
}))

function onContextMenu(cell: PickerCell, event: MouseEvent): void {
  emit('openDayMenu', cell.key, event.clientX, event.clientY)
}
</script>

<template>
  <div class="compact-date-picker" :class="`picker-${variant}`">
    <div class="picker-inner">
      <WeekdayHeader />

      <div class="picker-grid" role="group" aria-label="选择日期">
        <button
          v-for="cell in props.cells"
          :key="cell.key"
          type="button"
          class="picker-cell"
          :class="classes(cell)"
          :aria-label="cell.key"
          :aria-pressed="cell.isSelected"
          :title="titleOf(cell)"
          @click="emit('select', cell.key)"
          @contextmenu.prevent="onContextMenu(cell, $event)"
          @dragover="emit('dragOver', cell.key, $event)"
          @dragleave="emit('dragLeave', cell.key)"
          @drop="emit('drop', cell.key, $event)"
        >
          <span class="picker-day tabular" :class="{ 'is-complete': cell.isComplete }">
            {{ cell.day }}
          </span>

          <!-- 圆点只表示「当天有任务 + 科目分布」，不显示任何任务文字 -->
          <span class="picker-dots" aria-hidden="true">
            <span
              v-for="dot in cell.dots"
              :key="dot.subjectId"
              class="picker-dot"
              :class="{ 'is-done': dot.done }"
              :style="{ background: dot.color }"
            />
            <span v-if="cell.overflow > 0" class="picker-more tabular">+{{ cell.overflow }}</span>
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.compact-date-picker {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  /* 极矮视口下允许内部滚动，内容不会被卡片裁掉 */
  overflow-y: auto;
}

/**
 * 内容块用 `margin: auto 0` 垂直居中：
 * 卡片高时居中显示，内容高于卡片时自动变为顶部对齐并可滚动（不会出现「居中后顶部不可达」）。
 */
.picker-inner {
  width: 100%;
  min-width: 0;
  margin: auto 0;
  padding: var(--space-1) 0;
}

/* 与 WeekdayHeader 同一套七列等分 + 4px 间距，保证表头与日期格对齐 */
.picker-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: var(--space-1);
  min-width: 0;
}

.picker-cell {
  /* 整格底色由 --cell-bg 决定：普通 / 休息 / 缓冲颜色语义与宽屏网格保持一致 */
  --cell-bg: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-width: 0;
  padding: 4px 1px 5px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--cell-bg);
  color: var(--color-text-secondary);
  cursor: pointer;
  /* 极端窄屏（列宽只剩三十几像素）下也不让圆点 / +N 溢出格子 */
  overflow: hidden;
  /* 与全局动效令牌一致：悬停 / 选中 / 日期类型切换都平滑过渡 */
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard),
    box-shadow var(--duration-fast) var(--ease-standard);
}

.picker-week .picker-cell {
  /* 周视图只有一行，格子略高一些更好点按 */
  padding: 6px 1px 7px;
}

.picker-cell:hover:not(.is-selected) {
  box-shadow: inset 0 0 0 999px rgba(17, 20, 24, 0.04);
}

/* 选中日期：内描边（不改变尺寸，不引起列宽 / 高度抖动） */
.picker-cell.is-selected {
  background: var(--color-accent-soft);
  box-shadow: inset 0 0 0 2px var(--color-accent);
}

/* 拖拽改期的落点：与宽屏列同一套反馈（描边 + 浅底） */
.picker-cell.is-drop-target {
  background: var(--color-accent-soft);
  box-shadow: inset 0 0 0 2px var(--color-accent);
}

/* 月视图邻月日期：淡显，仍可点击 / 可选中 */
.picker-cell.is-outside {
  opacity: 0.5;
}

/* 休息日 / 缓冲日：沿用既有底色语义（与宽屏网格一致，不改变任何数据） */
.picker-cell.is-rest {
  --cell-bg: var(--color-rest-bg);
}

.picker-cell.is-buffer {
  --cell-bg: var(--color-buffer-bg);
}

/* 日期数字：今天用实心圆标记（与「选中」的整格描边不冲突） */
.picker-day {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: var(--font-size-sm);
  line-height: 1;
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard);
}

.picker-cell.is-today .picker-day {
  background: var(--color-accent);
  color: #ffffff;
  font-weight: var(--font-weight-semibold);
}

.picker-cell.is-selected .picker-day {
  color: var(--color-accent-text);
  font-weight: var(--font-weight-semibold);
}

/* 今天 + 选中：实心圆上保持白字，仍以整格描边表达选中 */
.picker-cell.is-today.is-selected .picker-day {
  color: #ffffff;
}

/* 当天任务全部完成：日期数字变绿（今天实心圆时不可见，避免两套强调互相干扰） */
.picker-cell:not(.is-today) .picker-day.is-complete {
  color: var(--color-success);
  font-weight: var(--font-weight-semibold);
}

/**
 * 任务圆点行：固定高度 + 居中 + 不换行。
 * 无任务的日期保持同样高度（不显示圆点），因此整月网格行高恒定，不会抖动。
 */
.picker-dots {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  height: 6px;
  overflow: hidden;
}

.picker-dot {
  width: 4px;
  height: 4px;
  flex-shrink: 0;
  border-radius: 50%;
  /* 浅色底上的小色块：极淡描边保证边界清晰（与月视图圆点一致） */
  box-shadow: 0 0 0 1px rgba(17, 20, 24, 0.08);
  transition: opacity var(--duration-fast) var(--ease-standard);
}

/* 该科目当天任务全部完成：圆点淡化（只作提示，不改变任务状态） */
.picker-dot.is-done {
  opacity: 0.3;
}

.picker-more {
  color: var(--text-muted);
  font-size: 9px;
  line-height: 1;
}
</style>
