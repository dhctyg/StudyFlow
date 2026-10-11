/**
 * 数据模型（阶段二）：
 * - 科目与子任务标签均可由用户自定义，ID 稳定、名称可改，引用一律用 ID。
 * - 任务新增 startTime / endTime（HH:mm）与 subtaskId（可空）。
 * - 休息日仍是独立的日期属性集合，不体现在 Task 上。
 */

/** 科目 ID：字符串（阶段一的 math/english/comm 仅作为默认值保留） */
export type SubjectId = string

export interface Subject {
  id: SubjectId
  name: string
  /** 主题色（不使用绿色，绿色专用于“全部完成”状态） */
  color: string
}

/** 子任务标签：属于某个科目，颜色继承科目 */
export interface Subtask {
  id: string
  subjectId: SubjectId
  name: string
}

export interface Task {
  /** 唯一 ID */
  id: string
  /**
   * 安排日期（本地 YYYY-MM-DD）。
   * - 字符串 = 已安排到具体日期；
   * - null = 未安排日期（进入「临时任务箱」）。
   * 兼容说明：阶段一 / 阶段二旧任务的 date 恒为合法日期串，读取时原样保留；
   * 只有用户在表单里主动选择「暂不安排日期」才会写入 null，绝不自动改动旧数据。
   */
  date: string | null
  subjectId: SubjectId
  /** 可选子任务标签 ID；null = 不分类。阶段一旧任务无此字段，读取时归一为 null */
  subtaskId: string | null
  /** 开始时间 HH:mm；null = 未安排时间（阶段一旧任务） */
  startTime: string | null
  /** 结束时间 HH:mm；不支持跨午夜，必须晚于 startTime */
  endTime: string | null
  /** 任务内容，非空 */
  content: string
  /** 是否完成 */
  done: boolean
}

export interface TaskInput {
  /** 安排日期；null = 暂不安排（临时任务箱） */
  date: string | null
  subjectId: SubjectId
  subtaskId: string | null
  startTime: string
  endTime: string
  content: string
}

export type ViewMode = 'week' | 'month'

/** 某天的任务状态：none=无任务；pending=存在未完成；completed=全部完成。与日期类型无关。 */
export type DayStatus = 'none' | 'pending' | 'completed'

/**
 * 日期类型（阶段一新增）：
 * - normal：普通日，正常安排任务（默认；不需要存储记录）；
 * - rest：休息日，标记休息，不主动安排任务；
 * - buffer：缓冲日，用于承接逾期任务或手动调整任务。
 * 仅存 rest / buffer 两种非默认类型，normal = 无记录。
 */
export type DateKind = 'rest' | 'buffer'

export type DayType = 'normal' | DateKind

/** 日期 → 日期类型（仅非普通日入表）：date（YYYY-MM-DD）→ kind */
export type DayTypeMap = Record<string, DateKind>

