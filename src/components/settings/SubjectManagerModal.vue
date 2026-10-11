<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Modal from '../common/Modal.vue'
import ConfirmDialog from '../common/ConfirmDialog.vue'
import type { Subject } from '../../models/types'
import {
  createSubject,
  createSubtask,
  deleteSubject,
  deleteSubtask,
  subtaskCountOfSubject,
  subtasksOfSubject,
  subjects,
  taskCountUsingSubject,
  taskCountUsingSubtask,
  updateSubject,
  updateSubtask,
} from '../../store/schedule'

/**
 * 科目与子任务标签管理。
 * - 科目：新增 / 改名 / 改色 / 删除（删除前明确告知将级联清理的任务与标签数量）。
 * - 标签：选定科目后管理其标签（新增 / 改名 / 删除）；删除标签只清空任务的标签引用，任务保留。
 * - 颜色使用原生 color 选择器并给出色值预览；不使用绿色作为默认色。
 */
const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

interface Draft {
  name: string
  color: string
}

const drafts = reactive<Record<string, Draft>>({})
const rowErrors = reactive<Record<string, string>>({})
const newSubject = reactive<Draft>({ name: '', color: '#3e5c9a' })
const newSubjectError = ref('')

const activeSubjectId = ref<string | null>(null)
const newTagName = ref('')
const tagError = ref('')
const tagDrafts = reactive<Record<string, string>>({})
const tagRowErrors = reactive<Record<string, string>>({})

const pending = ref<{ kind: 'subject' | 'subtask'; id: string; name: string } | null>(null)
const confirmOpen = ref(false)

const activeSubject = computed<Subject | undefined>(() =>
  subjects.value.find((subject) => subject.id === activeSubjectId.value),
)
const activeTags = computed(() =>
  activeSubjectId.value === null ? [] : subtasksOfSubject(activeSubjectId.value),
)

const confirmMessage = computed(() => {
  if (pending.value === null) return ''
  if (pending.value.kind === 'subject') {
    const tasks = taskCountUsingSubject(pending.value.id)
    const tags = subtaskCountOfSubject(pending.value.id)
    return `删除科目「${pending.value.name}」将同时删除其 ${tasks} 个任务与 ${tags} 个子任务标签，且不可恢复。确认删除？`
  }
  const used = taskCountUsingSubtask(pending.value.id)
  return used > 0
    ? `标签「${pending.value.name}」正被 ${used} 个任务使用。删除后这些任务会保留，标签会被清空。确认删除？`
    : `确认删除标签「${pending.value.name}」？`
})

function syncDrafts(): void {
  for (const key of Object.keys(drafts)) delete drafts[key]
  for (const key of Object.keys(rowErrors)) delete rowErrors[key]
  for (const key of Object.keys(tagDrafts)) delete tagDrafts[key]
  for (const key of Object.keys(tagRowErrors)) delete tagRowErrors[key]
  for (const subject of subjects.value) {
    drafts[subject.id] = { name: subject.name, color: subject.color }
  }
  for (const tag of activeTags.value) tagDrafts[tag.id] = tag.name
  newSubject.name = ''
  newSubject.color = '#3e5c9a'
  newSubjectError.value = ''
  newTagName.value = ''
  tagError.value = ''
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    pending.value = null
    confirmOpen.value = false
    activeSubjectId.value = subjects.value[0]?.id ?? null
    syncDrafts()
  },
)

watch(activeSubjectId, () => {
  newTagName.value = ''
  tagError.value = ''
  for (const key of Object.keys(tagDrafts)) delete tagDrafts[key]
  for (const key of Object.keys(tagRowErrors)) delete tagRowErrors[key]
  for (const tag of activeTags.value) tagDrafts[tag.id] = tag.name
})

// 保证草稿与真实数据同步：科目增删后立即补齐 / 清理对应草稿，避免模板取到空值。
watch(
  subjects,
  () => {
    for (const subject of subjects.value) {
      if (drafts[subject.id] === undefined) {
        drafts[subject.id] = { name: subject.name, color: subject.color }
      }
    }
    for (const id of Object.keys(drafts)) {
      if (!subjects.value.some((subject) => subject.id === id)) delete drafts[id]
    }
  },
  { deep: true },
)

watch(
  activeTags,
  () => {
    for (const tag of activeTags.value) {
      if (tagDrafts[tag.id] === undefined) tagDrafts[tag.id] = tag.name
    }
    for (const id of Object.keys(tagDrafts)) {
      if (!activeTags.value.some((tag) => tag.id === id)) delete tagDrafts[id]
    }
  },
  { deep: true },
)

function addSubject(): void {
  newSubjectError.value = ''
  try {
    const created = createSubject({ name: newSubject.name, color: newSubject.color })
    drafts[created.id] = { name: created.name, color: created.color }
    activeSubjectId.value = created.id
    newSubject.name = ''
    newSubject.color = '#3e5c9a'
  } catch (error) {
    newSubjectError.value = error instanceof Error ? error.message : '新增科目失败'
  }
}

function saveSubject(id: string): void {
  rowErrors[id] = ''
  const draft = drafts[id]
  if (draft === undefined) return
  try {
    updateSubject(id, { name: draft.name, color: draft.color })
  } catch (error) {
    rowErrors[id] = error instanceof Error ? error.message : '保存科目失败'
  }
}

function askDeleteSubject(subject: Subject): void {
  pending.value = { kind: 'subject', id: subject.id, name: subject.name }
  confirmOpen.value = true
}

function addTag(): void {
  tagError.value = ''
  if (activeSubjectId.value === null) return
  try {
    const created = createSubtask({ subjectId: activeSubjectId.value, name: newTagName.value })
    tagDrafts[created.id] = created.name
    newTagName.value = ''
  } catch (error) {
    tagError.value = error instanceof Error ? error.message : '新增标签失败'
  }
}

function saveTag(id: string): void {
  tagRowErrors[id] = ''
  const name = tagDrafts[id]
  if (name === undefined) return
  try {
    updateSubtask(id, { name })
  } catch (error) {
    tagRowErrors[id] = error instanceof Error ? error.message : '保存标签失败'
  }
}

function askDeleteTag(id: string, name: string): void {
  pending.value = { kind: 'subtask', id, name }
  confirmOpen.value = true
}

function onConfirmDelete(): void {
  if (pending.value === null) return
  if (pending.value.kind === 'subject') {
    deleteSubject(pending.value.id)
    if (activeSubjectId.value === pending.value.id) {
      activeSubjectId.value = subjects.value[0]?.id ?? null
    }
    syncDrafts()
  } else {
    deleteSubtask(pending.value.id)
  }
  pending.value = null
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    title="科目与子任务标签"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <section class="block">
      <h3 class="block-title">科目</h3>
      <ul class="row-list">
        <li v-for="subject in subjects" :key="subject.id" class="row">
          <input
            v-model="drafts[subject.id].color"
            class="color-input"
            type="color"
            :aria-label="`${drafts[subject.id]?.name} 的颜色`"
          />
          <input
            v-model="drafts[subject.id].name"
            class="input name-input"
            type="text"
            maxlength="20"
            :aria-label="'科目名称'"
          />
          <button type="button" class="btn btn-ghost" @click="saveSubject(subject.id)">保存</button>
          <button
            type="button"
            class="btn btn-quiet"
            :aria-pressed="activeSubjectId === subject.id"
            @click="activeSubjectId = subject.id"
          >
            标签
          </button>
          <button type="button" class="btn btn-quiet" @click="askDeleteSubject(subject)">删除</button>
          <p v-if="rowErrors[subject.id]" class="row-error">{{ rowErrors[subject.id] }}</p>
        </li>
      </ul>

      <div class="row add-row">
        <input v-model="newSubject.color" class="color-input" type="color" aria-label="新科目颜色" />
        <input
          v-model="newSubject.name"
          class="input name-input"
          type="text"
          maxlength="20"
          placeholder="新科目名称"
          aria-label="新科目名称"
        />
        <button type="button" class="btn btn-primary" @click="addSubject">新增科目</button>
      </div>
      <p v-if="newSubjectError" class="row-error">{{ newSubjectError }}</p>
    </section>

    <section v-if="activeSubject" class="block">
      <h3 class="block-title">「{{ activeSubject.name }}」的子任务标签</h3>
      <ul class="row-list">
        <li v-for="tag in activeTags" :key="tag.id" class="row">
          <span class="tag-dot" :style="{ background: activeSubject.color }" aria-hidden="true" />
          <input
            v-model="tagDrafts[tag.id]"
            class="input name-input"
            type="text"
            maxlength="20"
            :aria-label="`标签名称：${tag.name}`"
          />
          <button type="button" class="btn btn-ghost" @click="saveTag(tag.id)">保存</button>
          <button type="button" class="btn btn-quiet" @click="askDeleteTag(tag.id, tag.name)">
            删除
          </button>
          <p v-if="tagRowErrors[tag.id]" class="row-error">{{ tagRowErrors[tag.id] }}</p>
        </li>
      </ul>
      <p v-if="activeTags.length === 0" class="empty-note">该科目暂无标签。</p>

      <div class="row add-row">
        <input
          v-model="newTagName"
          class="input name-input"
          type="text"
          maxlength="20"
          placeholder="新标签名称，如 复盘"
          aria-label="新标签名称"
        />
        <button type="button" class="btn btn-ghost" @click="addTag">新增标签</button>
      </div>
      <p v-if="tagError" class="row-error">{{ tagError }}</p>
      <p class="block-hint">标签颜色自动继承所属科目，删除标签不会删除任务。</p>
    </section>

    <ConfirmDialog
      v-model="confirmOpen"
      title="确认删除"
      :message="confirmMessage"
      confirm-text="删除"
      @confirm="onConfirmDelete"
    />
  </Modal>
</template>

<style scoped>
.block {
  margin-bottom: var(--space-5);
}

.block-title {
  margin-bottom: var(--space-2);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.row-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.color-input {
  width: 30px;
  height: 26px;
  flex-shrink: 0;
  padding: 0;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: none;
  cursor: pointer;
}

.name-input {
  flex: 1;
  min-width: 96px;
  padding: 5px 8px;
}

.tag-dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
}

.row-error {
  flex-basis: 100%;
  color: var(--color-danger);
  font-size: var(--font-size-xs);
}

.add-row {
  margin-top: var(--space-3);
}

.empty-note,
.block-hint {
  margin-top: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}
</style>

