<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import ConfirmDialog from '../common/ConfirmDialog.vue'
import TaskActionMenu, { type TaskMenuItem } from '../tasks/TaskActionMenu.vue'
import TaskRow from '../tasks/TaskRow.vue'
import type { Task } from '../../models/types'
import {
  BufferUnavailableError,
  bufferDays,
  deleteTask,
  moveTaskToBufferDay,
  overdueTasks,
  selectedDate,
  selectedTasks,
  setDayType,
  toggleTaskDone,
  unscheduledTasks,
} from '../../store/schedule'
import { pickBufferDate } from '../../utils/taskGroups'
import { addDaysKey, formatDayTitle, todayKey } from '../../utils/date'

/**
 * 任务面板（三个可切换页面）。
 *
 * - 当日安排：**当前选定日期**对应的任务（沿用日历的日期关联逻辑，含已完成用于回顾）；
 * - 逾期任务：计划日期已过且未完成（已完成的不再出现在逾期里，也不会自动顺延）；
 * - 临时任务箱：没有指定日期的任务（已排到日期的任务不会重复出现在这里）；
 * - 三个页面共用同一套查询逻辑（store 的动态分组），操作直接调用现有业务逻辑：
 *   设置完成 / 删除（带确认）/ 移入缓冲日（更新原任务日期）/ 编辑 / 拖动改期。
 * - 页签风格与日历的周 / 月视图切换一致，切换只替换面板内容。
 */
const emit = defineEmits<{
  editTask: [task: Task]
  createTask: [dateKey: string | null]
  notice: [message: string]
}>()

type SectionId = 'day' | 'overdue' | 'unscheduled'

const TABS: { id: SectionId; label: string }[] = [
  { id: 'day', label: '当日安排' },
  { id: 'overdue', label: '逾期任务' },
  { id: 'unscheduled', label: '临时任务箱' },
]

/** 当前页签：切换只更新任务面板内容，不重新加载页面 */
const activeTab = ref<SectionId>('day')

interface MenuState {
  task: Task
  section: SectionId
  x: number
  y: number
}

const menu = ref<MenuState | null>(null)
const confirmTarget = ref<Task | null>(null)
const confirmOpen = ref(false)
/** 没有缓冲日时，等待用户决定的任务（内联提示，不静默改日期） */
const pendingBufferTask = ref<Task | null>(null)

const day = computed(() => selectedTasks.value)
const overdue = computed(() => overdueTasks.value)
const unscheduled = computed(() => unscheduledTasks.value)

function countOf(id: SectionId): number {
  if (id === 'day') return day.value.length
  if (id === 'overdue') return overdue.value.length
  return unscheduled.value.length
}

/** 共用新增入口：当日安排落在当前选定日期，其余两个页面进入临时任务箱 */
function createInActiveTab(): void {
  emit('createTask', activeTab.value === 'day' ? selectedDate.value : null)
}

const dayEmptyText = computed(() => `${formatDayTitle(selectedDate.value)} 没有任务。`)

/** 自动挑选的缓冲日（用于菜单提示，让用户知道会移到哪一天） */
const autoBufferDate = computed(() =>
  pickBufferDate({ today: todayKey(), bufferDates: bufferDays.value }),
)

const bufferLabel = computed(() =>
  autoBufferDate.value === null ? '需先创建缓冲日' : formatDayTitle(autoBufferDate.value),
)

function openMenu(section: SectionId, payload: { task: Task; x: number; y: number }): void {
  menu.value = { task: payload.task, section, x: payload.x, y: payload.y }
}

/** 菜单项：逾期区按要求提供「设置完成 / 移入缓冲日 / 删除」，并保留编辑能力 */
const menuItems = computed<TaskMenuItem[]>(() => {
  const current = menu.value
  if (current === null) return []
  const done = current.task.done
  const items: TaskMenuItem[] = [
    { id: 'toggle', label: done ? '取消完成' : '设置完成', icon: 'check' },
    { id: 'edit', label: '编辑任务', icon: 'edit' },
    {
      id: 'buffer',
      label: '移入缓冲日',
      icon: 'buffer',
      hint: bufferLabel.value,
    },
    { id: 'delete', label: '删除任务', icon: 'trash', danger: true },
  ]
  return items
})

function runAction(id: string): void {
  const current = menu.value
  menu.value = null
  if (current === null) return
  const task = current.task

  if (id === 'toggle') {
    toggleTaskDone(task.id)
    return
  }
  if (id === 'edit') {
    emit('editTask', task)
    return
  }
  if (id === 'delete') {
    confirmTarget.value = task
    confirmOpen.value = true
    return
  }
  if (id === 'buffer') {
    moveToBuffer(task)
  }
}

function moveToBuffer(task: Task): void {
  pendingBufferTask.value = null
  try {
    const target = moveTaskToBufferDay(task.id)
    emit('notice', `已把「${task.content}」移入缓冲日 ${formatDayTitle(target)}`)
  } catch (error) {
    if (error instanceof BufferUnavailableError) {
      // 不默默改日期：给出「新建缓冲日」入口，由用户决定
      pendingBufferTask.value = task
      emit('notice', '当前没有缓冲日：可一键把明天设为缓冲日并移入，或直接把任务拖到日历日期。')
      return
    }
    emit('notice', error instanceof Error ? error.message : '移入缓冲日失败，请重试')
  }
}

/** 没有缓冲日时的入口：把明天设为缓冲日并移入（规则明确，操作后有反馈） */
function createBufferAndMove(): void {
  const task = pendingBufferTask.value
  pendingBufferTask.value = null
  if (task === null) return
  const target = addDaysKey(todayKey(), 1)
  setDayType(target, 'buffer')
  try {
    moveTaskToBufferDay(task.id, { dateKey: target })
    emit('notice', `已新建缓冲日 ${formatDayTitle(target)}，并把「${task.content}」移入`)
  } catch (error) {
    emit('notice', error instanceof Error ? error.message : '移入缓冲日失败，请重试')
  }
}

function onConfirmDelete(): void {
  const task = confirmTarget.value
  confirmTarget.value = null
  if (task === null) return
  deleteTask(task.id)
  emit('notice', `已删除「${task.content}」`)
}

function onToggleDone(task: Task): void {
  toggleTaskDone(task.id)
}
</script>

<template>
  <section class="home-card task-panel">
    <header class="home-card-head task-panel-head">
      <div class="section-tabs" role="tablist" aria-label="任务分组">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          type="button"
          role="tab"
          class="tab-btn"
          :aria-selected="activeTab === tab.id"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
          <span v-if="countOf(tab.id) > 0" class="tab-count tabular">{{ countOf(tab.id) }}</span>
        </button>
      </div>

      <button
        type="button"
        class="icon-btn head-action"
        :title="activeTab === 'day' ? '为选中日期添加任务' : '添加临时任务'"
        aria-label="添加任务"
        @click="createInActiveTab"
      >
        <AppIcon name="plus" size="sm" />
      </button>
    </header>

    <div class="task-panel-body">
      <!-- 1. 当日安排：当前选定日期的任务 -->
      <section v-if="activeTab === 'day'" class="panel-section">
        <ul v-if="day.length > 0" class="row-list">
          <TaskRow
            v-for="task in day"
            :key="task.id"
            :task="task"
            @open-menu="openMenu('day', $event)"
            @toggle-done="onToggleDone"
          />
        </ul>
        <p v-else class="section-empty">{{ dayEmptyText }}</p>
      </section>

      <!-- 2. 逾期任务：计划日期已过且未完成（已完成不再出现，也不自动顺延） -->
      <section v-else-if="activeTab === 'overdue'" class="panel-section">
        <ul v-if="overdue.length > 0" class="row-list">
          <TaskRow
            v-for="task in overdue"
            :key="task.id"
            :task="task"
            show-date
            date-tone="overdue"
            @open-menu="openMenu('overdue', $event)"
            @toggle-done="onToggleDone"
          />
        </ul>
        <p v-else class="section-empty">没有逾期任务。</p>
      </section>

      <!-- 3. 临时任务箱：未安排日期的任务 -->
      <section v-else class="panel-section">
        <ul v-if="unscheduled.length > 0" class="row-list">
          <TaskRow
            v-for="task in unscheduled"
            :key="task.id"
            :task="task"
            @open-menu="openMenu('unscheduled', $event)"
            @toggle-done="onToggleDone"
          />
        </ul>
        <div v-else class="section-empty">
          <p>暂无任务</p>
          <button type="button" class="btn btn-ghost" @click="emit('createTask', null)">
            添加任务
          </button>
        </div>
      </section>

      <!-- 没有缓冲日时的内联入口：由用户决定，不静默改日期 -->
      <p v-if="pendingBufferTask !== null" class="buffer-prompt" role="status">
        <span>「{{ pendingBufferTask.content }}」没有可用缓冲日：</span>
        <button type="button" class="link-btn" @click="createBufferAndMove">
          把明天设为缓冲日并移入
        </button>
        <button type="button" class="link-btn" @click="pendingBufferTask = null">取消</button>
      </p>
    </div>

    <TaskActionMenu
      v-if="menu !== null"
      :title="menu.task.content"
      :items="menuItems"
      :x="menu.x"
      :y="menu.y"
      @select="runAction"
      @close="menu = null"
    />

    <ConfirmDialog
      v-model="confirmOpen"
      title="删除任务"
      :message="confirmTarget ? `确定删除「${confirmTarget.content}」吗？` : ''"
      confirm-text="删除"
      @confirm="onConfirmDelete"
    />
  </section>
</template>


<style scoped>
.task-panel-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--block-gap-sm);
  min-height: 0;
  overflow: hidden;
  padding: var(--card-pad-sm);
}

/* 三个区块按比例分配高度，各自内部滚动，不截断内容 */
.panel-section {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-height: 0;
}

/* 页签：与日历的「周 / 月」切换同一套样式（同一组内排列，选中清晰、未选中简洁） */
.task-panel-head {
  align-items: center;
  gap: var(--space-2);
}

.section-tabs {
  display: flex;
  padding: 2px;
  border-radius: var(--radius-md);
  background: var(--color-bg);
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: var(--button-height);
  padding: 0 12px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    color 0.12s ease;
}

.tab-btn:hover {
  color: var(--color-text);
}

.tab-btn[aria-selected='true'] {
  background: var(--color-surface);
  color: var(--color-text);
  font-weight: var(--font-weight-medium);
  box-shadow: var(--shadow-sm);
}

.tab-count {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}

.tab-btn[aria-selected='true'] .tab-count {
  color: var(--text-secondary);
}

.section-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
  padding: 0 2px 2px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
}

.head-action {
  margin-left: auto;
}

.row-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  list-style: none;
}

.section-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}

.buffer-prompt {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
  padding: var(--space-2);
  border: 1px solid var(--color-buffer-badge-border);
  border-radius: var(--radius-md);
  background: var(--color-buffer-badge-bg);
  color: var(--color-buffer-text);
  font-size: var(--font-size-xs);
  overflow-wrap: anywhere;
}

.link-btn {
  padding: 0 2px;
  border: none;
  background: transparent;
  color: var(--color-accent-text);
  font-size: var(--font-size-xs);
  text-decoration: underline;
  cursor: pointer;
}
</style>

