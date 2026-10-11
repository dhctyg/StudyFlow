/**
 * 日程 store（模块级响应式，不引入 Pinia，与既有项目约定一致）。
 *
 * 架构：UI → store → storage → localStorage。
 * 约定：
 * - 所有变更立即写回 localStorage；科目 / 标签 / 任务 / 休息日分别持久化。
 * - 休息日只增删日期集合，绝不触碰任务。
 * - 删除科目级联清理其任务与标签；删除标签仅清空任务引用，任务本身保留。
 * - 校验失败抛出 FieldError；时间冲突抛出 ConflictError（不覆盖已有任务）。
 */
import { computed, reactive } from 'vue'
import type {
  DayStatus,
  DayType,
  DayTypeMap,
  Subject,
  SubjectId,
  Subtask,
  Task,
  TaskInput,
  ViewMode,
} from '../models/types'
import { isDuplicateName, isValidHexColor, normalizeName } from '../models/subjects'
import { datesOfKind, dayTypeFrom, isDateKind } from '../models/dayType'
import * as storage from '../services/storage'
import { dayStatusOf } from '../utils/dayStatus'
import { partitionTasks, pickBufferDate, taskDateKey, type TaskGroups } from '../utils/taskGroups'
import {
  addDaysKey,
  addMonthsKey,
  formatDayTitle,
  formatMonthTitle,
  formatWeekTitle,
  isDateKey,
  monthGridKeys,
  monthOf,
  todayKey,
  weekDaysKey,
  yearOf,
} from '../utils/date'
import { isEndTimeAfterStart, isValidTime, intervalsOverlap, taskInterval, timeToMinutes } from '../utils/time'
import { summarizeDayDuration, type DayDurationSummary } from '../utils/studyDuration'
import { generateId } from '../utils/id'

/** 表单字段级错误：form 根据 field 决定展示位置 */
export class FieldError extends Error {
  readonly field: string

  constructor(field: string, message: string) {
    super(message)
    this.field = field
    this.name = 'FieldError'
  }
}

/** 时间冲突：携带冲突任务列表，由表单提示用户确认，绝不自动覆盖。 */
export class ConflictError extends Error {
  readonly conflicts: Task[]

  constructor(conflicts: Task[]) {
    super('与已有任务时间重叠')
    this.conflicts = conflicts
    this.name = 'ConflictError'
  }
}

/**
 * 休息日保护：目标日期是休息日时抛出，由界面明确提示并让用户确认。
 * 只有在用户主动确认（allowRestDay）后才写入，绝不静默把任务排进休息日。
 */
export class RestDayError extends Error {
  readonly dateKey: string

  constructor(dateKey: string) {
    super('该日期是休息日，不主动安排任务')
    this.dateKey = dateKey
    this.name = 'RestDayError'
  }
}

/** 没有可用缓冲日：由界面提示用户先创建缓冲日或手动选择日期，绝不默默改日期。 */
export class BufferUnavailableError extends Error {
  constructor() {
    super('当前没有可用的缓冲日')
    this.name = 'BufferUnavailableError'
  }
}

interface ScheduleState {
  subjects: Subject[]
  subtasks: Subtask[]
  tasks: Task[]
  /**
   * 日期类型表（阶段一）：仅记录非普通日 —— date → 'rest' | 'buffer'。
   * 由旧休息日集合迁移而来；普通日 = 无记录。独立于任务存储，绝不改动任务。
   */
  dayTypes: DayTypeMap
  /** 科目筛选：null = 全部；只影响日历显示，不影响详情 / 状态 / 时长 */
  subjectFilter: SubjectId | null
  selectedDate: string
  /** 当前周期锚点（周视图 = 该周任意日；月视图 = 该月任意日） */
  anchorDate: string
  viewMode: ViewMode
}

const state = reactive<ScheduleState>({
  subjects: [],
  subtasks: [],
  tasks: [],
  dayTypes: {},
  subjectFilter: null,
  selectedDate: todayKey(),
  anchorDate: todayKey(),
  viewMode: 'week',
})

/** 初始化：读取本地数据（必要时写入默认科目 / 标签示例任务）。 */
export function init(): void {
  const data = storage.initializeData()
  state.subjects = data.subjects
  state.subtasks = data.subtasks
  state.tasks = data.tasks
  state.dayTypes = data.dayTypes
}

// ---------- 只读视图 ----------

export const selectedDate = computed(() => state.selectedDate)
export const viewMode = computed(() => state.viewMode)
/** 休息日集合（由日期类型表派生，保持既有调用方不变） */
export const restDays = computed(() => datesOfKind(state.dayTypes, 'rest'))
/** 缓冲日集合（升序） */
export const bufferDays = computed(() => datesOfKind(state.dayTypes, 'buffer'))
/** 日期类型表（只读） */
export const dayTypes = computed(() => state.dayTypes)
export const tasks = computed(() => state.tasks)
export const subjects = computed(() => state.subjects)
export const subtasks = computed(() => state.subtasks)
export const subjectFilter = computed(() => state.subjectFilter)

/** 当前周期锚点（周视图 = 该周任意日；月视图 = 该月任意日） */
export const anchorDate = computed(() => state.anchorDate)

/** 当前周期标题（周视图 / 月视图共用顶栏） */
export const periodTitle = computed(() => {
  if (state.viewMode === 'month') {
    return formatMonthTitle(yearOf(state.anchorDate), monthOf(state.anchorDate))
  }
  const week = weekDaysKey(state.anchorDate)
  return formatWeekTitle(week[0], week[6])
})

/** 周视图 7 天（周一 → 周日） */
export const weekDays = computed(() => weekDaysKey(state.anchorDate))

/** 月视图网格（整周对齐，含邻月日期） */
export const monthCells = computed(() => monthGridKeys(yearOf(state.anchorDate), monthOf(state.anchorDate)))

// ---------- 选择与导航 ----------

export function selectDate(dateKey: string): void {
  if (!isDateKey(dateKey)) return
  state.selectedDate = dateKey
}

export function goPrev(): void {
  state.anchorDate =
    state.viewMode === 'week' ? addDaysKey(state.anchorDate, -7) : addMonthsKey(state.anchorDate, -1)
}

export function goNext(): void {
  state.anchorDate =
    state.viewMode === 'week' ? addDaysKey(state.anchorDate, 7) : addMonthsKey(state.anchorDate, 1)
}

/** 返回今天：锚点与选中日期都回到今天。 */
export function goToday(): void {
  const today = todayKey()
  state.anchorDate = today
  state.selectedDate = today
}

/** 切换视图时以当前选中日期为锚点，保证周期与详情一致。 */
export function switchView(mode: ViewMode): void {
  state.viewMode = mode
  state.anchorDate = state.selectedDate
}

// ---------- 科目与标签查询 ----------

export function subjectById(id: SubjectId): Subject | undefined {
  return state.subjects.find((subject) => subject.id === id)
}

/** 按 ID 取科目；未知 ID 返回兜底灰（数据已在持久层校验，这里仅防御渲染崩溃）。 */
export function subjectOf(id: SubjectId): Subject {
  return subjectById(id) ?? { id, name: '未知科目', color: '#98a0ac' }
}

export function subtasksOfSubject(subjectId: SubjectId): Subtask[] {
  return state.subtasks.filter((subtask) => subtask.subjectId === subjectId)
}

export function subtaskById(id: string | null): Subtask | undefined {
  if (id === null) return undefined
  return state.subtasks.find((subtask) => subtask.id === id)
}

// ---------- 任务查询 ----------

/** date → 当天全部任务（不受筛选影响，供详情 / 状态 / 时长使用） */
export const tasksByDate = computed(() => {
  const map = new Map<string, Task[]>()
  for (const task of state.tasks) {
    // 统一按**归一化**日期入索引：与任务面板的「今天 / 逾期」判定共用同一套规则，
    // 保证有日期的任务既能进面板、也能落到日历对应那一天。
    const dateKey = taskDateKey(task)
    if (dateKey === null) continue
    const list = map.get(dateKey)
    if (list) list.push(task)
    else map.set(dateKey, [task])
  }
  return map
})

export function tasksOf(dateKey: string): Task[] {
  return tasksByDate.value.get(dateKey) ?? []
}

/** 按开始时间排序（无时间的任务排最后，保持稳定顺序） */
export function sortTasksByTime(list: readonly Task[]): Task[] {
  const toMin = (task: Task): number => timeToMinutes(task.startTime) ?? Number.MAX_SAFE_INTEGER
  return [...list].sort((a, b) => toMin(a) - toMin(b))
}

/** 当天（受筛选影响的）可见任务，供日历视图使用 */
export function visibleTasksOf(dateKey: string): Task[] {
  const list = tasksOf(dateKey)
  if (state.subjectFilter === null) return list
  return list.filter((task) => task.subjectId === state.subjectFilter)
}

/** 某天任务状态：仅由全部任务决定，与筛选 / 休息日无关。 */
export function statusOf(dateKey: string): DayStatus {
  return dayStatusOf(tasksOf(dateKey))
}

/** 某天日期类型；无记录 = 普通日 */
export function dayTypeOf(dateKey: string): DayType {
  return dayTypeFrom(state.dayTypes, dateKey)
}

export function isRestDay(dateKey: string): boolean {
  return dayTypeOf(dateKey) === 'rest'
}

export function isBufferDay(dateKey: string): boolean {
  return dayTypeOf(dateKey) === 'buffer'
}

/** 某天学习时长汇总（全部任务，不受筛选影响） */
export function durationOf(dateKey: string): DayDurationSummary {
  return summarizeDayDuration(tasksOf(dateKey))
}

export const selectedTasks = computed(() => sortTasksByTime(tasksOf(state.selectedDate)))

export const selectedStatus = computed(() => dayStatusOf(tasksOf(state.selectedDate)))

export const selectedIsRest = computed(() => isRestDay(state.selectedDate))

/** 选中日期的类型（普通日 / 休息日 / 缓冲日） */
export const selectedDayType = computed<DayType>(() => dayTypeOf(state.selectedDate))

export const selectedIsBuffer = computed(() => selectedDayType.value === 'buffer')

export const selectedTitle = computed(() => formatDayTitle(state.selectedDate))

export const selectedDuration = computed(() => summarizeDayDuration(tasksOf(state.selectedDate)))

// ---------- 三类任务（当日安排 / 逾期 / 临时任务箱） ----------

/**
 * 分组结果全部由「原任务的 date + done」动态计算：
 * 不按天生成副本、同一任务只有一份记录、已完成任务不进入逾期与临时任务箱。
 * 分组不受科目筛选影响（避免逾期工作被筛选隐藏）。
 */
export const taskGroups = computed<TaskGroups>(() => partitionTasks(state.tasks, todayKey()))

/** 当日安排：安排日期为今天且未完成 */
export const todayTasks = computed(() => taskGroups.value.today)

/** 逾期任务：原计划日期早于今天且未完成（按日期升序） */
export const overdueTasks = computed(() => taskGroups.value.overdue)

/** 临时任务箱：尚未设置安排日期且未完成 */
export const unscheduledTasks = computed(() => taskGroups.value.unscheduled)

// ---------- 科目筛选 ----------

export function setSubjectFilter(subjectId: SubjectId | null): void {
  state.subjectFilter = subjectId !== null && subjectById(subjectId) !== undefined ? subjectId : null
}

// ---------- 时间冲突检测 ----------

/** 冲突检测入参（日期 / 时间都允许为空：未安排日期或未填时间的任务不参与冲突） */
export interface ConflictCheckInput {
  date: string | null
  startTime: string | null
  endTime: string | null
}

/** 检测与同一天已有任务的时间重叠（边界相接不算冲突；排除自身）。 */
export function detectTimeConflicts(input: ConflictCheckInput, excludeTaskId?: string): Task[] {
  if (input.date === null) return []
  const candidate = taskInterval({ startTime: input.startTime, endTime: input.endTime })
  if (candidate === null) return []
  return tasksOf(input.date).filter((task) => {
    if (task.id === excludeTaskId) return false
    const interval = taskInterval(task)
    if (interval === null) return false
    return intervalsOverlap(candidate, interval)
  })
}


// ---------- 任务变更 ----------

/** 归一化后的任务输入：日期可为 null（临时任务箱），时间随日期放宽 */
export interface NormalizedTaskInput {
  date: string | null
  subjectId: SubjectId
  subtaskId: string | null
  startTime: string | null
  endTime: string | null
  content: string
}

function normalizeInput(input: TaskInput): NormalizedTaskInput {
  const content = typeof input.content === 'string' ? input.content.trim() : ''
  if (content === '') throw new FieldError('content', '任务内容不能为空')
  // 日期：null = 暂不安排（临时任务箱）；否则必须是合法 YYYY-MM-DD
  const date = input.date ?? null
  if (date !== null && !isDateKey(date)) throw new FieldError('date', '日期格式不正确')
  if (subjectById(input.subjectId) === undefined) throw new FieldError('subjectId', '科目不存在')

  // 子任务标签：可空；非空时必须存在且属于当前科目。
  let subtaskId: string | null = null
  if (input.subtaskId !== null && input.subtaskId !== undefined) {
    const subtask = subtaskById(input.subtaskId)
    if (subtask === undefined) throw new FieldError('subtaskId', '子任务标签不存在')
    if (subtask.subjectId !== input.subjectId) {
      throw new FieldError('subtaskId', '子任务标签不属于当前科目')
    }
    subtaskId = subtask.id
  }

  // 时间规则：
  // - 已安排日期：必填且结束必须晚于开始（保持原校验，不支持跨午夜）；
  // - 未安排日期（临时任务箱）：可以留空；一旦填写，开始与结束必须成对合法。
  let startTime: string | null = null
  let endTime: string | null = null
  const hasAnyTime =
    (input.startTime ?? '') !== '' || (input.endTime ?? '') !== ''
  if (date !== null || hasAnyTime) {
    if (!isValidTime(input.startTime)) throw new FieldError('startTime', '请填写合法的开始时间（HH:mm）')
    if (!isValidTime(input.endTime)) throw new FieldError('endTime', '请填写合法的结束时间（HH:mm）')
    if (!isEndTimeAfterStart(input.startTime, input.endTime)) {
      throw new FieldError('endTime', '结束时间必须晚于开始时间，本阶段不支持跨午夜')
    }
    startTime = input.startTime
    endTime = input.endTime
  }

  return {
    date,
    subjectId: input.subjectId,
    subtaskId,
    startTime,
    endTime,
    content,
  }
}

function persistTasks(): void {
  storage.saveTasks(state.tasks)
}

export interface SaveTaskOptions {
  /** 用户确认保留重叠任务时传 true；默认检测到冲突即抛 ConflictError，绝不自动覆盖。 */
  allowConflict?: boolean
  /** 用户确认「仍要在休息日安排 / 移入」时传 true；否则休息日抛 RestDayError，由界面提示。 */
  allowRestDay?: boolean
}

/** 按 ID 取原始任务记录（始终只有一份，不存在按天生成的副本） */
export function taskById(id: string): Task | undefined {
  return state.tasks.find((task) => task.id === id)
}

/**
 * 休息日保护：默认拒绝把任务排进休息日（不主动安排任务）。
 * 由界面明确提示，用户确认后传 allowRestDay 才写入；未安排日期不受限制。
 */
function assertRestDayAllowed(dateKey: string | null, options: SaveTaskOptions): void {
  if (options.allowRestDay === true || dateKey === null) return
  if (isRestDay(dateKey)) throw new RestDayError(dateKey)
}

export function createTask(input: TaskInput, options: SaveTaskOptions = {}): Task {
  const normalized = normalizeInput(input)
  assertRestDayAllowed(normalized.date, options)
  if (options.allowConflict !== true) {
    const conflicts = detectTimeConflicts(normalized)
    if (conflicts.length > 0) throw new ConflictError(conflicts)
  }
  const task: Task = {
    id: generateId(),
    date: normalized.date,
    subjectId: normalized.subjectId,
    subtaskId: normalized.subtaskId,
    startTime: normalized.startTime,
    endTime: normalized.endTime,
    content: normalized.content,
    done: false,
  }
  state.tasks = [...state.tasks, task]
  persistTasks()
  return task
}

export function updateTask(id: string, input: TaskInput, options: SaveTaskOptions = {}): void {
  const normalized = normalizeInput(input)
  const index = state.tasks.findIndex((task) => task.id === id)
  if (index < 0) throw new FieldError('id', '任务不存在')
  // 仅当安排日期发生变化时才做休息日提示：已落在休息日的历史任务仍可正常编辑其它字段
  if (state.tasks[index].date !== normalized.date) {
    assertRestDayAllowed(normalized.date, options)
  }
  if (options.allowConflict !== true) {
    const conflicts = detectTimeConflicts(normalized, id)
    if (conflicts.length > 0) throw new ConflictError(conflicts)
  }
  const next = [...state.tasks]
  next[index] = { ...next[index], ...normalized }
  state.tasks = next
  persistTasks()
}

export function deleteTask(id: string): void {
  state.tasks = state.tasks.filter((task) => task.id !== id)
  persistTasks()
}

export function toggleTaskDone(id: string): void {
  state.tasks = state.tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task))
  persistTasks()
}

// ---------- 任务日期调整（改期 / 缓冲日 / 临时任务箱） ----------

/**
 * 移动任务到指定日期：只更新原任务的 date 字段 —— 不复制任务、不改完成状态与内容，
 * 也不顺延或影响其它任务。目标日期是休息日时抛 RestDayError（除非用户确认）。
 */
export function moveTaskToDate(id: string, dateKey: string, options: SaveTaskOptions = {}): void {
  if (!isDateKey(dateKey)) throw new FieldError('date', '日期格式不正确')
  const index = state.tasks.findIndex((task) => task.id === id)
  if (index < 0) throw new FieldError('id', '任务不存在')
  assertRestDayAllowed(dateKey, options)
  const next = [...state.tasks]
  next[index] = { ...next[index], date: dateKey }
  state.tasks = next
  persistTasks()
}

/** 移入临时任务箱：清空安排日期（时间字段原样保留，仅作展示） */
export function moveTaskToBox(id: string): void {
  const index = state.tasks.findIndex((task) => task.id === id)
  if (index < 0) throw new FieldError('id', '任务不存在')
  const next = [...state.tasks]
  next[index] = { ...next[index], date: null }
  state.tasks = next
  persistTasks()
}

/**
 * 移入缓冲日（更新原任务日期，不复制任务）：
 * - 未指定日期时，优先自动挑选合适的缓冲日（今天及之后最近的一个，排除任务当前日期）；
 * - 没有任何可用缓冲日 → 抛 BufferUnavailableError，由界面提示用户先创建缓冲日或手动选择日期，
 *   绝不默默修改日期；
 * - 显式指定日期时，该日期必须已经是缓冲日；
 * - 不影响任何其它任务的日期。
 */
export function moveTaskToBufferDay(
  id: string,
  options: { dateKey?: string | null; allowRestDay?: boolean } = {},
): string {
  const task = taskById(id)
  if (task === undefined) throw new FieldError('id', '任务不存在')
  let target: string | null = options.dateKey ?? null
  if (target === null) {
    target = pickBufferDate({
      today: todayKey(),
      bufferDates: datesOfKind(state.dayTypes, 'buffer'),
      excludeDate: task.date,
    })
    if (target === null) throw new BufferUnavailableError()
  } else if (!isBufferDay(target)) {
    throw new FieldError('bufferDate', '该日期不是缓冲日，请先设为缓冲日或另选日期')
  }
  moveTaskToDate(id, target, { allowRestDay: options.allowRestDay })
  return target
}

// ---------- 科目变更 ----------

function normalizeSubjectName(name: string, selfId?: string): string {
  const normalized = normalizeName(name)
  if (normalized === '') throw new FieldError('name', '科目名称不能为空')
  if (isDuplicateName(state.subjects, normalized, selfId)) {
    throw new FieldError('name', '科目名称已存在')
  }
  return normalized
}

function normalizeColor(color: string): string {
  if (!isValidHexColor(color)) throw new FieldError('color', '颜色格式不正确（#rrggbb）')
  return color.toLowerCase()
}

export function createSubject(input: { name: string; color: string }): Subject {
  const subject: Subject = {
    id: generateId(),
    name: normalizeSubjectName(input.name),
    color: normalizeColor(input.color),
  }
  state.subjects = [...state.subjects, subject]
  storage.saveSubjects(state.subjects)
  return subject
}

export function updateSubject(id: string, input: { name: string; color: string }): void {
  const index = state.subjects.findIndex((subject) => subject.id === id)
  if (index < 0) throw new FieldError('id', '科目不存在')
  const next = [...state.subjects]
  next[index] = {
    ...next[index],
    name: normalizeSubjectName(input.name, id),
    color: normalizeColor(input.color),
  }
  state.subjects = next
  storage.saveSubjects(state.subjects)
}

/**
 * 删除科目：级联清理其子任务标签与关联任务，并同步筛选状态。
 * 不影响其他科目 / 任务 / 休息日。
 */
export function deleteSubject(id: string): void {
  if (subjectById(id) === undefined) return
  state.subjects = state.subjects.filter((subject) => subject.id !== id)
  state.subtasks = state.subtasks.filter((subtask) => subtask.subjectId !== id)
  state.tasks = state.tasks.filter((task) => task.subjectId !== id)
  if (state.subjectFilter === id) state.subjectFilter = null
  storage.saveSubjects(state.subjects)
  storage.saveSubtasks(state.subtasks)
  persistTasks()
}

/** 引用某科目的任务数（删除前提示用） */
export function taskCountUsingSubject(id: SubjectId): number {
  return state.tasks.filter((task) => task.subjectId === id).length
}

/** 某科目下的标签数（删除前提示用） */
export function subtaskCountOfSubject(id: SubjectId): number {
  return subtasksOfSubject(id).length
}

// ---------- 子任务标签变更 ----------

function normalizeSubtaskName(name: string, subjectId: SubjectId, selfId?: string): string {
  const normalized = normalizeName(name)
  if (normalized === '') throw new FieldError('name', '标签名称不能为空')
  // 同一科目内不允许重名（忽略大小写与首尾空格）；不同科目允许同名。
  const siblings = subtasksOfSubject(subjectId)
  if (isDuplicateName(siblings, normalized, selfId)) {
    throw new FieldError('name', '该科目下已存在同名标签')
  }
  return normalized
}

export function createSubtask(input: { subjectId: SubjectId; name: string }): Subtask {
  if (subjectById(input.subjectId) === undefined) throw new FieldError('subjectId', '科目不存在')
  const subtask: Subtask = {
    id: generateId(),
    subjectId: input.subjectId,
    name: normalizeSubtaskName(input.name, input.subjectId),
  }
  state.subtasks = [...state.subtasks, subtask]
  storage.saveSubtasks(state.subtasks)
  return subtask
}

/** 修改标签名称：只改名称，不改 ID，关联任务的引用不受影响。 */
export function updateSubtask(id: string, input: { name: string }): void {
  const index = state.subtasks.findIndex((subtask) => subtask.id === id)
  if (index < 0) throw new FieldError('id', '标签不存在')
  const current = state.subtasks[index]
  const next = [...state.subtasks]
  next[index] = { ...current, name: normalizeSubtaskName(input.name, current.subjectId, id) }
  state.subtasks = next
  storage.saveSubtasks(state.subtasks)
}

/** 删除标签：清空引用它的任务的 subtaskId，任务本身 / 时间 / 内容 / 完成状态全部保留。 */
export function deleteSubtask(id: string): void {
  if (subtaskById(id) === undefined) return
  state.subtasks = state.subtasks.filter((subtask) => subtask.id !== id)
  state.tasks = state.tasks.map((task) => (task.subtaskId === id ? { ...task, subtaskId: null } : task))
  storage.saveSubtasks(state.subtasks)
  persistTasks()
}

/** 引用某标签的任务数（删除前提示用） */
export function taskCountUsingSubtask(id: string): number {
  return state.tasks.filter((task) => task.subtaskId === id).length
}

// ---------- 日期类型变更（普通日 / 休息日 / 缓冲日） ----------

/**
 * 设置日期类型：
 * - 'rest' 休息日；'buffer' 缓冲日；null / 'normal' 恢复普通日（移除记录）。
 * 只操作日期类型表：不删除任务、不改完成状态、不改任何任务日期。
 * 设置 / 取消后立即持久化，刷新不丢失。
 */
export function setDayType(dateKey: string, type: DayType | null): void {
  if (!isDateKey(dateKey)) return
  const next: DayTypeMap = { ...state.dayTypes }
  if (type === null || type === 'normal') {
    if (next[dateKey] === undefined) return
    delete next[dateKey]
  } else if (isDateKind(type)) {
    if (next[dateKey] === type) return
    next[dateKey] = type
  } else {
    return
  }
  state.dayTypes = next
  storage.saveDayTypes(next)
}

/**
 * 设置 / 取消休息日（兼容既有调用方）。
 * 仅操作日期集合：不删除任务、不改任务完成状态、取消后任务原样保留。
 */
export function setRestDay(dateKey: string, rest: boolean): void {
  if (rest) setDayType(dateKey, 'rest')
  else if (isRestDay(dateKey)) setDayType(dateKey, 'normal')
}

export function toggleRestDay(dateKey: string): void {
  setDayType(dateKey, isRestDay(dateKey) ? 'normal' : 'rest')
}

export function toggleBufferDay(dateKey: string): void {
  setDayType(dateKey, isBufferDay(dateKey) ? 'normal' : 'buffer')
}


