import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { kbApi } from '@/api/knowledgeBases'
import { toast } from 'sonner'

interface Props {
  kbId: string
  kbName: string
  onDeleted: () => void
}

export default function KBDeleteDialog({ kbId, kbName, onDeleted }: Props) {
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    setLoading(true)
    try {
      await kbApi.delete(kbId)
      toast.success('知识库已删除')
      onDeleted()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || '删除失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200">
          <Trash2 className="h-4 w-4 mr-1" />删除
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>确认删除</AlertDialogHeader>
        <AlertDialogDescription>
          确定要删除知识库「{kbName}」吗？所有文档和向量数据将被永久删除，此操作不可恢复。
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={loading}>
            {loading ? '删除中...' : '确认删除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
