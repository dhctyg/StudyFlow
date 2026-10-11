<script setup lang="ts">
import { ref } from 'vue'
import AppBar from './components/layout/AppBar.vue'
import ConfirmDialog from './components/common/ConfirmDialog.vue'
import DayTypeMenu from './components/calendar/DayTypeMenu.vue'
import CalendarCard from './components/home/CalendarCard.vue'
import CountdownCard from './components/home/CountdownCard.vue'
import TaskPanelCard from './components/home/TaskPanelCard.vue'
import SettingsModal from './components/settings/SettingsModal.vue'
import CountdownTargetModal from './components/settings/CountdownTargetModal.vue'
import RoundsModal from './components/settings/RoundsModal.vue'
import SubjectManagerModal from './components/settings/SubjectManagerModal.vue'
import TaskFormModal from './components/tasks/TaskFormModal.vue'
import type { DayType, Task } from './models/types'
import {
  RestDayError,
  dayTypeOf,
  moveTaskToDate,
  selectDate,
  selectedDate,
  setDayType,
} from './store/schedule'
import { formatDayTitle, todayKey } from './utils/date'

/**
 * 首页布局（阶段四）。
 *
 * - 顶部标题栏：产品名 +「倒计时 / 轮次 / 科目」三个管理入口 + 设置；
 * - 左栏：倒计时卡片 + 日历卡片；
 * - 右栏：任务面板（当日安排 / 逾期任务）占满整列；
 * - 列比例 / 卡片间距 / 内边距全部来自 tokens.css 的 UI 定制参数，窄屏自动单列。
 *
 * 这里只做「表单 / 弹窗 / 反馈」的编排：任务增删改、日期类型、拖放、导入导出
 * 全部调用既有 store 与 services，不重复实现业务逻辑。
 */
const formOpen = ref(false)
const settingsOpen = ref(false)
const subjectsOpen = ref(false)
/** 标题栏入口：考研倒计时目标 / 科目轮次 */
const countdownOpen = ref(false)
const roundsOpen = ref(false)
const editingTask = ref<Task | null>(null)
/** 新建任务时的默认日期（任务始终带日期；未排期分支只为兼容历史数据保留） */
const defaultDate = ref<string>(todayKey())

/** 日期类型菜单（右键或「⋯」触发，周 / 月视图共用） */
const dayMenu = ref<{ dateKey: string; x: number; y: number } | null>(null)
/** 拖到休息日时的确认（明确提示，不静默改日期） */
const pendingMove = ref<{ taskId: string; dateKey: string } | null>(null)
/** 一次性操作反馈 */
const notice = ref('')
let noticeTimer: number | null = null

function showNotice(message: string): void {
  notice.value = message
  if (noticeTimer !== null) window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => {
    notice.value = ''
    noticeTimer = null
  }, 6000)
}

function openCreate(dateKey?: string): void {
  const targetDate = dateKey === undefined ? selectedDate.value : dateKey
  editingTask.value = null
  defaultDate.value = targetDate
  selectDate(targetDate)
  formOpen.value = true
}

function openEdit(task: Task): void {
  editingTask.value = task
  // 历史任务可能没有日期（date = null）：表单会给出当前选中日期作为兜底默认值
  defaultDate.value = task.date ?? selectedDate.value
  formOpen.value = true
}

function openSettings(): void {
  settingsOpen.value = true
}

// ---------- 日期类型（右键 / 「⋯」菜单，与日历卡片内的按钮等价） ----------

function openDayMenu(dateKey: string, x: number, y: number): void {
  selectDate(dateKey)
  dayMenu.value = { dateKey, x, y }
}

function onDayTypeSelect(type: DayType): void {
  const menu = dayMenu.value
  dayMenu.value = null
  if (menu === null) return
  setDayType(menu.dateKey, type)
  showNotice(
    type === 'normal'
      ? `${formatDayTitle(menu.dateKey)} 已恢复为普通日`
      : `${formatDayTitle(menu.dateKey)} 已设为${type === 'rest' ? '休息日' : '缓冲日'}`,
  )
}

// ---------- 拖放改期（只改原任务日期） ----------

function applyMove(taskId: string, dateKey: string, allowRestDay: boolean): void {
  try {
    moveTaskToDate(taskId, dateKey, { allowRestDay })
    showNotice(`已把任务改到 ${formatDayTitle(dateKey)}`)
  } catch (error) {
    if (error instanceof RestDayError) {
      pendingMove.value = { taskId, dateKey }
      return
    }
    showNotice(error instanceof Error ? error.message : '改期失败，请重试')
  }
}

function onMoveTask(taskId: string, dateKey: string): void {
  applyMove(taskId, dateKey, false)
}

function onConfirmRestMove(): void {
  const pending = pendingMove.value
  pendingMove.value = null
  if (pending === null) return
  applyMove(pending.taskId, pending.dateKey, true)
}
</script>

<template>
  <div class="app-shell">
    <AppBar
      @open-settings="openSettings"
      @open-countdown="countdownOpen = true"
      @open-rounds="roundsOpen = true"
      @open-subjects="subjectsOpen = true"
    />

    <p v-if="notice" class="app-notice" role="status" @click="notice = ''">{{ notice }}</p>

    <main class="home-body">
      <!-- 左栏：倒计时 + 日历 -->
      <div class="home-column home-left">
        <CountdownCard />

        <CalendarCard
          @edit="openEdit"
          @create="openCreate"
          @move-task="onMoveTask"
          @open-day-menu="openDayMenu"
        />
      </div>

      <!-- 右栏：任务面板（当日安排 / 逾期任务）占满整列 -->
      <div class="home-column home-right">
        <TaskPanelCard
          @edit-task="openEdit"
          @create-task="openCreate"
          @notice="showNotice"
        />
      </div>
    </main>

    <!-- 任务表单（新增 / 编辑，含休息日确认；不再包含开始 / 结束时间） -->
    <TaskFormModal
      v-model="formOpen"
      :task="editingTask"
      :default-date="defaultDate"
    />

    <!-- 设置：界面自定义 / 数据导入导出 / 备份恢复 / 清空数据 -->
    <SettingsModal
      v-model="settingsOpen"
      @notice="showNotice"
      @restored="showNotice('已恢复数据，界面已刷新')"
    />

    <!-- 标题栏入口：考研倒计时目标 / 科目轮次（各自独立弹窗，原设置页面中的能力不变） -->
    <CountdownTargetModal v-model="countdownOpen" />
    <RoundsModal v-model="roundsOpen" @notice="showNotice" />

    <SubjectManagerModal v-model="subjectsOpen" />

    <!-- 日期类型菜单：右键与「⋯」按钮共用 -->
    <DayTypeMenu
      v-if="dayMenu !== null"
      :date-key="dayMenu.dateKey"
      :current="dayTypeOf(dayMenu.dateKey)"
      :x="dayMenu.x"
      :y="dayMenu.y"
      @select="onDayTypeSelect"
      @close="dayMenu = null"
    />

    <!-- 拖到休息日：明确提示后由用户决定，不静默修改日期 -->
    <ConfirmDialog
      :model-value="pendingMove !== null"
      title="目标日期是休息日"
      :message="
        pendingMove
          ? `${formatDayTitle(pendingMove.dateKey)} 是休息日（不主动安排任务）。仍要把这个任务改到这一天吗？其它任务的日期不会改变。`
          : ''
      "
      confirm-text="仍然改期"
      @update:model-value="pendingMove = null"
      @confirm="onConfirmRestMove"
    />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--page-bg);
}

.home-body {
  display: grid;
  grid-template-columns: var(--home-columns);
  gap: var(--card-gap);
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: var(--app-max-width);
  margin: 0 auto;
  padding: var(--card-gap);
}

.home-column {
  display: grid;
  gap: var(--card-gap);
  min-width: 0;
  min-height: 0;
}

/* 左栏：倒计时卡片 + 日历卡片 */
.home-left {
  grid-template-rows: var(--home-left-rows);
}

/* 右栏：任务面板占满整列（快捷操作卡片已移除，空间全部给任务面板） */
.home-right {
  grid-template-rows: minmax(0, 1fr);
}

/* 一次性操作反馈（改期 / 日期类型 / 导入导出 / 恢复） */
.app-notice {
  margin: var(--card-gap) var(--card-gap) 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-md);
  background: var(--color-accent-soft);
  color: var(--color-accent-text);
  font-size: var(--font-size-sm);
  overflow-wrap: anywhere;
  cursor: pointer;
}

/* 窄屏：改为单列，卡片给出可用高度，绝不横向溢出 */
@media (max-width: 1080px) {
  .app-shell {
    height: auto;
    min-height: 100%;
  }

  .home-body {
    grid-template-columns: minmax(0, 1fr);
    padding: var(--card-gap-sm);
    gap: var(--card-gap-sm);
  }

  .home-left,
  .home-right {
    grid-template-rows: auto;
    gap: var(--card-gap-sm);
  }

  /* 日历是主要工作区：窄屏下单独给足高度 */
  .home-left > .calendar-card {
    height: 72vh;
    min-height: 420px;
  }

  /* 任务面板：窄屏下限制高度并内部滚动 */
  .home-right > .task-panel {
    min-height: 300px;
    max-height: 60vh;
  }
}
</style>


