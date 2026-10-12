// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { STORAGE_KEYS } from '../../services/storage'
import {
  createTask,
  init,
  monthCells,
  selectDate,
  selectedDate,
  selectedTasks,
  setDayType,
  switchView,
} from '../../store/schedule'
import { todayKey, weekDaysKey } from '../../utils/date'
import { TASK_DRAG_MIME } from '../../utils/taskDrag'
import CalendarCard from '../home/CalendarCard.vue'
import {
  CALENDAR_COMPACT_EXIT_WIDTH,
  CALENDAR_COMPACT_WIDTH,
  nextCompactState,
} from './calendarBreakpoints'
import MonthView from './MonthView.vue'
import WeekView from './WeekView.vue'

/**
 * 窄屏竖屏（紧凑日期选择器）测试：真实组件 + 真实 store。
 *
 * 关注点：
 * 1. compact 时不再渲染七列任务卡片 / 月历格子，改为日期选择器；
 * 2. 日期选择器只显示日期数字 + 科目主题色圆点，不出现任何任务文字；
 * 3. 点击日期能切换选中日期，并让日任务区域（selectedTasks）同步更新；
 * 4. compact 由「实际可用宽度」决定 —— 拿不到宽度时保持宽屏，测到窄宽度才切换；
 * 5. 宽屏（compact = false）行为与重构前一致。
 */

const SEED_SUBJECTS = [
  { id: 'math', name: '数学', color: '#c15f5c' },
  { id: 'english', name: '英语', color: '#4059a8' },
  { id: 'comm', name: '通信原理', color: '#c0914e' },
  { id: 'physics', name: '物理', color: '#7a5ea8' },
  { id: 'cs', name: '计算机', color: '#4a7c94' },
]
/** jsdom 会把内联颜色规范化为 rgb(...) 形式 */
const MATH_RGB = 'rgb(193, 95, 92)'
const ENGLISH_RGB = 'rgb(64, 89, 168)'

function fakeLocalStorage(initial: Record<string, string>): Storage {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    get length() {
      return store.size
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
  }
}

function useStorage(): void {
  const fake = fakeLocalStorage({
    [STORAGE_KEYS.subjects]: JSON.stringify(SEED_SUBJECTS),
    [STORAGE_KEYS.subtasks]: '[]',
    [STORAGE_KEYS.tasks]: '[]',
    [STORAGE_KEYS.restDays]: '[]',
    [STORAGE_KEYS.dayTypes]: '{}',
    [STORAGE_KEYS.seeded]: '1',
  })
  Object.defineProperty(window, 'localStorage', { configurable: true, value: fake })
  init()
}

let slot = 0

/** 同一天多个任务：逐个错开时间，避免（历史数据才有的）时间冲突判定干扰 */
function addTask(date: string, subjectId: string, content: string): void {
  slot += 1
  const start = `${String(8 + (slot % 12)).padStart(2, '0')}:00`
  const end = `${String(9 + (slot % 12)).padStart(2, '0')}:00`
  createTask({ date, subjectId, subtaskId: null, startTime: start, endTime: end, content })
}

function cellFor(wrapper: ReturnType<typeof mount>, key: string) {
  return wrapper.findAll('.picker-cell').find((cell) => cell.attributes('aria-label') === key)
}

beforeEach(() => {
  useStorage()
  switchView('week')
  selectDate(todayKey())
})

afterEach(() => {
  vi.unstubAllGlobals()
})


describe('紧凑周视图：日期选择器', () => {
  it('只渲染 7 个日期格，不渲染任务卡片 / 任务文字', () => {
    addTask(todayKey(), 'math', '复习卷积码')
    const wrapper = mount(WeekView, { props: { compact: true } })

    expect(wrapper.findAll('.picker-cell')).toHaveLength(7)
    expect(wrapper.findAll('.day-column')).toHaveLength(0)
    expect(wrapper.findAll('.task-card')).toHaveLength(0)
    // 日期选择器不显示任何任务信息
    expect(wrapper.text()).not.toContain('复习卷积码')
    expect(wrapper.find('.picker-grid').exists()).toBe(true)
    // 星期标题仍在（用于方向感）
    expect(wrapper.findAll('.weekday-box')).toHaveLength(7)
  })

  it('宽屏（compact = false）仍然渲染原有七列，行为不变', () => {
    const wrapper = mount(WeekView, { props: { compact: false } })
    expect(wrapper.findAll('.day-column')).toHaveLength(7)
    expect(wrapper.findAll('.picker-cell')).toHaveLength(0)
  })

  it('圆点使用科目主题色：同一科目合并，多科目各一个', () => {
    addTask(todayKey(), 'math', '数学一')
    addTask(todayKey(), 'math', '数学二')
    addTask(todayKey(), 'english', '英语一')

    const wrapper = mount(WeekView, { props: { compact: true } })
    const cell = cellFor(wrapper, todayKey())
    expect(cell, '未找到今天的日期格').toBeTruthy()

    const dots = cell!.findAll('.picker-dot')
    expect(dots).toHaveLength(2)
    expect(dots[0]!.attributes('style')).toContain(MATH_RGB)
    expect(dots[1]!.attributes('style')).toContain(ENGLISH_RGB)
    // 没有超出上限时不显示 +N
    expect(cell!.find('.picker-more').exists()).toBe(false)
  })

  it('无任务的日期不显示圆点，有任务的日期才显示', () => {
    const days = weekDaysKey(todayKey())
    const other = days.find((key) => key !== todayKey())!
    addTask(todayKey(), 'math', '数学一')

    const wrapper = mount(WeekView, { props: { compact: true } })
    expect(cellFor(wrapper, todayKey())!.findAll('.picker-dot')).toHaveLength(1)
    expect(cellFor(wrapper, other)!.findAll('.picker-dot')).toHaveLength(0)
  })

  it('科目数超过上限时显示 +N（圆点数量受控，不拥挤）', () => {
    for (const id of ['math', 'english', 'comm', 'physics', 'cs']) {
      addTask(todayKey(), id, `${id} 任务`)
    }
    const wrapper = mount(WeekView, { props: { compact: true } })
    const cell = cellFor(wrapper, todayKey())!
    expect(cell.findAll('.picker-dot')).toHaveLength(3)
    expect(cell.find('.picker-more').text()).toBe('+2')
  })

  it('点击日期切换选中日期，日任务区域（selectedTasks）同步更新', async () => {
    const days = weekDaysKey(todayKey())
    const target = days[days.length - 1]!
    addTask(target, 'math', '周日的任务')
    addTask(todayKey(), 'english', '今天的任务')

    const wrapper = mount(WeekView, { props: { compact: true } })
    await cellFor(wrapper, target)!.trigger('click')
    await nextTick()

    expect(selectedDate.value).toBe(target)
    expect(selectedTasks.value.map((task) => task.content)).toEqual(['周日的任务'])
    // 选中态跟随更新
    expect(cellFor(wrapper, target)!.classes()).toContain('is-selected')
    expect(cellFor(wrapper, target)!.attributes('aria-pressed')).toBe('true')
  })

  it('日期格保留日期类型语义（今天 / 休息日 / 缓冲日），不改动任何数据', async () => {
    const days = weekDaysKey(todayKey())
    const rest = days.find((key) => key !== todayKey())!
    setDayType(rest, 'rest')
    const buffer = days.find((key) => key !== todayKey() && key !== rest)!
    setDayType(buffer, 'buffer')

    const wrapper = mount(WeekView, { props: { compact: true } })
    expect(cellFor(wrapper, todayKey())!.classes()).toContain('is-today')
    expect(cellFor(wrapper, rest)!.classes()).toContain('is-rest')
    expect(cellFor(wrapper, buffer)!.classes()).toContain('is-buffer')

    // 选择日期不会修改日期类型或任务数据
    await cellFor(wrapper, rest)!.trigger('click')
    await nextTick()
    expect(selectedDate.value).toBe(rest)
  })

  it('右键日期格仍能打开日期类型菜单（保留原有入口）', async () => {
    const wrapper = mount(WeekView, { props: { compact: true } })
    await cellFor(wrapper, todayKey())!.trigger('contextmenu')
    expect(wrapper.emitted('openDayMenu')).toBeTruthy()
  })

  it('拖拽任务到日期格：沿用既有改期逻辑（落点只改原任务日期）', async () => {
    const target = weekDaysKey(todayKey())[3]!
    const dataTransfer = { getData: () => 'task-1', setData: () => {}, types: [TASK_DRAG_MIME] }

    const wrapper = mount(WeekView, { props: { compact: true } })
    await cellFor(wrapper, target)!.trigger('dragover', { dataTransfer })
    expect(cellFor(wrapper, target)!.classes()).toContain('is-drop-target')

    await cellFor(wrapper, target)!.trigger('drop', { dataTransfer })
    expect(wrapper.emitted('moveTask')).toEqual([['task-1', target]])
  })

  it('科目筛选会同步影响圆点（沿用既有筛选逻辑）', async () => {
    addTask(todayKey(), 'math', '数学任务')
    addTask(todayKey(), 'english', '英语任务')
    const { setSubjectFilter } = await import('../../store/schedule')

    const wrapper = mount(WeekView, { props: { compact: true } })
    expect(cellFor(wrapper, todayKey())!.findAll('.picker-dot')).toHaveLength(2)

    setSubjectFilter('math')
    await nextTick()
    const dots = cellFor(wrapper, todayKey())!.findAll('.picker-dot')
    expect(dots).toHaveLength(1)
    expect(dots[0]!.attributes('style')).toContain(MATH_RGB)
  })
})

describe('紧凑月视图：日期选择器', () => {
  it('渲染整月日期格（不再是月历任务格子），并标记邻月日期', () => {
    switchView('month')
    const wrapper = mount(MonthView, { props: { compact: true } })

    expect(wrapper.findAll('.picker-cell')).toHaveLength(monthCells.value.length)
    expect(wrapper.findAll('.month-cell')).toHaveLength(0)
    // 每个格子只有一个日期数字（没有任何任务文字）
    expect(wrapper.findAll('.picker-cell .picker-day')).toHaveLength(monthCells.value.length)
    expect(wrapper.findAll('.picker-cell.is-outside').length).toBeGreaterThan(0)
  })

  it('宽屏（compact = false）仍然渲染原有月历网格，行高与选中逻辑不变', () => {
    switchView('month')
    const wrapper = mount(MonthView, { props: { compact: false } })
    expect(wrapper.findAll('.month-cell')).toHaveLength(monthCells.value.length)
    expect(wrapper.findAll('.picker-cell')).toHaveLength(0)
    expect(wrapper.findAll('.cell-dot').length).toBe(0)
  })

  it('点击日期切换选中日期并同步日任务区域', async () => {
    switchView('month')
    const target = monthCells.value[10]!
    addTask(target, 'comm', '月末任务')

    const wrapper = mount(MonthView, { props: { compact: true } })
    await cellFor(wrapper, target)!.trigger('click')
    await nextTick()

    expect(selectedDate.value).toBe(target)
    expect(selectedTasks.value.map((task) => task.content)).toEqual(['月末任务'])
  })
})

/** 用可注入宽度的 ResizeObserver 模拟「实际可用宽度」 */
class FakeResizeObserver {
  static width = 1024
  /** 已创建的实例（测试里用来手动推送新的宽度，模拟窗口尺寸变化） */
  static instances: FakeResizeObserver[] = []
  private readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    FakeResizeObserver.instances.push(this)
  }

  observe(): void {
    this.emit(FakeResizeObserver.width)
  }

  /** 推送一次尺寸变化 */
  emit(width: number): void {
    this.callback(
      [{ contentRect: { width } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    )
  }

  unobserve(): void {}
  disconnect(): void {
    FakeResizeObserver.instances = FakeResizeObserver.instances.filter((item) => item !== this)
  }
}

describe('日历布局切换：按实际可用宽度（容器查询式判断）', () => {
  it('拿不到可用宽度时保持宽屏七列（不因「可能是手机」而误切）', async () => {
    // jsdom 默认没有 ResizeObserver，宽度未知
    const wrapper = mount(CalendarCard)
    await nextTick()

    expect(wrapper.find('.calendar-view').classes()).not.toContain('is-compact')
    expect(wrapper.findAll('.day-column')).toHaveLength(7)
    expect(wrapper.findAll('.picker-cell')).toHaveLength(0)
  })

  it('测到窄宽度（例如手机竖屏 360px）时切换为紧凑日期选择器', async () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    FakeResizeObserver.width = 360

    const wrapper = mount(CalendarCard)
    await nextTick()

    expect(wrapper.find('.calendar-view').classes()).toContain('is-compact')
    expect(wrapper.findAll('.day-column')).toHaveLength(0)
    expect(wrapper.findAll('.picker-cell')).toHaveLength(7)
  })

  it('测到宽宽度（桌面横屏）时仍使用七列布局', async () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    FakeResizeObserver.width = 1000

    const wrapper = mount(CalendarCard)
    await nextTick()

    expect(wrapper.find('.calendar-view').classes()).not.toContain('is-compact')
    expect(wrapper.findAll('.day-column')).toHaveLength(7)
    expect(wrapper.findAll('.picker-cell')).toHaveLength(0)
  })

  it('紧凑模式下切换周 / 月视图，两种模式都用日期选择器', async () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    FakeResizeObserver.width = 360

    const wrapper = mount(CalendarCard)
    await nextTick()
    expect(wrapper.findAll('.picker-cell')).toHaveLength(7)

    await wrapper.findAll('.view-btn')[1]!.trigger('click')
    await nextTick()

    expect(wrapper.findAll('.month-cell')).toHaveLength(0)
    expect(wrapper.findAll('.picker-cell')).toHaveLength(monthCells.value.length)
  })
})

describe('断点与滞回：阈值附近不反复跳变', () => {
  it('纯函数规则：进入 / 退出用不同阈值，宽度不可用时保持现状', () => {
    // 未紧凑：明显变窄才进入
    expect(nextCompactState(false, 1000)).toBe(false)
    expect(nextCompactState(false, CALENDAR_COMPACT_WIDTH + 1)).toBe(false)
    expect(nextCompactState(false, CALENDAR_COMPACT_WIDTH - 1)).toBe(true)

    // 已紧凑：只有明显变宽才退出（滞回区间内保持紧凑）
    expect(nextCompactState(true, CALENDAR_COMPACT_WIDTH + 1)).toBe(true)
    expect(nextCompactState(true, CALENDAR_COMPACT_EXIT_WIDTH)).toBe(true)
    expect(nextCompactState(true, CALENDAR_COMPACT_EXIT_WIDTH + 1)).toBe(false)

    // 量不到宽度（尚未布局 / 环境不支持测量）：保持现状，绝不误切
    expect(nextCompactState(false, Number.POSITIVE_INFINITY)).toBe(false)
    expect(nextCompactState(true, Number.POSITIVE_INFINITY)).toBe(true)
    expect(nextCompactState(false, 0)).toBe(false)
    expect(nextCompactState(true, Number.NaN)).toBe(true)
  })

  it('组件行为：在阈值附近来回变化时布局不会反复跳变', async () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    FakeResizeObserver.instances = []
    FakeResizeObserver.width = CALENDAR_COMPACT_WIDTH + 20 // 640：未紧凑时不触发

    const wrapper = mount(CalendarCard)
    await nextTick()
    expect(wrapper.find('.calendar-view').classes()).not.toContain('is-compact')
    const observer = FakeResizeObserver.instances[0]!

    observer.emit(CALENDAR_COMPACT_WIDTH - 20) // 600：明显变窄 → 紧凑
    await nextTick()
    expect(wrapper.find('.calendar-view').classes()).toContain('is-compact')

    observer.emit(CALENDAR_COMPACT_WIDTH + 20) // 640：滞回区间内 → 保持紧凑
    await nextTick()
    expect(wrapper.find('.calendar-view').classes()).toContain('is-compact')

    observer.emit(CALENDAR_COMPACT_WIDTH - 20) // 又变窄：仍是紧凑，不闪回七列
    await nextTick()
    expect(wrapper.find('.calendar-view').classes()).toContain('is-compact')

    observer.emit(CALENDAR_COMPACT_EXIT_WIDTH + 20) // 700：明显变宽 → 恢复七列
    await nextTick()
    expect(wrapper.find('.calendar-view').classes()).not.toContain('is-compact')
    expect(wrapper.findAll('.day-column')).toHaveLength(7)
  })
})
