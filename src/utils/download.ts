/**
 * 浏览器文件下载 / 读取（薄封装）。
 * 解析、校验、序列化等逻辑全部放在 services 的纯函数里，便于单测；这里只做 DOM 交互。
 */

export const CSV_MIME = 'text/csv;charset=utf-8'
export const JSON_MIME = 'application/json'

/** 触发浏览器下载文本文件 */
export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  // 释放对象 URL（稍作延迟，兼容 Safari）
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 读取本地文件为文本（UTF-8） */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '')
    }
    reader.onerror = () => {
      reject(new Error('文件读取失败，请重试。'))
    }
    reader.readAsText(file, 'utf-8')
  })
}
