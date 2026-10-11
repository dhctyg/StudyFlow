// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AppBar from './AppBar.vue'

/** 标题栏：三个管理入口（图标 + 文字）与设置入口的连通性。 */
describe('标题栏入口', () => {
  it('三个管理入口文字与顺序为 倒计时 / 轮次 / 科目', () => {
    const wrapper = mount(AppBar)
    const entries = wrapper.findAll('.bar-entry')
    expect(entries).toHaveLength(3)
    expect(entries.map((entry) => entry.text())).toEqual(['倒计时', '轮次', '科目'])
  })

  it('点击三个入口分别触发对应事件（各自打开独立功能）', async () => {
    const wrapper = mount(AppBar)
    const entries = wrapper.findAll('.bar-entry')

    await entries[0]!.trigger('click')
    await entries[1]!.trigger('click')
    await entries[2]!.trigger('click')

    expect(wrapper.emitted('openCountdown')).toHaveLength(1)
    expect(wrapper.emitted('openRounds')).toHaveLength(1)
    expect(wrapper.emitted('openSubjects')).toHaveLength(1)
    expect(wrapper.emitted('openSettings')).toBeUndefined()
  })

  it('设置按钮仍然只负责打开设置', async () => {
    const wrapper = mount(AppBar)
    await wrapper.find('.bar-btn').trigger('click')
    expect(wrapper.emitted('openSettings')).toHaveLength(1)
    expect(wrapper.emitted('openCountdown')).toBeUndefined()
  })

  it('窄屏只显示图标时语义不丢失（aria-label / title 保留）', () => {
    const wrapper = mount(AppBar)
    const entries = wrapper.findAll('.bar-entry')
    expect(entries.map((entry) => entry.attributes('aria-label'))).toEqual([
      '倒计时',
      '轮次',
      '科目',
    ])
    expect(entries.map((entry) => entry.attributes('title'))).toEqual(['倒计时', '轮次', '科目'])
  })
})
