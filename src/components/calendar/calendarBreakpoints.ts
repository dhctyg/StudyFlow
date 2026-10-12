/**
 * 日历布局断点（窄屏竖屏 → 紧凑日期选择器）。
 *
 * 判断依据是**日历区域的真实可用宽度**（由 useAvailableWidth 量出来），
 * 不是设备型号，也不是「是否手机」的简单判断：
 *
 * - `CALENDAR_COMPACT_WIDTH`：七列要放下任务卡片，每列至少约 88px → 7 × 88 ≈ 620px。
 *   可用宽度小于它时改用紧凑日期选择器（只显示日期数字 + 科目主题色圆点）。
 * - `CALENDAR_COMPACT_EXIT_WIDTH`：滞回上界。已经处于紧凑布局时，需要更宽的宽度才切回七列，
 *   避免窗口宽度恰好在阈值附近来回变化（拖动窗口边缘、侧栏比例微调）时布局反复跳变。
 *
 * 与既有响应式规则的关系：
 * - 桌面两栏布局下左栏最窄约 713px（右栏最小 320px），永远 > 620px，
 *   所以**横屏桌面界面不会误切**，原有周 / 月视图保持原样；
 * - 单列窄屏下日历卡片宽度 ≈ 窗口宽 − 40px，即窗口窄于约 660px 时切换为日期选择器。
 */

/** 进入紧凑布局的上限：可用宽度小于该值 → 日期选择器 */
export const CALENDAR_COMPACT_WIDTH = 620

/** 退出紧凑布局的下限（滞回）：可用宽度大于该值 → 恢复七列 / 月历网格 */
export const CALENDAR_COMPACT_EXIT_WIDTH = 680

/**
 * 计算下一帧是否使用紧凑布局（纯函数，带滞回）。
 *
 * - 宽度不可用（Infinity / 0 / NaN，例如尚未布局或环境不支持测量）→ 保持当前状态，
 *   绝不因为「量不到宽度」而误切布局；
 * - 已紧凑：只有明显变宽（> EXIT）才切回；
 * - 未紧凑：只有明显变窄（< COMPACT）才切换。
 */
export function nextCompactState(current: boolean, width: number): boolean {
  if (!Number.isFinite(width) || width <= 0) return current
  if (current) return width <= CALENDAR_COMPACT_EXIT_WIDTH
  return width < CALENDAR_COMPACT_WIDTH
}
