/**
 * 时间轴任务布局（纯函数，可单测）。
 * 把一天的任务映射为时间轴上的绝对定位块：
 * - 按开始时间排序，重叠任务分列并排（不互相遮挡），列宽均分。
 * - 超出可视范围（TIMELINE_START_HOUR ~ TIMELINE_END_HOUR）的任务裁切到边界，不破坏网格。
 * - 无合法时间的任务不参与布局（由调用方另行展示）。
 */
import type { Task } from '../models/types'
import {
  TIMELINE_COLLAPSED_HEIGHT,
  TIMELINE_DAY_END_HOUR,
  TIMELINE_DAY_START_HOUR,
  TIMELINE_END_HOUR,
  TIMELINE_HOUR_HEIGHT,
  TIMELINE_MAIN_END_HOUR,
  TIMELINE_MAIN_START_HOUR,
  TIMELINE_MAIN_TICK_HOURS,
  TIMELINE_MIN_BLOCK_HEIGHT,
  TIMELINE_START_HOUR,
  intervalsOverlap,
  taskInterval,
} from './time'

export interface TimelineBlock {
  task: Task
  /** 距时间轴顶部的像素偏移 */
  top: number
  /** 块高度（最小 20px 保证可读） */
  height: number
  /** 水平位置：百分比（0–100） */
  leftPercent: number
  widthPercent: number
  /** 是否被裁切（超出可视范围） */
  clippedTop: boolean
  clippedBottom: boolean
  /** 是否为“展示用默认时段”（未安排时间的任务，不写回任务数据） */
  placeholder: boolean
  /** 展示用开始分钟：定时任务 = 真实开始；展示用默认时段 = 推算开始 */
  displayStart: number
  /** 展示用结束分钟 */
  displayEnd: number
}

export interface TimelineOptions {
  startHour?: number
  endHour?: number
  hourHeight?: number
}

/** 已解析为分钟区间的布局条目（定时任务与展示用默认时段共用） */
export interface LayoutEntry {
  task: Task
  start: number
  end: number
  placeholder?: boolean
}

const MIN_BLOCK_HEIGHT = TIMELINE_MIN_BLOCK_HEIGHT

/** 展示用默认时段：每项未安排任务按 1 小时展示，从主要时段起点（08:00）起寻找空档 */
export const PLACEHOLDER_HOURS = 1
export const PLACEHOLDER_START_HOUR = TIMELINE_MAIN_START_HOUR
export const PLACEHOLDER_END_HOUR = TIMELINE_MAIN_END_HOUR

/** 展示用默认时段（仅用于渲染，绝不写回任务数据） */
export interface PlaceholderSlot {
  task: Task
  /** 展示用开始分钟（自 00:00 起） */
  start: number
  /** 展示用结束分钟 */
  end: number
}

/**
 * 为一天的任务计算时间轴布局（区间来自任务自身的开始 / 结束时间）。
 * 返回顺序与传入顺序无关：内部统一按（开始时间, 结束时间, id）排序，保证稳定。
 */
export function layoutDayBlocks(
  tasks: readonly Task[],
  options: TimelineOptions = {},
): TimelineBlock[] {
  const entries: LayoutEntry[] = []
  for (const task of tasks) {
    const interval = taskInterval(task)
    if (interval === null) continue
    entries.push({ task, start: interval.start, end: interval.end })
  }
  return layoutEntries(entries, options)
}

/**
 * 低层布局：按已解析的分钟区间计算块。
 * 定时任务与“展示用默认时段”共用同一套分列 / 重叠判定，因此二者不会互相遮挡。
 */
export function layoutEntries(
  entries: readonly LayoutEntry[],
  options: TimelineOptions = {},
): TimelineBlock[] {
  const startHour = options.startHour ?? TIMELINE_START_HOUR
  const endHour = options.endHour ?? TIMELINE_END_HOUR
  const hourHeight = options.hourHeight ?? TIMELINE_HOUR_HEIGHT

  const axisStart = startHour * 60
  const axisEnd = endHour * 60
  const pixelsPerMinute = hourHeight / 60

  const timed: { task: Task; start: number; end: number; placeholder: boolean }[] = []
  for (const entry of entries) {
    if (entry.end <= entry.start) continue
    timed.push({
      task: entry.task,
      start: entry.start,
      end: entry.end,
      placeholder: entry.placeholder === true,
    })
  }
  if (timed.length === 0) return []

  timed.sort((a, b) => a.start - b.start || a.end - b.end || a.task.id.localeCompare(b.task.id))

  const blocks: TimelineBlock[] = []

  // 按“重叠簇”分组：簇内任务互相（传递地）重叠，簇之间互不重叠。
  // 每个簇独立分列，因此不与任何任务重叠的任务能占满整列宽度。
  let cluster: typeof timed = []
  let clusterEnd = Number.NEGATIVE_INFINITY

  const flushCluster = (): void => {
    if (cluster.length === 0) return
    const laneEnds: number[] = []
    const assigned: { item: (typeof timed)[number]; lane: number }[] = []
    for (const item of cluster) {
      let laneIndex = laneEnds.findIndex((laneEnd) => laneEnd <= item.start)
      if (laneIndex === -1) {
        laneEnds.push(item.end)
        laneIndex = laneEnds.length - 1
      } else {
        laneEnds[laneIndex] = item.end
      }
      assigned.push({ item, lane: laneIndex })
    }
    const laneCount = Math.max(1, laneEnds.length)
    const widthPercent = 100 / laneCount
    for (const { item, lane } of assigned) {
      const clippedTop = item.start < axisStart
      const clippedBottom = item.end > axisEnd
      const visibleStart = Math.max(item.start, axisStart)
      const visibleEnd = Math.min(item.end, axisEnd)
      const top = (visibleStart - axisStart) * pixelsPerMinute
      const rawHeight = (visibleEnd - visibleStart) * pixelsPerMinute
      blocks.push({
        task: item.task,
        top,
        height: Math.max(MIN_BLOCK_HEIGHT, rawHeight),
        leftPercent: lane * widthPercent,
        widthPercent,
        clippedTop,
        clippedBottom,
        placeholder: item.placeholder,
        displayStart: item.start,
        displayEnd: item.end,
      })
    }
    cluster = []
    clusterEnd = Number.NEGATIVE_INFINITY
  }

  for (const item of timed) {
    if (cluster.length > 0 && item.start >= clusterEnd) flushCluster()
    cluster.push(item)
    clusterEnd = Math.max(clusterEnd, item.end)
  }
  flushCluster()

  return blocks
}

/** 像素偏移 → 起点小时（用于点击空白处新增任务时推断开始时间，向下取整到整点） */
export function pixelOffsetToHour(offsetTop: number, options: TimelineOptions = {}): number {
  const startHour = options.startHour ?? TIMELINE_START_HOUR
  const endHour = options.endHour ?? TIMELINE_END_HOUR
  const hourHeight = options.hourHeight ?? TIMELINE_HOUR_HEIGHT
  const hour = startHour + Math.floor(offsetTop / hourHeight)
  return Math.min(Math.max(hour, startHour), endHour - 1)
}

/**
 * 为未安排时间的任务分配“展示用”默认时段（仅渲染，绝不写回任务数据）：
 * - 每项默认占用 1 小时，且只在整点开始；
 * - 先统计当天已有定时任务的占用，再从 08:00 起依次寻找不重叠的空档，避免覆盖已有安排；
 * - 找不到空档的任务进入 overflow（由界面以紧凑提示 / 可展开列表展示，仍可查看与编辑）。
 */
export function assignPlaceholderSlots(
  timedTasks: readonly Task[],
  untimedTasks: readonly Task[],
  options: { startHour?: number; endHour?: number; hours?: number } = {},
): { slots: PlaceholderSlot[]; overflow: Task[] } {
  const startHour = options.startHour ?? PLACEHOLDER_START_HOUR
  const endHour = options.endHour ?? PLACEHOLDER_END_HOUR
  const duration = Math.max(1, Math.trunc(options.hours ?? PLACEHOLDER_HOURS)) * 60
  const rangeStart = startHour * 60
  const rangeEnd = endHour * 60

  // 先统计已有定时任务的占用区间（只读，不修改任务）
  const occupied: { start: number; end: number }[] = []
  for (const task of timedTasks) {
    const interval = taskInterval(task)
    if (interval !== null) occupied.push(interval)
  }

  const slots: PlaceholderSlot[] = []
  const overflow: Task[] = []
  for (const task of untimedTasks) {
    let target = -1
    for (let start = rangeStart; start + duration <= rangeEnd; start += 60) {
      const candidate = { start, end: start + duration }
      if (!occupied.some((item) => intervalsOverlap(candidate, item))) {
        target = start
        break
      }
    }
    if (target === -1) {
      overflow.push(task)
      continue
    }
    const slot = { start: target, end: target + duration }
    occupied.push(slot)
    slots.push({ task, start: slot.start, end: slot.end })
  }

  return { slots, overflow }
}

// ---------- 分段 / 折叠模型 ----------
// 周视图把一天切成 3 个纵向段：早间（折叠）、主要时段（默认展开）、晚间（折叠）。
// 每个任务只会被分配到其中一个段，避免重复显示或丢失：
// - 与主要时段相交的任务（含跨越 08:00 / 22:00 边界者）→ main，展开区内按真实时间裁切定位；
// - 完全落在 08:00 之前 / 22:00 之后的任务 → 对应折叠段，折叠时以任务卡片列出、展开时精确定位。

export type TimelineSegmentId = 'early' | 'main' | 'late'

export interface TimelineSegmentMeta {
  id: TimelineSegmentId
  /** 段起始小时（含） */
  startHour: number
  /** 段结束小时（不含；24 表示当天结束） */
  endHour: number
  expanded: boolean
  /** 展开时 =（段长 × 行高）；折叠时 = 折叠行高 */
  height: number
  /** 形如 '00:00–08:00' */
  label: string
  /** 段内主刻度小时（升序）；折叠时为空数组 */
  tickHours: number[]
}

export interface SegmentLayout extends TimelineSegmentMeta {
  /** 分配到该段的任务（每个任务只会出现在一个段里） */
  tasks: Task[]
  /** 展开时按真实时间精确定位的块；折叠时为空数组 */
  blocks: TimelineBlock[]
  /** 折叠时以卡片列表展示的任务；展开时为空数组 */
  collapsedTasks: Task[]
  taskCount: number
}

export interface TimelineDayLayout {
  segments: SegmentLayout[]
  /** 未安排时间的任务（原始数据：startTime / endTime 仍为 null） */
  untimed: Task[]
  /** 展示用默认时段（每项 1 小时，仅渲染，不写回任务数据） */
  placeholders: PlaceholderSlot[]
  /** 未能排入时间轴的未安排任务（由界面以紧凑提示 / 列表展示） */
  overflow: Task[]
  /** 全部段高度之和；七天共用同一套段定义，因此纵向刻度始终一致 */
  totalHeight: number
}

export interface TimelineSegmentsOptions {
  earlyExpanded?: boolean
  lateExpanded?: boolean
  hourHeight?: number
  collapsedHeight?: number
  /** 展示用默认时段的搜索范围（默认与主要时段一致：08:00–22:00） */
  placeholderStartHour?: number
  placeholderEndHour?: number
}

/**
 * 任务归属的分段：
 * - 与主要时段（08:00–22:00）相交（含跨越边界）→ main；
 * - 完全早于主要时段起点 → early；
 * - 其余（完全晚于主要时段终点）→ late。
 */
export function segmentIdOf(interval: { start: number; end: number }): TimelineSegmentId {
  const mainStart = TIMELINE_MAIN_START_HOUR * 60
  const mainEnd = TIMELINE_MAIN_END_HOUR * 60
  if (interval.end > mainStart && interval.start < mainEnd) return 'main'
  return interval.start < mainStart ? 'early' : 'late'
}

/**
 * 段内主刻度小时（升序）。
 * includeEndBoundary = true 时把段尾整点也作为刻度（主要时段用它标出 22:00）。
 */
export function timelineTickHours(
  startHour: number,
  endHour: number,
  tickHours: number = TIMELINE_MAIN_TICK_HOURS,
  includeEndBoundary = false,
): number[] {
  const step = Math.max(1, Math.trunc(tickHours))
  const hours: number[] = []
  for (let hour = Math.ceil(startHour / step) * step; hour < endHour; hour += step) hours.push(hour)
  if (includeEndBoundary && endHour > startHour) hours.push(endHour)
  return hours
}

/** 三段元信息（与任务无关，七天一致）。 */
export function timelineSegmentMeta(options: TimelineSegmentsOptions = {}): TimelineSegmentMeta[] {
  const hourHeight = options.hourHeight ?? TIMELINE_HOUR_HEIGHT
  const collapsedHeight = options.collapsedHeight ?? TIMELINE_COLLAPSED_HEIGHT
  const specs: {
    id: TimelineSegmentId
    startHour: number
    endHour: number
    expanded: boolean
    includeEndBoundary: boolean
  }[] = [
    {
      id: 'early',
      startHour: TIMELINE_DAY_START_HOUR,
      endHour: TIMELINE_MAIN_START_HOUR,
      expanded: options.earlyExpanded === true,
      includeEndBoundary: false,
    },
    {
      id: 'main',
      startHour: TIMELINE_MAIN_START_HOUR,
      endHour: TIMELINE_MAIN_END_HOUR,
      expanded: true,
      includeEndBoundary: true,
    },
    {
      id: 'late',
      startHour: TIMELINE_MAIN_END_HOUR,
      endHour: TIMELINE_DAY_END_HOUR,
      expanded: options.lateExpanded === true,
      includeEndBoundary: false,
    },
  ]
  return specs.map((spec) => ({
    id: spec.id,
    startHour: spec.startHour,
    endHour: spec.endHour,
    expanded: spec.expanded,
    height: spec.expanded ? (spec.endHour - spec.startHour) * hourHeight : collapsedHeight,
    label: `${String(spec.startHour).padStart(2, '0')}:00–${String(spec.endHour).padStart(2, '0')}:00`,
    tickHours: spec.expanded
      ? timelineTickHours(spec.startHour, spec.endHour, TIMELINE_MAIN_TICK_HOURS, spec.includeEndBoundary)
      : [],
  }))
}

/**
 * 某一天的分段布局（纯函数）：段的划分与高度与七天一致，只有任务内容随日期不同。
 * 未安排时间的任务不写回数据，而是按“展示用默认时段”（每项 1 小时）排入主要时段；
 * 排不下的进入 overflow，由界面以紧凑提示展示。
 */
export function layoutTimelineDay(
  tasks: readonly Task[],
  options: TimelineSegmentsOptions = {},
): TimelineDayLayout {
  const hourHeight = options.hourHeight ?? TIMELINE_HOUR_HEIGHT
  const segmentsMeta = timelineSegmentMeta(options)

  const untimed: Task[] = []
  const timedTasks: Task[] = []
  const buckets = new Map<TimelineSegmentId, Task[]>([
    ['early', []],
    ['main', []],
    ['late', []],
  ])

  for (const task of tasks) {
    const interval = taskInterval(task)
    if (interval === null) {
      untimed.push(task)
      continue
    }
    timedTasks.push(task)
    const bucket = buckets.get(segmentIdOf(interval))
    if (bucket !== undefined) bucket.push(task)
  }

  // 展示用默认时段：先统计已有占用，再按 1 小时依次填充 08:00 起的空档（只读，不修改任务）
  const { slots: placeholders, overflow } = assignPlaceholderSlots(timedTasks, untimed, {
    startHour: options.placeholderStartHour ?? PLACEHOLDER_START_HOUR,
    endHour: options.placeholderEndHour ?? PLACEHOLDER_END_HOUR,
  })

  const segments: SegmentLayout[] = segmentsMeta.map((segment) => {
    const segmentTasks = buckets.get(segment.id) ?? []
    let blocks: TimelineBlock[] = []
    if (segment.expanded && segment.id === 'main') {
      // 主要时段：定时任务 + 展示用默认时段一起参与分列，保证互不遮挡
      const entries: LayoutEntry[] = []
      for (const task of segmentTasks) {
        const interval = taskInterval(task)
        if (interval !== null) entries.push({ task, start: interval.start, end: interval.end })
      }
      for (const slot of placeholders) {
        entries.push({ task: slot.task, start: slot.start, end: slot.end, placeholder: true })
      }
      blocks = layoutEntries(entries, {
        startHour: segment.startHour,
        endHour: segment.endHour,
        hourHeight,
      })
    } else if (segment.expanded) {
      blocks = layoutDayBlocks(segmentTasks, {
        startHour: segment.startHour,
        endHour: segment.endHour,
        hourHeight,
      })
    }
    return {
      ...segment,
      tasks: segmentTasks,
      blocks,
      collapsedTasks: segment.expanded ? [] : segmentTasks,
      taskCount: segmentTasks.length,
    }
  })

  return {
    segments,
    untimed,
    placeholders,
    overflow,
    totalHeight: segments.reduce((sum, segment) => sum + segment.height, 0),
  }
}

