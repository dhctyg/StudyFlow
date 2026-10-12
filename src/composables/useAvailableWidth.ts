import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

/**
 * 跟踪某个容器元素的**实际可用宽度**（px），用于按真实可用宽度切换布局，
 * 而不是依赖设备型号或简单的「是否手机」判断。
 *
 * 设计约定：
 * - 优先用 `ResizeObserver` 监听容器自身尺寸：窗口缩放、侧栏比例调整、
 *   单列/两列切换都会触发，能反映「真正分给这块区域的宽度」；
 * - 环境不支持 `ResizeObserver`（例如单元测试使用的 jsdom）时回退到 `window.resize`
 *   + `getBoundingClientRect()`，并且**取不到有效宽度时保持「宽度充足」**（Infinity），
 *   绝不因为拿不到宽度就误切到窄屏布局；
 * - 宽度为 0（尚未布局 / 容器隐藏）视为无效值，保留上一次的有效宽度，
 *   避免初始化阶段出现一次布局跳变。
 */
export function useAvailableWidth(target: Ref<HTMLElement | null>): Ref<number> {
  /** 默认视为宽度充足（桌面布局），只有测到有效宽度后才可能变窄 */
  const width = ref(Number.POSITIVE_INFINITY)

  const applyWidth = (value: number): void => {
    if (Number.isFinite(value) && value > 0) width.value = value
  }

  let observer: ResizeObserver | null = null

  const measureFromRect = (): void => {
    const el = target.value
    if (el === null) return
    applyWidth(el.getBoundingClientRect().width)
  }

  const stopObserving = (): void => {
    observer?.disconnect()
    observer = null
  }

  const startObserving = (): void => {
    stopObserving()
    const el = target.value
    if (el === null) return

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measureFromRect)
      measureFromRect()
      return
    }

    observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry === undefined) return
      applyWidth(entry.contentRect.width)
    })
    observer.observe(el)
  }

  onMounted(startObserving)
  // 容器由 v-if 延迟挂载时也能重新开始观测
  watch(target, startObserving)

  onBeforeUnmount(() => {
    stopObserving()
    window.removeEventListener('resize', measureFromRect)
  })

  return width
}
