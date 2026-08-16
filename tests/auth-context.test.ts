import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { VgAuthProvider, useVgAuth, usePermissions } from '../lib/auth-context'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}))

const PERMISSIONS = ['audit.project.read', 'audit.journey.read']
const MOCK_TOKEN  = 'vg.platform.jwt'

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(VgAuthProvider, null, children)
}

describe('VgAuthProvider / useVgAuth', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('sets platformToken and permissions after successful exchange', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: MOCK_TOKEN, permissions: PERMISSIONS }), { status:200 }),
    )
    const { result } = renderHook(() => useVgAuth(), { wrapper })
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.platformToken).toBe(MOCK_TOKEN)
    expect(result.current.permissions).toEqual(PERMISSIONS)
    expect(result.current.error).toBeNull()
  })

  it('calls POST /api/auth/exchange', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: MOCK_TOKEN, permissions:[] }), { status:200 }),
    )
    const { result } = renderHook(() => useVgAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(spy).toHaveBeenCalledWith('/api/auth/exchange', { method:'POST' })
  })

  it('sets error and clears token when exchange returns non-200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error:'token_exchange_failed' }), { status:502 }),
    )
    const { result } = renderHook(() => useVgAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.platformToken).toBeNull()
    expect(result.current.permissions).toEqual([])
    expect(result.current.error).toBeTruthy()
  })

  it('refresh() re-calls the exchange', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ access_token: MOCK_TOKEN, permissions:PERMISSIONS }), { status:200 }),
    )
    const { result } = renderHook(() => useVgAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    result.current.refresh()
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2))
  })
})

describe('usePermissions', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('can() returns true for held permission', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: MOCK_TOKEN, permissions: PERMISSIONS }), { status:200 }),
    )
    const { result } = renderHook(() => usePermissions(), { wrapper })
    await waitFor(() => expect(result.current.permissions).toEqual(PERMISSIONS))
    expect(result.current.can('audit.project.read')).toBe(true)
    expect(result.current.can('audit.journey.read')).toBe(true)
  })

  it('can() returns false for missing permission', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: MOCK_TOKEN, permissions: PERMISSIONS }), { status:200 }),
    )
    const { result } = renderHook(() => usePermissions(), { wrapper })
    await waitFor(() => expect(result.current.permissions).toEqual(PERMISSIONS))
    expect(result.current.can('audit.review.decide')).toBe(false)
    expect(result.current.can('security.role_template.read')).toBe(false)
  })
})
