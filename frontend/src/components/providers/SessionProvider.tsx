'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { AuthUser } from '@/types'
import { ApiError, api } from '@/services/api'
import {
  clearClinicalSessionStorage,
  SESSION_EXPIRED_EVENT,
} from '@/services/client-session'

interface SessionContextValue {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  refreshSession: () => Promise<void>
  setSessionUser: (user: AuthUser | null) => void
  logout: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

const PUBLIC_PATHS = ['/login', '/cadastro']

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

function FullscreenState({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="text-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary-500 border-t-transparent animate-spin mx-auto mb-4" />
        <p className="text-sm text-slate-500">{message}</p>
      </div>
    </div>
  )
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const activeUserIdRef = useRef<string | null | undefined>(undefined)

  const clearPrivateClientState = useCallback(() => {
    queryClient.clear()
    clearClinicalSessionStorage()
  }, [queryClient])

  const applySessionUser = useCallback((nextUser: AuthUser | null) => {
    const nextUserId = nextUser?.id ?? null
    if (activeUserIdRef.current !== nextUserId) {
      clearPrivateClientState()
    }
    activeUserIdRef.current = nextUserId
    setUser(nextUser)
  }, [clearPrivateClientState])

  const refreshSession = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await api.auth.me()
      applySessionUser(response.user)
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 404)) {
        if (error.status === 404) {
          console.warn(
            'Endpoint /api/auth/me nao encontrado. Confirme se o backend foi reiniciado com a versao nova.'
          )
        }
      } else {
        console.error('Falha ao carregar sessao:', error)
      }
      applySessionUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [applySessionUser])

  useEffect(() => {
    const expireSession = () => {
      clearPrivateClientState()
      activeUserIdRef.current = null
      setUser(null)
      setIsLoading(false)
      router.replace('/login')
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, expireSession)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expireSession)
  }, [clearPrivateClientState, router])

  useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  useEffect(() => {
    if (isLoading) return

    const publicRoute = isPublicPath(pathname)
    if (!user && !publicRoute) {
      router.replace('/login')
      return
    }

    if (user && publicRoute) {
      router.replace('/')
    }
  }, [isLoading, pathname, router, user])

  const logout = useCallback(async () => {
    try {
      await api.auth.logout()
    } catch (error) {
      console.error('Falha ao encerrar sessao:', error)
    } finally {
      clearPrivateClientState()
      activeUserIdRef.current = null
      setUser(null)
      router.replace('/login')
    }
  }, [clearPrivateClientState, router])

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      refreshSession,
      setSessionUser: applySessionUser,
      logout,
    }),
    [applySessionUser, isLoading, logout, refreshSession, user]
  )

  const publicRoute = isPublicPath(pathname)
  if (isLoading) {
    return (
      <SessionContext.Provider value={value}>
        <FullscreenState message="Carregando sua sessao..." />
      </SessionContext.Provider>
    )
  }

  if (!publicRoute && !user) {
    return (
      <SessionContext.Provider value={value}>
        <FullscreenState message="Redirecionando para o login..." />
      </SessionContext.Provider>
    )
  }

  if (publicRoute && user) {
    return (
      <SessionContext.Provider value={value}>
        <FullscreenState message="Redirecionando para o dashboard..." />
      </SessionContext.Provider>
    )
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('useSession precisa ser usado dentro de SessionProvider')
  }
  return context
}
