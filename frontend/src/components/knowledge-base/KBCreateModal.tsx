import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogClose } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { kbApi } from '@/api/knowledgeBases'
import { toast } from 'sonner'

interface Props {
  onClose: () => void
  onCreated: () => void
}

export default function KBCreateModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      await kbApi.create({ name: name.trim(), description: desc.trim() || undefined })
      toast.success('知识库创建成功')
      onCreated()
      onClose()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || '创建失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>新建知识库</DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>知识库名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="输入知识库名称" autoFocus />
          </div>
          <div>
            <Label>描述（可选）</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="知识库的描述" rows={3} />
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">取消</Button>
            </DialogClose>
            <Button onClick={handleSubmit} disabled={!name.trim() || loading}>
              {loading ? '创建中...' : '创建'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
