import { useNavigate, useLocation } from 'react-router-dom'
import { ShieldCheck, BarChart3, Users, LogOut } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

export default function AdminSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()

  const handleLogout = () => {
    logout()
    navigate('/login?tab=admin')
  }

  const navItems = [
    { path: '/admin', icon: BarChart3, label: '总览' },
    { path: '/admin/users', icon: Users, label: '用户管理' },
  ]

  return (
    <aside className="w-[220px] min-w-[220px] h-screen flex flex-col bg-[#0f0f5e] text-white">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-[#1a1a7a] shrink-0">
        <ShieldCheck className="h-5 w-5 text-emerald-400" />
        <span className="font-semibold">管理后台</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-1">
        {navItems.map((item) => {
          const isActive = item.path === '/admin'
            ? location.pathname === '/admin'
            : location.pathname.startsWith(item.path)
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive ? 'bg-[#1a1a7a] text-white' : 'text-indigo-200 hover:bg-[#1a1a7a]/60'
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-[#1a1a7a] p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-indigo-200 truncate max-w-[150px]">{user?.username}</span>
          <button onClick={handleLogout} className="h-8 w-8 flex items-center justify-center rounded-md text-indigo-200 hover:bg-[#1a1a7a]/60 hover:text-white transition-colors">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
