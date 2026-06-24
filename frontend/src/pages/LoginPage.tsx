import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChevronDown, X } from 'lucide-react'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { LogoFull } from '@/components/brand/LogoFull'

const STORAGE_KEY_USER = 'login_accounts_user'
const STORAGE_KEY_ADMIN = 'login_accounts_admin'
const MAX_ACCOUNTS = 5

interface SavedAccount {
  username: string
  password: string
  avatar_url?: string
}

function loadAccounts(tab: string): SavedAccount[] {
  try {
    const key = tab === 'admin' ? STORAGE_KEY_ADMIN : STORAGE_KEY_USER
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return []
}

function saveAccounts(tab: string, accounts: SavedAccount[]) {
  const key = tab === 'admin' ? STORAGE_KEY_ADMIN : STORAGE_KEY_USER
  localStorage.setItem(key, JSON.stringify(accounts))
}

function addAccount(tab: string, username: string, password: string, avatar_url?: string) {
  const accounts = loadAccounts(tab).filter((a) => a.username !== username)
  accounts.unshift({ username, password, avatar_url })
  saveAccounts(tab, accounts.slice(0, MAX_ACCOUNTS))
}

function removeAccount(tab: string, username: string) {
  const accounts = loadAccounts(tab).filter((a) => a.username !== username)
  saveAccounts(tab, accounts)
  return accounts
}

function clearAccounts(tab: string) {
  const key = tab === 'admin' ? STORAGE_KEY_ADMIN : STORAGE_KEY_USER
  localStorage.removeItem(key)
}

export default function LoginPage() {
  const [searchParams] = useSearchParams()
  const defaultTab = searchParams.get('tab') === 'admin' ? 'admin' : 'user'
  const [tab, setTab] = useState(defaultTab)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const navigate = useNavigate()
  const { login: storeLogin } = useAuthStore()
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 切换 Tab 或首次加载时，从 localStorage 恢复
  useEffect(() => {
    const accounts = loadAccounts(tab)
    setSavedAccounts(accounts)
    if (accounts.length > 0) {
      setUsername(accounts[0].username)
      setPassword(accounts[0].password)
    } else {
      setUsername('')
      setPassword('')
    }
    setError('')
    setShowDropdown(false)
  }, [tab])

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectAccount = useCallback((account: SavedAccount) => {
    setUsername(account.username)
    setPassword(account.password)
    setShowDropdown(false)
    // 密码输入框自动聚焦
    setTimeout(() => {
      const pwInput = document.querySelector<HTMLInputElement>('input[type="password"]')
      pwInput?.focus()
    }, 0)
  }, [])

  const handleFocus = () => {
    if (savedAccounts.length > 1) {
      setShowDropdown(true)
    }
  }

  const handleRemoveAccount = (e: React.MouseEvent, acc: SavedAccount) => {
    e.stopPropagation()
    const remaining = removeAccount(tab, acc.username)
    setSavedAccounts(remaining)
    // 如果删的是当前选中的账号，切到第一个
    if (acc.username === username) {
      if (remaining.length > 0) {
        setUsername(remaining[0].username)
        setPassword(remaining[0].password)
      } else {
        setUsername('')
        setPassword('')
      }
    }
  }

  const handleClear = () => {
    clearAccounts(tab)
    setSavedAccounts([])
    setUsername('')
    setPassword('')
    setShowDropdown(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authApi.login({ username_or_email: username, password })

      if (tab === 'admin' && !res.data.user.is_admin) {
        setError('该账号不是管理员账号')
        return
      }

      addAccount(tab, username, password, res.data.user.avatar_url ?? undefined)
      storeLogin(res.data.access_token, res.data.user)
    } catch (err: any) {
      setError(err.response?.data?.detail || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: '#0a0a4a' }}>
      {/* 棱柱光束背景 */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" viewBox="0 0 1440 900">
        <polygon points="0,0 720,0 420,900 0,900" fill="#0d0d5c" opacity="0.9" />
        <polygon points="720,0 1440,0 1440,600 1020,900 420,900" fill="#0f0f68" opacity="0.7" />
        <polygon points="660,0 780,0 1020,900 480,900" fill="#4f6ef7" opacity="0.07" />
        <polygon points="100,0 300,0 420,900 0,900" fill="#7c9bff" opacity="0.05" />
        <polygon points="1200,0 1380,0 1440,340 1440,0" fill="#4f6ef7" opacity="0.06" />
        <ellipse cx="720" cy="-40" rx="400" ry="220" fill="#6b87ff" opacity="0.12" />
        <ellipse cx="720" cy="-40" rx="200" ry="130" fill="#8fa8ff" opacity="0.10" />
        <line x1="720" y1="0" x2="420" y2="900" stroke="#7c9bff" strokeWidth="1" opacity="0.15" />
        <line x1="720" y1="0" x2="1020" y2="900" stroke="#7c9bff" strokeWidth="1" opacity="0.15" />
        <line x1="300" y1="0" x2="0" y2="640" stroke="#a8c0ff" strokeWidth="0.6" opacity="0.10" />
        <line x1="1180" y1="0" x2="1440" y2="560" stroke="#a8c0ff" strokeWidth="0.6" opacity="0.10" />
      </svg>
      <div className="relative z-10 flex items-center justify-center px-4 min-h-screen">
        <Card className="w-full max-w-[420px] shadow-dialog border-0">
          <CardHeader>
            <div className="pt-2 -mb-6">
              <div className="w-[110%] ml-8">
                <LogoFull className="w-full" />
              </div>
            </div>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid grid-cols-2 w-full bg-brand-50/70 p-1 rounded-lg">
                <TabsTrigger value="user" className="text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-brand-600 data-[state=inactive]:text-gray-500 data-[state=inactive]:hover:text-brand-600 rounded-md">用户登录</TabsTrigger>
                <TabsTrigger value="admin" className="text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-brand-600 data-[state=inactive]:text-gray-500 data-[state=inactive]:hover:text-brand-600 rounded-md">管理员登录</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative" ref={dropdownRef}>
                <Label>用户名或邮箱</Label>
                <div className="relative">
                  <Input
                    ref={inputRef}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onFocus={handleFocus}
                    placeholder="输入用户名或邮箱"
                    autoFocus
                  />
                  {savedAccounts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowDropdown(!showDropdown)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {showDropdown && savedAccounts.length > 0 && (
                  <div className="absolute z-10 top-full mt-1 w-full bg-white border rounded-md shadow-lg py-1">
                    {savedAccounts.map((acc, i) => (
                      <div
                        key={i}
                        className={`group flex items-center gap-1 px-1 ${
                          acc.username === username ? 'bg-blue-50' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => selectAccount(acc)}
                          className="flex-1 text-left py-2 px-2 text-sm hover:bg-gray-50 flex items-center gap-2 rounded"
                        >
                          {acc.avatar_url ? (
                            <img src={acc.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                          ) : (
                            <span className="w-6 h-6 rounded-full bg-gray-300 text-white text-xs flex items-center justify-center shrink-0 font-medium">
                              {acc.username[0]?.toUpperCase() || '?'}
                            </span>
                          )}
                          <span className="truncate">{acc.username}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleRemoveAccount(e, acc)}
                          className="p-1 mr-1 rounded hover:bg-red-50 hover:text-red-500 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="删除此账号"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <div className="border-t mt-1 pt-1">
                      <button
                        type="button"
                        onClick={handleClear}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:text-red-500 hover:bg-gray-50"
                      >
                        清除记住的账号
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <Label>密码</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="输入密码" />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" className="w-full" disabled={!username || !password || loading}>
                {loading ? '登录中...' : '登录'}
              </Button>
              {tab === 'user' ? (
                <p className="text-sm text-center text-gray-500">
                  还没有账号？
                  <Link to="/register" className="text-brand-600 hover:underline ml-1">注册</Link>
                </p>
              ) : (
                <p className="text-sm">&nbsp;</p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
