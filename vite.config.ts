import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

/**
 * `base` 必须与 GitHub Pages 上的实际路径完全一致（含大小写）：
 * 仓库 dhctyg/StudyFlow → 站点 https://dhctyg.github.io/StudyFlow/，故生产 base 为 '/StudyFlow/'。
 *
 * - `vite build`（command === 'build'）：产物 index.html 引用 /StudyFlow/assets/…js|css，
 *   线上不会再 404。若以后改用自定义域名或改仓库名，只改这一处。
 * - `vite preview`（isPreview === true）：预览的也是构建产物，同样要用 '/StudyFlow/'，
 *   否则本地预览会复现线上那种“资源 404”的假象。
 * - `vite`（开发服务器）：base '/'，http://localhost:5173/ 照常可用；`vitest` 亦为 '/'。
 */
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/StudyFlow/' : '/',
  plugins: [vue()],
  test: {
    // 让 Vitest 处理 CSS 模块：否则用 ?raw 读取样式源码会拿到空字符串
    // （字体接入的回归测试需要读取 fonts.css / tokens.css 原文）
    css: true,
  },
}))

