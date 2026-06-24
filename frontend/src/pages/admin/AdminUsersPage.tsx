import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, MoreHorizontal, Eye, ToggleLeft, ToggleRight, KeyRound, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog'
import { adminApi } from '@/api/admin'
import { toast } from 'sonner'
import type { AdminUserListItem } from '@/types'

export default function AdminUsersPage() {
  const navigate = useNavigate()
  const [users, setUsers] = useState<AdminUserListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const pageSize = 20

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<AdminUserListItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadUsers = useCallback(() => {
    setLoading(true)
    adminApi.listUsers(page, pageSize, search || undefined).then((res) => {
      setUsers(res.data.items)
      setTotal(res.data.total)
      setLoading(false)
    }).catch(() => {
      toast.error('加载用户列表失败')
      setLoading(false)
    })
  }, [page, search])

  useEffect(() => { loadUsers() }, [loadUsers])

  // 搜索防抖
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const handleSearch = (value: string) => {
    setSearch(value)
    if (searchTimer) clearTimeout(searchTimer)
    setSearchTimer(setTimeout(() => setPage(1), 400))
  }

  const handleToggleStatus = async (user: AdminUserListItem) => {
    try {
      const res = await adminApi.updateUserStatus(user.id, !user.is_active)
      toast.success(res.data.message)
      loadUsers()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || '操作失败')
    }
  }

  const handleResetPassword = async (user: AdminUserListItem) => {
    try {
      const res = await adminApi.resetPassword(user.id)
      toast.success(res.data.message)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || '重置失败')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await adminApi.deleteUser(deleteTarget.id)
      toast.success('用户已删除')
      setDeleteTarget(null)
      loadUsers()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">用户管理</h1>

      {/* Search */}
      <div className="relative mb-4 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="搜索用户名或邮箱..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-brand-100 shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户名</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead className="text-center">知识库数</TableHead>
              <TableHead className="text-center">状态</TableHead>
              <TableHead>最后登录</TableHead>
              <TableHead>注册时间</TableHead>
              <TableHead className="text-center">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-400 py-8">加载中...</TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-400 py-8">暂无用户</TableCell>
              </TableRow>
            ) : users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">
                  {u.username}
                  {u.is_admin && <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">管理员</span>}
                </TableCell>
                <TableCell className="text-gray-500">{u.email}</TableCell>
                <TableCell className="text-center">{u.kb_count}</TableCell>
                <TableCell className="text-center">
                  {u.is_active ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" /> 正常
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-300 inline-block" /> 禁用
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-gray-500 text-sm">{u.last_login_at ? new Date(u.last_login_at).toLocaleString('zh-CN') : '从未登录'}</TableCell>
                <TableCell className="text-gray-500 text-sm">{new Date(u.created_at).toLocaleDateString('zh-CN')}</TableCell>
                <TableCell className="text-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(`/admin/users/${u.id}`)}>
                        <Eye className="h-4 w-4 mr-2" />查看详情
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleStatus(u)}>
                        {u.is_active ? <ToggleLeft className="h-4 w-4 mr-2" /> : <ToggleRight className="h-4 w-4 mr-2" />}
                        {u.is_active ? '禁用账号' : '启用账号'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleResetPassword(u)}>
                        <KeyRound className="h-4 w-4 mr-2" />重置密码
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteTarget(u)}
                        className="text-red-500"
                        disabled={u.is_admin}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />删除用户
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>共 {total} 条，第 {page}/{totalPages} 页</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" /> 上一页
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              下一页 <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>确认删除用户</AlertDialogHeader>
          <AlertDialogDescription>
            确定要删除用户「{deleteTarget?.username}」吗？此操作不可恢复，将删除该用户的所有知识库、文档和对话记录。
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-red-500 hover:bg-red-600">
              {deleting ? '删除中...' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
