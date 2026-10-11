import { describe, expect, it } from 'vitest'
import type { Task } from '../models/types'
import {
  CSV_BOM,
  escapeCsvField,
  parseCsv,
  parseTaskCsv,
  taskFingerprint,
  tasksToCsvRows,
  toCsv,
} from './csv'

const HEADER = '科目,子任务标签,任务内容,计划日期,开始时间,结束时间,完成状态'

function context(existing: string[] = []) {
  return {
    subjectByName: new Map([
      ['数学', 'math'],
      ['英语', 'english'],
    ]),
    subtaskByKey: new Map([['数学|复盘', 'sub-math-1']]),
    existingFingerprints: new Set(existing),
  }
}

describe('CSV 转义与解析（纯函数）', () => {
  it('中文、逗号、双引号、换行都能正确往返', () => {
    const rows = [
      ['科目', '任务内容'],
      ['数学', '复习高数，含逗号'],
      ['英语', '引号 "重点" 与\n换行'],
      ['通信', ' 前后空格 '],
    ]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })

  it('导出带 UTF-8 BOM 与 CRLF（Excel 友好）', () => {
    const text = toCsv([
      ['a', 'b'],
      ['1', '2'],
    ])
    expect(text.startsWith(CSV_BOM)).toBe(true)
    expect(text).toBe(`${CSV_BOM}a,b\r\n1,2\r\n`)
    expect(toCsv([['a']], { bom: false })).toBe('a\r\n')
  })

  it('escapeCsvField：仅在必要时加引号', () => {
    expect(escapeCsvField('普通文本')).toBe('普通文本')
    expect(escapeCsvField('带,逗号')).toBe('"带,逗号"')
    expect(escapeCsvField('带"引号')).toBe('"带""引号"')
    expect(escapeCsvField('带\n换行')).toBe('"带\n换行"')
  })

  it('parseCsv 兼容 LF、忽略尾部空行', () => {
    expect(parseCsv('a,b\n1,2\n\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('任务 CSV 导入', () => {
  it('表头缺失时拒绝导入并列出缺失项', () => {
    const result = parseTaskCsv('科目,任务内容\n数学,做题', context())
    expect(result.valid).toHaveLength(0)
    expect(result.missingHeaders).toContain('计划日期')
    expect(result.missingHeaders.length).toBeGreaterThan(0)
  })

  it('正常行：科目 / 标签 / 日期 / 时间 / 完成状态', () => {
    const csv = `${HEADER}\n数学,复盘,复习卷积码,2026-10-12,9:30,10:30,已完成`
    const result = parseTaskCsv(csv, context())
    expect(result.issues).toEqual([])
    expect(result.valid).toHaveLength(1)
    expect(result.valid[0].done).toBe(true)
    expect(result.valid[0].input).toEqual({
      date: '2026-10-12',
      subjectId: 'math',
      subtaskId: 'sub-math-1',
      startTime: '09:30',
      endTime: '10:30',
      content: '复习卷积码',
    })
  })

  it('日期支持 YYYY/M/D 归一化；空日期行按未排期兼容读取', () => {
    const csv = `${HEADER}\n数学,,A,2026/10/5,09:00,10:00,否\n数学,,B,,,,否`
    const result = parseTaskCsv(csv, context())
    expect(result.valid.map((row) => row.input.date)).toEqual(['2026-10-05', null])
    expect(result.valid[1].input.startTime).toBe('')
    expect(result.valid[1].input.endTime).toBe('')
  })

  it('逐行报错：非法日期 / 时间 / 未知科目 / 未知标签 / 空内容 / 完成状态无法识别 / 时间倒序', () => {
    const csv = [
      HEADER,
      '数学,,日期错,2026-99-99,09:00,10:00,否',
      '数学,,时间错,2026-10-12,25:00,10:00,否',
      '未知科目,,科目错,2026-10-12,09:00,10:00,否',
      '数学,不存在的标签,标签错,2026-10-12,09:00,10:00,否',
      '数学,,,2026-10-12,09:00,10:00,否',
      '数学,,状态错,2026-10-12,09:00,10:00,也许',
      '数学,,时间倒序,2026-10-12,11:00,10:00,否',
      '数学,,只有一个时间,2026-10-12,09:00,,否',
    ].join('\n')
    const result = parseTaskCsv(csv, context())
    expect(result.valid).toHaveLength(0)
    expect(result.issues.map((issue) => issue.line)).toEqual([2, 3, 4, 5, 6, 7, 8, 9])
    expect(result.issues[0].reason).toContain('日期格式不正确')
    expect(result.issues[1].reason).toContain('开始时间格式不正确')
    expect(result.issues[2].reason).toContain('未知科目')
    expect(result.issues[3].reason).toContain('未知子任务标签')
    expect(result.issues[4].reason).toContain('任务内容为空')
    expect(result.issues[5].reason).toContain('完成状态无法识别')
    expect(result.issues[6].reason).toContain('结束时间必须晚于开始时间')
    expect(result.issues[7].reason).toContain('开始与结束时间需要同时填写')
  })

  it('时间可以留空：已安排日期但未填时间的行可以导入（与表单移除时间项保持一致）', () => {
    const csv = `${HEADER}\n数学,,没有时间的任务,2026-10-12,,,否`
    const result = parseTaskCsv(csv, context())
    expect(result.issues).toEqual([])
    expect(result.valid).toHaveLength(1)
    expect(result.valid[0].input.startTime).toBe('')
    expect(result.valid[0].input.endTime).toBe('')
    expect(result.valid[0].input.date).toBe('2026-10-12')
  })

  it('空行跳过并计数（尾部换行不会产生多余空行）', () => {
    const csv = `${HEADER}\n\n数学,,A,2026-10-12,09:00,10:00,否\n,,,\n`
    const result = parseTaskCsv(csv, context())
    expect(result.blankLines).toBe(2) // 表头后的空行 + 全空行
    expect(result.total).toBe(1)
    expect(result.valid).toHaveLength(1)
    expect(result.issues).toEqual([])
  })

  it('重复任务默认跳过（文件内重复 + 与已有任务重复），不覆盖已有数据', () => {
    const existing = [
      taskFingerprint({
        subjectId: 'math',
        date: '2026-10-12',
        startTime: '09:00',
        endTime: '10:00',
        content: 'A',
      }),
    ]
    const csv = `${HEADER}\n数学,,A,2026-10-12,09:00,10:00,否\n数学,,A,2026-10-12,09:00,10:00,否\n数学,,B,2026-10-12,10:00,11:00,否`
    const result = parseTaskCsv(csv, context(existing))
    expect(result.valid).toHaveLength(1)
    expect(result.valid[0].input.content).toBe('B')
    expect(result.duplicateLines).toEqual([2, 3])
  })
})

describe('任务 CSV 导出', () => {
  it('只导出必要字段，且导出 → 解析可往返', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        date: '2026-10-12',
        subjectId: 'math',
        subtaskId: null,
        startTime: '09:00',
        endTime: '10:00',
        content: '复习，含逗号',
        done: false,
      },
      {
        id: 't2',
        date: null,
        subjectId: 'english',
        subtaskId: null,
        startTime: null,
        endTime: null,
        content: '未安排的任务',
        done: true,
      },
    ]
    const rows = tasksToCsvRows(tasks, {
      subjectName: (id) => (id === 'math' ? '数学' : '英语'),
      subtaskName: () => '',
    })
    expect(rows[0]).toEqual([
      '科目',
      '子任务标签',
      '任务内容',
      '计划日期',
      '开始时间',
      '结束时间',
      '完成状态',
    ])
    expect(rows[1]).toEqual(['数学', '', '复习，含逗号', '2026-10-12', '09:00', '10:00', '未完成'])
    expect(rows[2]).toEqual(['英语', '', '未安排的任务', '', '', '', '已完成'])

    const back = parseTaskCsv(toCsv(rows), context())
    expect(back.issues).toEqual([])
    expect(back.valid).toHaveLength(2)
    expect(back.valid[0].input.content).toBe('复习，含逗号')
    expect(back.valid[1].input.date).toBeNull()
    expect(back.valid[1].done).toBe(true)
  })
})
