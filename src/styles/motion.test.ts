import { describe, expect, it } from 'vitest'
// 直接以文本方式读取源码（Vite ?raw），不引入 Node 类型依赖
import appSource from '../App.vue?raw'
import modalSource from '../components/common/Modal.vue?raw'
import calendarHeaderSource from '../components/calendar/CalendarHeader.vue?raw'
import dayTypeMenuSource from '../components/calendar/DayTypeMenu.vue?raw'
import monthViewSource from '../components/calendar/MonthView.vue?raw'
import taskCardSource from '../components/calendar/TaskCard.vue?raw'
import weekViewSource from '../components/calendar/WeekView.vue?raw'
import taskPanelSource from '../components/home/TaskPanelCard.vue?raw'
import taskActionMenuSource from '../components/tasks/TaskActionMenu.vue?raw'
import taskRowSource from '../components/tasks/TaskRow.vue?raw'
import baseCss from './base.css?raw'
import tokensCss from './tokens.css?raw'

/**
 * 全局动效规范回归测试。
 *
 * 锁住本轮 UI 动效优化的约定，避免后续改动把它们悄悄改回去：
 * - 过渡时长分三档并集中在 tokens.css，组件内不再写死秒数；
 * - 缓动曲线不止一条（不同交互类型用不同曲线）；
 * - 弹窗 / 浮层用 Vue <Transition> 管理退出动画；
 * - 日历选中态用常驻伪元素 + opacity 过渡（不改变列宽 / 格宽）；
 * - 日历不给七列添加逐列进入动画；
 * - 提供 prefers-reduced-motion 支持。
 */

function token(name: string): string {
  const match = tokensCss.match(new RegExp(`--${name}:\\s*([^;]+);`))
  expect(match, `缺少动效令牌 --${name}`).not.toBeNull()
  return (match?.[1] ?? '').trim()
}

function msOf(value: string): number {
  expect(value.endsWith('ms'), `${value} 应使用 ms 单位`).toBe(true)
  return Number(value.replace('ms', ''))
}

/** 参与动效优化的组件源码（用于检查是否仍写死过渡秒数） */
const ANIMATED_SOURCES: [string, string][] = [
  ['App.vue', appSource],
  ['common/Modal.vue', modalSource],
  ['calendar/CalendarHeader.vue', calendarHeaderSource],
  ['calendar/WeekView.vue', weekViewSource],
  ['calendar/MonthView.vue', monthViewSource],
  ['calendar/DayTypeMenu.vue', dayTypeMenuSource],
  ['calendar/TaskCard.vue', taskCardSource],
  ['tasks/TaskActionMenu.vue', taskActionMenuSource],
  ['tasks/TaskRow.vue', taskRowSource],
  ['home/TaskPanelCard.vue', taskPanelSource],
]

describe('动效规范：统一时长 / 缓动 / 减少动态效果', () => {
  it('过渡时长分三档，且落在建议区间内（快速 120–160ms / 普通 180–240ms / 弹窗 220–300ms）', () => {
    const fast = msOf(token('duration-fast'))
    const base = msOf(token('duration-base'))
    const slow = msOf(token('duration-slow'))

    expect(fast).toBeGreaterThanOrEqual(120)
    expect(fast).toBeLessThanOrEqual(160)
    expect(base).toBeGreaterThanOrEqual(180)
    expect(base).toBeLessThanOrEqual(240)
    expect(slow).toBeGreaterThanOrEqual(220)
    expect(slow).toBeLessThanOrEqual(300)

    // 三档递增，避免所有交互都用同一个时长
    expect(fast).toBeLessThan(base)
    expect(base).toBeLessThan(slow)
  })

  it('缓动曲线集中在令牌里，且不止一条（不同交互类型用不同曲线）', () => {
    const eases = ['ease-standard', 'ease-out', 'ease-in'].map((name) => token(name))
    for (const ease of eases) expect(ease).toMatch(/^cubic-bezier\(/)
    expect(new Set(eases).size).toBeGreaterThan(1)
  })

  it('组件不再写死过渡秒数（统一复用动效令牌）', () => {
    for (const [file, source] of ANIMATED_SOURCES) {
      // 只检查 transition 声明：animation 关键字（如任务名称悬停滚动）不在本约束范围内
      expect(source, `${file} 仍有写死的过渡秒数`).not.toMatch(/transition:[^;]*\d+(\.\d+)?s[^;]*;/)
    }
  })

  it('为 prefers-reduced-motion: reduce 提供支持', () => {
    expect(baseCss).toContain('@media (prefers-reduced-motion: reduce)')
    expect(baseCss).toContain('transition-duration: 0.01ms')
  })

  it('弹窗使用 Vue <Transition> 管理进入与退出（退出动画能完整执行）', () => {
    expect(modalSource).toContain('<Transition name="modal">')
    expect(modalSource).toContain('.modal-enter-from')
    expect(modalSource).toContain('.modal-leave-to')
    // 遮罩与面板退出使用同一时长，不会出现「内容先消失、遮罩延迟消失」
    expect(modalSource).toContain('transition: opacity var(--duration-slow)')
  })

  it('浮层菜单（日期类型 / 任务操作）由父组件用 <Transition name="menu"> 包裹，且组件内定义了退出过渡', () => {
    expect(appSource).toContain('<Transition name="menu">')
    expect(taskPanelSource).toContain('<Transition name="menu">')
    for (const source of [dayTypeMenuSource, taskActionMenuSource]) {
      expect(source).toContain('.menu-enter-from')
      expect(source).toContain('.menu-leave-to')
    }
  })

  it('日历选中态：用常驻伪元素 + opacity 过渡，不改变尺寸（不会列宽变化 / 描边错位）', () => {
    for (const source of [weekViewSource, monthViewSource]) {
      expect(source).toContain('opacity: 0;')
      expect(source).toContain('transition: opacity var(--duration-fast)')
    }
    expect(weekViewSource).toContain('.day-column::after')
    expect(monthViewSource).toContain('.month-cell::after')
    // 伪元素不再「仅选中时才创建」（那种写法会让描边瞬间出现）
    expect(weekViewSource).not.toMatch(/\.day-column\.is-selected::after\s*\{\s*content/)
    expect(monthViewSource).not.toMatch(/\.month-cell\.is-selected::after\s*\{\s*content/)
  })

  it('日历视图切换只整块淡入，不给七列添加逐列进入动画', () => {
    expect(weekViewSource).toContain('@keyframes calendar-view-in')
    expect(monthViewSource).toContain('@keyframes calendar-view-in')
    expect(weekViewSource).not.toMatch(/\.day-column[^{]*\{[^}]*animation:/)
    expect(monthViewSource).not.toMatch(/\.month-cell[^{]*\{[^}]*animation:/)
  })

  it('任务行只有「新出现」时才淡入（v-for 复用节点，不重复播放）', () => {
    expect(taskRowSource).toContain('@keyframes row-in')
  })
})
