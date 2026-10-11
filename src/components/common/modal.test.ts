// @vitest-environment jsdom
import { DOMWrapper, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import Modal from './Modal.vue'

/**
 * 弹窗进入 / 退出生命周期测试（jsdom，不校验像素，只校验节点与事件）。
 *
 * 关键回归点：关闭弹窗时元素**必须保留到退出动画结束再销毁**，
 * 否则会出现「内容瞬间消失、遮罩延迟消失」以及 Vue <Transition> 退出动画完全不执行的问题。
 *
 * 注意：
 * - 必须使用真实 Teleport（`attachTo: document.body` + 直接查询 body），
 *   因为 Teleport 的测试 stub 会让 Transition 钩子失效，测不到真实生命周期；
 * - 必须显式关闭 Transition 的默认 stub（`stubs: { transition: false }`）。
 */

let wrapper: ReturnType<typeof mount> | null = null

function mountModal(modelValue: boolean) {
  wrapper = mount(Modal, {
    props: { modelValue, title: '测试弹窗' },
    slots: { default: '<p class="probe">弹窗内容</p>' },
    attachTo: document.body,
    global: { stubs: { transition: false } },
  })
  return wrapper
}

function overlay(): DOMWrapper<Element> {
  return new DOMWrapper(document.body.querySelector('.modal-overlay') as Element | null)
}

/**
 * 等待进入 / 退出过渡结束。
 * jsdom 无法真正运行 CSS 过渡，Vue 会在两帧后收尾（内部走 requestAnimationFrame），
 * 因此这里等待得比 40ms 更宽裕一些，避免帧调度抖动导致的偶发失败。
 */
async function settle(): Promise<void> {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 150))
  await nextTick()
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('弹窗：进入 / 退出动画生命周期', () => {
  it('打开后渲染遮罩与面板，并锁定页面滚动', async () => {
    const modal = mountModal(false)
    expect(document.body.querySelector('.modal-overlay')).toBeNull()

    await modal.setProps({ modelValue: true })
    await nextTick()

    expect(overlay().exists()).toBe(true)
    expect(overlay().find('.modal-panel').exists()).toBe(true)
    expect(overlay().find('.probe').text()).toBe('弹窗内容')
    // 进入过渡进行中：遮罩带 enter-active 类（说明 Vue Transition 已接管）
    expect(overlay().classes()).toContain('modal-enter-active')
    expect(document.body.style.overflow).toBe('hidden')

    await settle()
    expect(overlay().exists()).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('关闭时元素保留到退出动画结束才销毁（退出动画能完整执行）', async () => {
    const modal = mountModal(false)
    await modal.setProps({ modelValue: true })
    await nextTick()
    expect(document.body.style.overflow).toBe('hidden')

    await modal.setProps({ modelValue: false })
    await nextTick()

    // 关键：刚关闭时仍在 DOM 中，并带 leave-active 类（退出动画正在执行）
    expect(overlay().exists()).toBe(true)
    expect(overlay().classes()).toContain('modal-leave-active')
    // 页面滚动锁在关闭瞬间释放，避免遮罩淡出期间页面仍不可滚动
    expect(document.body.style.overflow).toBe('')

    await settle()
    expect(document.body.querySelector('.modal-overlay')).toBeNull()
  })

  it('Esc 与遮罩点击都能关闭（Transition 不影响事件绑定）', async () => {
    const modal = mountModal(false)
    await modal.setProps({ modelValue: true })
    await nextTick()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(modal.emitted('update:modelValue')?.at(-1)).toEqual([false])

    await overlay().trigger('click')
    expect(modal.emitted('update:modelValue')).toHaveLength(2)

    await settle()
  })
})

