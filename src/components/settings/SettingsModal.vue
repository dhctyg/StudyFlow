<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import ConfirmDialog from '../common/ConfirmDialog.vue'
import Modal from '../common/Modal.vue'
import type { IconName } from '../common/icons'
import UiCustomizerPanel from './UiCustomizerPanel.vue'
import {
  buildBackup,
  backupFileName,
  parseBackup,
  serializeBackup,
  type BackupFile,
  type BackupOverview,
} from '../../services/backup'
import {
  CSV_MIME,
  JSON_MIME,
  downloadText,
  readFileAsText,
} from '../../utils/download'
import {
  parseTaskCsv,
  taskFingerprint,
  tasksToCsvRows,
  toCsv,
  type CsvImportResult,
} from '../../services/csv'
import { clearBusinessData, restoreAllData } from '../../services/storage'
import {
  createTask,
  dayTypes,
  init,
  isRestDay,
  setSubjectFilter,
  subjects,
  subtasks,
  subjectOf,
  subtaskById,
  tasks,
} from '../../store/schedule'
import { config, initSettings } from '../../store/settings'
import { todayKey } from '../../utils/date'

/**
 * 设置（阶段四重构）：左侧导航 + 右侧内容。
 *
 * - 界面：界面自定义面板（实时预览 → 保存 / 恢复默认）；
 * - 数据：CSV 导入导出、JSON 备份恢复、清空数据（危险操作，需二次确认）。
 *
 * 考试倒计时、科目轮次、科目管理已从设置页移出，改为标题栏上的独立入口。
 *
 * 数据安全约定：
 * - CSV 导入先解析预览，用户确认后才写入；重复任务默认跳过，不静默覆盖；
 * - JSON 恢复先校验格式 / 版本 / 必要字段，展示概览并二次确认，
 *   且**先自动导出一份当前数据备份**，写入失败整体回滚；
 * - 清空数据只写空集合（保留 UI 自定义与考试目标），失败整体回滚。
 */
defineProps<{ modelValue: boolean }>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  notice: [message: string]
  restored: []
}>()

// ---------- 设置导航 ----------

type SettingsSection = 'interface' | 'data'

const SECTIONS: { id: SettingsSection; label: string; icon: IconName }[] = [
  { id: 'interface', label: '界面', icon: 'edit' },
  { id: 'data', label: '数据', icon: 'restore' },
]

/** 当前设置项：切换只更新右侧内容，不重新加载页面 */
const activeSection = ref<SettingsSection>('interface')

// ---------- 清空数据 ----------

const clearConfirmOpen = ref(false)

function onClearDialogUpdate(value: boolean): void {
  if (!value) clearConfirmOpen.value = false
}

/**
 * 清空全部业务数据：科目 / 子任务标签 / 任务 / 日期类型 / 科目轮次。
 * 保留 UI 自定义、字体与其它界面偏好；失败会自动回滚（见 storage.clearBusinessData）。
 */
function confirmClear(): void {
  const result = clearBusinessData()
  clearConfirmOpen.value = false
  if (!result.ok) {
    emit('notice', `清空失败，已保留原有数据：${result.error}`)
    return
  }
  // 重新从存储加载两个 store；并清掉可能指向已删除科目的筛选项，避免失效引用
  init()
  initSettings()
  setSubjectFilter(null)
  emit('restored')
  emit('notice', '已清空全部科目与任务')
}

// ---------- CSV 导入 / 导出 ----------

const csvInput = ref<HTMLInputElement | null>(null)
const jsonInput = ref<HTMLInputElement | null>(null)
const csvResult = ref<CsvImportResult | null>(null)
const csvRestRows = ref(0)

/** 解析结果摘要 */
const csvSummary = computed(() => {
  const result = csvResult.value
  if (result === null) return null
  return {
    valid: result.valid.length,
    invalid: result.issues.length,
    duplicate: result.duplicateLines.length,
    blank: result.blankLines,
    total: result.total,
    missingHeaders: result.missingHeaders,
  }
})

function csvContext() {
  const subjectByName = new Map<string, string>()
  for (const subject of subjects.value) subjectByName.set(subject.name.trim().toLowerCase(), subject.id)
  const subtaskByKey = new Map<string, string>()
  for (const subtask of subtasks.value) {
    const owner = subjectOf(subtask.subjectId).name.trim().toLowerCase()
    subtaskByKey.set(`${owner}|${subtask.name.trim().toLowerCase()}`, subtask.id)
  }
  const existingFingerprints = new Set(
    tasks.value.map((task) =>
      taskFingerprint({
        subjectId: task.subjectId,
        date: task.date,
        startTime: task.startTime,
        endTime: task.endTime,
        content: task.content,
      }),
    ),
  )
  return { subjectByName, subtaskByKey, existingFingerprints }
}

/** 导出任务 CSV（UTF-8 + BOM，Excel 可直接打开中文） */
function exportCsv(): void {
  const rows = tasksToCsvRows(tasks.value, {
    subjectName: (subjectId) => subjectOf(subjectId).name,
    subtaskName: (subtaskId) => subtaskById(subtaskId)?.name ?? '',
  })
  downloadText(`studyflow-tasks-${todayKey()}.csv`, toCsv(rows), CSV_MIME)
  emit('notice', `已导出 ${tasks.value.length} 条任务到 CSV`)
}

/** 选择 CSV 文件 → 解析预览（不写入任何数据） */
async function onCsvFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file === undefined) return
  try {
    const text = await readFileAsText(file)
    const result = parseTaskCsv(text, csvContext())
    csvResult.value = result
    csvRestRows.value = result.valid.filter(
      (row) => row.input.date !== null && isRestDay(row.input.date),
    ).length
    if (result.missingHeaders.length > 0) {
      emit('notice', `CSV 缺少必要表头：${result.missingHeaders.join('、')}`)
    }
  } catch (error) {
    emit('notice', error instanceof Error ? error.message : 'CSV 读取失败')
  }
}

/** 用户确认后才写入；重复任务已在上一步被跳过 */
function confirmCsvImport(): void {
  const result = csvResult.value
  if (result === null) return
  let imported = 0
  let failed = 0
  for (const row of result.valid) {
    try {
      // 导入是用户的显式操作：允许重叠与休息日（预览中已明确提示）
      createTask(row.input, { allowConflict: true, allowRestDay: true })
      imported += 1
    } catch {
      failed += 1
    }
  }
  csvResult.value = null
  csvRestRows.value = 0
  emit('notice', `CSV 导入完成：新增 ${imported} 条，失败 ${failed} 条，跳过重复 ${result.duplicateLines.length} 条`)
}

function cancelCsvImport(): void {
  csvResult.value = null
  csvRestRows.value = 0
}

// ---------- JSON 备份 / 恢复 ----------

const backupFile = ref<BackupFile | null>(null)
const backupOverviewData = ref<BackupOverview | null>(null)
const backupWarnings = ref<string[]>([])
const restoreConfirmOpen = ref(false)

function currentData() {
  return {
    tasks: tasks.value,
    subjects: subjects.value,
    subtasks: subtasks.value,
    dayTypes: dayTypes.value,
    config: config.value,
  }
}

/** 导出完整 JSON 备份 */
function exportBackup(): void {
  const file = buildBackup(currentData())
  downloadText(backupFileName(todayKey()), serializeBackup(file), JSON_MIME)
  emit('notice', '已导出完整数据备份（JSON）')
}

/** 恢复前自动导出现有数据，确保失败时可回到当前状态 */
function autoBackupBeforeRestore(): void {
  const file = buildBackup(currentData())
  downloadText(`studyflow-before-restore-${todayKey()}.json`, serializeBackup(file), JSON_MIME)
}

async function onJsonFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file === undefined) return
  try {
    const text = await readFileAsText(file)
    const parsed = parseBackup(text)
    if (!parsed.ok) {
      backupFile.value = null
      backupOverviewData.value = null
      backupWarnings.value = []
      emit('notice', `恢复失败：${parsed.error}`)
      return
    }
    backupFile.value = parsed.file
    backupOverviewData.value = parsed.overview
    backupWarnings.value = parsed.warnings
    restoreConfirmOpen.value = true
  } catch (error) {
    emit('notice', error instanceof Error ? error.message : '备份文件读取失败')
  }
}

function confirmRestore(): void {
  const file = backupFile.value
  restoreConfirmOpen.value = false
  if (file === null) return
  autoBackupBeforeRestore()
  const result = restoreAllData(file.data)
  backupFile.value = null
  backupOverviewData.value = null
  backupWarnings.value = []
  if (!result.ok) {
    emit('notice', `恢复失败，已保留原有数据：${result.error}`)
    return
  }
  // 重新从存储加载，界面（日历 / 面板 / 倒计时）立即刷新
  init()
  initSettings()
  emit('restored')
  emit('notice', `恢复完成：任务 ${result.data?.tasks.length ?? 0} 条`)
}

function cancelRestore(): void {
  restoreConfirmOpen.value = false
  backupFile.value = null
  backupOverviewData.value = null
  backupWarnings.value = []
}

/** 恢复确认弹窗文案（数据概览 + 风险提示 + 兼容说明） */
const restoreMessage = computed(() => {
  const overview = backupOverviewData.value
  if (overview === null) return ''
  const parts = [
    `版本 v${overview.version}，导出时间 ${overview.exportedAt === '' ? '未知' : overview.exportedAt}`,
    `任务 ${overview.taskCount} 条（已完成 ${overview.doneCount}，未安排日期 ${overview.unscheduledCount}）`,
    `科目 ${overview.subjectCount} 个 / 子任务标签 ${overview.subtaskCount} 个`,
    `休息日 ${overview.restDayCount} 天 / 缓冲日 ${overview.bufferDayCount} 天`,
    `轮次计划 ${overview.roundCount} 个，考试日期 ${overview.examDate ?? '未设置'}`,
    '恢复会覆盖当前数据；已自动把当前数据导出为 JSON，可随时回退。',
  ]
  if (backupWarnings.value.length > 0) parts.push(backupWarnings.value.join(' '))
  return parts.join(' ｜ ')
})

/** 关闭确认弹窗（未确认）时清理待恢复数据 */
function onRestoreDialogUpdate(value: boolean): void {
  if (!value) cancelRestore()
}
</script>


<template>
  <Modal :model-value="modelValue" title="设置" @update:model-value="emit('update:modelValue', $event)">
    <div class="settings-layout">
      <!-- 左侧：设置项导航 -->
      <nav class="settings-nav" aria-label="设置分类">
        <button
          v-for="item in SECTIONS"
          :key="item.id"
          type="button"
          class="nav-item"
          :class="{ 'is-active': activeSection === item.id }"
          :aria-current="activeSection === item.id"
          @click="activeSection = item.id"
        >
          <AppIcon :name="item.icon" size="sm" />
          {{ item.label }}
        </button>
      </nav>

      <!-- 右侧：当前设置项内容（切换只替换这一块） -->
      <div class="settings-pane">
        <UiCustomizerPanel
          v-if="activeSection === 'interface'"
          @notice="emit('notice', $event)"
        />

        <template v-else>


          <div class="settings">
      <!-- 4. 任务 CSV 导入导出 -->
      <section class="settings-section">
        <h3 class="section-title">
          <AppIcon name="export" size="sm" />
          任务 CSV
        </h3>
        <div class="button-row">
          <button type="button" class="btn btn-ghost btn-with-icon" @click="exportCsv">
            <AppIcon name="export" size="sm" />
            导出任务 CSV
          </button>
          <button type="button" class="btn btn-ghost btn-with-icon" @click="csvInput?.click()">
            <AppIcon name="import" size="sm" />
            导入任务 CSV
          </button>
          <input
            ref="csvInput"
            class="file-input"
            type="file"
            accept=".csv,text/csv"
            @change="onCsvFile"
          />
        </div>

        <div v-if="csvSummary !== null" class="preview" role="status">
          <p class="preview-title">解析结果（确认后才会写入）</p>
          <p v-if="csvSummary.missingHeaders.length > 0" class="preview-error">
            缺少表头：{{ csvSummary.missingHeaders.join('、') }}，无法导入。
          </p>
          <p v-else class="preview-line tabular">
            有效 {{ csvSummary.valid }} 条 · 无效 {{ csvSummary.invalid }} 条 · 重复跳过
            {{ csvSummary.duplicate }} 条 · 空行 {{ csvSummary.blank }} 行（共
            {{ csvSummary.total }} 行）
          </p>
          <p v-if="csvRestRows > 0" class="preview-hint">
            其中 {{ csvRestRows }} 条落在休息日：导入后仍然保留，可稍后在日历中调整。
          </p>
          <ul v-if="csvResult !== null && csvResult.issues.length > 0" class="issue-list">
            <li v-for="issue in csvResult.issues.slice(0, 8)" :key="issue.line">
              第 {{ issue.line }} 行：{{ issue.reason }}
            </li>
          </ul>
          <p v-if="csvResult !== null && csvResult.issues.length > 8" class="preview-hint">
            另有 {{ csvResult.issues.length - 8 }} 条问题未列出。
          </p>
          <div class="button-row">
            <button
              type="button"
              class="btn btn-primary"
              :disabled="csvSummary.valid === 0"
              @click="confirmCsvImport"
            >
              确认导入 {{ csvSummary.valid }} 条
            </button>
            <button type="button" class="btn btn-ghost" @click="cancelCsvImport">取消</button>
          </div>
        </div>
      </section>

      <!-- 5. JSON 备份与恢复 -->
      <section class="settings-section">
        <h3 class="section-title">
          <AppIcon name="restore" size="sm" />
          完整备份（JSON）
        </h3>
        <p class="section-hint">含任务 / 科目 / 日期类型 / 配置；恢复前自动备份当前数据</p>
        <div class="button-row">
          <button type="button" class="btn btn-ghost btn-with-icon" @click="exportBackup">
            <AppIcon name="export" size="sm" />
            导出 JSON 备份
          </button>
          <button type="button" class="btn btn-ghost btn-with-icon" @click="jsonInput?.click()">
            <AppIcon name="restore" size="sm" />
            从 JSON 恢复
          </button>
          <input
            ref="jsonInput"
            class="file-input"
            type="file"
            accept=".json,application/json"
            @change="onJsonFile"
          />
        </div>
      </section>

            <!-- 6. 清空数据（危险操作，需二次确认） -->
            <section class="settings-section is-danger">
              <h3 class="section-title">清空数据</h3>
              <p class="section-hint">
                清空全部科目与任务（含子任务标签、日期类型、科目轮次）；UI 自定义与考试目标保留，操作不可撤销。
              </p>
              <button
                type="button"
                class="btn btn-danger btn-with-icon"
                @click="clearConfirmOpen = true"
              >
                <AppIcon name="trash" size="sm" />
                清空数据
              </button>
            </section>
          </div>
        </template>
      </div>
    </div>

    <ConfirmDialog
      v-model="restoreConfirmOpen"
      title="确认恢复备份"
      :message="restoreMessage"
      confirm-text="确认恢复"
      @confirm="confirmRestore"
      @update:model-value="onRestoreDialogUpdate"
    />

    <ConfirmDialog
      :model-value="clearConfirmOpen"
      title="清空数据"
      message="此操作将清空所有科目和任务（含子任务标签、日期类型、科目轮次），且不可撤销。建议先导出 JSON 备份；UI 自定义与考试目标不受影响。"
      confirm-text="确认清空"
      @confirm="confirmClear"
      @update:model-value="onClearDialogUpdate"
    />
  </Modal>
</template>


<style scoped>
.settings-layout {
  display: grid;
  grid-template-columns: 148px minmax(0, 1fr);
  gap: var(--block-gap);
  min-height: 0;
}

/* 左侧导航：现代桌面软件的设置项列表 */
.settings-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-self: start;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  height: var(--button-height);
  padding: 0 10px;
  border: none;
  border-radius: var(--button-radius);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--font-size-base);
  text-align: left;
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard);
}

.nav-item:hover {
  background: var(--color-bg);
  color: var(--text-primary);
}

.nav-item:active {
  background: var(--color-accent-soft);
}

/* 当前项：低调的浅底 + 加粗，不做高饱和色块 */
.nav-item.is-active {
  background: var(--color-accent-soft);
  color: var(--text-primary);
  font-weight: var(--font-weight-medium);
}

.settings-pane {
  min-width: 0;
  max-height: 62vh;
  overflow-y: auto;
  padding-right: 4px;
}

/**
 * 设置项切换：右侧内容轻微淡入（只做透明度，不改变面板高度）。
 * 元素由 v-if / v-else 重建，因此只在切换设置项时播放，不会因为实时预览重播。
 * 这里刻意不做位移：内容区自身可滚动，位移会让滚动高度短暂变化，可能引发滚动条闪现。
 */
.settings-pane > * {
  animation: pane-in var(--duration-base) var(--ease-out);
}

@keyframes pane-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* 窄屏：导航移到顶部横向排列，避免挤压内容 */
@media (max-width: 640px) {
  .settings-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .settings-nav {
    flex-direction: row;
    overflow-x: auto;
  }

  .nav-item {
    width: auto;
    white-space: nowrap;
  }
}

.settings {
  display: flex;
  flex-direction: column;
  gap: var(--block-gap);
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: var(--block-gap-sm);
  padding-bottom: var(--block-gap);
}

/* 危险区：用文字与间距区分，不加大红底，按钮本身已是警示色 */
.settings-section.is-danger {
  gap: var(--block-gap-sm);
}

.settings-section:last-child {
  padding-bottom: 0;
}

.section-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.section-hint {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  overflow-wrap: anywhere;
}

.field-row {
  display: flex;
  gap: var(--space-3);
}

.field {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.field-label {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

/* 隐藏的原生文件选择器（由按钮触发） */
.file-input {
  display: none;
}

.round-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: 0;
  margin: 0;
  list-style: none;
}

.round-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.round-subject {
  width: 110px;
}

.round-name {
  width: 96px;
}

.round-date {
  width: 140px;
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

.preview {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-subtle);
}

.preview-title {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.preview-line {
  color: var(--text-primary);
  font-size: var(--font-size-sm);
}

.preview-error {
  color: var(--color-danger);
  font-size: var(--font-size-sm);
}

.preview-hint {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}

.issue-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 120px;
  padding-left: 16px;
  margin: 0;
  overflow-y: auto;
  color: var(--color-danger);
  font-size: var(--font-size-xs);
}

@media (max-width: 640px) {
  .field-row {
    flex-direction: column;
  }

  .round-row {
    flex-wrap: wrap;
  }
}
</style>

