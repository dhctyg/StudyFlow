/**
 * 任务拖放的载荷约定（纯函数，可单测）。
 *
 * 拖放只传递任务 ID：落点写入的是**原任务的日期**，不复制任务、不影响其它任务。
 * MIME 自定义类型避免与外部拖入内容混淆，同时保留 text/plain 以兼容旧浏览器。
 */
export const TASK_DRAG_MIME = 'application/x-studyflow-task'

/** 拖放数据的最小结构（便于测试时用普通对象替代 DataTransfer） */
export interface DragDataLike {
  getData(format: string): string
  setData(format: string, value: string): void
  effectAllowed?: string
  dropEffect?: string
  /** 浏览器在 dragover 阶段只暴露类型，不暴露数据 */
  types?: readonly string[]
}

export interface DragEventLike {
  dataTransfer: DragDataLike | null
}

/** 开始拖动任务：写入任务 ID */
export function startTaskDrag(event: DragEventLike, taskId: string): void {
  const data = event.dataTransfer
  if (data === null) return
  data.setData(TASK_DRAG_MIME, taskId)
  data.setData('text/plain', taskId)
  data.effectAllowed = 'move'
}

/**
 * 是否为「任务拖动」。
 * 注意：dragover 阶段浏览器只允许读取 types（getData 返回空串），
 * 因此拖拽悬停判断必须走这里，不能依赖 readTaskDragId。
 */
export function hasTaskDrag(event: DragEventLike): boolean {
  const data = event.dataTransfer
  if (data === null) return false
  if (data.types !== undefined && Array.from(data.types).includes(TASK_DRAG_MIME)) return true
  return readTaskDragId(event) !== null
}

/** 读取被拖动的任务 ID；不是任务拖放时返回 null */
export function readTaskDragId(event: DragEventLike): string | null {
  const data = event.dataTransfer
  if (data === null) return null
  const value = data.getData(TASK_DRAG_MIME) || data.getData('text/plain')
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed === '' ? null : trimmed
}
