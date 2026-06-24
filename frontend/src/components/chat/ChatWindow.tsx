import { useEffect, useRef } from 'react'
import { MessageSquare } from 'lucide-react'
import MessageItem from './MessageItem'
import TypingIndicator from './TypingIndicator'
import type { ChatMessage } from '@/types'

interface Props {
  messages: ChatMessage[]
  isStreaming: boolean
  kbId?: string
}

export default function ChatWindow({ messages, isStreaming, kbId }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-brand-300">
        <div className="text-center">
          <MessageSquare className="h-14 w-14 mx-auto mb-4 opacity-20" />
          <p className="text-sm font-medium text-brand-500">向我提问</p>
          <p className="text-xs text-brand-300 mt-1">我会基于知识库中的文档来回答</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {messages.map((msg) => (
          <MessageItem key={msg.id} message={msg} kbId={kbId} />
        ))}
        {isStreaming && (!messages.length || messages[messages.length - 1].role !== 'assistant' || !messages[messages.length - 1].content) && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
