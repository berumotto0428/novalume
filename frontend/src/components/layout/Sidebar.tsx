import { useEffect, useState, useRef, useCallback, useLayoutEffect } from 'react'
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
  const EXPANDED_KEY = 'novalume_expanded_kbs'
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(EXPANDED_KEY)
      if (saved) return new Set(JSON.parse(saved))
    } catch { /* ignore */ }
    return new Set()
  })
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
  const navRef = useRef<HTMLElement>(null)
  const scrollPosRef = useRef(0)
  const scrollRestored = useRef(false)

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

  // URL 变化时将当前知识库加入展开列表
  useEffect(() => {
    const m = location.pathname.match(/\/kb\/([^/]+)/)
    if (m) setExpandedIds(prev => new Set(prev).add(m[1]))
  }, [location.pathname])

  // 持久化展开状态
  useEffect(() => {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expandedIds]))
  }, [expandedIds])

  // 展开/收起后恢复滚动位置
  useLayoutEffect(() => {
    if (navRef.current && scrollPosRef.current > 0) {
      navRef.current.scrollTop = scrollPosRef.current
      scrollPosRef.current = 0
    }
  })

  // 恢复侧边栏滚动位置（刷新页面后保持）
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const saved = sessionStorage.getItem("novalume_sidebar_scroll")
    if (!saved) return
    const restore = () => {
      const target = parseInt(saved)
      if (target > 0 && nav.scrollHeight > nav.clientHeight) {
        nav.scrollTop = target
      }
    }
    // 立即尝试恢复（如果内容已加载完毕）
    restore()
    // 用 MutationObserver 监听内容变化，内容增长时再次尝试恢复
    const observer = new MutationObserver(() => restore())
    observer.observe(nav, { childList: true, subtree: true })
    const saveScroll = () => {
      sessionStorage.setItem("novalume_sidebar_scroll", String(nav.scrollTop))
    }
    window.addEventListener("beforeunload", saveScroll)
    return () => { observer.disconnect(); window.removeEventListener("beforeunload", saveScroll) }
  }, [])

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
    // 保存展开/收起前的滚动位置
    if (navRef.current) scrollPosRef.current = navRef.current.scrollTop
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(kbId)) next.delete(kbId)
      else next.add(kbId)
      return next
    })
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
        <nav ref={navRef} className="flex-1 overflow-y-auto px-2">
          {kbs.map((kb) => (
            <KBItem
              key={kb.id}
              kb={kb}
              isExpanded={expandedIds.has(kb.id)}
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
