// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import ConfirmDialog from '../common/ConfirmDialog.vue'
import SubjectManagerModal from './SubjectManagerModal.vue'
import { SUBJECT_COLOR_PRESETS } from '../../models/subjects'
import { STORAGE_KEYS, loadSubtasks } from '../../services/storage'
import { createTask, init, subjectOf, subtasksOfSubject, taskById } from '../../store/schedule'
import { todayKey } from '../../utils/date'

/**
 * 科目与子任务标签设置页测试（真实组件 + 真实 store + 真实 localStorage 读写）：
 * - 标签管理区随弹窗打开即可用，且能用内置科目选择器切换科目；
 * - 新增 / 改名 / 删除标签都会写入 store 与 localStorage，刷新（重新 init）后仍在；
 * - 颜色是固定色板（无系统调色盘、无 HEX 文本），选择器位于名称输入下方，保存后同步到 store。
 */

const SEED_SUBJECTS = [
  { id: 'math', name: '数学', color: '#c15f5c' },
  { id: 'english', name: '英语', color: '#4059a8' },
]
const SEED_SUBTASKS = [{ id: 'sub-math-1', subjectId: 'math', name: '复盘' }]

function fakeLocalStorage(initial: Record<string, string>): Storage {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    get length() {
      return store.size
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
  }
}

function useStorage(): void {
  const fake = fakeLocalStorage({
    [STORAGE_KEYS.subjects]: JSON.stringify(SEED_SUBJECTS),
    [STORAGE_KEYS.subtasks]: JSON.stringify(SEED_SUBTASKS),
    [STORAGE_KEYS.tasks]: '[]',
    [STORAGE_KEYS.restDays]: '[]',
    [STORAGE_KEYS.dayTypes]: '{}',
    [STORAGE_KEYS.seeded]: '1',
  })
  Object.defineProperty(window, 'localStorage', { configurable: true, value: fake })
  init()
}

/** 模拟真实使用：弹窗常驻挂载，再由 false → true 打开 */
async function openModal() {
  const wrapper = mount(SubjectManagerModal, {
    props: { modelValue: false },
    global: { stubs: { teleport: true } },
  })
  await wrapper.setProps({ modelValue: true })
  return wrapper
}

function storedSubtasks(): { id: string; subjectId: string; name: string }[] {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEYS.subtasks) ?? '[]')
}

describe('科目与子任务标签设置页', () => {
  beforeEach(() => {
    useStorage()
  })

  it('打开弹窗即可看到标签管理区（含科目选择器与已有标签）', async () => {
    const wrapper = await openModal()
    const tags = wrapper.find('.tags-block')

    expect(tags.exists()).toBe(true)
    // 默认管理第一个科目；已有标签可见、可编辑
    expect((wrapper.find('#tags-subject').element as HTMLSelectElement).value).toBe('math')
    expect(tags.findAll('.row-list .row')).toHaveLength(1)
    // 标签名在输入框里（不是静态文本）
    expect((tags.find('.row-list input').element as HTMLInputElement).value).toBe('复盘')
    expect(tags.find('input[type="text"]').exists()).toBe(true)
  })

  it('标签管理区与科目区是同级区块（不会被科目列表挤出视口）', async () => {
    const wrapper = await openModal()
    expect(wrapper.find('.subject-list').exists()).toBe(true)
    expect(wrapper.findAll('section.block')).toHaveLength(2)
  })
  it('新增标签：写入 store 与 localStorage，刷新后仍在', async () => {
    const wrapper = await openModal()
    const addRow = wrapper.find('.tags-block .add-row')

    await addRow.find('input').setValue('习题')
    await addRow.find('button').trigger('click')

    expect(subtasksOfSubject('math').map((tag) => tag.name)).toContain('习题')
    const tagInputs = wrapper.findAll('.tags-block .row-list input')
    expect((tagInputs[tagInputs.length - 1]!.element as HTMLInputElement).value).toBe('习题')
    expect(storedSubtasks().map((tag) => tag.name)).toContain('习题')

    init() // 模拟刷新
    expect(subtasksOfSubject('math').map((tag) => tag.name)).toContain('习题')
    expect(loadSubtasks().map((tag) => tag.name)).toContain('习题')
  })

  it('改名标签：只改名称，任务的标签引用保持不变', async () => {
    const task = createTask({
      date: todayKey(),
      subjectId: 'math',
      subtaskId: 'sub-math-1',
      startTime: '',
      endTime: '',
      content: '带标签的任务',
    })
    const wrapper = await openModal()
    const tagRow = wrapper.find('.tags-block .row-list .row')

    await tagRow.find('input[type="text"]').setValue('复盘（改）')
    await tagRow.find('.btn-ghost').trigger('click')

    expect(subtasksOfSubject('math')[0]?.name).toBe('复盘（改）')
    expect(taskById(task.id)?.subtaskId).toBe('sub-math-1')
    expect(storedSubtasks()[0]?.name).toBe('复盘（改）')
  })

  it('删除标签：确认后标签被删除，任务保留且引用被清空', async () => {
    const task = createTask({
      date: todayKey(),
      subjectId: 'math',
      subtaskId: 'sub-math-1',
      startTime: '',
      endTime: '',
      content: '带标签的任务',
    })
    const wrapper = await openModal()
    const tagRow = wrapper.find('.tags-block .row-list .row')

    // 点击「删除」→ 弹出确认框 → 确认
    await tagRow.findAll('button')[1]!.trigger('click')
    const dialog = wrapper.findComponent(ConfirmDialog)
    expect(dialog.props('modelValue')).toBe(true)
    dialog.vm.$emit('confirm')
    await wrapper.vm.$nextTick()

    expect(subtasksOfSubject('math')).toHaveLength(0)
    expect(wrapper.find('.tags-block').text()).toContain('暂无标签')
    // 任务本身保留，仅清空标签引用
    expect(taskById(task.id)?.subtaskId).toBeNull()
    expect(storedSubtasks()).toEqual([])
  })

  it('切换科目：各自管理自己的标签，不会串台', async () => {
    const wrapper = await openModal()

    await wrapper.find('#tags-subject').setValue('english')
    const tags = wrapper.find('.tags-block')
    expect(tags.text()).not.toContain('复盘')
    expect(tags.text()).toContain('暂无标签')

    await tags.find('.add-row input').setValue('单词')
    await tags.find('.add-row button').trigger('click')
    expect(subtasksOfSubject('english').map((tag) => tag.name)).toEqual(['单词'])

    await wrapper.find('#tags-subject').setValue('math')
    const mathTagInputs = wrapper.findAll('.tags-block .row-list input')
    expect(mathTagInputs.map((input) => (input.element as HTMLInputElement).value)).toEqual(['复盘'])
  })

  it('颜色：固定色板（无系统调色盘 / 无 HEX 文本），位于名称输入下方，保存后同步', async () => {
    const wrapper = await openModal()
    // Teleport 被 stub 后每次渲染会重建节点，因此断言前都重新查询
    const subjectItem = () => wrapper.findAll('.subject-item')[0]!
    const swatchAt = (index: number) => subjectItem().findAll('.preset-swatch')[index]!

    // 色板 = 全部预设色，且没有原生取色器
    expect(subjectItem().findAll('.preset-swatch')).toHaveLength(SUBJECT_COLOR_PRESETS.length)
    expect(subjectItem().find('input[type="color"]').exists()).toBe(false)
    expect(subjectItem().text()).not.toContain('#')

    // 颜色选择器在名称输入下方（DOM 顺序）
    const html = subjectItem().html()
    expect(html.indexOf('type="text"')).toBeLessThan(html.indexOf('swatches'))

    // 点选预设色 → 出现勾选标记 → 保存写入
    const target = SUBJECT_COLOR_PRESETS[2]!
    expect(swatchAt(2).find('.app-icon').exists()).toBe(false)
    await swatchAt(2).trigger('click')

    expect(swatchAt(2).classes()).toContain('is-active')
    expect(swatchAt(2).find('.app-icon').exists()).toBe(true)
    expect(subjectItem().findAll('.preset-swatch.is-active')).toHaveLength(1)

    await subjectItem().find('.btn-ghost').trigger('click') // 保存
    expect(subjectOf('math').color).toBe(target.color)
    const persisted = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.subjects) ?? '[]')
    expect(persisted[0].color).toBe(target.color)
  })
})

