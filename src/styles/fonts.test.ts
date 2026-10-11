import { describe, expect, it } from 'vitest'
// 直接以文本方式读取样式源码（Vite ?raw），不引入 Node 类型依赖，也不依赖运行时文件系统
import baseCss from './base.css?raw'
import fontsCss from './fonts.css?raw'
import tokensCss from './tokens.css?raw'
import mainTs from '../main.ts?raw'

/**
 * MiSans 字体接入的回归保护（纯文本断言，无需浏览器）。
 * 覆盖：@font-face 声明与字重映射、相对路径（子路径部署安全）、无 CDN、
 * 全局字体栈与原生表单控件继承。
 * 说明：字体文件本身的存在性与 wOF2 魔数在交付前用命令行校验（见报告），
 * 这里不做文件系统访问，保持测试无 Node 依赖。
 */
describe('MiSans 字体接入', () => {
  it('@font-face 只声明 MiSans 的 400 / 500 / 600 三个具体字重（不用区间写法）', () => {
    // 去掉注释，避免文档里的示例写法被当成真实声明
    const stripped = fontsCss.replace(/\/\*[\s\S]*?\*\//g, '')
    const faces = stripped.split('@font-face').slice(1)
    expect(faces).toHaveLength(3)
    expect(faces.every((face) => /font-family:\s*'MiSans'/.test(face))).toBe(true)
    expect(faces.map((face) => /font-weight:\s*(\d+)/.exec(face)?.[1])).toEqual([
      '400',
      '500',
      '600',
    ])
    // 不能出现字重区间（避免把单字重文件声明成多个字重）
    expect(/font-weight:\s*\d+\s+\d+/.test(stripped)).toBe(false)
    expect(faces.every((face) => /font-style:\s*normal/.test(face))).toBe(true)
    expect(faces.every((face) => /format\('woff2'\)/.test(face))).toBe(true)
    expect(faces.every((face) => /font-display:\s*swap/.test(face))).toBe(true)
  })

  it('字体路径为相对路径（兼顾 GitHub Pages 子路径部署），且不含外部 CDN', () => {
    const urls = [...fontsCss.matchAll(/url\('([^']+)'\)/g)].map((match) => match[1])
    expect(urls).toEqual([
      '../fonts/MiSans-Regular.woff2',
      '../fonts/MiSans-Medium.woff2',
      '../fonts/MiSans-Semibold.woff2',
    ])
    expect(fontsCss).not.toMatch(/https?:\/\//)
    expect(tokensCss).not.toMatch(/fonts\.googleapis|fonts\.gstatic|cdn\./i)
  })

  it('全局字体栈为 MiSans + 中文回退，并在 html / body / #app 上生效', () => {
    expect(tokensCss).toMatch(
      /--font-sans:\s*MiSans,\s*'Microsoft YaHei',\s*'Noto Sans CJK SC',\s*sans-serif;/,
    )
    expect(baseCss).toMatch(/html,\s*\r?\nbody,\s*\r?\n#app\s*\{[^}]*font-family:\s*var\(--font-sans\)/)
    // 原生表单控件跟随全局字体（含下拉选项）
    expect(baseCss).toMatch(/button,\s*\r?\ninput,\s*\r?\nselect,\s*\r?\ntextarea,\s*\r?\noptgroup,\s*\r?\noption\s*\{/)
    expect(baseCss).toMatch(/font:\s*inherit/)
  })

  it('字体样式在入口处最先加载，保证首屏即用 MiSans', () => {
    expect(mainTs).toMatch(/import '\.\/styles\/fonts\.css'/)
    const fontsIndex = mainTs.indexOf("import './styles/fonts.css'")
    const tokensIndex = mainTs.indexOf("import './styles/tokens.css'")
    expect(fontsIndex).toBeGreaterThan(-1)
    expect(fontsIndex).toBeLessThan(tokensIndex)
  })
})
