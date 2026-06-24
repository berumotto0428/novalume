import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog'
import { ArrowLeft, Camera, Trash2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { authApi } from '@/api/auth'
import { toast } from 'sonner'

export default function SettingsPage() {
  const navigate = useNavigate()
  const { user, updateUser, logout } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Profile
  const [username, setUsername] = useState(user?.username || '')
  const [email, setEmail] = useState(user?.email || '')
  const [saving, setSaving] = useState(false)

  // Password
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPw, setChangingPw] = useState(false)

  // Delete
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const res = await authApi.uploadAvatar(file)
      updateUser({ avatar_url: res.data.avatar_url })
      toast.success('头像已更新')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || '上传失败')
    }
  }

  const handleSaveProfile = async () => {
    if (!username.trim() || !email.trim()) return
    setSaving(true)
    try {
      const updated = await authApi.updateProfile({ username, email })
      updateUser(updated.data)
      toast.success('个人资料已更新')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword) return
    if (newPassword !== confirmPassword) {
      toast.error('两次输入的新密码不一致')
      return
    }
    if (newPassword.length < 6) {
      toast.error('新密码长度不能少于6位')
      return
    }
    setChangingPw(true)
    try {
      await authApi.changePassword({ old_password: oldPassword, new_password: newPassword })
      toast.success('密码已修改')
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || '修改失败')
    } finally {
      setChangingPw(false)
    }
  }

  const handleDeleteAccount = async () => {
    setDeleting(true)
    try {
      await authApi.deleteAccount()
      toast.success('账号已注销')
      logout()
      navigate('/login')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || '注销失败')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">设置</h1>
      </div>

      {/* 个人资料（头像 + 用户名 + 邮箱） */}
      <Card>
        <CardHeader className="border-b border-brand-50">个人资料</CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="h-20 w-20 rounded-full object-cover" />
              ) : (
                <div className="h-20 w-20 rounded-full bg-gray-300 text-white flex items-center justify-center text-2xl font-medium">
                  {user?.username[0]?.toUpperCase() || '?'}
                </div>
              )}
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="text-sm text-gray-500">
              <p>点击更换头像</p>
              <p className="text-xs">支持 JPG / PNG / WebP，不超过 2MB</p>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </div>

          <div>
            <Label>用户名</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div>
            <Label>邮箱</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button onClick={handleSaveProfile} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader className="border-b border-brand-50">安全设置</CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>旧密码</Label>
            <Input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder="输入当前密码" />
          </div>
          <div>
            <Label>新密码</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="输入新密码（至少6位）" />
          </div>
          <div>
            <Label>确认新密码</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="再次输入新密码" />
          </div>
          <Button onClick={handleChangePassword} disabled={changingPw || !oldPassword || !newPassword || !confirmPassword}>
            {changingPw ? '修改中...' : '修改密码'}
          </Button>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200 bg-red-50/30">
        <CardHeader className="text-red-600 border-b border-red-100">危险操作</CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-3">注销账号将永久删除你的所有知识库、文档、对话记录和头像，此操作不可恢复。</p>
          <Button variant="outline" className="text-red-500 border-red-200 hover:bg-red-50 hover:border-red-300" onClick={() => setShowDelete(true)}>
            <Trash2 className="h-4 w-4 mr-2" />注销账号
          </Button>
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>确认注销账号</AlertDialogHeader>
          <AlertDialogDescription>
            确定要永久删除账号「{user?.username}」吗？此操作不可恢复，你的所有知识库、文档和对话记录将被永久删除。
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAccount} disabled={deleting} className="bg-red-500 hover:bg-red-600">
              {deleting ? '注销中...' : '确认注销'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
