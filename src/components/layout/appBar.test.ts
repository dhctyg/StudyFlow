// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AppBar from './AppBar.vue'

/** 标题栏：四个管理入口（统一为「图标 + 文字」）与设置入口的连通性。 */
describe('标题栏入口', () => {
  it('四个入口文字与顺序为 倒计时 / 轮次 / 科目 / 设置', () => {
    const wrapper = mount(AppBar)
    const entries = wrapper.findAll('.bar-entry')
    expect(entries).toHaveLength(4)
    expect(entries.map((entry) => entry.text())).toEqual(['倒计时', '轮次', '科目', '设置'])
  })

  it('点击四个入口分别触发对应事件（各自打开独立功能）', async () => {
    const wrapper = mount(AppBar)
    const entries = wrapper.findAll('.bar-entry')

    await entries[0]!.trigger('click')
    await entries[1]!.trigger('click')
    await entries[2]!.trigger('click')
    await entries[3]!.trigger('click')

    expect(wrapper.emitted('openCountdown')).toHaveLength(1)
    expect(wrapper.emitted('openRounds')).toHaveLength(1)
    expect(wrapper.emitted('openSubjects')).toHaveLength(1)
    expect(wrapper.emitted('openSettings')).toHaveLength(1)
  })

  it('设置入口与其它入口同款（图标 + 文字），且仍然只负责打开设置', async () => {
    const wrapper = mount(AppBar)
    const settings = wrapper.find('.bar-entry.is-settings')

    expect(settings.exists()).toBe(true)
    expect(settings.text()).toBe('设置')
    expect(settings.find('.app-icon').exists()).toBe(true)
    // 不再有单独的图标按钮（避免同一入口两套形态）
    expect(wrapper.find('.bar-btn').exists()).toBe(false)

    await settings.trigger('click')
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
      '设置',
    ])
    expect(entries.map((entry) => entry.attributes('title'))).toEqual([
      '倒计时',
      '轮次',
      '科目',
      '设置',
    ])
  })
})
