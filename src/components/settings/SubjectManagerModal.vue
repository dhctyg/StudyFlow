<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Modal from '../common/Modal.vue'
import ConfirmDialog from '../common/ConfirmDialog.vue'
import AppIcon from '../common/AppIcon.vue'
import type { Subject } from '../../models/types'
import {
  DEFAULT_SUBJECT_COLOR,
  SUBJECT_COLOR_PRESETS,
  isDarkSubjectColor,
  isPresetSubjectColor,
} from '../../models/subjects'
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
 *   每个科目是一张「小卡片」：第一行是名称与操作按钮，**颜色色板固定放在名称输入下方**。
 * - 标签：标签区自带科目选择器（与科目行的「标签」按钮等价），查看 / 新增 / 改名 / 删除都在这里完成；
 *   删除标签只清空任务的标签引用，任务保留。科目列表内部滚动，保证标签区始终可见。
 * - **颜色为固定色板**：只能从 models/subjects.ts 的预设主题色里选，不用系统调色盘，
 *   界面不显示 HEX / RGB 代码（颜色名只在 title / aria-label），选中色块用勾选标记 + 描边提示。
 * - 兼容旧数据：已有科目若使用自定义色，仍按原值读取与显示（色板末尾会多出一个虚线「当前颜色」色块），
 *   只有用户主动点选预设色并保存才会写入新颜色 —— 不静默改数据、不会报错或丢数据。
 */
const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

interface Draft {
  name: string
  color: string
}

const drafts = reactive<Record<string, Draft>>({})
const rowErrors = reactive<Record<string, string>>({})
const newSubject = reactive<Draft>({ name: '', color: DEFAULT_SUBJECT_COLOR })
const newSubjectError = ref('')

/** 该科目草稿的当前颜色（模板里统一取值，避免取到 undefined） */
function rowColor(id: string): string {
  return drafts[id]?.color ?? ''
}

/** 该颜色是否属于固定色板（false = 历史自定义色，需要单独显示当前色块） */
function isCustomColor(id: string): boolean {
  const color = rowColor(id)
  return color !== '' && !isPresetSubjectColor(color)
}

/** 草稿颜色是否等于某个预设色（大小写不敏感：旧数据可能存的是大写 HEX） */
function isRowColor(id: string, preset: string): boolean {
  return rowColor(id).toLowerCase() === preset
}

/** 选择预设色：只改草稿，仍由「保存」写入（与原有流程一致） */
function setRowColor(id: string, color: string): void {
  const draft = drafts[id]
  if (draft !== undefined) draft.color = color
}

/** 切换正在管理标签的科目（标签区自带的科目选择器 / 科目行的「标签」按钮共用） */
function onActiveSubject(id: string): void {
  activeSubjectId.value = id
}

/** 新科目默认色：优先选一个尚未被占用的预设色，避免与已有科目撞色 */
function nextUnusedColor(): string {
  const used = new Set(subjects.value.map((subject) => subject.color.toLowerCase()))
  const free = SUBJECT_COLOR_PRESETS.find((preset) => !used.has(preset.color))
  return free?.color ?? DEFAULT_SUBJECT_COLOR
}

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
  newSubject.color = nextUnusedColor()
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
    // 默认选中第一个科目：标签管理区随弹窗打开即可用（immediate 保证“挂载即打开”也初始化）
    activeSubjectId.value = subjects.value[0]?.id ?? null
    syncDrafts()
  },
  { immediate: true },
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
    newSubject.color = nextUnusedColor()
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
      <ul class="row-list subject-list">
        <li v-for="subject in subjects" :key="subject.id" class="subject-item">
          <div class="row">
            <input
              v-model="drafts[subject.id].name"
              class="input name-input"
              type="text"
              maxlength="20"
              :aria-label="`科目名称：${subject.name}`"
            />
            <button type="button" class="btn btn-ghost" @click="saveSubject(subject.id)">保存</button>
            <button
              type="button"
              class="btn btn-quiet"
              :aria-pressed="activeSubjectId === subject.id"
              @click="onActiveSubject(subject.id)"
            >
              标签
            </button>
            <button type="button" class="btn btn-quiet" @click="askDeleteSubject(subject)">删除</button>
          </div>

          <!-- 颜色选择器固定在名称输入下方：固定色板，圆角方形色块 + 选中勾选标记 -->
          <div class="swatches" role="radiogroup" :aria-label="`${drafts[subject.id]?.name ?? ''} 的主题色`">
            <button
              v-for="preset in SUBJECT_COLOR_PRESETS"
              :key="preset.color"
              type="button"
              role="radio"
              class="preset-swatch"
              :class="{
                'is-active': isRowColor(subject.id, preset.color),
                'is-dark': isDarkSubjectColor(preset.color),
              }"
              :style="{ '--swatch': preset.color }"
              :aria-label="preset.name"
              :aria-checked="isRowColor(subject.id, preset.color)"
              :title="preset.name"
              @click="setRowColor(subject.id, preset.color)"
            >
              <AppIcon v-if="isRowColor(subject.id, preset.color)" name="check" size="sm" />
            </button>
            <span
              v-if="isCustomColor(subject.id)"
              class="preset-swatch is-active is-custom is-dark"
              :style="{ '--swatch': rowColor(subject.id) }"
              title="当前颜色（历史自定义色，保持不变）"
              aria-hidden="true"
            >
              <AppIcon name="check" size="sm" />
            </span>
          </div>
          <p v-if="rowErrors[subject.id]" class="row-error">{{ rowErrors[subject.id] }}</p>
        </li>
      </ul>

      <div class="subject-item add-item">
        <div class="row">
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

        <!-- 新科目颜色：同样放在名称输入下方（固定色板） -->
        <div class="swatches" role="radiogroup" aria-label="新科目主题色">
          <button
            v-for="preset in SUBJECT_COLOR_PRESETS"
            :key="preset.color"
            type="button"
            role="radio"
            class="preset-swatch"
            :class="{
              'is-active': newSubject.color === preset.color,
              'is-dark': isDarkSubjectColor(preset.color),
            }"
            :style="{ '--swatch': preset.color }"
            :aria-label="preset.name"
            :aria-checked="newSubject.color === preset.color"
            :title="preset.name"
            @click="newSubject.color = preset.color"
          >
            <AppIcon v-if="newSubject.color === preset.color" name="check" size="sm" />
          </button>
        </div>
      </div>
      <p v-if="newSubjectError" class="row-error">{{ newSubjectError }}</p>
    </section>

    <!-- 子任务标签管理：自带科目选择器，始终位于科目列表下方且不会被挤出视口 -->
    <section v-if="activeSubject" class="block tags-block">
      <h3 class="block-title">
        子任务标签
        <span class="tags-count tabular">{{ activeTags.length }}</span>
      </h3>

      <div class="row tags-subject-row">
        <label class="row-label" for="tags-subject">科目</label>
        <select
          id="tags-subject"
          class="input tags-subject"
          :value="activeSubject.id"
          aria-label="选择要管理标签的科目"
          @change="onActiveSubject(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="subject in subjects" :key="subject.id" :value="subject.id">
            {{ subject.name }}
          </option>
        </select>
        <span class="tag-dot" :style="{ background: activeSubject.color }" aria-hidden="true" />
        <span class="tags-hint">标签颜色继承所属科目</span>
      </div>

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
      <p v-if="activeTags.length === 0" class="empty-note">「{{ activeSubject.name }}」暂无标签。</p>

      <div class="row add-row">
        <input
          v-model="newTagName"
          class="input name-input"
          type="text"
          maxlength="20"
          :placeholder="`为「${activeSubject.name}」新增标签，如 复盘`"
          aria-label="新标签名称"
        />
        <button type="button" class="btn btn-ghost" @click="addTag">新增标签</button>
      </div>
      <p v-if="tagError" class="row-error">{{ tagError }}</p>
      <p class="block-hint">删除标签不会删除任务：任务保留，仅清空标签引用。</p>
    </section>
    <p v-else class="empty-note">暂无科目，请先在上方新增科目后再管理子任务标签。</p>

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

/**
 * 科目列表：条目多时内部滚动，保证下方「子任务标签」区域始终在视口内可见
 * （此前颜色色板把每条撑高后，标签区被推到视口之外，看起来像「功能消失了」）。
 */
.subject-list {
  max-height: 32vh;
  overflow-y: auto;
  padding-right: 2px;
}

/* 每个科目 = 一张小卡片：第一行名称与操作，第二行颜色色板 */
.subject-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-subtle);
}

.add-item {
  margin-top: var(--space-3);
  background: transparent;
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

/* ---------- 固定色板：圆角方形色块 + 选中勾选标记（不用系统调色盘，也不显示 HEX / RGB 代码） ---------- */

.swatches {
  display: flex;
  align-items: center;
  /* 8px 间距：色块既不过于紧密，整行高度也保持紧凑 */
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.preset-swatch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid rgba(17, 20, 24, 0.14);
  /* 圆角方形（不是圆形），与项目控件的圆角语言一致 */
  border-radius: 6px;
  background: var(--swatch);
  /* 勾选标记默认白色：深色色块上用白勾对比度最好 */
  color: #ffffff;
  cursor: pointer;
  transition:
    transform var(--duration-fast) var(--ease-out),
    box-shadow var(--duration-fast) var(--ease-standard);
}

/* 亮色色块上的勾选标记改用深色，保证浅色选项也清晰可辨 */
.preset-swatch:not(.is-dark) {
  color: var(--color-accent);
}

.preset-swatch:hover {
  transform: scale(1.06);
}

/* 按下：轻微收缩，松开后平滑回到原大小（选中态的描边阴影也一并过渡） */
.preset-swatch:active:not(.is-custom) {
  transform: scale(0.98);
}

/* 选中态：外圈描边 + 勾选标记（浅色 / 深色色块都能一眼分辨） */
.preset-swatch.is-active {
  box-shadow:
    0 0 0 2px var(--card-bg),
    0 0 0 4px var(--color-accent);
}

/* 历史自定义色：虚线描边 + 不可点击（只有主动点选预设色并保存才会改颜色） */
.preset-swatch.is-custom {
  border-style: dashed;
  cursor: default;
}

.preset-swatch.is-custom:hover {
  transform: none;
}

.name-input {
  flex: 1;
  min-width: 96px;
  padding: 5px 8px;
}

/* ---------- 子任务标签管理区 ---------- */

/* 与科目区分开：上方一条分隔线，明确这是「标签」区域 */
.tags-block {
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.tags-count {
  margin-left: 6px;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-regular);
}

.tags-subject-row {
  margin-bottom: var(--space-2);
}

.row-label {
  flex: 0 0 auto;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.tags-subject {
  flex: 0 1 220px;
  width: auto;
  min-width: 120px;
  padding: 5px 8px;
}

.tags-hint {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
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

