import { describe, expect, it } from 'vitest'
import type { Task } from '../models/types'
import { summarizeDayDuration } from './studyDuration'
import { TIMELINE_MIN_BLOCK_HEIGHT } from './time'
import {
  assignPlaceholderSlots,
  layoutDayBlocks,
  layoutEntries,
  layoutTimelineDay,
  pixelOffsetToHour,
  segmentIdOf,
  timelineSegmentMeta,
  timelineTickHours,
} from './timeline'

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't',
    date: '2026-10-10',
    subjectId: 'math',
    subtaskId: null,
    startTime: '09:00',
    endTime: '10:00',
    content: '任务',
    done: false,
    ...overrides,
  }
}

/** 默认布局：06:00–24:00，每小时 44px → 每分钟 44/60 px */
const OPTIONS = { startHour: 6, endHour: 24, hourHeight: 44 }

describe('layoutDayBlocks · 定位与时长', () => {
  it('按开始时间定位、按持续时间计算高度', () => {
    const blocks = layoutDayBlocks([task({ id: 'a', startTime: '09:00', endTime: '10:30' })], OPTIONS)
    expect(blocks).toHaveLength(1)
    // 09:00 距 06:00 为 180 分钟 → 132px；90 分钟 → 66px
    expect(blocks[0].top).toBeCloseTo(132, 5)
    expect(blocks[0].height).toBeCloseTo(66, 5)
    expect(blocks[0].leftPercent).toBe(0)
    expect(blocks[0].widthPercent).toBe(100)
    expect(blocks[0].clippedTop).toBe(false)
    expect(blocks[0].clippedBottom).toBe(false)
  })

  it('无时间的任务不参与布局', () => {
    const blocks = layoutDayBlocks(
      [task({ id: 'a', startTime: null, endTime: null }), task({ id: 'b' })],
      OPTIONS,
    )
    expect(blocks.map((block) => block.task.id)).toEqual(['b'])
  })

  it('按（开始时间, 结束时间, id）稳定排序', () => {
    const blocks = layoutDayBlocks(
      [
        task({ id: 'late', startTime: '15:00', endTime: '16:00' }),
        task({ id: 'early', startTime: '08:00', endTime: '09:00' }),
        task({ id: 'mid', startTime: '08:00', endTime: '08:30' }),
      ],
      OPTIONS,
    )
    expect(blocks.map((block) => block.task.id)).toEqual(['mid', 'early', 'late'])
  })
})

describe('layoutDayBlocks · 重叠并排', () => {
  it('两个重叠任务各占一半宽度，不互相遮挡', () => {
    const blocks = layoutDayBlocks(
      [
        task({ id: 'a', startTime: '09:00', endTime: '10:00' }),
        task({ id: 'b', startTime: '09:30', endTime: '10:30' }),
      ],
      OPTIONS,
    )
    expect(blocks).toHaveLength(2)
    expect(blocks[0].widthPercent).toBe(50)
    expect(blocks[1].widthPercent).toBe(50)
    expect(blocks[0].leftPercent).toBe(0)
    expect(blocks[1].leftPercent).toBe(50)
  })

  it('三个互相重叠的任务分三列', () => {
    const blocks = layoutDayBlocks(
      [
        task({ id: 'a', startTime: '09:00', endTime: '12:00' }),
        task({ id: 'b', startTime: '09:30', endTime: '10:00' }),
        task({ id: 'c', startTime: '10:00', endTime: '11:00' }),
      ],
      OPTIONS,
    )
    // a 与 b、c 都重叠；b、c 边界相接不重叠 → b、c 复用同一列
    const byId = new Map(blocks.map((block) => [block.task.id, block]))
    expect(byId.get('a')?.leftPercent).toBe(0)
    expect(byId.get('a')?.widthPercent).toBe(50)
    expect(byId.get('b')?.leftPercent).toBe(50)
    expect(byId.get('c')?.leftPercent).toBe(50)
  })

  it('不相邻的重叠簇各自独立分列（互不影响宽度）', () => {
    const blocks = layoutDayBlocks(
      [
        task({ id: 'a', startTime: '08:00', endTime: '09:00' }),
        task({ id: 'b', startTime: '08:30', endTime: '09:30' }),
        task({ id: 'c', startTime: '14:00', endTime: '15:00' }),
      ],
      OPTIONS,
    )
    const byId = new Map(blocks.map((block) => [block.task.id, block]))
    expect(byId.get('a')?.widthPercent).toBe(50)
    expect(byId.get('b')?.widthPercent).toBe(50)
    // c 与它们不重叠：贪心分列会复用空出的第一列 → 全宽
    expect(byId.get('c')?.widthPercent).toBe(100)
  })

  it('相接任务不重叠', () => {
    const blocks = layoutDayBlocks(
      [
        task({ id: 'a', startTime: '09:00', endTime: '10:00' }),
        task({ id: 'b', startTime: '10:00', endTime: '11:00' }),
      ],
      OPTIONS,
    )
    expect(blocks.every((block) => block.widthPercent === 100)).toBe(true)
  })
})

describe('layoutDayBlocks · 越界裁切', () => {
  it('早于可视范围的任务裁切到顶部并标记 clippedTop', () => {
    const blocks = layoutDayBlocks([task({ id: 'a', startTime: '05:00', endTime: '07:00' })], OPTIONS)
    expect(blocks[0].top).toBe(0)
    expect(blocks[0].height).toBeCloseTo(44, 5) // 06:00–07:00
    expect(blocks[0].clippedTop).toBe(true)
    expect(blocks[0].clippedBottom).toBe(false)
  })

  it('晚于可视范围的任务裁切到底部并标记 clippedBottom', () => {
    // 用较窄的可视窗口（06:00–22:00）验证底部裁切
    const narrow = { startHour: 6, endHour: 22, hourHeight: 44 }
    const blocks = layoutDayBlocks([task({ id: 'a', startTime: '21:00', endTime: '23:00' })], narrow)
    expect(blocks[0].clippedBottom).toBe(true)
    expect(blocks[0].clippedTop).toBe(false)
    // 06:00–22:00 共 16 小时 → 不超过网格总高
    expect(blocks[0].top + blocks[0].height).toBeLessThanOrEqual(16 * 44 + 0.001)
  })

  it('完全落在可视范围内的任务不被裁切（默认窗口 06:00–24:00）', () => {
    const blocks = layoutDayBlocks([task({ id: 'a', startTime: '23:00', endTime: '23:59' })], OPTIONS)
    expect(blocks[0].clippedBottom).toBe(false)
    expect(blocks[0].clippedTop).toBe(false)
  })

  it('极短任务有最小高度，保证可读', () => {
    const blocks = layoutDayBlocks([task({ id: 'a', startTime: '09:00', endTime: '09:05' })], OPTIONS)
    expect(blocks[0].height).toBeGreaterThanOrEqual(TIMELINE_MIN_BLOCK_HEIGHT)
  })
})

describe('pixelOffsetToHour', () => {
  it('像素偏移向下取整到整点并收敛到可视范围', () => {
    expect(pixelOffsetToHour(0, OPTIONS)).toBe(6)
    expect(pixelOffsetToHour(43, OPTIONS)).toBe(6)
    expect(pixelOffsetToHour(44, OPTIONS)).toBe(7)
    expect(pixelOffsetToHour(44 * 3 + 10, OPTIONS)).toBe(9)
    expect(pixelOffsetToHour(99999, OPTIONS)).toBe(23) // 不越界
    expect(pixelOffsetToHour(-50, OPTIONS)).toBe(6)
  })
})

// ---------- 阶段三：分段 / 折叠 ----------

/** 折叠模型默认值：1 小时 30px、折叠条 44px、主要时段 08:00–22:00 */
const SEGMENT_OPTIONS = { hourHeight: 30, collapsedHeight: 44 }
const MAIN_HEIGHT = (22 - 8) * 30 // 420

function idsOf(tasks: readonly Task[]): string[] {
  return tasks.map((item) => item.id).sort()
}

describe('segmentIdOf：任务归属分段（保证不重复、不丢失）', () => {
  it('落在主要时段内 → main', () => {
    expect(segmentIdOf({ start: 9 * 60, end: 10 * 60 })).toBe('main')
  })

  it('跨越 08:00 / 22:00 边界 → main（由主要时段裁切显示）', () => {
    expect(segmentIdOf({ start: 7 * 60 + 30, end: 8 * 60 + 30 })).toBe('main')
    expect(segmentIdOf({ start: 21 * 60 + 30, end: 22 * 60 + 30 })).toBe('main')
    expect(segmentIdOf({ start: 5 * 60, end: 9 * 60 })).toBe('main')
  })

  it('紧贴边界的任务：07:00–08:00 → early；22:00–23:00 → late', () => {
    expect(segmentIdOf({ start: 7 * 60, end: 8 * 60 })).toBe('early')
    expect(segmentIdOf({ start: 22 * 60, end: 23 * 60 })).toBe('late')
    expect(segmentIdOf({ start: 8 * 60, end: 9 * 60 })).toBe('main')
  })

  it('完全在主要时段之外 → early / late', () => {
    expect(segmentIdOf({ start: 6 * 60, end: 7 * 60 })).toBe('early')
    expect(segmentIdOf({ start: 23 * 60, end: 23 * 60 + 59 })).toBe('late')
  })
})

describe('timelineTickHours / timelineSegmentMeta', () => {
  it('主刻度按 2 小时分布，可包含段尾整点', () => {
    expect(timelineTickHours(8, 22, 2, false)).toEqual([8, 10, 12, 14, 16, 18, 20])
    expect(timelineTickHours(8, 22, 2, true)).toEqual([8, 10, 12, 14, 16, 18, 20, 22])
    expect(timelineTickHours(0, 8, 2, false)).toEqual([0, 2, 4, 6])
    expect(timelineTickHours(22, 24, 2, false)).toEqual([22])
  })

  it('默认只展开主要时段，早间与晚间折叠', () => {
    const meta = timelineSegmentMeta(SEGMENT_OPTIONS)
    expect(meta.map((item) => item.id)).toEqual(['early', 'main', 'late'])
    expect(meta.map((item) => item.expanded)).toEqual([false, true, false])
    expect(meta[1].height).toBe(MAIN_HEIGHT)
    expect(meta[0].height).toBe(44)
    expect(meta[2].height).toBe(44)
    expect(meta[1].label).toBe('08:00–22:00')
    expect(meta[1].tickHours).toEqual([8, 10, 12, 14, 16, 18, 20, 22])
    // 折叠段的刻度线不再保留（高度不按时间比例展开）
    expect(meta[0].tickHours).toEqual([])
    expect(meta[2].tickHours).toEqual([])
  })

  it('展开后恢复对应时段的真实刻度与高度', () => {
    const meta = timelineSegmentMeta({ ...SEGMENT_OPTIONS, earlyExpanded: true, lateExpanded: true })
    const [early, main, late] = meta
    expect(early.expanded).toBe(true)
    expect(early.height).toBe((8 - 0) * 30)
    expect(early.tickHours).toEqual([0, 2, 4, 6])
    expect(late.expanded).toBe(true)
    expect(late.height).toBe((24 - 22) * 30)
    expect(late.tickHours).toEqual([22])
    expect(main.height).toBe(MAIN_HEIGHT)
  })
})

describe('layoutTimelineDay：默认折叠、任务不重复不丢失', () => {
  it('默认高度显著缩短（主要时段 + 两条折叠条）', () => {
    const layout = layoutTimelineDay([], SEGMENT_OPTIONS)
    expect(layout.totalHeight).toBe(MAIN_HEIGHT + 44 + 44)
    // 旧实现为 18 小时 × 44px = 792px，此处应显著更矮
    expect(layout.totalHeight).toBeLessThan(792)
    expect(layout.totalHeight).toBe(508)
  })

  it('每个任务只出现在一个段里（跨边界也不重复）', () => {
    const tasks = [
      task({ id: 'early-1', startTime: '06:00', endTime: '07:00' }),
      task({ id: 'early-2', startTime: '07:30', endTime: '08:00' }),
      task({ id: 'main-1', startTime: '09:00', endTime: '10:00' }),
      task({ id: 'cross-top', startTime: '07:30', endTime: '08:30' }),
      task({ id: 'cross-bottom', startTime: '21:30', endTime: '22:30' }),
      task({ id: 'late-1', startTime: '23:00', endTime: '23:30' }),
      task({ id: 'untimed', startTime: null, endTime: null }),
    ]
    const layout = layoutTimelineDay(tasks, SEGMENT_OPTIONS)
    const collected = [...layout.segments.flatMap((segment) => segment.tasks), ...layout.untimed]
    expect(idsOf(collected)).toEqual(idsOf(tasks)) // 不重复、不丢失
    expect(layout.untimed.map((item) => item.id)).toEqual(['untimed'])

    const byId = new Map<string, string>(
      layout.segments.flatMap((segment) =>
        segment.tasks.map((item): [string, string] => [item.id, segment.id]),
      ),
    )
    expect(byId.get('early-1')).toBe('early')
    expect(byId.get('early-2')).toBe('early')
    expect(byId.get('main-1')).toBe('main')
    expect(byId.get('cross-top')).toBe('main')
    expect(byId.get('cross-bottom')).toBe('main')
    expect(byId.get('late-1')).toBe('late')
  })
})


describe('layoutTimelineDay：折叠与展开的显示策略', () => {
  it('折叠时早间任务以卡片列出（不做时间定位），展开后按真实时间精确定位', () => {
    const tasks = [task({ id: 'early', startTime: '06:30', endTime: '07:00' })]

    const collapsed = layoutTimelineDay(tasks, SEGMENT_OPTIONS)
    const earlyCollapsed = collapsed.segments[0]
    expect(earlyCollapsed.expanded).toBe(false)
    expect(earlyCollapsed.blocks).toEqual([]) // 折叠时不做时间定位
    expect(earlyCollapsed.collapsedTasks.map((item) => item.id)).toEqual(['early'])
    expect(earlyCollapsed.taskCount).toBe(1)

    const expanded = layoutTimelineDay(tasks, { ...SEGMENT_OPTIONS, earlyExpanded: true })
    const earlyExpanded = expanded.segments[0]
    expect(earlyExpanded.collapsedTasks).toEqual([])
    expect(earlyExpanded.blocks).toHaveLength(1)
    // 06:30 距段首 00:00 为 390 分钟 → 390/60 × 30 = 195px
    expect(earlyExpanded.blocks[0].top).toBeCloseTo(195, 5)
    expect(earlyExpanded.blocks[0].clippedTop).toBe(false)
    expect(earlyExpanded.taskCount).toBe(1)
  })

  it('跨越 08:00 的任务归属主要时段并裁切到顶部（带标记，不在折叠条重复出现）', () => {
    const layout = layoutTimelineDay(
      [task({ id: 'cross', startTime: '07:30', endTime: '08:30' })],
      SEGMENT_OPTIONS,
    )
    const main = layout.segments[1]
    expect(main.blocks).toHaveLength(1)
    expect(main.blocks[0].top).toBe(0)
    expect(main.blocks[0].clippedTop).toBe(true)
    expect(main.blocks[0].clippedBottom).toBe(false)
    expect(layout.segments[0].taskCount).toBe(0)
  })

  it('跨越 22:00 的任务归属主要时段并裁切到底部', () => {
    const layout = layoutTimelineDay(
      [task({ id: 'cross', startTime: '21:30', endTime: '22:30' })],
      SEGMENT_OPTIONS,
    )
    const main = layout.segments[1]
    expect(main.blocks[0].clippedBottom).toBe(true)
    expect(main.blocks[0].clippedTop).toBe(false)
    // 起点仍按真实时间精确计算：21:30 距 08:00 为 810 分钟 → 405px
    expect(main.blocks[0].top).toBeCloseTo(405, 5)
    // 可见时长 30 分钟 = 15px，但块高不低于最小可读高度（超出段尾的部分由容器裁掉）
    expect(main.blocks[0].height).toBeGreaterThanOrEqual(15)
    expect(main.blocks[0].height).toBeGreaterThanOrEqual(TIMELINE_MIN_BLOCK_HEIGHT)
    expect(layout.segments[2].taskCount).toBe(0)
  })

  it('主要时段内 09:30–10:30 仍按真实分钟精确定位（不受 2 小时主刻度限制）', () => {
    const layout = layoutTimelineDay(
      [task({ id: 'a', startTime: '09:30', endTime: '10:30' })],
      SEGMENT_OPTIONS,
    )
    const block = layout.segments[1].blocks[0]
    expect(block.top).toBeCloseTo(45, 5) // 09:30 距 08:00 = 90 分钟 → 45px
    expect(block.height).toBeCloseTo(30, 5) // 60 分钟 → 30px
  })

  it('七天共用同一套段高度：任务再多也不会拉长时间轴', () => {
    const crowded = Array.from({ length: 12 }, (_, index) =>
      task({
        id: `t-${index}`,
        startTime: `${String(8 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 === 0 ? '00' : '30'}`,
        endTime: `${String(8 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 === 0 ? '30' : '59'}`,
      }),
    )
    const empty = layoutTimelineDay([], SEGMENT_OPTIONS)
    const busy = layoutTimelineDay(crowded, SEGMENT_OPTIONS)
    expect(busy.totalHeight).toBe(empty.totalHeight)
    expect(busy.segments.map((segment) => segment.height)).toEqual(
      empty.segments.map((segment) => segment.height),
    )
  })

  it('折叠 / 展开不修改任务的任何时间数据', () => {
    const source = [task({ id: 'a', startTime: '06:30', endTime: '07:15', content: '早读' })]
    const snapshot = source.map((item) => ({ ...item }))
    layoutTimelineDay(source, SEGMENT_OPTIONS)
    layoutTimelineDay(source, { ...SEGMENT_OPTIONS, earlyExpanded: true })
    expect(source).toEqual(snapshot)
  })
})

describe('pixelOffsetToHour：分段内的点击时间推断', () => {
  it('主要时段：08:00 起，向下取整到整点', () => {
    const options = { startHour: 8, endHour: 22, hourHeight: 30 }
    expect(pixelOffsetToHour(0, options)).toBe(8)
    expect(pixelOffsetToHour(29, options)).toBe(8)
    expect(pixelOffsetToHour(30, options)).toBe(9)
    expect(pixelOffsetToHour(100000, options)).toBe(21)
    expect(pixelOffsetToHour(-10, options)).toBe(8)
  })

  it('早间 / 晚间段各自独立推断', () => {
    expect(pixelOffsetToHour(0, { startHour: 0, endHour: 8, hourHeight: 30 })).toBe(0)
    expect(pixelOffsetToHour(65, { startHour: 0, endHour: 8, hourHeight: 30 })).toBe(2)
    expect(pixelOffsetToHour(0, { startHour: 22, endHour: 24, hourHeight: 30 })).toBe(22)
    expect(pixelOffsetToHour(35, { startHour: 22, endHour: 24, hourHeight: 30 })).toBe(23)
  })

// ---------- 展示用默认时段（未安排时间的任务纳入时间轴） ----------

function untimed(id: string): Task {
  return task({ id, startTime: null, endTime: null, content: `未安排 ${id}` })
}

describe('assignPlaceholderSlots：未安排任务的展示用默认时段', () => {
  it('从 08:00 起依次分配，每项 1 小时', () => {
    const { slots, overflow } = assignPlaceholderSlots([], [untimed('a'), untimed('b')])
    expect(slots.map((slot) => [slot.start, slot.end])).toEqual([
      [480, 540],
      [540, 600],
    ])
    expect(slots.map((slot) => slot.task.id)).toEqual(['a', 'b'])
    expect(overflow).toEqual([])
  })

  it('跳过已有定时任务占用的时段，不覆盖已有安排', () => {
    const { slots } = assignPlaceholderSlots(
      [task({ id: 'timed', startTime: '08:00', endTime: '09:00' })],
      [untimed('a')],
    )
    expect(slots.map((slot) => [slot.start, slot.end])).toEqual([[540, 600]]) // 09:00–10:00
  })

  it('与半小时开始的定时任务也不重叠（按真实区间判定）', () => {
    const timed = [
      task({ id: 't1', startTime: '08:00', endTime: '09:00' }),
      task({ id: 't2', startTime: '09:30', endTime: '10:30' }),
    ]
    const { slots } = assignPlaceholderSlots(timed, [untimed('a'), untimed('b')])
    // 08:00 / 09:00 / 10:00 起点均被占用（10:00 与 09:30–10:30 重叠）→ 依次取 11:00、12:00
    expect(slots.map((slot) => [slot.start, slot.end])).toEqual([
      [660, 720],
      [720, 780],
    ])
  })

  it('排不下时进入 overflow：不丢弃、互不重叠', () => {
    const pool = Array.from({ length: 20 }, (_, index) => untimed(`u${index}`))
    const { slots, overflow } = assignPlaceholderSlots([], pool)
    // 08:00–22:00 共 14 个整点时段
    expect(slots).toHaveLength(14)
    expect(overflow).toHaveLength(6)
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        expect(slots[i].end <= slots[j].start || slots[j].end <= slots[i].start).toBe(true)
      }
    }
  })

  it('不修改任务数据（时间仍为 null，不写回任何字段）', () => {
    const value = untimed('a')
    const snapshot = { ...value }
    assignPlaceholderSlots([task({ id: 'timed' })], [value])
    expect(value).toEqual(snapshot)
    expect(value.startTime).toBeNull()
    expect(value.endTime).toBeNull()
  })

  it('可自定义时段长度与搜索范围', () => {
    const { slots } = assignPlaceholderSlots([], [untimed('a')], {
      startHour: 10,
      endHour: 12,
      hours: 2,
    })
    expect(slots.map((slot) => [slot.start, slot.end])).toEqual([[600, 720]])
  })
})

describe('layoutTimelineDay：未安排任务纳入时间轴（默认一小时）', () => {
  const OPTIONS = { hourHeight: 30, collapsedHeight: 44 }

  it('未安排任务作为展示用块出现在主要时段，并标记 placeholder', () => {
    const tasks = [
      task({ id: 'timed', startTime: '09:00', endTime: '10:00' }),
      untimed('u1'),
      untimed('u2'),
    ]
    const layout = layoutTimelineDay(tasks, OPTIONS)
    const main = layout.segments[1]
    const byId = new Map(main.blocks.map((block) => [block.task.id, block]))

    expect(byId.get('u1')?.placeholder).toBe(true)
    expect(byId.get('u2')?.placeholder).toBe(true)
    expect(byId.get('timed')?.placeholder).toBe(false)
    // u1 → 08:00（top 0）；timed 保持 09:00（top 30）；u2 → 10:00（top 60）
    expect(byId.get('u1')?.top).toBe(0)
    expect(byId.get('timed')?.top).toBeCloseTo(30, 5)
    expect(byId.get('u2')?.top).toBeCloseTo(60, 5)
    expect(layout.placeholders.map((slot) => [slot.start, slot.end])).toEqual([
      [480, 540],
      [600, 660],
    ])
    // 展示用时间随块一起给出（卡片第二行使用它，不依赖任务数据）
    expect(byId.get('u1')?.displayStart).toBe(480)
    expect(byId.get('u1')?.displayEnd).toBe(540)
    expect(byId.get('timed')?.displayStart).toBe(540)
    expect(byId.get('timed')?.displayEnd).toBe(600)
  })

  it('已有定时任务的位置不因默认排布而改变', () => {
    const timedOnly = [task({ id: 'timed', startTime: '09:30', endTime: '10:30' })]
    const withUntimed = [...timedOnly, untimed('u1'), untimed('u2')]

    const before = layoutTimelineDay(timedOnly, OPTIONS).segments[1].blocks[0]
    const after = layoutTimelineDay(withUntimed, OPTIONS).segments[1].blocks.find(
      (block) => block.task.id === 'timed',
    )
    expect(after?.top).toBe(before.top)
    expect(after?.height).toBe(before.height)
    expect(after?.widthPercent).toBe(before.widthPercent)
    expect(after?.placeholder).toBe(false)
  })

  it('展示用时段不计入正式学习时长统计', () => {
    const tasks = [
      task({ id: 'timed', startTime: '09:00', endTime: '10:00' }),
      untimed('u1'),
      untimed('u2'),
    ]
    const summary = summarizeDayDuration(tasks)
    expect(summary.plannedMinutes).toBe(60) // 只统计真实定时任务的 60 分钟
    expect(summary.timedTaskCount).toBe(1)
    expect(summary.untimedTaskCount).toBe(2)
  })

  it('排不下的任务不进入时间轴，保留在 overflow 列表中', () => {
    const pool = [task({ id: 'timed', startTime: '08:00', endTime: '22:00' }), untimed('u1')]
    const layout = layoutTimelineDay(pool, OPTIONS)
    expect(layout.overflow.map((item) => item.id)).toEqual(['u1'])
    expect(layout.segments[1].blocks.map((block) => block.task.id)).toEqual(['timed'])
  })

  it('七天共用的段高度不受默认排布影响', () => {
    const empty = layoutTimelineDay([], OPTIONS)
    const busy = layoutTimelineDay([untimed('u1'), untimed('u2')], OPTIONS)
    expect(busy.totalHeight).toBe(empty.totalHeight)
  })
})

describe('layoutEntries：与 layoutDayBlocks 结果一致（回归保护）', () => {
  it('相同区间得到相同块', () => {
    const tasks = [
      task({ id: 'a', startTime: '09:00', endTime: '10:30' }),
      task({ id: 'b', startTime: '09:30', endTime: '10:00' }),
    ]
    const options = { startHour: 8, endHour: 22, hourHeight: 30 }
    const direct = layoutDayBlocks(tasks, options)
    const viaEntries = layoutEntries(
      [
        { task: tasks[0], start: 540, end: 630 },
        { task: tasks[1], start: 570, end: 600 },
      ],
      options,
    )
    expect(viaEntries).toEqual(direct)
  })
})

})

