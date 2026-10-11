<script setup lang="ts">
/**
 * 星期标题行：每周一个独立圆角方框，只显示一个汉字（一…日），水平垂直居中。
 *
 * - 与日期网格同宽同列（7 等分），因此对齐日期列，且不占用日期格的点击区域；
 * - 周视图 / 月视图都是「七列等分、不横向滚动」，无需再传入最小宽度；
 * - 星期文字只出现在这里，不插入任何日期单元格；
 * - 周视图 / 月视图共用，保证两个视图的视觉一致。
 */

const WEEKDAY_CHARS = ['一', '二', '三', '四', '五', '六', '日'] as const
const LABELS = WEEKDAY_CHARS.map((char) => `周${char}`)
</script>

<template>
  <div class="weekday-row" aria-hidden="true">
    <span
      v-for="(label, index) in LABELS"
      :key="label"
      class="weekday-box"
      :class="{ 'is-weekend': index >= 5 }"
      :title="label"
    >
      {{ WEEKDAY_CHARS[index] }}
    </span>
  </div>
</template>

<style scoped>
.weekday-row {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: var(--space-1);
  /* 周视图内随滚动容器固定在顶部（月视图无滚动，效果相同） */
  position: sticky;
  top: 0;
  z-index: 3;
  padding: var(--space-1) 0;
  background: var(--color-surface);
  flex-shrink: 0;
}

/* 统一宽高与圆角，文字居中 */
.weekday-box {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1;
}

.weekday-box.is-weekend {
  color: var(--text-muted);
}
</style>
