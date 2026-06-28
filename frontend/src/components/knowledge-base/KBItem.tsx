import { useState, useEffect } from 'react'
import { Layers, MoreHorizontal, Pencil, Trash2, ChevronDown, ChevronRight, FileText, MessageSquare } from 'lucide-react'
import DocIcon from '@/components/document/DocIcon'
import { useNavigate, useLocation } from 'react-router-dom'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog'
import { useKBStore } from '@/store/kbStore'
import { kbApi } from '@/api/knowledgeBases'
import { docApi } from '@/api/documents'
import { toast } from 'sonner'
import KBRenameModal from './KBRenameModal'
import type { KnowledgeBase, Document } from '@/types'

interface Props {
  kb: KnowledgeBase
  isExpanded: boolean
  onToggle: () => void
  onRefreshKbs?: () => void
}

export default function KBItem({ kb, isExpanded, onToggle, onRefreshKbs }: Props) {
  const [showRename, setShowRename] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [docsExpanded, setDocsExpanded] = useState(false)
  const [docs, setDocs] = useState<Document[]>([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { setCurrentKb } = useKBStore()

  const isActive = location.pathname.startsWith(`/kb/${kb.id}`)

  // 展开文档列表时加载数据
  useEffect(() => {
    if (docsExpanded && docs.length === 0 && !loadingDocs) {
      setLoadingDocs(true)
      docApi.list(kb.id).then((res) => {
        setDocs(res.data.sort((a, b) => a.filename.localeCompare(b.filename, 'zh')))
        setLoadingDocs(false)
      }).catch(() => setLoadingDocs(false))
    }
  }, [docsExpanded, kb.id])

  return (
    <div className="mb-1">
      {/* KB row */}
      <div className={`flex items-center rounded-lg transition-colors ${isActive ? 'bg-brand-50' : 'hover:bg-brand-50/70'}`}>
        <button
          onClick={() => { setCurrentKb(kb.id, kb.name); onToggle(); navigate(`/kb/${kb.id}/docs`) }}
          className="flex items-center gap-2 px-2 py-2 flex-1 min-w-0 text-left"
        >
          {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />}
          <Layers className="h-4 w-4 shrink-0 text-gray-400" />
          <span className="text-sm truncate flex-1">{kb.name}</span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowRename(true)}>
              <Pencil className="h-4 w-4 mr-2" />重命名
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowDelete(true)} className="text-red-500">
              <Trash2 className="h-4 w-4 mr-2" />删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Expanded children */}
      {isExpanded && (
        <div className="ml-3 mt-1 space-y-0.5 border-l-2 border-gray-100 pl-2">
          {/* 文档管理 - 整行可点击展开 + 跳转 */}
          <div>
            <button
              onClick={() => { setDocsExpanded(!docsExpanded); setCurrentKb(kb.id, kb.name); navigate(`/kb/${kb.id}/docs`) }}
              className={`w-full flex items-center gap-1 px-2 py-1.5 rounded-md text-sm transition-colors ${
                location.pathname === `/kb/${kb.id}/docs` ? 'text-brand-600 bg-brand-50' : 'text-gray-600 hover:bg-brand-50/70'
              }`}
            >
              {docsExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
              <FileText className="h-3.5 w-3.5 shrink-0" />
              文档管理
            </button>

            {/* Document list */}
            {docsExpanded && (
              <div className="ml-5 mt-0.5 space-y-0.5 border-l border-brand-100 pl-2">
                {loadingDocs ? (
                  <p className="text-xs text-gray-400 py-1 pl-2">加载中...</p>
                ) : docs.length === 0 ? (
                  <p className="text-xs text-gray-400 py-1 pl-2">暂无文档</p>
                ) : (
                  docs.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => { setCurrentKb(kb.id, kb.name); navigate(`/kb/${kb.id}/docs/${doc.id}`) }}
                      className={`w-full flex items-center gap-2 px-2 py-1 rounded-md text-xs transition-colors ${
                        location.pathname === `/kb/${kb.id}/docs/${doc.id}` ? 'bg-brand-50 text-brand-600' : 'text-gray-500 hover:text-brand-600 hover:bg-brand-50/40'
                      }`}
                    >
                      <DocIcon fileType={doc.file_type} />
                      <span className="truncate">{doc.filename}</span>
                      {doc.status === 'ready' && <span className="text-green-500 shrink-0">✓</span>}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 对话 - 与文档管理对齐 */}
          <button
            onClick={() => { setCurrentKb(kb.id, kb.name); navigate(`/kb/${kb.id}/chat`) }}
            className={`w-full flex items-center gap-1 px-2 py-1.5 rounded-md text-sm transition-colors ${
              location.pathname.startsWith(`/kb/${kb.id}/chat`) ? 'bg-brand-50 text-brand-600' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span className="w-3.5 shrink-0" /> {/* 占位，对齐文档管理的箭头 */}
            <MessageSquare className="h-3.5 w-3.5 shrink-0" />
            对话
          </button>
        </div>
      )}

      {showRename && <KBRenameModal kb={kb} onClose={() => setShowRename(false)} onRenamed={() => { useKBStore.getState().bumpVersion(); onRefreshKbs?.() }} />}

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>确认删除</AlertDialogHeader>
          <AlertDialogDescription>确定要删除知识库「{kb.name}」吗？所有文档、会话和向量数据将被永久删除。</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              setDeleting(true)
              try { await kbApi.delete(kb.id); toast.success('知识库已删除'); onRefreshKbs?.() }
              catch (err: any) { toast.error(err.response?.data?.detail || '删除失败') }
              finally { setDeleting(false); setShowDelete(false) }
            }} disabled={deleting}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
