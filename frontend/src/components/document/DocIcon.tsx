/**
 * 文件类型图标组件。
 * 根据 file_type 显示不同颜色和图标。
 */
import { FileText, Sheet, FileType, Presentation } from 'lucide-react'
import { Image as ImageIcon, File as FileIcon } from 'lucide-react'

const ICONS: Record<string, { Icon: typeof FileText; color: string }> = {
  pdf:      { Icon: FileText,     color: 'text-red-500' },
  word:     { Icon: FileText,     color: 'text-blue-600' },
  excel:    { Icon: Sheet,        color: 'text-green-600' },
  pptx:     { Icon: Presentation, color: 'text-orange-500' },
  markdown: { Icon: FileType,     color: 'text-gray-500' },
  image:    { Icon: ImageIcon,    color: 'text-purple-500' },
}

export default function DocIcon({ fileType, className = '' }: { fileType: string | null; className?: string }) {
  const cfg = ICONS[fileType || ''] ?? { Icon: FileIcon, color: 'text-gray-400' }
  const { Icon, color } = cfg
  return <Icon className={`h-4 w-4 shrink-0 ${color} ${className}`} />
}
