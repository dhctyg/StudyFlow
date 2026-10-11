import { describe, expect, it } from 'vitest'
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  backupFileName,
  backupOverview,
  buildBackup,
  parseBackup,
  serializeBackup,
} from './backup'

function sampleData() {
  return {
    tasks: [
      {
        id: 't1',
        date: '2026-10-12',
        subjectId: 'math',
        subtaskId: null,
        startTime: '09:00',
        endTime: '10:00',
        content: 'A',
        done: false,
      },
      {
        id: 't2',
        date: null,
        subjectId: 'math',
        subtaskId: null,
        startTime: null,
        endTime: null,
        content: 'B',
        done: true,
      },
    ],
    subjects: [{ id: 'math', name: '数学', color: '#c15f5c' }],
    subtasks: [{ id: 'sub-1', subjectId: 'math', name: '复盘' }],
    dayTypes: { '2026-10-12': 'buffer' as const, '2026-10-13': 'rest' as const },
    config: {
      examName: '考研初试',
      examDate: '2026-12-19',
      rounds: [{ id: 'r1', subjectId: 'math', name: '第一轮', dueDate: '2026-11-01' }],
    },
  }
}

describe('JSON 备份（构建与概览）', () => {
  it('备份带格式标识与版本号，且只包含业务数据（无 UI 状态）', () => {
    const file = buildBackup(sampleData(), '2026-10-10T00:00:00.000Z')
    expect(file.format).toBe(BACKUP_FORMAT)
    expect(file.version).toBe(BACKUP_VERSION)
    expect(Object.keys(file)).toEqual(['format', 'version', 'exportedAt', 'data'])
    expect(Object.keys(file.data).sort()).toEqual([
      'config',
      'dayTypes',
      'subjects',
      'subtasks',
      'tasks',
    ])
  })

  it('概览统计正确（任务 / 完成 / 未安排日期 / 科目 / 标签 / 日期类型 / 轮次 / 考试日期）', () => {
    const overview = backupOverview(buildBackup(sampleData(), '2026-10-10T00:00:00.000Z'))
    expect(overview).toMatchObject({
      taskCount: 2,
      doneCount: 1,
      unscheduledCount: 1,
      subjectCount: 1,
      subtaskCount: 1,
      restDayCount: 1,
      bufferDayCount: 1,
      roundCount: 1,
      examDate: '2026-12-19',
    })
  })

  it('序列化 → 解析往返一致', () => {
    const file = buildBackup(sampleData(), '2026-10-10T00:00:00.000Z')
    const parsed = parseBackup(serializeBackup(file))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.file.data).toEqual(file.data)
    expect(parsed.overview.taskCount).toBe(2)
    expect(parsed.warnings).toEqual([])
    expect(parsed.migratedFrom).toBeNull()
  })

  it('备份文件名包含日期', () => {
    expect(backupFileName('2026-10-10')).toBe('studyflow-backup-2026-10-10.json')
  })
})

describe('JSON 恢复：格式与版本校验', () => {
  it('非 JSON / 非对象 / 非本应用格式 → 明确报错', () => {
    expect(parseBackup('not json')).toMatchObject({ ok: false })
    expect(parseBackup('[]')).toMatchObject({ ok: false })
    const wrong = parseBackup(JSON.stringify({ format: 'other-tool', version: 1, data: {} }))
    expect(wrong.ok).toBe(false)
    if (!wrong.ok) expect(wrong.error).toContain('不是 StudyFlow 备份文件')
  })

  it('版本缺失 / 类型错误 / 高于支持版本 → 明确报错', () => {
    const withVersion = (version: unknown) =>
      JSON.stringify({
        format: BACKUP_FORMAT,
        version,
        data: { tasks: [], subjects: [], subtasks: [] },
      })
    expect(parseBackup(withVersion(0))).toMatchObject({ ok: false })
    expect(parseBackup(withVersion('1'))).toMatchObject({ ok: false })
    const tooHigh = parseBackup(withVersion(BACKUP_VERSION + 1))
    expect(tooHigh.ok).toBe(false)
    if (!tooHigh.ok) expect(tooHigh.error).toContain('高于当前支持')
  })

  it('缺少 data 或必要字段 → 明确报错（不会写入任何数据）', () => {
    const noData = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1 }))
    expect(noData.ok).toBe(false)
    if (!noData.ok) expect(noData.error).toContain('data')

    const missingTasks = parseBackup(
      JSON.stringify({ format: BACKUP_FORMAT, version: 1, data: { subjects: [], subtasks: [] } }),
    )
    expect(missingTasks.ok).toBe(false)
    if (!missingTasks.ok) expect(missingTasks.error).toContain('tasks')
  })

  it('缺少可选字段（日期类型 / 配置）时按默认值处理并给出提示', () => {
    const minimal = JSON.stringify({
      format: BACKUP_FORMAT,
      version: 1,
      data: { tasks: [], subjects: [], subtasks: [] },
    })
    const parsed = parseBackup(minimal)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.warnings.length).toBeGreaterThan(0)
    expect(parsed.file.data.dayTypes).toEqual({})
    expect(parsed.file.data.config.rounds).toEqual([])
    expect(parsed.file.data.config.examDate).toBeNull()
  })

  it('备份中的脏数据在解析阶段被清理（不把非法配置写回）', () => {
    const dirty = JSON.stringify({
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: '2026-10-10T00:00:00.000Z',
      data: {
        tasks: [{ id: 'bad' }],
        subjects: [{ id: 'math', name: '数学', color: '#c15f5c' }],
        subtasks: [],
        dayTypes: { bad: 'rest', '2026-10-01': 'rest', '2026-10-02': 'x' },
        config: {
          examName: '',
          examDate: 'nope',
          rounds: [{ id: '', subjectId: 'math' }],
        },
      },
    })
    const parsed = parseBackup(dirty)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.file.data.dayTypes).toEqual({ '2026-10-01': 'rest' })
    expect(parsed.file.data.config.examName).toBe('考研初试')
    expect(parsed.file.data.config.examDate).toBeNull()
    expect(parsed.file.data.config.rounds).toEqual([])
    // 任务条目的深层净化在写入恢复时由 storage 完成（见 storage 测试）
    expect(parsed.overview.taskCount).toBe(1)
  })
})
