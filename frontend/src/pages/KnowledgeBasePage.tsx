import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Upload, FileText, Trash2, Pencil, HardDrive, BookOpen } from 'lucide-react'
import DocIcon from '@/components/document/DocIcon'
import { useDropzone } from 'react-dropzone'
import { kbApi } from '@/api/knowledgeBases'
import { docApi } from '@/api/documents'
import { useKBStore } from '@/store/kbStore'
import KBDeleteDialog from '@/components/knowledge-base/KBDeleteDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import type { KnowledgeBase, Document as DocType } from '@/types'

const STATUS_MAP: Record<string, { label: string; dot: string }> = {
  pending: { label: '等待', dot: 'bg-gray-400' },
  processing: { label: '处理中', dot: 'bg-blue-500 animate-pulse' },
  ready: { label: '就绪', dot: 'bg-green-500' },
  failed: { label: '失败', dot: 'bg-red-500' },
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function KnowledgeBasePage() {
  const { kbId } = useParams<{ kbId: string }>()
  const navigate = useNavigate()
  const { setCurrentKb, kbVersion, bumpVersion } = useKBStore()
  const [kb, setKb] = useState<KnowledgeBase | null>(null)
  const [docs, setDocs] = useState<DocType[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [refresh, setRefresh] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [isPageDrag, setIsPageDrag] = useState(false)
  const pageDropRef = useRef<HTMLDivElement>(null)

  // 加载 KB + 文档列表
  const loadData = useCallback(() => {
    if (!kbId) return
    kbApi.get(kbId).then((res) => {
      setKb(res.data)
      setCurrentKb(res.data.id, res.data.name)
    }).catch(() => {})
    docApi.list(kbId).then((res) => setDocs(res.data)).catch(() => {})
      .finally(() => setLoading(false))
  }, [kbId])

  useEffect(() => { loadData() }, [refresh, kbId, kbVersion])

  // Polling for in-progress docs
  useEffect(() => {
    const hasInProgress = docs.some((d) => d.status === 'pending' || d.status === 'processing')
    if (hasInProgress && !intervalRef.current) {
      intervalRef.current = setInterval(() => {
        docApi.list(kbId!).then((res) => setDocs(res.data)).catch(() => {})
      }, 3000)
    } else if (!hasInProgress && intervalRef.current) {
      clearInterval(intervalRef.current); intervalRef.current = null
    }
    return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null } }
  }, [docs])

  // Upload
  const onDrop = useCallback(async (accepted: File[]) => {
    if (accepted.length === 0 || !kbId) return
    setUploading(true); setProgress(0)
    try {
      await docApi.upload(kbId, accepted, setProgress)
      toast.success(`成功上传 ${accepted.length} 个文件`)
      setRefresh((r) => r + 1)
      bumpVersion()
    } catch (err: any) { toast.error(err.response?.data?.detail || '上传失败') }
    finally { setUploading(false) }
  }, [kbId])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'text/markdown': ['.md'],
      'text/plain': ['.txt'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
    },
    multiple: true,
    disabled: uploading,
  })

  // Rename
  const handleRename = async (docId: string) => {
    if (!renameVal.trim()) return
    try {
      await docApi.rename(kbId!, docId, renameVal.trim())
      toast.success('已重命名')
      setRenaming(null)
      setRefresh((r) => r + 1)
    } catch (err: any) { toast.error(err.response?.data?.detail || '重命名失败') }
  }

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const handleDelete = async () => {
    if (!deleteTarget || !kbId) return
    setDeleting(true)
    try { await docApi.delete(kbId, deleteTarget); toast.success('文档已删除'); setRefresh((r) => r + 1); bumpVersion() }
    catch (err: any) { toast.error(err.response?.data?.detail || '删除失败') }
    finally { setDeleting(false); setDeleteTarget(null) }
  }

  // Sort by pinyin
  const sortedDocs = [...docs].sort((a, b) => a.filename.localeCompare(b.filename, 'zh'))
  const totalSize = docs.reduce((s, d) => s + d.file_size, 0)

  if (loading) return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-64" /><Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
  if (!kb) return (
    <div className="p-6 text-center text-gray-400"><p>知识库不存在</p><Button variant="link" onClick={() => navigate('/')}>返回首页</Button></div>
  )

  return (
    <div
      className="p-6 max-w-4xl mx-auto"
      ref={pageDropRef}
      onDragOver={(e) => { e.preventDefault(); setIsPageDrag(true) }}
      onDragLeave={(e) => {
        if (pageDropRef.current && !pageDropRef.current.contains(e.relatedTarget as Node)) {
          setIsPageDrag(false)
        }
      }}
      onDrop={(e) => {
        e.preventDefault()
        setIsPageDrag(false)
        const ALLOWED_EXTS = ['.pdf', '.docx', '.doc', '.md', '.txt', '.xlsx', '.xls', '.pptx', '.jpg', '.jpeg', '.png']
        const files = Array.from(e.dataTransfer.files).filter(f =>
          ALLOWED_EXTS.some(ext => f.name.toLowerCase().endsWith(ext))
        )
        if (files.length > 0) onDrop(files)
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 truncate">{kb.name}</h1>
            {kb.description && <span className="text-sm text-gray-400 truncate hidden sm:inline">· {kb.description}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div {...getRootProps()} className="cursor-pointer">
            <input {...getInputProps()} />
            <Button variant="outline" size="sm" disabled={uploading}>
              {uploading ? (<><Upload className="h-4 w-4 mr-1" />{progress}%</>) : (<><Upload className="h-4 w-4 mr-1" />上传文件</>)}
            </Button>
          </div>
          <KBDeleteDialog kbId={kb.id} kbName={kb.name} onDeleted={() => navigate('/')} />
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
        <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5 text-brand-500" />{docs.length} 个文件</span>
        <span className="flex items-center gap-1"><HardDrive className="h-3.5 w-3.5 text-brand-500" />共 {formatSize(totalSize)}</span>
        <span className="text-xs text-gray-400 ml-auto">支持 PDF · Word · Excel · PPT · Markdown · 图片</span>
      </div>

      <Separator className="mb-4" />

      {/* Document section with drag overlay — doesn't cover header/stats */}
      <div className="relative min-h-[70vh]">
        {isPageDrag && !uploading && (
          <div className="absolute inset-0 z-20 rounded-xl border-2 border-dashed border-brand-400 bg-brand-500/5 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white/95 rounded-xl px-8 py-6 shadow-lg border text-center">
              <Upload className="h-10 w-10 text-brand-500 mx-auto mb-3" />
              <p className="text-brand-600 font-medium text-lg">放开以上传文档</p>
              <p className="text-xs text-gray-400 mt-1">支持 PDF · Word · Excel · PPT · Markdown · 图片</p>
            </div>
          </div>
        )}
        {sortedDocs.length === 0 ? (
        <div className="text-center py-16 bg-white/80 backdrop-blur-sm border-2 border-dashed border-brand-200 rounded-xl min-h-[70vh] flex flex-col items-center justify-center">
          <BookOpen className="h-14 w-14 mx-auto mb-3 text-brand-300 opacity-40" />
          <p className="text-sm font-medium text-brand-600">知识库还没有文档</p>
          <p className="text-xs mt-1 text-brand-400">拖拽文件到页面或点击右上角「上传文件」</p>
        </div>
      ) : (
        <div className="border border-brand-100 rounded-xl shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-50/50 border-b border-brand-50">
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">文件名</th>
                <th className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 w-16">大小</th>
                <th className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 w-16">页数</th>
                <th className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 w-16">状态</th>
                <th className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 w-16">重命名</th>
                <th className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 w-16">删除</th>
              </tr>
            </thead>
            <tbody>
              {sortedDocs.map((doc) => {
                const st = STATUS_MAP[doc.status] || STATUS_MAP.pending
                return (
                  <tr key={doc.id} className="border-b border-brand-100 last:border-0 hover:bg-brand-50/40 transition-colors">
                    <td className="px-4 py-3">
                      {renaming === doc.id ? (
                        <div className="flex items-center gap-1">
                          <Input className="h-7 text-sm" value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(doc.id); if (e.key === 'Escape') setRenaming(null) }}
                            onBlur={() => handleRename(doc.id)} autoFocus />
                        </div>
                      ) : (
                        <button onClick={() => navigate(`/kb/${kbId}/docs/${doc.id}`)}
                          className="text-brand-600 hover:text-brand-700 font-medium underline underline-offset-2 decoration-brand-300/50 hover:decoration-brand-500 truncate max-w-[300px] block text-left flex items-center gap-1.5">
                          <DocIcon fileType={doc.file_type} />
                          <span className="truncate">{doc.filename}</span>
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center text-gray-500 whitespace-nowrap">{formatSize(doc.file_size)}</td>
                    <td className="px-3 py-3 text-center text-gray-500">{doc.page_count || '-'}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 text-xs ${st.dot.includes('green') ? 'text-green-600' : st.dot.includes('red') ? 'text-red-500' : 'text-gray-500'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />{st.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-brand-500"
                        onClick={() => { setRenaming(doc.id); setRenameVal(doc.filename) }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-red-500"
                        onClick={() => setDeleteTarget(doc.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}</div>

      {/* Delete dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>确认删除</AlertDialogHeader>
          <AlertDialogDescription>确定要删除该文档吗？向量数据也将被清除，此操作不可恢复。</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>{deleting ? '删除中...' : '删除'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
