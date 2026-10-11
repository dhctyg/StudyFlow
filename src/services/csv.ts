/**
 * 任务 CSV 导入 / 导出（纯函数，可单测）。
 *
 * 导出：UTF-8 + BOM（Excel 打开中文不乱码）+ CRLF 换行；
 *      字段固定为 科目 / 子任务标签 / 任务内容 / 计划日期 / 开始时间 / 结束时间 / 完成状态，
 *      不含内部 ID 等与用户无关的状态。
 * 导入：严格校验表头；逐行处理空行 / 非法日期 / 非法时间 / 未知科目 / 重复任务；
 *      默认**跳过**重复任务（绝不静默覆盖已有数据），并把每一处问题回报给界面预览。
 *
 * 与业务规则保持一致：**时间可以留空**（任务表单已不再填写开始 / 结束时间）；
 * 一旦填写，必须成对合法且结束晚于开始；未安排日期（date 为空）的行依旧兼容读取。
 */
import type { Task, TaskInput } from '../models/types'
import { isDateKey } from '../utils/date'
import { isEndTimeAfterStart, isValidTime } from '../utils/time'

export const CSV_BOM = '\ufeff'

/** 导出表头（顺序即列顺序） */
export const TASK_CSV_HEADERS = [
  '科目',
  '子任务标签',
  '任务内容',
  '计划日期',
  '开始时间',
  '结束时间',
  '完成状态',
] as const

export type TaskCsvHeader = (typeof TASK_CSV_HEADERS)[number]

/** 单元格转义：含逗号 / 引号 / 换行时用双引号包裹，内部引号翻倍 */
export function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** 二维数组 → CSV 文本 */
export function toCsv(rows: readonly (readonly string[])[], options: { bom?: boolean } = {}): string {
  const body = rows.map((row) => row.map((cell) => escapeCsvField(cell ?? '')).join(',')).join('\r\n')
  const text = `${body}\r\n`
  return options.bom === false ? text : CSV_BOM + text
}

/** RFC4180 风格解析：支持引号包裹、字段内逗号 / 引号 / 换行，兼容 CRLF 与 LF */
export function parseCsv(text: string): string[][] {
  const content = text.startsWith(CSV_BOM) ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]
    if (inQuotes) {
      if (char === '"') {
        if (content[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && content[index + 1] === '\n') index += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  row.push(field)
  rows.push(row)

  // 丢弃尾部空行（Excel 常在末尾多出一个空行）
  while (rows.length > 0) {
    const last = rows[rows.length - 1]
    if (last.length === 1 && last[0].trim() === '') rows.pop()
    else break
  }
  return rows
}

// ---------- 导入映射 ----------

export interface TaskCsvContext {
  /** 科目名（小写）→ 科目 ID */
  subjectByName: ReadonlyMap<string, string>
  /** 「科目名|标签名」（小写）→ 标签 ID */
  subtaskByKey: ReadonlyMap<string, string>
  /** 已存在任务的指纹集合，用于识别重复任务 */
  existingFingerprints?: ReadonlySet<string>
}

export interface CsvIssue {
  /** CSV 中的行号（含表头，从 1 开始） */
  line: number
  reason: string
}

export interface CsvImportResult {
  /** 校验通过、可写入的任务 */
  valid: { line: number; input: TaskInput; done: boolean }[]
  /** 无法导入的行及原因 */
  issues: CsvIssue[]
  /** 空行数（静默跳过，仅用于预览提示） */
  blankLines: number
  /** 重复任务所在行（默认跳过，不覆盖已有数据） */
  duplicateLines: number[]
  /** 缺失的表头 */
  missingHeaders: string[]
  /** 数据行总数（不含表头） */
  total: number
}

/** 任务指纹：科目 + 日期 + 时间 + 内容（不依赖内部 ID，便于跨设备去重） */
export function taskFingerprint(input: {
  subjectId: string
  date: string | null
  startTime: string | null
  endTime: string | null
  content: string
}): string {
  return [
    input.subjectId,
    input.date ?? '',
    input.startTime ?? '',
    input.endTime ?? '',
    input.content.trim().toLowerCase(),
  ].join('|')
}

/** 日期：'' → null（未安排）；YYYY-MM-DD / YYYY/M/D → 归一化；非法 → undefined */
function normalizeDate(raw: string): string | null | undefined {
  if (raw === '') return null
  const match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(raw)
  if (match === null) return undefined
  const key = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
  return isDateKey(key) ? key : undefined
}

/** 时间：'' → null；H:mm → HH:mm；非法 → undefined */
function normalizeTime(raw: string): string | null | undefined {
  if (raw === '') return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw)
  if (match === null) return undefined
  const key = `${match[1].padStart(2, '0')}:${match[2]}`
  return isValidTime(key) ? key : undefined
}

const DONE_TRUE = new Set(['是', '已完成', '完成', 'true', '1', 'yes', 'done'])
const DONE_FALSE = new Set(['否', '未完成', '', 'false', '0', 'no'])

/**
 * 解析任务 CSV 文本。
 * 表头缺失 → missingHeaders 非空且 valid 为空（调用方应直接拒绝导入）。
 */
export function parseTaskCsv(text: string, context: TaskCsvContext): CsvImportResult {
  const rows = parseCsv(text)
  const result: CsvImportResult = {
    valid: [],
    issues: [],
    blankLines: 0,
    duplicateLines: [],
    missingHeaders: [],
    total: 0,
  }
  if (rows.length === 0) {
    result.missingHeaders = [...TASK_CSV_HEADERS]
    return result
  }

  const header = rows[0].map((value) => value.trim())
  const headerIndex = new Map<string, number>()
  header.forEach((name, index) => {
    if (!headerIndex.has(name)) headerIndex.set(name, index)
  })
  result.missingHeaders = TASK_CSV_HEADERS.filter((name) => !headerIndex.has(name))
  if (result.missingHeaders.length > 0) return result

  const column = (row: readonly string[], name: TaskCsvHeader): string => {
    const index = headerIndex.get(name)
    return index === undefined ? '' : (row[index] ?? '').trim()
  }

  const seen = new Set<string>(context.existingFingerprints ?? [])

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index]
    const line = index + 1
    if (row.every((value) => value.trim() === '')) {
      result.blankLines += 1
      continue
    }
    result.total += 1

    const subjectName = column(row, '科目')
    const content = column(row, '任务内容')
    const rawDate = column(row, '计划日期')
    const rawStart = column(row, '开始时间')
    const rawEnd = column(row, '结束时间')
    const rawDone = column(row, '完成状态').toLowerCase()
    const subtaskName = column(row, '子任务标签')

    if (content === '') {
      result.issues.push({ line, reason: '任务内容为空' })
      continue
    }
    if (subjectName === '') {
      result.issues.push({ line, reason: '缺少科目' })
      continue
    }
    const subjectId = context.subjectByName.get(subjectName.toLowerCase())
    if (subjectId === undefined) {
      result.issues.push({ line, reason: `未知科目「${subjectName}」` })
      continue
    }

    const date = normalizeDate(rawDate)
    if (date === undefined) {
      result.issues.push({ line, reason: `日期格式不正确：「${rawDate}」（应为 YYYY-MM-DD）` })
      continue
    }
    const startTime = normalizeTime(rawStart)
    if (startTime === undefined) {
      result.issues.push({ line, reason: `开始时间格式不正确：「${rawStart}」（应为 HH:mm）` })
      continue
    }
    const endTime = normalizeTime(rawEnd)
    if (endTime === undefined) {
      result.issues.push({ line, reason: `结束时间格式不正确：「${rawEnd}」（应为 HH:mm）` })
      continue
    }

    // 时间可选（表单已不再填写时间）：留空即无时间；一旦填写必须成对，且结束晚于开始
    if ((startTime === null) !== (endTime === null)) {
      result.issues.push({ line, reason: '开始与结束时间需要同时填写' })
      continue
    }
    if (startTime !== null && endTime !== null && !isEndTimeAfterStart(startTime, endTime)) {
      result.issues.push({ line, reason: '结束时间必须晚于开始时间' })
      continue
    }

    if (!DONE_TRUE.has(rawDone) && !DONE_FALSE.has(rawDone)) {
      result.issues.push({
        line,
        reason: `完成状态无法识别：「${rawDone}」（可填 是/否 或 已完成/未完成）`,
      })
      continue
    }

    let subtaskId: string | null = null
    if (subtaskName !== '') {
      const key = `${subjectName.toLowerCase()}|${subtaskName.toLowerCase()}`
      const found = context.subtaskByKey.get(key)
      if (found === undefined) {
        result.issues.push({
          line,
          reason: `未知子任务标签「${subtaskName}」（科目：${subjectName}）`,
        })
        continue
      }
      subtaskId = found
    }

    const input: TaskInput = {
      date,
      subjectId,
      subtaskId,
      startTime: startTime ?? '',
      endTime: endTime ?? '',
      content,
    }
    const fingerprint = taskFingerprint({ subjectId, date, startTime, endTime, content })
    if (seen.has(fingerprint)) {
      result.duplicateLines.push(line)
      continue
    }
    seen.add(fingerprint)
    result.valid.push({ line, input, done: DONE_TRUE.has(rawDone) })
  }

  return result
}

export interface CsvExportContext {
  subjectName: (subjectId: string) => string
  subtaskName: (subtaskId: string | null) => string
}

/** 任务 → CSV 二维数组（第一行为表头） */
export function tasksToCsvRows(tasks: readonly Task[], context: CsvExportContext): string[][] {
  const rows: string[][] = [[...TASK_CSV_HEADERS]]
  for (const task of tasks) {
    rows.push([
      context.subjectName(task.subjectId),
      context.subtaskName(task.subtaskId),
      task.content,
      task.date ?? '',
      task.startTime ?? '',
      task.endTime ?? '',
      task.done ? '已完成' : '未完成',
    ])
  }
  return rows
}

