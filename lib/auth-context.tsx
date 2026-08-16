'use client'
/**
 * VgAuthContext
 *
 * Reads the platform JWT from /api/auth/session (which reads the httpOnly cookie),
 * exposes permissions[] for UI show/hide decisions.
 * Authorization enforcement is always server-side.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

export interface VgAuthState {
  platformToken: string | null
  permissions:   string[]
  loading:       boolean
  error:         string | null
  refresh:       () => void
}

const VgAuthContext = createContext<VgAuthState>({
  platformToken: null, permissions: [], loading: true, error: null, refresh: () => {},
})

export function VgAuthProvider({ children }: { children: React.ReactNode }) {
  const [platformToken, setPlatformToken] = useState<string | null>(null)
  const [permissions,   setPermissions]   = useState<string[]>([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState<string | null>(null)

  const loadSession = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      // GET /api/auth/session — server reads httpOnly cookie, returns permissions[]
      const res = await fetch('/api/auth/session')
      if (!res.ok) throw new Error(`session ${res.status}`)
      const data = await res.json() as { access_token: string; permissions: string[] }
      setPlatformToken(data.access_token)
      setPermissions(data.permissions)
    } catch (err) {
      setError(String(err))
      setPlatformToken(null); setPermissions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadSession() }, [loadSession])

  return (
    <VgAuthContext.Provider value={{ platformToken, permissions, loading, error, refresh: loadSession }}>
      {children}
    </VgAuthContext.Provider>
  )
}

export const useVgAuth = () => useContext(VgAuthContext)

export function usePermissions() {
  const { permissions } = useVgAuth()
  return { can: (p: string) => permissions.includes(p), permissions }
}
