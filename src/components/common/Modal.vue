<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'

const props = defineProps<{ modelValue: boolean; title: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.modelValue) {
    emit('update:modelValue', false)
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', onKeydown)
    } else {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKeydown)
    }
  },
)

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="modal-overlay"
      @click.self="emit('update:modelValue', false)"
    >
      <div class="modal-panel" role="dialog" aria-modal="true" :aria-label="title">
        <header class="modal-header">
          <h2 class="modal-title">{{ title }}</h2>
          <button
            class="btn btn-quiet modal-close"
            aria-label="关闭"
            type="button"
            @click="emit('update:modelValue', false)"
          >
            ×
          </button>
        </header>
        <div class="modal-body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  /* 顶部留白收紧：弹窗更快进入视线，也不浪费纵向空间 */
  padding: 7vh var(--space-4) var(--space-4);
  background: var(--color-overlay);
}

.modal-panel {
  width: 100%;
  /**
   * 弹窗加宽：设置 / 倒计时 / 轮次 / 科目与任务表单内的滑块、标签与数值不再拥挤。
   * 用 min() 同时给出响应式上限，窄屏（含 320px）不会超出视口，也不会出现横向滚动。
   */
  max-width: min(600px, calc(100vw - var(--space-4) * 2));
  /* 允许更高的内容区，减少内部滚动次数 */
  max-height: 84vh;
  overflow-y: auto;
  background: var(--card-bg);
  /* 弹窗与卡片统一 16px 圆角；不加边框，靠阴影分层 */
  border: none;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-4) var(--space-2);
}

.modal-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
}

.modal-close {
  font-size: var(--font-size-lg);
  line-height: 1;
}

.modal-body {
  padding: var(--space-2) var(--space-4) var(--space-4);
}
</style>
