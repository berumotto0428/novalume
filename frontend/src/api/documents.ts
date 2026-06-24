import { apiClient } from './client'
import type { Document } from '@/types'

export const docApi = {
  list: (kbId: string) => apiClient.get<Document[]>(`/knowledge-bases/${kbId}/documents`),
  get: (kbId: string, docId: string) =>
    apiClient.get<Document>(`/knowledge-bases/${kbId}/documents/${docId}`),
  upload: (kbId: string, files: File[], onProgress?: (pct: number) => void) => {
    const form = new FormData()
    files.forEach(f => form.append('files', f))
    return apiClient.post<Document[]>(`/knowledge-bases/${kbId}/documents`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
      },
    })
  },
  rename: (kbId: string, docId: string, filename: string) =>
    apiClient.put<Document>(`/knowledge-bases/${kbId}/documents/${docId}`, { filename }),
  delete: (kbId: string, docId: string) =>
    apiClient.delete(`/knowledge-bases/${kbId}/documents/${docId}`),
}
