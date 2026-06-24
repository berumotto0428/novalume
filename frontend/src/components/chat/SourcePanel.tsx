import { useState } from 'react'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import PdfViewerDialog from './PdfViewerDialog'
import type { SourceItem } from '@/types'

interface Props {
  sources: SourceItem[]
  kbId: string
}

export default function SourcePanel({ sources, kbId }: Props) {
  const [open, setOpen] = useState(false)
  const [viewSource, setViewSource] = useState<SourceItem | null>(null)
  const [dialogKey, setDialogKey] = useState(0)

  const handleViewSource = (s: SourceItem) => {
    setViewSource(s)
    setDialogKey((k) => k + 1)
  }

  if (!sources || sources.length === 0) return null

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          📎 引用了 {sources.length} 个来源
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-2">
          {sources.map((s, i) => {
            const confidence = s.score !== undefined ? s.score : (s.distance !== undefined ? Math.round((1 - s.distance) * 100) : null)
            return (
            <div key={i} className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2.5 border border-gray-100">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => handleViewSource(s)}
                  className="font-medium text-brand-600 hover:text-brand-700 hover:underline flex items-center gap-1 min-w-0"
                >
                  {s.filename}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  {s.page_number && s.page_number > 0 && (
                    <span className="text-gray-400 font-normal whitespace-nowrap">· 第 {s.page_number} 页</span>
                  )}
                </button>
                {confidence !== null && (
                  <span className={`shrink-0 ml-2 font-medium ${confidence >= 70 ? 'text-green-600' : confidence >= 50 ? 'text-yellow-600' : 'text-gray-400'}`}>
                    {confidence}%
                  </span>
                )}
              </div>
              <p className="mt-1 text-gray-400 line-clamp-2">{s.text_preview}</p>
            </div>
            )
          })}
        </CollapsibleContent>
      </Collapsible>

      <PdfViewerDialog
        key={dialogKey}
        source={viewSource}
        kbId={kbId}
        open={!!viewSource}
        onOpenChange={(open) => { if (!open) setViewSource(null) }}
      />
    </>
  )
}
