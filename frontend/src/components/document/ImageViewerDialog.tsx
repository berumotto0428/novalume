import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog'
import { useAuthStore } from '@/store/authStore'
import type { SourceItem } from '@/types'

interface Props {
  source: SourceItem | null
  kbId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ImageViewerDialog({ source, kbId, open, onOpenChange }: Props) {
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !source?.document_id) return
    setLoading(true)
    setError('')
    let objectUrl: string | null = null
    const token = useAuthStore.getState().token
    fetch(`/api/knowledge-bases/${kbId}/documents/${source.document_id}/file`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.blob() })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        setImgUrl(objectUrl)
        setLoading(false)
      })
      .catch((err) => { setError(err.message); setLoading(false) })
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [open, source, kbId])

  if (!source?.document_id) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[85vw] max-h-[90vh] flex flex-col">
        <DialogHeader><span className="text-sm font-medium">{source.filename}</span></DialogHeader>
        <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-50 rounded-md p-4">
          {loading && <p className="text-sm text-gray-400">加载中...</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {imgUrl && <img src={imgUrl} alt={source.filename} className="max-w-full max-h-full object-contain" />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
