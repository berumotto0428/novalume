import { useState, useRef, useCallback } from 'react'
import { Send, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  onSend: (text: string) => void
  onStop: () => void
  isStreaming: boolean
}

export default function ChatInput({ onSend, onStop, isStreaming }: Props) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 6 * 24) + 'px'
  }, [])

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return
    onSend(trimmed)
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-brand-100 bg-white px-4 py-3">
      <div className="flex items-end gap-2 max-w-4xl mx-auto">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => { setText(e.target.value); adjustHeight() }}
          onKeyDown={handleKeyDown}
          placeholder="输入你的问题..."
          rows={1}
          className="flex-1 resize-none rounded-lg border border-brand-100 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 placeholder:text-brand-300 min-h-[40px] max-h-[144px]"
        />
        {isStreaming ? (
          <Button onClick={onStop} variant="secondary" size="icon" className="shrink-0">
            <Square className="h-4 w-4 fill-current" />
          </Button>
        ) : (
          <Button onClick={handleSend} disabled={!text.trim()} size="icon" className="shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
