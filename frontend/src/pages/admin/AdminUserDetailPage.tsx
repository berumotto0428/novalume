import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Layers, FileText, ChevronDown, ChevronRight } from 'lucide-react'
import DocIcon from '@/components/document/DocIcon'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { adminApi } from '@/api/admin'
import { toast } from 'sonner'
import type { AdminUserDetail } from '@/types'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function AdminUserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const [user, setUser] = useState<AdminUserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedKb, setExpandedKb] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    adminApi.getUserDetail(userId).then((res) => {
      setUser(res.data)
      setLoading(false)
    }).catch(() => {
      toast.error('加载用户详情失败')
      setLoading(false)
    })
  }, [userId])

  const handleToggleStatus = async () => {
    if (!user) return
    try {
      const res = await adminApi.updateUserStatus(user.id, !user.is_active)
      toast.success(res.data.message)
      setUser({ ...user, is_active: !user.is_active })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || '操作失败')
    }
  }

  const handleResetPassword = async () => {
    if (!user) return
    try {
      const res = await adminApi.resetPassword(user.id)
      toast.success(res.data.message)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || '重置失败')
    }
  }

  if (loading) return <div className="text-sm text-gray-400">加载中...</div>
  if (!user) return <div className="text-sm text-gray-400">用户不存在</div>

  return (
    <div>
      <button
        onClick={() => navigate('/admin/users')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> 返回用户列表
      </button>

      {/* User Info */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-gray-900">{user.username}</h1>
                {user.is_admin && (
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">管理员</span>
                )}
              </div>
              <p className="text-gray-500">{user.email}</p>
              <p className="text-sm text-gray-400 mt-1">
                注册于 {new Date(user.created_at).toLocaleDateString('zh-CN')}
                {user.last_login_at && ` · 最后登录 ${new Date(user.last_login_at).toLocaleString('zh-CN')}`}
              </p>
              <div className="flex items-center gap-2 mt-3">
                <span className={`inline-flex items-center gap-1 text-sm ${user.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                  <span className={`h-2 w-2 rounded-full inline-block ${user.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                  {user.is_active ? '正常' : '禁用'}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleToggleStatus}>
                {user.is_active ? '禁用账号' : '启用账号'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleResetPassword}>
                重置密码
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Knowledge Bases — 只对普通用户显示 */}
      {!user.is_admin && (
        <Card>
          <CardHeader>
            <div className="text-lg font-semibold flex items-center gap-2">
              <Layers className="h-5 w-5" />
              知识库（{user.knowledge_bases.length}）
            </div>
          </CardHeader>
          <CardContent>
            {user.knowledge_bases.length === 0 ? (
              <p className="text-sm text-gray-400">该用户暂无知识库</p>
            ) : (
              <div className="grid gap-2">
                {user.knowledge_bases.map((kb) => (
                  <Collapsible
                    key={kb.id}
                    open={expandedKb === kb.id}
                    onOpenChange={(open) => setExpandedKb(open ? kb.id : null)}
                  >
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md cursor-pointer hover:bg-gray-100 transition-colors">
                        <div className="flex items-center gap-2">
                          {expandedKb === kb.id ? (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          )}
                          <Layers className="h-4 w-4 text-gray-400" />
                          <span className="text-sm font-medium">{kb.name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <FileText className="h-3.5 w-3.5" />
                          {kb.doc_count} 个文档
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {kb.documents.length === 0 ? (
                        <p className="text-xs text-gray-400 py-2 pl-8">暂无文档</p>
                      ) : (
                        <div className="ml-6 mt-1 space-y-1">
                          {[...kb.documents].sort((a, b) => a.filename.localeCompare(b.filename, 'zh')).map((doc) => (
                            <div
                              key={doc.id}
                              className="flex items-center justify-between py-1.5 px-3 text-sm rounded hover:bg-gray-50"
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <DocIcon fileType={doc.file_type} className="h-3.5 w-3.5" />
                                <span className="truncate">{doc.filename}</span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0 text-xs text-gray-400 ml-3">
                                {doc.page_count && <span>{doc.page_count} 页</span>}
                                <span>{formatSize(doc.file_size)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  )
}
