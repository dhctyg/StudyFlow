<script setup lang="ts">
import { computed } from 'vue'
import { APP_ICONS, type IconName } from './icons'
import { resolveIconName } from '../../store/uiTheme'

/**
 * 统一图标出口：组件按语义名使用图标，尺寸走设计令牌 --icon-size-*，
 * 颜色走 --icon-color（默认 currentColor，跟随文字色）。
 * 可自定义的语义图标（日历 / 设置 / 添加任务 / 完成 / 删除）由 UI 自定义中心覆盖，
 * 映射集中在 ./icons.ts，替换图标库只改那一处。
 */
const props = withDefaults(
  defineProps<{ name: IconName; size?: 'sm' | 'md' | 'lg'; raw?: boolean }>(),
  { size: 'md', raw: false },
)

/** raw = true 时按图标名直接渲染（图标选择器预览用，不做语义覆盖） */
const resolvedName = computed(() => (props.raw ? props.name : resolveIconName(props.name)))
const iconComponent = computed(() => APP_ICONS[resolvedName.value])
</script>

<template>
  <component :is="iconComponent" class="app-icon" :class="`is-${size}`" aria-hidden="true" />
</template>

<style scoped>
.app-icon {
  flex-shrink: 0;
  color: var(--icon-color);
}

.app-icon.is-sm {
  width: var(--icon-size-sm);
  height: var(--icon-size-sm);
}

.app-icon.is-md {
  width: var(--icon-size-md);
  height: var(--icon-size-md);
}

.app-icon.is-lg {
  width: var(--icon-size-lg);
  height: var(--icon-size-lg);
}
</style>

