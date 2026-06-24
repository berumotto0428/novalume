import { apiClient } from './client'
import type { AdminStats, AdminUsersResponse, AdminUserDetail } from '@/types'

export const adminApi = {
  getStats: () => apiClient.get<AdminStats>('/admin/stats'),
  listUsers: (page: number = 1, pageSize: number = 20, search?: string) =>
    apiClient.get<AdminUsersResponse>('/admin/users', { params: { page, page_size: pageSize, search } }),
  getUserDetail: (userId: string) => apiClient.get<AdminUserDetail>(`/admin/users/${userId}`),
  updateUserStatus: (userId: string, isActive: boolean) =>
    apiClient.put(`/admin/users/${userId}/status`, { is_active: isActive }),
  resetPassword: (userId: string) =>
    apiClient.post<{ message: string }>(`/admin/users/${userId}/reset-password`),
  deleteUser: (userId: string) => apiClient.delete(`/admin/users/${userId}`),
}
