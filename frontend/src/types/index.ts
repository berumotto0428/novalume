export interface User {
  id: string
  username: string
  email: string
  is_admin: boolean
  avatar_url?: string | null
}

export interface KnowledgeBase {
  id: string
  name: string
  description: string | null
  doc_count: number
  ready_doc_count: number
  created_at: string
  updated_at: string
}

export interface Document {
  id: string
  knowledge_base_id: string
  filename: string
  file_size: number
  page_count: number | null
  file_type: string | null
  status: 'pending' | 'processing' | 'ready' | 'failed'
  chunk_count: number
  error_message: string | null
  created_at: string
}

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  sources: SourceItem[] | null
  created_at: string
}

export interface SourceItem {
  filename: string
  document_id?: string
  chunk_index: number
  page_number?: number
  file_type?: string
  distance?: number
  score?: number
  text_preview: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: SourceItem[]
  isStreaming?: boolean
}

// Admin types
export interface AdminStats {
  total_users: number
  active_users: number
  total_knowledge_bases: number
  total_documents: number
  ready_documents: number
}

export interface AdminUserListItem {
  id: string
  username: string
  email: string
  is_admin: boolean
  is_active: boolean
  kb_count: number
  last_login_at: string | null
  created_at: string
}

export interface AdminUserDetail extends AdminUserListItem {
  knowledge_bases: Array<{
    id: string
    name: string
    doc_count: number
    created_at: string
    documents: Array<{
      id: string
      filename: string
      file_size: number
      page_count: number | null
      status: string
      chunk_count: number
      created_at: string
    }>
  }>
}

export interface AdminUsersResponse {
  total: number
  page: number
  page_size: number
  items: AdminUserListItem[]
}
