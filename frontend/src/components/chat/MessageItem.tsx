import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github.css'
import SourcePanel from './SourcePanel'
import { useAuthStore } from '@/store/authStore'
import type { ChatMessage } from '@/types'

interface Props {
  message: ChatMessage
  kbId?: string
}

function UserAvatar({ username, avatarUrl, size = 'md' }: { username: string; avatarUrl?: string | null; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-6 w-6 text-xs' : 'h-8 w-8 text-sm'

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={username}
        className={`${cls} rounded-full object-cover shrink-0 mt-1`}
      />
    )
  }

  return (
    <div className={`${cls} rounded-full bg-gray-300 text-white flex items-center justify-center shrink-0 mt-1 font-medium`}>
      {username[0]?.toUpperCase() || '?'}
    </div>
  )
}

export default function MessageItem({ message, kbId }: Props) {
  const isUser = message.role === 'user'
  const currentUser = useAuthStore((s) => s.user)

  // 内容为空的流式助手消息由 TypingIndicator 展示，不渲染空头像
  if (!isUser && !message.content) return null

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <img
          src="/bot-avatar.png"
          alt="Nova"
          className="h-8 w-8 rounded-full object-cover shrink-0 mt-1"
        />
      )}

      <div className={`max-w-[75%] ${isUser ? '' : 'flex-1'}`}>
        {isUser ? (
          <div className="bg-gradient-to-br from-brand-500 to-brand-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm whitespace-pre-wrap shadow-elevated">
            {message.content}
          </div>
        ) : message.content ? (
          <div className="bg-white text-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 border border-brand-100 shadow-card">
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                {message.content}
              </ReactMarkdown>
              {!message.sources || message.sources.length === 0 ? null : (
                <SourcePanel sources={message.sources} kbId={kbId || ''} />
              )}
            </div>
          </div>
        ) : null}
      </div>

      {isUser && (
        <UserAvatar
          username={currentUser?.username || '?'}
          avatarUrl={currentUser?.avatar_url}
        />
      )}
    </div>
  )
}
