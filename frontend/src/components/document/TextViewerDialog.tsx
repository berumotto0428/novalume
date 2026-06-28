import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog'
import { useAuthStore } from '@/store/authStore'
import type { SourceItem } from '@/types'

interface Props {
  source: SourceItem | null
  kbId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function TextViewerDialog({ source, kbId, open, onOpenChange }: Props) {
  const [text, setText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !source?.document_id) return
    setLoading(true)
    setError('')
    const token = useAuthStore.getState().token
    fetch(`/api/knowledge-bases/${kbId}/documents/${source.document_id}/text`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
      .then((data) => { setText(data.text); setLoading(false) })
      .catch((err) => { setError(err.message); setLoading(false) })
  }, [open, source, kbId])

  if (!source?.document_id) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[85vw] h-[88vh] flex flex-col">
        <DialogHeader><span className="text-sm font-medium">{source.filename}</span></DialogHeader>
        <div className="flex-1 min-h-0 overflow-auto p-4 bg-white rounded-md">
          {loading && <p className="text-sm text-gray-400 text-center mt-20">加载中...</p>}
          {error && <p className="text-sm text-red-400 text-center mt-20">{error}</p>}
          {text && (
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown>{text}</ReactMarkdown>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
