import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { LogoFull } from '@/components/brand/LogoFull'

export default function RegisterPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { login } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('密码长度不能少于6位')
      return
    }

    setLoading(true)
    try {
      const res = await authApi.register({ username, email, password })
      login(res.data.access_token, res.data.user)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.detail || '注册失败')
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
              <div className="w-[115%] ml-6">
                <LogoFull className="w-full" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>用户名</Label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="输入用户名" autoFocus />
              </div>
              <div>
                <Label>邮箱</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="输入邮箱" />
              </div>
              <div>
                <Label>密码</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="输入密码（至少6位）" />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" className="w-full" disabled={!username || !email || !password || loading}>
                {loading ? '注册中...' : '注册'}
              </Button>
              <p className="text-sm text-center text-gray-500">
                已有账号？
                <Link to="/login" className="text-brand-600 hover:underline ml-1">登录</Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
