import { describe, expect, it } from 'vitest'
import {
  TASK_DRAG_MIME,
  hasTaskDrag,
  readTaskDragId,
  startTaskDrag,
  type DragDataLike,
} from './taskDrag'

function fakeDataTransfer(
  initial: Record<string, string> = {},
  types?: readonly string[],
): DragDataLike {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    getData: (format: string) => store.get(format) ?? '',
    setData: (format: string, value: string) => {
      store.set(format, value)
    },
    types: types ?? [...store.keys()],
  }
}

describe('任务拖放载荷（纯函数）', () => {
  it('拖起任务时写入自定义 MIME 与 text/plain', () => {
    const data = fakeDataTransfer()
    startTaskDrag({ dataTransfer: data }, 'task-9')
    expect(data.getData(TASK_DRAG_MIME)).toBe('task-9')
    expect(data.getData('text/plain')).toBe('task-9')
    expect(data.effectAllowed).toBe('move')
  })

  it('drop 阶段能读出任务 ID（缺少自定义 MIME 时退化用 text/plain）', () => {
    expect(
      readTaskDragId({ dataTransfer: fakeDataTransfer({ [TASK_DRAG_MIME]: 'task-9' }) }),
    ).toBe('task-9')
    expect(readTaskDragId({ dataTransfer: fakeDataTransfer({ 'text/plain': 'task-8' }) })).toBe(
      'task-8',
    )
  })

  it('非任务拖放返回 null', () => {
    expect(readTaskDragId({ dataTransfer: fakeDataTransfer() })).toBeNull()
    expect(readTaskDragId({ dataTransfer: null })).toBeNull()
  })

  it('dragover 阶段按 types 判断（此时 getData 读不到数据）', () => {
    expect(hasTaskDrag({ dataTransfer: fakeDataTransfer({}, [TASK_DRAG_MIME]) })).toBe(true)
    expect(hasTaskDrag({ dataTransfer: fakeDataTransfer({}, ['text/plain']) })).toBe(false)
    expect(hasTaskDrag({ dataTransfer: null })).toBe(false)
  })
})
