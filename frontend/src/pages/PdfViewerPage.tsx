import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Document, Page, Outline, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import ReactMarkdown from 'react-markdown'
import { ArrowLeft, ChevronLeft, ChevronRight, List } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/store/authStore'
import { docApi } from '@/api/documents'
import type { Document as DocType } from '@/types'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'

const RENDER_BUFFER = 8

function ImageFullPage({ doc, kbId }: { doc: DocType; kbId: string }) {
  const navigate = useNavigate()
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const token = useAuthStore.getState().token
    fetch(`/api/knowledge-bases/${kbId}/documents/${doc.id}/file`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob() })
      .then((blob) => setImgUrl(URL.createObjectURL(blob)))
      .catch((e) => setError(e.message))
  }, [doc.id, kbId])

  return (
    <div className="h-full flex flex-col">
      <div className="h-14 border-b flex items-center px-4 shrink-0 bg-white">
        <button
            onClick={() => window.location.href = `/kb/${kbId}/docs`}
            className="inline-flex items-center justify-center rounded-lg h-10 w-10 hover:bg-brand-50 hover:text-brand-600 transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        <span className="text-sm font-medium ml-2">{doc.filename}</span>
      </div>
      <div className="flex-1 flex items-center justify-center bg-gray-100 p-4">
        {error && <p className="text-sm text-red-400">{error}</p>}
        {imgUrl && <img src={imgUrl} alt={doc.filename} className="max-w-full max-h-full object-contain" />}
      </div>
    </div>
  )
}

function MarkdownFullPage({ doc, kbId }: { doc: DocType; kbId: string }) {
  const navigate = useNavigate()
  const [text, setText] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const token = useAuthStore.getState().token
    fetch(`/api/knowledge-bases/${kbId}/documents/${doc.id}/text`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((data) => { setText(data.text || ''); setLoading(false) })
      .catch((e) => { setError(e.message); setLoading(false) })
  }, [doc.id, kbId])

  return (
    <div className="h-full flex flex-col">
      <div className="h-14 border-b flex items-center px-4 shrink-0 bg-white">
        <button
            onClick={() => window.location.href = `/kb/${kbId}/docs`}
            className="inline-flex items-center justify-center rounded-lg h-10 w-10 hover:bg-brand-50 hover:text-brand-600 transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        <span className="text-sm font-medium ml-2">{doc.filename}</span>
      </div>
      <div className="flex-1 overflow-auto p-6 bg-white">
        {loading && <Skeleton className="h-64 w-full" />}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {text && (
          <article className="prose prose-sm max-w-none">
            <ReactMarkdown>{text}</ReactMarkdown>
          </article>
        )}
      </div>
    </div>
  )
}

function ExcelFullPage({ doc, kbId }: { doc: DocType; kbId: string }) {
  const navigate = useNavigate()
  const [html, setHtml] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const token = useAuthStore.getState().token
    fetch(`/api/knowledge-bases/${kbId}/documents/${doc.id}/file`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer() })
      .then(async (buf) => {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
        const parts: string[] = []
        wb.SheetNames.forEach((name) => {
          const sheet = wb.Sheets[name]
          const json = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 }) as string[][]
          if (json.length === 0) return
          const hdr = (json[0] || []).map(c => c ?? '')
          let t = `<table class="w-full border-collapse border border-gray-300 text-sm mb-6">`
          t += `<thead><tr>${hdr.map(h => `<th class="border border-gray-300 bg-gray-100 px-2 py-1 text-left font-medium">${h.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</th>`).join('')}</tr></thead><tbody>`
          for (let i = 1; i < json.length; i++) {
            const row = json[i] || []
            t += `<tr>${hdr.map((_, ci) => `<td class="border border-gray-300 px-2 py-0.5">${String(row[ci] ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')}</td>`).join('')}</tr>`
          }
          t += '</tbody></table>'
          parts.push(`<div class="mb-4"><h3 class="text-sm font-semibold mb-1">${name.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</h3>${t}</div>`)
        })
        setHtml(parts.join('\n'))
        setLoading(false)
      })
      .catch((e) => { setError(e.message); setLoading(false) })
  }, [doc.id, kbId])

  return (
    <div className="h-full flex flex-col">
      <div className="h-14 border-b flex items-center px-4 shrink-0 bg-white">
        <button
            onClick={() => window.location.href = `/kb/${kbId}/docs`}
            className="inline-flex items-center justify-center rounded-lg h-10 w-10 hover:bg-brand-50 hover:text-brand-600 transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        <span className="text-sm font-medium ml-2">{doc.filename}</span>
      </div>
      <div className="flex-1 overflow-auto p-6 bg-white">
        {loading && <p className="text-sm text-gray-400 text-center mt-20">加载中...</p>}
        {error && <p className="text-sm text-red-400 text-center mt-20">{error}</p>}
        {html && <div dangerouslySetInnerHTML={{ __html: html }} />}
      </div>
    </div>
  )
}

export default function PdfViewerPage() {
  const { kbId, docId } = useParams<{ kbId: string; docId: string }>()
  const navigate = useNavigate()

  const [doc, setDoc] = useState<DocType | null>(null)
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [jumpInput, setJumpInput] = useState('1')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pageWidth, setPageWidth] = useState(800)
  const [range, setRange] = useState({ start: 1, end: 20 })
  const [showOutline, setShowOutline] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const scrollTicking = useRef(false)
  const pdfDocRef = useRef<any>(null)
  const numPagesRef = useRef(0)
  useEffect(() => { numPagesRef.current = numPages }, [numPages])

  useEffect(() => {
    if (!kbId || !docId) return

    // 先获取文档信息，根据 file_type 选择加载方式
    docApi.get(kbId, docId).then((res) => {
      const docData = res.data
      setDoc(docData)
      const ft = docData.file_type
      const token = useAuthStore.getState().token

      if (ft === 'image' || ft === 'markdown') {
        // 图片和 Markdown 由子组件自行加载，这里完成 loading 即可
        setLoading(false)
        return
      }

      // pdf / word / pptx：通过 /file 或 /preview 获取 PDF
      const isPreview = ft === 'word' || ft === 'pptx'
      const url = isPreview
        ? `/api/knowledge-bases/${kbId}/documents/${docId}/preview`
        : `/api/knowledge-bases/${kbId}/documents/${docId}/file`

      fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer() })
        .then((buf) => { if (buf.byteLength === 0) throw new Error('空文件'); setPdfData(buf); setLoading(false) })
        .catch((err) => { setError(err.message); setLoading(false) })
    }).catch(() => setLoading(false))
  }, [kbId, docId])

  useEffect(() => {
    const update = () => setPageWidth(Math.min(window.innerWidth * 0.8, 1000))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const pageStep = Math.round(pageWidth * 1.414) + 16

  const handleScroll = useCallback(() => {
    if (scrollTicking.current || !containerRef.current || numPages === 0) return
    scrollTicking.current = true
    requestAnimationFrame(() => {
      const c = containerRef.current!
      const scrollTop = c.scrollTop, h = c.clientHeight
      const firstVisible = Math.floor(scrollTop / pageStep) + 1
      const lastVisible = Math.ceil((scrollTop + h) / pageStep)
      setRange({ start: Math.max(1, firstVisible - RENDER_BUFFER), end: Math.min(numPages, lastVisible + RENDER_BUFFER) })
      const midPage = Math.round((scrollTop + h / 2) / pageStep)
      const cur = Math.max(1, Math.min(numPages, midPage))
      setPageNumber(cur); setJumpInput(String(cur))
      scrollTicking.current = false
    })
  }, [numPages, pageStep])

  const setPageRef = useCallback((n: number, el: HTMLDivElement | null) => {
    if (el) pageRefs.current.set(n, el); else pageRefs.current.delete(n)
  }, [])

  const scrollToPage = useCallback((n: number) => {
    if (!containerRef.current || n < 1 || n > numPagesRef.current) return
    containerRef.current.scrollTop = (n - 1) * pageStep
  }, [pageStep])

  const handleJump = () => {
    const n = parseInt(jumpInput, 10)
    if (n >= 1 && n <= numPagesRef.current) scrollToPage(n)
  }

  const handleItemClick = useCallback((args: { pageNumber: number }) => {
    const targetPage = args.pageNumber
    const n = numPagesRef.current
    if (targetPage >= 1 && targetPage <= n) {
      setRange({ start: Math.max(1, targetPage - RENDER_BUFFER), end: Math.min(n, targetPage + RENDER_BUFFER) })
      requestAnimationFrame(() => scrollToPage(targetPage))
    }
  }, [scrollToPage])

  // 非 PDF 格式：渲染专用页面
  if (doc && doc.file_type === 'image' && !loading) {
    return <ImageFullPage doc={doc} kbId={kbId!} />
  }
  if (doc && doc.file_type === 'markdown' && !loading) {
    return <MarkdownFullPage doc={doc} kbId={kbId!} />
  }
  if (doc && doc.file_type === 'excel' && !loading) {
    // Excel 全页预览：用 SheetJS 渲染
    return <ExcelFullPage doc={doc} kbId={kbId!} />
  }

  if (loading) return (
    <div className="h-full flex flex-col">
      <div className="h-14 border-b flex items-center px-6 shrink-0"><Skeleton className="h-5 w-48" /></div>
      <div className="flex-1 flex items-center justify-center"><Skeleton className="h-8 w-32" /></div>
    </div>
  )

  if (error) return (
    <div className="h-full flex flex-col items-center justify-center text-gray-400">
      <p>加载失败: {error}</p>
      <Button variant="link" onClick={() => window.location.href = `/kb/${kbId}/docs`}>返回文档管理</Button>
    </div>
  )

  const pageHeightPx = Math.round(pageWidth * 1.414)
  const pages = []
  for (let i = 1; i <= numPages; i++) {
    const visible = i >= range.start && i <= range.end
    pages.push(
      <div key={i} data-page-number={i} ref={visible ? (el) => setPageRef(i, el) : undefined}
        className="bg-white shadow-lg mb-4"
        style={{ width: pageWidth, height: pageHeightPx, overflow: 'hidden' }}>
        {visible ? (
          <Page pageNumber={i} width={pageWidth} renderTextLayer renderAnnotationLayer />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-200 text-sm select-none">{i}</div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="h-14 border-b flex items-center justify-between px-4 shrink-0 bg-white z-10">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => window.location.href = `/kb/${kbId}/docs`}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium truncate">{doc?.filename || 'PDF'}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" onClick={() => setShowOutline(!showOutline)} title="目录">
            <List className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" disabled={pageNumber <= 1} onClick={() => scrollToPage(pageNumber - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1 text-sm">
            <Input className="w-14 h-7 text-center text-xs" value={jumpInput}
              onChange={(e) => setJumpInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleJump() }} />
            <span className="text-xs text-gray-400">/ {numPages}</span>
          </div>
          <Button variant="ghost" size="icon" disabled={pageNumber >= numPages} onClick={() => scrollToPage(pageNumber + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden bg-gray-100">
        {showOutline && pdfDocRef.current && (
          <>
            <div className="flex-1 absolute inset-0 z-0" onClick={() => setShowOutline(false)} />
            <div className="w-64 border-r bg-white overflow-y-auto shrink-0 p-4 text-sm relative z-10">
              <p className="text-xs text-gray-400 mb-3 font-medium tracking-wide" style={{ letterSpacing: '0.05em' }}>目 录</p>
              <style>{`
              .pdf-outline, .pdf-outline ul { list-style: none; padding: 0; margin: 0; }
              .pdf-outline li { margin: 0; }
              .pdf-outline a {
                display: block; padding: 5px 8px; color: #4f6ef7; text-decoration: underline;
                text-underline-offset: 2px; border-radius: 4px; font-size: 13px;
                transition: background-color 0.15s;
              }
              .pdf-outline a:hover { background-color: #eef2ff; }
              .pdf-outline ul ul a { padding-left: 20px; font-size: 12px; color: #7c8cf7; }
              .pdf-outline ul ul ul a { padding-left: 32px; font-size: 11px; color: #a5b0fc; }
            `}</style>
              <Outline pdf={pdfDocRef.current} onItemClick={handleItemClick} className="pdf-outline" />
            </div>
          </>
        )}
        <div ref={containerRef} className="flex-1 overflow-auto" onScroll={handleScroll}
          onClick={() => showOutline && setShowOutline(false)}>
          <div className="flex flex-col items-center py-4">
            {pdfData && (
              <Document file={pdfData}
                onItemClick={handleItemClick}
                onLoadSuccess={(pdf) => {
                  pdfDocRef.current = pdf
                  setNumPages(pdf.numPages); setJumpInput('1')
                  setRange({ start: 1, end: Math.min(20, pdf.numPages) })
                }}
                onLoadError={() => setError('PDF 解析失败')}>
                {pages}
              </Document>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
