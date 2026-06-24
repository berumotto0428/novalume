import { apiClient } from './client'
import type { KnowledgeBase, Message } from '@/types'

export const kbApi = {
  list: () => apiClient.get<KnowledgeBase[]>('/knowledge-bases'),
  create: (data: { name: string; description?: string }) =>
    apiClient.post<KnowledgeBase>('/knowledge-bases', data),
  get: (id: string) => apiClient.get<KnowledgeBase>(`/knowledge-bases/${id}`),
  update: (id: string, data: { name?: string; description?: string }) =>
    apiClient.put<KnowledgeBase>(`/knowledge-bases/${id}`, data),
  delete: (id: string) => apiClient.delete(`/knowledge-bases/${id}`),
  getMessages: (id: string) => apiClient.get<Message[]>(`/knowledge-bases/${id}/messages`),
}
