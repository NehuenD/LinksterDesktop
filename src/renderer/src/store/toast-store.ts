import { create } from 'zustand'

export interface Toast {
  id: string
  message: string
  type: 'info' | 'error' | 'success'
}

interface ToastStore {
  toasts: Toast[]
  push: (message: string, type?: Toast['type']) => void
  dismiss: (id: string) => void
}

let counter = 0

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (message, type = 'info') => {
    const id = `toast-${counter}`
    counter += 1
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }))
    setTimeout(() => get().dismiss(id), type === 'error' ? 8000 : 4000)
  },
  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
}))

export function reportError(message: string): void {
  useToastStore.getState().push(message, 'error')
}

export function reportSuccess(message: string): void {
  useToastStore.getState().push(message, 'success')
}

export function reportInfo(message: string): void {
  useToastStore.getState().push(message, 'info')
}
