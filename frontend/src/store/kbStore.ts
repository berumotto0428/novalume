import { create } from 'zustand'

interface KBStore {
  currentKbId: string | null
  currentKbName: string | null
  kbVersion: number
  streamingKbId: string | null   // 正在回答的知识库 ID
  unreadKbIds: Set<string>       // 有未读消息的知识库 ID 列表
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
  unreadKbIds: new Set(),
  setCurrentKb: (id, name) => set({ currentKbId: id, currentKbName: name }),
  clearCurrentKb: () => set({ currentKbId: null, currentKbName: null }),
  bumpVersion: () => set((state) => ({ kbVersion: state.kbVersion + 1 })),
  setStreaming: (kbId) => set({ streamingKbId: kbId }),
  markUnread: (kbId) => set((state) => {
    const next = new Set(state.unreadKbIds)
    next.add(kbId)
    return { unreadKbIds: next }
  }),
  markRead: (kbId) => set((state) => {
    const next = new Set(state.unreadKbIds)
    next.delete(kbId)
    return { unreadKbIds: next }
  }),
}))
