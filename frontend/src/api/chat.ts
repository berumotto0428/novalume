import { useAuthStore } from '@/store/authStore'
import type { SourceItem } from '@/types'

interface StreamCallbacks {
  onSources: (sources: SourceItem[]) => void
  onToken: (token: string) => void
  onDone: () => void
  onError: (message: string) => void
}

export async function streamChat(
  kbId: string,
  question: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const token = useAuthStore.getState().token

  const response = await fetch(`/api/knowledge-bases/${kbId}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ question }),
    signal,
  })

  if (!response.ok) {
    const err = await response.json()
    throw new Error(err.detail || '请求失败')
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''

      for (const event of events) {
        const line = event.trim()
        if (!line.startsWith('data: ')) continue

        try {
          const data = JSON.parse(line.slice(6))
          if (data.type === 'sources') callbacks.onSources(data.sources)
          else if (data.type === 'token') callbacks.onToken(data.content)
          else if (data.type === 'done') callbacks.onDone()
          else if (data.type === 'error') callbacks.onError(data.message)
        } catch {
          // ignore non-JSON lines
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
