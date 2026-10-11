import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SUBJECT_COLOR,
  SUBJECT_COLOR_PRESETS,
  isDarkSubjectColor,
  isPresetSubjectColor,
} from './subjects'

/** 固定色板与相关纯函数的回归测试（色板是科目颜色的唯一配置来源）。 */
describe('科目固定色板', () => {
  it('色板非空、颜色唯一、格式为 #rrggbb 且都带名字', () => {
    expect(SUBJECT_COLOR_PRESETS.length).toBeGreaterThanOrEqual(6)
    const colors = SUBJECT_COLOR_PRESETS.map((preset) => preset.color)
    expect(new Set(colors).size).toBe(colors.length)
    for (const preset of SUBJECT_COLOR_PRESETS) {
      expect(preset.color).toMatch(/^#[0-9a-f]{6}$/)
      expect(preset.name.trim()).not.toBe('')
    }
  })

  it('刻意避开绿色系（绿色专属于“当天任务全部完成”状态）', () => {
    for (const preset of SUBJECT_COLOR_PRESETS) {
      const r = parseInt(preset.color.slice(1, 3), 16)
      const g = parseInt(preset.color.slice(3, 5), 16)
      const b = parseInt(preset.color.slice(5, 7), 16)
      expect(g).toBeLessThanOrEqual(Math.max(r, b))
    }
  })

  it('DEFAULT_SUBJECT_COLOR 属于色板', () => {
    expect(isPresetSubjectColor(DEFAULT_SUBJECT_COLOR)).toBe(true)
  })

  it('isPresetSubjectColor：大小写不敏感；自定义色与非法输入返回 false', () => {
    expect(isPresetSubjectColor(SUBJECT_COLOR_PRESETS[0].color.toUpperCase())).toBe(true)
    expect(isPresetSubjectColor('#123456')).toBe(false)
    expect(isPresetSubjectColor('not-a-color')).toBe(false)
  })

  it('isDarkSubjectColor：深色 true、浅色 false，非法输入按深色处理（白勾更安全）', () => {
    expect(isDarkSubjectColor('#3a3f45')).toBe(true)
    expect(isDarkSubjectColor('#1f2329')).toBe(true)
    expect(isDarkSubjectColor('#ffffff')).toBe(false)
    expect(isDarkSubjectColor('#fdf7ea')).toBe(false)
    expect(isDarkSubjectColor('')).toBe(true)
    expect(isDarkSubjectColor('#abc')).toBe(true)
  })

  it('色板每个颜色都能被判定明暗（勾选标记的对比度依赖该结论）', () => {
    for (const preset of SUBJECT_COLOR_PRESETS) {
      expect(typeof isDarkSubjectColor(preset.color)).toBe('boolean')
    }
  })
})
