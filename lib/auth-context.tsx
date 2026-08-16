'use client'
/**
 * VgAuthContext
 *
 * After Clerk authenticates the user this context calls POST /api/auth/exchange
 * which exchanges the Clerk JWT for a Verigence platform JWT via
 * verigence-security /oauth/token (token-exchange grant).
 *
 * permissions[] from the platform JWT drives UI show/hide decisions.
 * Authorization enforcement is always server-side.
 */
import React, {
  createContext, useContext, useEffect,
  useState, useCallback,
} from 'react'
import { useAuth } from '@clerk/nextjs'

export interface VgAuthState {
  platformToken: string | null
  permissions:   string[]
  loading:       boolean
  error:         string | null
  refresh:       () => void
}

const VgAuthContext = createContext<VgAuthState>({
  platformToken: null,
  permissions:   [],
  loading:       true,
  error:         null,
  refresh:       () => {},
})

export function VgAuthProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth()
  const [platformToken, setPlatformToken] = useState<string | null>(null)
  const [permissions,   setPermissions]   = useState<string[]>([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState<string | null>(null)

  const exchange = useCallback(async () => {
    if (!isLoaded || !isSignedIn) { setLoading(false); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/auth/exchange', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `exchange failed ${res.status}`)
      }
      const data = await res.json() as { access_token: string; permissions: string[] }
      setPlatformToken(data.access_token)
      setPermissions(data.permissions)
    } catch (err) {
      setError(String(err))
      setPlatformToken(null)
      setPermissions([])
    } finally {
      setLoading(false)
    }
  }, [isLoaded, isSignedIn])

  useEffect(() => { exchange() }, [exchange])

  return (
    <VgAuthContext.Provider value={{ platformToken, permissions, loading, error, refresh: exchange }}>
      {children}
    </VgAuthContext.Provider>
  )
}

export const useVgAuth = () => useContext(VgAuthContext)

export function usePermissions() {
  const { permissions } = useVgAuth()
  return {
    can:         (p: string) => permissions.includes(p),
    permissions,
  }
}
