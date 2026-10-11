<script setup lang="ts">
import AppIcon from '../common/AppIcon.vue'
import Modal from '../common/Modal.vue'
import {
  addRound,
  removeRound,
  roundCountdowns,
  updateRound,
} from '../../store/settings'
import { subjects } from '../../store/schedule'
import { formatDayTitle } from '../../utils/date'

/**
 * 科目学习轮次预计完成日期（标题栏「轮次」入口）。
 * 每个轮次 = 科目 + 名称 + 预计完成日期；未设置日期时显示「未设置」。
 */
defineProps<{ modelValue: boolean }>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  notice: [message: string]
}>()

function onAdd(): void {
  const first = subjects.value[0]
  if (first === undefined) {
    emit('notice', '请先创建至少一个科目，再添加轮次计划')
    return
  }
  addRound({ subjectId: first.id, name: '第一轮', dueDate: null })
}

function onSubject(roundId: string, event: Event): void {
  updateRound(roundId, { subjectId: (event.target as HTMLSelectElement).value })
}

function onName(roundId: string, event: Event): void {
  updateRound(roundId, { name: (event.target as HTMLInputElement).value })
}

function onDate(roundId: string, event: Event): void {
  const value = (event.target as HTMLInputElement).value
  updateRound(roundId, { dueDate: value === '' ? null : value })
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    title="科目轮次"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="rounds">
      <div class="rounds-head">
        <p class="hint">预计完成日期用于倒计时展示，不影响任务</p>
        <button type="button" class="btn btn-ghost btn-with-icon" @click="onAdd">
          <AppIcon name="plus" size="sm" />
          添加轮次
        </button>
      </div>

      <ul v-if="roundCountdowns.length > 0" class="round-list">
        <li v-for="round in roundCountdowns" :key="round.id" class="round-row">
          <select
            class="input round-subject"
            :value="round.subjectId"
            aria-label="科目"
            @change="onSubject(round.id, $event)"
          >
            <option v-for="subject in subjects" :key="subject.id" :value="subject.id">
              {{ subject.name }}
            </option>
          </select>
          <input
            class="input round-name"
            type="text"
            :value="round.name"
            aria-label="轮次名称"
            placeholder="第一轮"
            @input="onName(round.id, $event)"
          />
          <input
            class="input round-date"
            type="date"
            :value="round.dueDate ?? ''"
            aria-label="预计完成日期"
            @input="onDate(round.id, $event)"
          />
          <span class="round-status tabular">
            {{ round.dueDate === null ? '未设置' : formatDayTitle(round.dueDate) }}
            <template v-if="round.label !== null"> · {{ round.label }}</template>
          </span>
          <button
            type="button"
            class="icon-btn"
            title="删除该轮次"
            aria-label="删除该轮次"
            @click="removeRound(round.id)"
          >
            <AppIcon name="trash" size="sm" />
          </button>
        </li>
      </ul>
      <p v-else class="hint">暂无轮次计划</p>
    </div>
  </Modal>
</template>

<style scoped>
.rounds {
  display: flex;
  flex-direction: column;
  gap: var(--block-gap-sm);
}

.rounds-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--block-gap-sm);
}

.hint {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}

.round-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 0;
  margin: 0;
  list-style: none;
}

.round-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.round-subject {
  width: 104px;
}

.round-name {
  width: 92px;
}

.round-date {
  width: 144px;
}

.round-status {
  flex: 1;
  min-width: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 560px) {
  .round-row {
    flex-wrap: wrap;
  }
}
</style>
