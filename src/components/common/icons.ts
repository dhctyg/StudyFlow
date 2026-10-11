/**
 * 统一图标注册表（阶段二）。
 *
 * 页面只按**语义名**引用图标（如 'settings'、'overdue'），实现集中在这里：
 * 之后要更换图标库或替换成自有 SVG，只改本文件的映射即可，页面无需改动。
 * 图标库：lucide-vue-next（按需引入，tree-shaking 后只打包用到的图标）。
 */
import type { Component } from 'vue'
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock,
  Download,
  Inbox,
  ListChecks,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Settings,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-vue-next'

export type IconName =
  | 'settings'
  | 'plus'
  | 'calendar'
  | 'clock'
  | 'check'
  | 'trash'
  | 'edit'
  | 'more'
  | 'prev'
  | 'next'
  | 'today'
  | 'overdue'
  | 'inbox'
  | 'tasks'
  | 'export'
  | 'import'
  | 'restore'
  | 'rest'
  | 'buffer'
  | 'close'

export const APP_ICONS: Record<IconName, Component> = {
  settings: Settings,
  plus: Plus,
  calendar: CalendarDays,
  clock: Clock,
  check: Check,
  trash: Trash2,
  edit: Pencil,
  more: MoreHorizontal,
  prev: ChevronLeft,
  next: ChevronRight,
  today: CircleDot,
  overdue: AlertTriangle,
  inbox: Inbox,
  tasks: ListChecks,
  export: Download,
  import: Upload,
  restore: RotateCcw,
  rest: Sun,
  buffer: Package,
  close: X,
}
