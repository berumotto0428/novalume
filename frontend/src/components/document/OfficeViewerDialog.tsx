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

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export default function OfficeViewerDialog({ source, kbId, open, onOpenChange }: Props) {
  const [html, setHtml] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !source?.document_id) return
    setLoading(true)
    setError('')
    const token = useAuthStore.getState().token

    fetch(`/api/knowledge-bases/${kbId}/documents/${source.document_id}/file`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.arrayBuffer() })
      .then(async (buf) => {
        const XLSX = await import('xlsx')
        const workbook = XLSX.read(new Uint8Array(buf), { type: 'array' })
        const htmlParts: string[] = []

        workbook.SheetNames.forEach((name: string) => {
          const sheet = workbook.Sheets[name]
          const json = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })
          if (json.length === 0) return

          const header = (json[0] as string[]).map((c) => c ?? '')
          let tableHtml = '<table class="w-full border-collapse border border-gray-300 text-sm mb-4">'
          tableHtml += `<thead><tr>${header.map((h: string) => `<th class="border border-gray-300 bg-gray-100 px-2 py-1 text-left font-medium">${escapeHtml(h)}</th>`).join('')}</tr></thead>`
          tableHtml += '<tbody>'
          for (let i = 1; i < json.length; i++) {
            const row = (json[i] as (string | null)[]) || []
            tableHtml += `<tr>${header.map((_, ci) => `<td class="border border-gray-300 px-2 py-0.5">${escapeHtml(String(row[ci] ?? ''))}</td>`).join('')}</tr>`
          }
          tableHtml += '</tbody></table>'
          htmlParts.push(`<div class="mb-4"><h3 class="text-sm font-semibold mb-1">${escapeHtml(name)}</h3>${tableHtml}</div>`)
        })

        setHtml(htmlParts.join('\n'))
        setLoading(false)
      })
      .catch((err) => { setError(err.message); setLoading(false) })
  }, [open, source, kbId])

  if (!source?.document_id) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[90vw] h-[90vh] flex flex-col">
        <DialogHeader><span className="text-sm font-medium">{source.filename}</span></DialogHeader>
        <div className="flex-1 min-h-0 overflow-auto p-4 bg-white rounded-md">
          {loading && <p className="text-sm text-gray-400 text-center mt-20">加载中...</p>}
          {error && <p className="text-sm text-red-400 text-center mt-20">{error}</p>}
          {html && <div dangerouslySetInnerHTML={{ __html: html }} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
