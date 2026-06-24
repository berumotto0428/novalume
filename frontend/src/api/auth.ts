import { apiClient } from './client'

export interface AuthResponse {
  access_token: string
  token_type: string
  user: { id: string; username: string; email: string; is_admin: boolean; avatar_url?: string | null }
}

export const authApi = {
  register: (data: { username: string; email: string; password: string }) =>
    apiClient.post<AuthResponse>('/auth/register', data),
  login: (data: { username_or_email: string; password: string }) =>
    apiClient.post<AuthResponse>('/auth/login', data),
  me: () => apiClient.get<{ id: string; username: string; email: string; is_admin: boolean; avatar_url?: string | null }>('/auth/me'),
  updateProfile: (data: { username?: string; email?: string }) =>
    apiClient.put<AuthResponse['user']>('/auth/profile', data),
  changePassword: (data: { old_password: string; new_password: string }) =>
    apiClient.put<{ message: string }>('/auth/password', data),
  deleteAccount: () => apiClient.delete<{ message: string }>('/auth/account'),
  uploadAvatar: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post<{ message: string; avatar_url: string }>('/auth/avatar', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}
