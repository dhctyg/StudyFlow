<script setup lang="ts">
import { computed } from 'vue'
import Modal from '../common/Modal.vue'
import { config, examCountdown, setExamDate, setExamName } from '../../store/settings'
import { formatDayTitle } from '../../utils/date'

/**
 * 考研倒计时目标（标题栏「倒计时」入口）。
 * 只编辑配置（名称 / 日期），不触碰任何任务数据。
 */
defineProps<{ modelValue: boolean }>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const currentText = computed(() => {
  const countdown = examCountdown.value
  if (countdown === null) return '未设置考试日期'
  return `${countdown.label} · ${formatDayTitle(countdown.targetDate)}`
})

function onName(event: Event): void {
  setExamName((event.target as HTMLInputElement).value)
}

function onDate(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  setExamDate(value === '' ? null : value)
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    title="考研倒计时"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="form">
      <label class="field">
        <span class="field-label">考试名称</span>
        <input
          class="input"
          type="text"
          :value="config.examName"
          placeholder="例如：考研初试"
          @input="onName"
        />
      </label>

      <label class="field">
        <span class="field-label">考试日期</span>
        <input class="input" type="date" :value="config.examDate ?? ''" @input="onDate" />
      </label>

      <p class="state">当前：{{ currentText }}</p>
    </div>
  </Modal>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: var(--block-gap);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.state {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}
</style>
