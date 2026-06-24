import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Plus, LogOut, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { useKBStore } from '@/store/kbStore'
import { kbApi } from '@/api/knowledgeBases'
import KBItem from '@/components/knowledge-base/KBItem'
import KBCreateModal from '@/components/knowledge-base/KBCreateModal'
import { LogoFull } from '@/components/brand/LogoFull'
import type { KnowledgeBase } from '@/types'

const SIDEBAR_MIN = 200
const SIDEBAR_MAX = 400
const STORAGE_KEY = 'novalume_sidebar_width'

export default function Sidebar() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([])
  const [expandedKbId, setExpandedKbId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const w = parseInt(saved)
        if (w >= SIDEBAR_MIN && w <= SIDEBAR_MAX) return w
      }
    } catch { /* ignore */ }
    return 260
  })
  const isResizing = useRef(false)

  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const { clearCurrentKb } = useKBStore()

  const loadKbs = useCallback(() => {
    kbApi.list().then((res) => {
      setKbs(res.data)
    }).catch(() => {})
  }, [])

  // 加载 KB 列表（路由变化时刷新）
  useEffect(() => { loadKbs() }, [location.pathname])

  // URL 变化时同步展开的知识库（刷新页面后仍保持状态）
  useEffect(() => {
    const m = location.pathname.match(/\/kb\/([^/]+)/)
    if (m) setExpandedKbId(m[1])
  }, [location.pathname])

  // 持久化宽度
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  // 全局鼠标事件 — 拖拽调整宽度
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return
      setSidebarWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, e.clientX)))
    }
    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const handleToggle = (kbId: string) => {
    setExpandedKbId(expandedKbId === kbId ? null : kbId)
  }

  const handleLogout = () => {
    clearCurrentKb()
    logout()
    navigate('/login')
  }

  return (
    <>
      <aside
        className="relative h-screen flex flex-col bg-white border-r border-brand-100 shadow-[1px_0_4px_rgba(79,110,247,0.04)] shrink-0"
        style={{ width: sidebarWidth }}
      >
        {/* Logo */}
        <div className="flex items-center pt-9 h-14 border-b border-brand-100 shrink-0 pl-4 pr-3">
          <div className="w-[325px] -ml-7 flex-none">
            <LogoFull className="w-full" />
          </div>
        </div>

        {/* New KB Button */}
        <div className="p-3 shrink-0">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-brand-50 border border-dashed border-brand-200 hover:border-brand-400"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="h-4 w-4" />
            新建知识库
          </Button>
        </div>

        {/* KB Tree */}
        <nav className="flex-1 overflow-y-auto px-2">
          {kbs.map((kb) => (
            <KBItem
              key={kb.id}
              kb={kb}
              isExpanded={expandedKbId === kb.id}
              onToggle={() => handleToggle(kb.id)}
              onRefreshKbs={loadKbs}
            />
          ))}

          {kbs.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">还没有知识库</p>
          )}
        </nav>

        {/* User Info */}
        <div className="border-t border-brand-100 p-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
              ) : (
                <div className="h-7 w-7 rounded-full bg-gray-300 text-white text-xs flex items-center justify-center shrink-0 font-medium">
                  {user?.username[0]?.toUpperCase() || '?'}
                </div>
              )}
              <span className="text-sm text-gray-600 truncate">{user?.username}</span>
            </div>
            <div className="flex items-center gap-0">
              <Button variant="ghost" size="icon" className="hover:bg-brand-50 hover:text-brand-600" onClick={() => navigate('/settings')}>
                <Settings className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="hover:bg-brand-50 hover:text-brand-600" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Drag handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-[5px] cursor-col-resize hover:w-[6px] group z-10"
          onMouseDown={handleResizeStart}
        >
          <div className="absolute right-0 top-0 bottom-0 w-[3px] bg-transparent group-hover:bg-brand-400/60 transition-colors duration-150 rounded-full" />
        </div>
      </aside>

      {showCreate && <KBCreateModal onClose={() => setShowCreate(false)} onCreated={loadKbs} />}
    </>
  )
}
