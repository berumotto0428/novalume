import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User { id: string; username: string; email: string; is_admin: boolean; avatar_url?: string | null }

interface AuthStore {
  token: string | null
  user: User | null
  login: (token: string, user: User) => void
  updateUser: (user: Partial<User>) => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      login: (token, user) => set({ token, user }),
      updateUser: (partial) => set((state) => ({ user: state.user ? { ...state.user, ...partial } : null })),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'auth-storage' }
  )
)
