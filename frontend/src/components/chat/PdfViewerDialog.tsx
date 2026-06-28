import { useState, useEffect, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog'
import { useAuthStore } from '@/store/authStore'
import type { SourceItem } from '@/types'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'

const RENDER_BUFFER = 5
const PAGE_GAP = 8  // 页间距，紧凑排列

interface Props {
  source: SourceItem | null
  kbId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function PdfViewerDialog({ source, kbId, open, onOpenChange }: Props) {
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [renderRange, setRenderRange] = useState({ start: 1, end: 1 })
  const [currentPage, setCurrentPage] = useState(1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const ticking = useRef(false)
  const inited = useRef(false)
  const pageWidth = Math.min(window.innerWidth * 0.8, 900)

  // 打开弹窗时 fetch PDF
  useEffect(() => {
    if (!open || !source?.document_id) return

    setLoading(true)
    setError('')
    setPdfData(null)
    setNumPages(0)
    inited.current = false

    const token = useAuthStore.getState().token
    const isOfficePreview = source.file_type === 'word' || source.file_type === 'pptx'
    const url = isOfficePreview
      ? `/api/knowledge-bases/${kbId}/documents/${source.document_id}/preview`
      : `/api/knowledge-bases/${kbId}/documents/${source.document_id}/file`

    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.arrayBuffer()
      })
      .then((buf) => {
        if (buf.byteLength === 0) throw new Error('空文件')
        setPdfData(buf)
        setLoading(false)
      })
      .catch((err) => {
        setError(`PDF 加载失败: ${err.message}`)
        setLoading(false)
      })
  }, [open, source, kbId])

  // 打开后初始化渲染范围为来源页附近
  useEffect(() => {
    if (numPages > 0 && source?.page_number && source.page_number > 0 && !inited.current) {
      inited.current = true
      const start = Math.max(1, source.page_number - RENDER_BUFFER)
      const end = Math.min(numPages, source.page_number + RENDER_BUFFER)
      setRenderRange({ start, end })
      setCurrentPage(source.page_number)
      setTimeout(() => {
        const el = document.getElementById(`pdialog-page-${source.page_number}`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 300)
    }
  }, [numPages, source])

  const pageHeight = Math.round(pageWidth * 1.414)
  const pageStep = pageHeight + PAGE_GAP

  // 滚动时更新渲染范围和当前页
  const handleScroll = () => {
    if (ticking.current || numPages === 0 || !scrollRef.current) return
    ticking.current = true
    requestAnimationFrame(() => {
      const c = scrollRef.current!
      const scrollTop = c.scrollTop
      const h = c.clientHeight
      const first = Math.floor(scrollTop / pageStep) + 1
      const last = Math.ceil((scrollTop + h) / pageStep)
      setRenderRange({
        start: Math.max(1, first - RENDER_BUFFER),
        end: Math.min(numPages, last + RENDER_BUFFER),
      })
      const mid = Math.round((scrollTop + h / 2) / pageStep)
      setCurrentPage(Math.max(1, Math.min(numPages, mid)))
      ticking.current = false
    })
  }

  if (!source || !source.document_id) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[90vw] h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium truncate">{source.filename}</span>
              {source.page_number && source.page_number > 0 && (
                <span className="text-xs text-gray-400 shrink-0">· 来源第 {source.page_number} 页</span>
              )}
            </div>
            {numPages > 0 && (
              <span className="text-xs text-gray-500 shrink-0 tabular-nums">
                {currentPage} / {numPages}
              </span>
            )}
          </div>
        </DialogHeader>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 overflow-auto bg-gray-100 rounded-md"
        >
          {loading && <p className="text-sm text-gray-400 mt-20 text-center">加载中...</p>}
          {error && <p className="text-sm text-red-400 mt-20 text-center">{error}</p>}
          {!loading && !error && !pdfData && <p className="text-sm text-gray-400 mt-20 text-center">无数据</p>}

          {pdfData && (
            <Document
              file={pdfData}
              onLoadSuccess={({ numPages: n }) => {
                setNumPages(n)
              }}
              onLoadError={() => setError('PDF 解析失败')}
            >
              {numPages > 0 && (
                <div style={{ height: numPages * pageStep, position: 'relative' }}>
                  {Array.from({ length: numPages }, (_, i) => i + 1)
                    .filter((p) => p >= renderRange.start && p <= renderRange.end)
                    .map((p) => (
                      <div
                        key={p}
                        id={`pdialog-page-${p}`}
                        className="bg-white shadow-sm absolute left-1/2 -translate-x-1/2"
                        style={{
                          top: (p - 1) * pageStep,
                          width: pageWidth,
                          height: pageHeight,
                        }}
                      >
                        <Page
                          pageNumber={p}
                          width={pageWidth}
                          renderTextLayer
                          renderAnnotationLayer
                        />
                      </div>
                    ))}
                </div>
              )}
            </Document>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
