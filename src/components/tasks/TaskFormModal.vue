<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Modal from '../common/Modal.vue'
import type { SubjectId, Task, TaskInput } from '../../models/types'
import {
  ConflictError,
  FieldError,
  RestDayError,
  createTask,
  isRestDay,
  subjectOf,
  subjects,
  subtasksOfSubject,
  updateTask,
} from '../../store/schedule'
import { isDateKey } from '../../utils/date'

/**
 * 任务表单（新增 / 编辑共用，日历日期格、空白区、任务面板共用）。
 *
 * - 表单**不再提供「开始时间 / 结束时间」**：任务只按日期安排；
 *   时间线相关工具与每日时长统计仍保留（供旧任务展示 / 统计），见 utils/time.ts 与 utils/studyDuration.ts；
 * - 编辑旧任务时，任务原有的开始 / 结束时间会在保存时**原样带回**（表单不展示、不重设、不清空），
 *   因此旧数据不会被这次改版破坏；
 * - 保存前仍会检测同一天的时间冲突（只可能发生在带时间的旧任务之间）：默认拦截并列出冲突任务，
 *   用户可以改日期或确认保留重叠；
 * - 目标日期是休息日时默认拦截并明确提示，用户确认后才写入；
 * - 子任务标签只列当前科目下的标签；切换科目时自动清空不属于新科目的标签。
 */
const props = defineProps<{
  modelValue: boolean
  task: Task | null
  /** 默认日期（新增任务时的安排日期） */
  defaultDate: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
}>()

type ErrorFields = 'date' | 'subjectId' | 'subtaskId' | 'content'

const form = reactive<{
  date: string | null
  /** 旧任务自带的时间：不在表单展示，仅用于编辑时原样保留（新任务恒为空串） */
  startTime: string
  endTime: string
  subjectId: SubjectId
  subtaskId: string | null
  content: string
}>({
  date: '',
  startTime: '',
  endTime: '',
  subjectId: '',
  subtaskId: null,
  content: '',
})

/** 休息日保护提示：保存被拦截后显示，用户确认才继续 */
const restDayPrompt = ref(false)

const errors = reactive<Record<ErrorFields, string>>({
  date: '',
  subjectId: '',
  subtaskId: '',
  content: '',
})

const conflicts = ref<Task[]>([])
const submitting = ref(false)

const isEdit = computed(() => props.task !== null)
const title = computed(() => (isEdit.value ? '编辑任务' : '新增任务'))
const submitText = computed(() => (isEdit.value ? '保存修改' : '创建任务'))
const subtaskOptions = computed(() => subtasksOfSubject(form.subjectId))
/** 所选日期是休息日：给出前置提示（保存时仍需确认） */
const selectedIsRest = computed(() => form.date !== null && isRestDay(form.date))

function clearErrors(): void {
  errors.date = ''
  errors.subjectId = ''
  errors.subtaskId = ''
  errors.content = ''
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    clearErrors()
    conflicts.value = []
    if (props.task !== null) {
      form.date = props.task.date
      // 旧任务的时间原样带出：表单不展示，保存时保持原值（不清空、不重设）
      form.startTime = props.task.startTime ?? ''
      form.endTime = props.task.endTime ?? ''
      form.subjectId = props.task.subjectId
      // 标签已删除时按“不分类”处理，任务仍可编辑
      form.subtaskId = props.task.subtaskId
      form.content = props.task.content
    } else {
      form.date = props.defaultDate
      form.startTime = ''
      form.endTime = ''
      form.subjectId = subjects.value[0]?.id ?? ''
      form.subtaskId = null
      form.content = ''
    }
    restDayPrompt.value = false
  },
)

// 切换科目：当前标签不属于新科目时清空
watch(
  () => form.subjectId,
  () => {
    if (form.subtaskId !== null && !subtaskOptions.value.some((item) => item.id === form.subtaskId)) {
      form.subtaskId = null
    }
  },
)

// 日期变化后，之前的冲突 / 休息日提示已失效
watch(
  () => form.date,
  () => {
    conflicts.value = []
    restDayPrompt.value = false
  },
)

function close(): void {
  emit('update:modelValue', false)
}

function buildInput(): TaskInput {
  return {
    date: form.date,
    subjectId: form.subjectId,
    subtaskId: form.subtaskId,
    startTime: form.startTime,
    endTime: form.endTime,
    content: form.content,
  }
}

function save(allowConflict: boolean, allowRestDay = false): void {
  clearErrors()
  restDayPrompt.value = false
  try {
    const input = buildInput()
    if (props.task !== null) updateTask(props.task.id, input, { allowConflict, allowRestDay })
    else createTask(input, { allowConflict, allowRestDay })
    emit('saved')
    close()
  } catch (error) {
    if (error instanceof ConflictError) {
      // 拦截保存：列出冲突任务，已有任务绝不被覆盖或删除
      conflicts.value = error.conflicts
      return
    }
    if (error instanceof RestDayError) {
      // 休息日保护：明确提示，用户确认后才写入（不会自动把任务排进休息日）
      restDayPrompt.value = true
      return
    }
    if (error instanceof FieldError && error.field in errors) {
      ;(errors as Record<string, string>)[error.field] = error.message
      return
    }
    errors.content = error instanceof Error ? error.message : '保存失败，请重试'
  }
}

function submit(): void {
  submitting.value = true
  try {
    // 本地前置校验，给出字段级提示（时间字段已从表单移除，这里只校验日期与内容）
    if (form.date === null || !isDateKey(form.date)) {
      errors.date = '请选择有效日期'
      return
    }
    if (form.content.trim() === '') {
      errors.content = '任务内容不能为空'
      return
    }
    save(false)
  } finally {
    submitting.value = false
  }
}

function subjectLabel(subjectId: SubjectId): string {
  return subjectOf(subjectId).name
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    :title="title"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <form class="task-form" novalidate @submit.prevent="submit">
      <div class="field">
        <label class="field-label" for="task-date">日期</label>
        <input
          id="task-date"
          :value="form.date ?? ''"
          class="input"
          type="date"
          :aria-invalid="errors.date !== ''"
          @input="form.date = ($event.target as HTMLInputElement).value || null"
        />
        <p v-if="selectedIsRest" class="field-hint field-hint-warn">
          所选日期是休息日，保存时会再次确认。
        </p>
        <p v-if="errors.date" class="field-error">{{ errors.date }}</p>
      </div>

      <!-- 表单不再提供「开始时间 / 结束时间」：任务只按日期安排；旧任务自带的时间原样保留 -->

      <div class="field">
        <label class="field-label" for="task-subject">科目</label>
        <div class="subject-row">
          <span
            class="subject-swatch"
            :style="{ background: subjectOf(form.subjectId).color }"
            aria-hidden="true"
          />
          <select
            id="task-subject"
            v-model="form.subjectId"
            class="input"
            :aria-invalid="errors.subjectId !== ''"
          >
            <option v-for="subject in subjects" :key="subject.id" :value="subject.id">
              {{ subject.name }}
            </option>
          </select>
        </div>
        <p v-if="errors.subjectId" class="field-error">{{ errors.subjectId }}</p>
      </div>

      <div class="field">
        <label class="field-label" for="task-subtask">子任务标签</label>
        <select
          id="task-subtask"
          v-model="form.subtaskId"
          class="input"
          :aria-invalid="errors.subtaskId !== ''"
        >
          <option :value="null">不分类</option>
          <option v-for="subtask in subtaskOptions" :key="subtask.id" :value="subtask.id">
            {{ subtask.name }}
          </option>
        </select>
        <p v-if="errors.subtaskId" class="field-error">{{ errors.subtaskId }}</p>
      </div>

      <div class="field">
        <label class="field-label" for="task-content">任务内容</label>
        <textarea
          id="task-content"
          v-model="form.content"
          class="textarea"
          rows="3"
          placeholder="例如：完成课后习题 1–15"
          :aria-invalid="errors.content !== ''"
        />
        <p v-if="errors.content" class="field-error">{{ errors.content }}</p>
      </div>

      <div v-if="conflicts.length > 0" class="conflict-box" role="alert">
        <p class="conflict-title">该时间段与以下任务重叠：</p>
        <ul class="conflict-list">
          <li v-for="conflict in conflicts" :key="conflict.id">
            <span class="conflict-time tabular">
              {{ conflict.startTime }}–{{ conflict.endTime }}
            </span>
            <span class="conflict-subject">{{ subjectLabel(conflict.subjectId) }}</span>
            <span class="conflict-content">{{ conflict.content }}</span>
          </li>
        </ul>
        <p class="conflict-hint">
          已有任务不会被覆盖或删除。可取消后调整时间，或确认保留重叠（时间轴将以并排方式显示）。
        </p>
        <button type="button" class="btn btn-ghost" @click="save(true)">仍然保存（保留重叠）</button>
      </div>

      <div v-if="restDayPrompt" class="conflict-box rest-day-box" role="alert">
        <p class="conflict-title">该日期是休息日</p>
        <p class="conflict-hint">
          休息日用于标记休息，不会主动安排任务。确认后可把该任务安排到这一天（不会修改其它任务的日期），
          也可以取消后改选其它日期。
        </p>
        <button type="button" class="btn btn-ghost" @click="save(false, true)">仍然安排到休息日</button>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-ghost" @click="close">取消</button>
        <button type="submit" class="btn btn-primary" :disabled="submitting">{{ submitText }}</button>
      </div>
    </form>
  </Modal>
</template>

<style scoped>
.subject-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.subject-swatch {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.field-hint {
  margin-top: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  overflow-wrap: anywhere;
}

.field-hint-warn {
  color: var(--color-rest-badge-text);
}

.rest-day-box {
  border-color: var(--color-rest-badge-border);
  background: var(--color-rest-badge-bg);
}

.conflict-box {
  padding: var(--space-3);
  margin-bottom: var(--space-4);
  border: 1px solid #e2cfa8;
  border-radius: var(--radius-sm);
  background: #faf4e8;
}

.conflict-title {
  color: #8a6a2f;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.conflict-list {
  margin: var(--space-2) 0;
  padding-left: var(--space-4);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.conflict-list li {
  margin-bottom: 2px;
  overflow-wrap: anywhere;
}

.conflict-time {
  margin-right: var(--space-1);
  color: var(--color-text-muted);
}

.conflict-subject {
  margin-right: var(--space-1);
}

.conflict-hint {
  margin-bottom: var(--space-3);
  color: #8a6a2f;
  font-size: var(--font-size-xs);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-5);
}
</style>

