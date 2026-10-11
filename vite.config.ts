import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    // 让 Vitest 处理 CSS 模块：否则用 ?raw 读取样式源码会拿到空字符串
    // （字体接入的回归测试需要读取 fonts.css / tokens.css 原文）
    css: true,
  },
})
