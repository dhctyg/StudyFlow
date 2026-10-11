<script setup lang="ts">
import Modal from './Modal.vue'

defineProps<{
  modelValue: boolean
  title: string
  message: string
  confirmText?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
}>()

function onConfirm(): void {
  emit('confirm')
  emit('update:modelValue', false)
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    :title="title"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <p class="confirm-message">{{ message }}</p>
    <div class="confirm-actions">
      <button type="button" class="btn btn-ghost" @click="emit('update:modelValue', false)">
        取消
      </button>
      <button type="button" class="btn btn-danger" @click="onConfirm">
        {{ confirmText ?? '确认' }}
      </button>
    </div>
  </Modal>
</template>

<style scoped>
.confirm-message {
  color: var(--color-text-secondary);
  font-size: var(--font-size-base);
  overflow-wrap: anywhere;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-5);
}
</style>
