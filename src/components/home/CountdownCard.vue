<script setup lang="ts">
import { computed } from 'vue'
import { subjects } from '../../store/schedule'
import { examCountdown, examName, roundCountdowns } from '../../store/settings'
import { formatDayTitle } from '../../utils/date'

/**
 * 倒计时卡片（阶段四）。
 *
 * - 不再显示「倒计时」标题，也不放设置图标（改日期与轮次的入口在标题栏）；
 * - 只保留有用信息：考试目标、剩余天数、目标日期、各科目轮次的预计完成日期；
 * - 内部间距收紧，窄屏单列；剩余天数的计算逻辑未改动。
 */
const days = computed(() => examCountdown.value?.daysRemaining ?? null)
const absDays = computed(() => (days.value === null ? 0 : Math.abs(days.value)))
const isPassed = computed(() => days.value !== null && days.value < 0)

function subjectName(subjectId: string): string {
  return subjects.value.find((subject) => subject.id === subjectId)?.name ?? '未知科目'
}
</script>

<template>
  <section class="home-card countdown-card">
    <div class="home-card-body countdown-body">
      <div class="exam-block">
        <p class="exam-name">{{ examName }}</p>

        <template v-if="examCountdown !== null">
          <p class="exam-days">
            <span class="days-value tabular" :class="{ 'is-passed': isPassed }">{{ absDays }}</span>
            <span class="days-unit">天</span>
            <span class="exam-date tabular">{{ formatDayTitle(examCountdown.targetDate) }}</span>
          </p>
        </template>

        <p v-else class="exam-empty">未设置考试日期 · 可在标题栏「倒计时」中设置</p>
      </div>

      <ul v-if="roundCountdowns.length > 0" class="round-list">
        <li v-for="round in roundCountdowns" :key="round.id" class="round-row">
          <span class="round-name">
            <span class="round-subject">{{ subjectName(round.subjectId) }}</span>
            <span class="round-title">{{ round.name }}</span>
          </span>
          <span v-if="round.dueDate !== null" class="round-meta tabular">
            {{ formatDayTitle(round.dueDate) }} · {{ round.label }}
          </span>
          <span v-else class="round-meta is-unset">未设置</span>
        </li>
      </ul>

      <p v-else class="exam-empty">暂无轮次计划</p>
    </div>
  </section>
</template>

<style scoped>
/* 紧凑排布：左列考试目标 + 剩余天数，右列轮次日期 */
.countdown-body {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) minmax(0, 1.7fr);
  gap: var(--space-3) var(--block-gap);
  align-content: start;
}

.exam-block {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
}

.exam-name {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.exam-days {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0 6px;
}

.days-value {
  font-size: 36px;
  line-height: 1.1;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.days-value.is-passed {
  color: var(--color-danger);
}

.days-unit {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.exam-date {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}

.exam-empty {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}

.round-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0;
  margin: 0;
  list-style: none;
  min-width: 0;
}

.round-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  min-width: 0;
}

.round-name {
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
}

.round-subject {
  color: var(--text-primary);
  font-size: var(--font-size-sm);
}

.round-title {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.round-meta {
  flex-shrink: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  white-space: nowrap;
}

.round-meta.is-unset {
  color: var(--text-muted);
}

@media (max-width: 720px) {
  .countdown-body {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

