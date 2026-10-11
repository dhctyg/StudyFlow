// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref, Transition, createCommentVNode } from 'vue'
import DayTypeMenu from './DayTypeMenu.vue'

/**
 * 日期类型菜单的进入 / 退出动画测试。
 *
 * 这里验证一个容易被改坏的机制：菜单组件由父组件用 <Transition name="menu"> 包裹
 * （v-if 在父组件里），过渡类会加在菜单组件根节点上，
 * 因此关闭时菜单必须保留到退出动画结束再销毁 —— 否则右键菜单会「啪」地瞬间消失。
 */

function mountMenu() {
  const open = ref(false)
  const Host = defineComponent({
    setup() {
      // 与真实用法一致：<Transition> 是包装元素的子节点，而不是组件根节点
      // （Transition 作为组件根节点时，Vue 的退出过渡不会执行）
      return () =>
        h('div', { class: 'host' }, [
          h(Transition, { name: 'menu' }, {
            default: () =>
              open.value
                ? h(DayTypeMenu, {
                    dateKey: '2026-10-10',
                    current: 'normal',
                    x: 10,
                    y: 10,
                    // 与 App.vue 一致：选择后由父组件关闭菜单
                    onSelect: () => {
                      open.value = false
                    },
                    onClose: () => {
                      open.value = false
                    },
                  })
                // 与 <DayTypeMenu v-if="..."> 编译结果一致：关闭时是注释占位
                : createCommentVNode('v-if', true),
          }),
        ])
    },
  })
  return {
    wrapper: mount(Host, { global: { stubs: { transition: false } } }),
    open,
  }
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

describe('日期类型菜单：进入 / 退出动画', () => {
  it('打开时带进入过渡类，关闭时保留到退出动画结束再销毁', async () => {
    const { wrapper, open } = mountMenu()
    expect(wrapper.find('.day-type-menu').exists()).toBe(false)

    open.value = true
    await nextTick()

    expect(wrapper.find('.day-type-menu').exists()).toBe(true)
    expect(wrapper.find('.day-type-backdrop').classes()).toContain('menu-enter-active')

    await settle()
    expect(wrapper.find('.day-type-menu').exists()).toBe(true)

    // 关闭：菜单仍在 DOM 中并带退出过渡类（退出动画可完整执行）
    open.value = false
    await nextTick()

    expect(wrapper.find('.day-type-menu').exists()).toBe(true)
    expect(wrapper.find('.day-type-backdrop').classes()).toContain('menu-leave-active')

    await settle()
    expect(wrapper.find('.day-type-menu').exists()).toBe(false)
  })

  it('选择日期类型后由父组件关闭，同样走完整退出动画', async () => {
    const { wrapper, open } = mountMenu()
    open.value = true
    await nextTick()
    await settle()

    await wrapper.findAll('.menu-item')[1]!.trigger('click')
    await nextTick()

    // onClose 由父组件执行 → v-if 变 false → 进入退出过渡
    expect(wrapper.find('.day-type-menu').exists()).toBe(true)
    expect(wrapper.find('.day-type-backdrop').classes()).toContain('menu-leave-active')

    await settle()
    expect(wrapper.find('.day-type-menu').exists()).toBe(false)
  })
})
