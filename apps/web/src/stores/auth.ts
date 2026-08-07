import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { WorkerRole, PlanTier } from '@stitchbook/types'

interface Worker {
  id: string
  name: string
  role: WorkerRole
  email?: string
}

interface Shop {
  id: string
  name: string
  slug: string
  planTier: PlanTier
  currency: string
  defaultUnit: string
}

interface AuthState {
  token: string | null
  worker: Worker | null
  shop: Shop | null
  isAuthenticated: boolean
  setAuth: (token: string, worker: Worker, shop: Shop) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      worker: null,
      shop: null,
      isAuthenticated: false,

      setAuth: (token, worker, shop) =>
        set({ token, worker, shop, isAuthenticated: true }),

      logout: () => {
        set({ token: null, worker: null, shop: null, isAuthenticated: false })
        // Clear Better Auth session cookie
        fetch('/auth/sign-out', {
          method: 'POST',
          credentials: 'include',
          headers: { Accept: 'application/json' },
          redirect: 'error',
        }).catch(() => {})
        window.location.href = '/login'
      },
    }),
    {
      name: 'sb-auth',
      partialize: (state) => ({
        token: state.token,
        worker: state.worker,
        shop: state.shop,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
