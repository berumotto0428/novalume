import { create } from 'zustand'

interface KBStore {
  currentKbId: string | null
  currentKbName: string | null
  kbVersion: number
  setCurrentKb: (id: string, name: string) => void
  clearCurrentKb: () => void
  bumpVersion: () => void
}

export const useKBStore = create<KBStore>((set) => ({
  currentKbId: null,
  currentKbName: null,
  kbVersion: 0,
  setCurrentKb: (id, name) => set({ currentKbId: id, currentKbName: name }),
  clearCurrentKb: () => set({ currentKbId: null, currentKbName: null }),
  bumpVersion: () => set((state) => ({ kbVersion: state.kbVersion + 1 })),
}))
