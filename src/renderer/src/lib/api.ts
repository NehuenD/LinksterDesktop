import type { LinksterApi } from '@shared/contract/ipc'

declare global {
  interface Window {
    linkster: LinksterApi
  }
}

export const api: LinksterApi = window.linkster
