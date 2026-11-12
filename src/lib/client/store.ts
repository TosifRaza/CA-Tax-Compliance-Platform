'use client'

import { create } from 'zustand'
import { useEffect } from 'react'

export interface SessionUser {
  id: string
  email: string
  name: string
  role: string
  phone?: string | null
}

export type ViewId =
  | 'dashboard' | 'services' | 'apply' | 'applications' | 'application'
  | 'tasks' | 'reviews' | 'businesses' | 'compliance' | 'notifications'
  | 'support' | 'masters' | 'services-admin' | 'audit'
  | 'reports' | 'regulatory' | 'consents'

export interface ViewRoute {
  view: ViewId
  id?: string
  param?: string
}

interface AppState {
  user: SessionUser | null
  loadingSession: boolean
  route: ViewRoute
  notificationsOpen: boolean
  setUser: (u: SessionUser | null) => void
  setLoadingSession: (b: boolean) => void
  navigate: (view: ViewId, id?: string, param?: string) => void
  setNotificationsOpen: (b: boolean) => void
}

function parseHash(): ViewRoute {
  const h = window.location.hash.replace(/^#\/?/, '')
  if (!h) return { view: 'dashboard' }
  const parts = h.split(':')
  const view = parts[0] as ViewId
  return { view, id: parts[1] || undefined, param: parts[2] || undefined }
}

function routeToHash(r: ViewRoute): string {
  return `#/${r.view}${r.id ? `:${r.id}` : ''}${r.param ? `:${r.param}` : ''}`
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  loadingSession: true,
  route: { view: 'dashboard' },
  notificationsOpen: false,
  setUser: (user) => set({ user }),
  setLoadingSession: (loadingSession) => set({ loadingSession }),
  navigate: (view, id, param) => {
    const route = { view, id, param }
    window.location.hash = routeToHash(route)
    set({ route, notificationsOpen: false })
  },
  setNotificationsOpen: (notificationsOpen) => set({ notificationsOpen }),
}))

// Keep store in sync with the URL hash (also survives refresh).
export function useHashSync() {
  const navigate = useAppStore((s) => s.navigate)
  useEffect(() => {
    const apply = () => {
      const r = parseHash()
      navigate(r.view, r.id, r.param)
    }
    apply()
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
  }, [])
}
