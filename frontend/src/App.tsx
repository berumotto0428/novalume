import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { useEffect, useState } from 'react'
import { authApi } from '@/api/auth'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import KnowledgeBasePage from '@/pages/KnowledgeBasePage'
import ChatPage from '@/pages/ChatPage'
import PdfViewerPage from '@/pages/PdfViewerPage'
import SettingsPage from '@/pages/SettingsPage'
import AdminDashboardPage from '@/pages/admin/AdminDashboardPage'
import AdminUsersPage from '@/pages/admin/AdminUsersPage'
import AdminUserDetailPage from '@/pages/admin/AdminUserDetailPage'
import AdminLayout from '@/components/admin/AdminLayout'
import AppLayout from '@/components/layout/AppLayout'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (user?.is_admin) return <Navigate to="/admin" replace />
  return <>{children}</>
}

function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuthStore()
  if (!token) return <Navigate to="/login?tab=admin" replace />
  if (!user?.is_admin) return <Navigate to="/" replace />
  return <>{children}</>
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { token, user, login } = useAuthStore()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (token && !user) {
      authApi.me().then((res) => {
        login(token, res.data)
      }).catch(() => {
        useAuthStore.getState().logout()
      }).finally(() => setChecking(false))
    } else {
      setChecking(false)
    }
  }, [])

  if (token && !checking) {
    if (user?.is_admin) return <Navigate to="/admin" replace />
    return <Navigate to="/" replace />
  }
  if (checking) return null
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" />
      <Routes>
        <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
        <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />

        {/* User routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <p className="text-sm">选择一个知识库开始</p>
              </div>
            </div>
          } />
          <Route path="kb/:kbId/docs" element={<KnowledgeBasePage />} />
          <Route path="kb/:kbId/docs/:docId" element={<PdfViewerPage />} />
          <Route path="kb/:kbId/chat" element={<ChatPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Admin routes */}
        <Route
          path="/admin"
          element={
            <AdminProtectedRoute>
              <AdminLayout />
            </AdminProtectedRoute>
          }
        >
          <Route index element={<AdminDashboardPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="users/:userId" element={<AdminUserDetailPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
