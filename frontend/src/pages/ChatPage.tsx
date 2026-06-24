import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { kbApi } from '@/api/knowledgeBases'
import { streamChat } from '@/api/chat'
import { useKBStore } from '@/store/kbStore'
import { useAuthStore } from '@/store/authStore'
import ChatWindow from '@/components/chat/ChatWindow'
import ChatInput from '@/components/chat/ChatInput'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import type { KnowledgeBase, ChatMessage, SourceItem, Message } from '@/types'

export default function ChatPage() {
  const { kbId } = useParams<{ kbId: string }>()
  const navigate = useNavigate()
  const { setCurrentKb, kbVersion } = useKBStore()
  const [kb, setKb] = useState<KnowledgeBase | null>(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [showClear, setShowClear] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // 加载知识库信息
  useEffect(() => {
    if (!kbId) return
    kbApi.get(kbId).then((res) => {
      setKb(res.data)
      setCurrentKb(res.data.id, res.data.name)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [kbId, kbVersion])

  // 加载历史消息
  useEffect(() => {
    if (!kbId) return
    setMessages([])

    kbApi.getMessages(kbId).then((res) => {
      const history: ChatMessage[] = res.data.map((m: Message) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sources: m.sources ?? undefined,
        isStreaming: false,
      }))
      setMessages(history)
    }).catch(() => {
      toast.error('加载消息失败')
    })
  }, [kbId])

  // 组件卸载时自动中止流式请求，防止内存泄漏
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const handleSend = useCallback(async (question: string) => {
    if (!kbId) return

    const msgId = crypto.randomUUID()
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: question,
    }
    const assistantMsg: ChatMessage = {
      id: msgId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      let sources: SourceItem[] = []
      await streamChat(
        kbId, question,
        {
          onSources: (s) => { sources = s },
          onToken: (token) => {
            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === msgId)
              if (idx === -1) return prev
              const updated = [...prev]
              updated[idx] = { ...updated[idx], content: updated[idx].content + token }
              return updated
            })
          },
          onDone: () => {
            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === msgId)
              if (idx === -1) return prev
              const updated = [...prev]
              updated[idx] = { ...updated[idx], isStreaming: false, sources }
              return updated
            })
            setIsStreaming(false)
          },
          onError: (msg) => {
            toast.error(msg)
            setIsStreaming(false)
          },
        },
        controller.signal
      )
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        toast.error(err.message || '网络异常，请重试')
        setIsStreaming(false)
      }
    }
  }, [kbId])

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
    setMessages((prev) => {
      const updated = [...prev]
      const last = updated[updated.length - 1]
      if (last.role === 'assistant') last.isStreaming = false
      return updated
    })
    setIsStreaming(false)
  }, [])

  const handleClear = useCallback(async () => {
    if (!kbId) return
    try {
      const res = await fetch(`/api/knowledge-bases/${kbId}/messages`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${useAuthStore.getState().token}` },
      })
      if (!res.ok) throw new Error()
      setMessages([])
      toast.success('对话记录已清除')
    } catch {
      toast.error('清除失败')
    } finally {
      setShowClear(false)
    }
  }, [kbId])

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="h-14 border-b border-gray-200 flex items-center px-6">
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Skeleton className="h-8 w-48" />
        </div>
      </div>
    )
  }

  if (!kb) {
    return (
      <div className="p-6 text-center text-gray-400">
        <p>知识库不存在</p>
        <Button variant="link" onClick={() => navigate('/')}>返回首页</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="h-16 border-b border-brand-100 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold tracking-tight flex items-center gap-2">
            <span style={{ color: '#171775' }}>Nova</span>
            <span className="text-gray-900 font-normal">智能助理</span>
            {kb && (
              <span className="text-gray-400 text-sm font-normal">· {kb.name}</span>
            )}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50"
            onClick={() => setShowClear(true)}
            title="清除对话记录"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ChatWindow messages={messages} isStreaming={isStreaming} kbId={kbId} />

      {/* Input */}
      <ChatInput onSend={handleSend} onStop={handleStop} isStreaming={isStreaming} />

      <AlertDialog open={showClear} onOpenChange={setShowClear}>
        <AlertDialogContent>
          <AlertDialogHeader>清除对话记录</AlertDialogHeader>
          <AlertDialogDescription>确定要清除当前知识库的所有对话记录吗？此操作不可恢复。</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleClear}>确认清除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
