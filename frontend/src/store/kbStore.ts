import { create } from 'zustand'

interface KBStore {
  currentKbId: string | null
  currentKbName: string | null
  kbVersion: number
  streamingKbId: string | null
  unreadKbIds: string[]
  setCurrentKb: (id: string, name: string) => void
  clearCurrentKb: () => void
  bumpVersion: () => void
  setStreaming: (kbId: string | null) => void
  markUnread: (kbId: string) => void
  markRead: (kbId: string) => void
}

export const useKBStore = create<KBStore>((set) => ({
  currentKbId: null,
  currentKbName: null,
  kbVersion: 0,
  streamingKbId: null,
  unreadKbIds: [],
  setCurrentKb: (id, name) => set({ currentKbId: id, currentKbName: name }),
  clearCurrentKb: () => set({ currentKbId: null, currentKbName: null }),
  bumpVersion: () => set((state) => ({ kbVersion: state.kbVersion + 1 })),
  setStreaming: (kbId) => set({ streamingKbId: kbId }),
  markUnread: (kbId) => set((state) => {
    if (state.unreadKbIds.includes(kbId)) return state
    return { unreadKbIds: [...state.unreadKbIds, kbId] }
  }),
  markRead: (kbId) => set((state) => ({
    unreadKbIds: state.unreadKbIds.filter((id) => id !== kbId),
  })),
}))
