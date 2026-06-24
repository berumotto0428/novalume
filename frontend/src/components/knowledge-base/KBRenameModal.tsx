import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogClose } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { kbApi } from '@/api/knowledgeBases'
import { toast } from 'sonner'
import type { KnowledgeBase } from '@/types'

interface Props {
  kb: KnowledgeBase
  onClose: () => void
  onRenamed: () => void
}

export default function KBRenameModal({ kb, onClose, onRenamed }: Props) {
  const [name, setName] = useState(kb.name)
  const [desc, setDesc] = useState(kb.description || '')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      await kbApi.update(kb.id, { name: name.trim(), description: desc.trim() || undefined })
      toast.success('知识库已更新')
      onRenamed()
      onClose()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || '更新失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>重命名知识库</DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>知识库名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>描述（可选）</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">取消</Button>
            </DialogClose>
            <Button onClick={handleSubmit} disabled={!name.trim() || loading}>
              {loading ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
