'use client'
/**
 * Sign-in page — agreed wireframe Screen 1
 * White bg · Approved logo · Tagline · Email + Password form · Sign up link
 *
 * On submit → POST /api/auth/login → Security module
 * On success → Security issues JWT → stored in httpOnly cookie → redirect /dashboard
 */
import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function SignInPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) { setError('Email and password are required'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string; detail?: string }
        setError(body.detail ?? body.error ?? 'Invalid email or password')
        return
      }
      // Session cookie set by the API route
      router.push('/dashboard')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width:'100%', height:40, padding:'0 12px',
    border:'1px solid #E2E8F0', borderRadius:8, fontSize:14,
    fontFamily:'Inter,Arial,Helvetica,sans-serif', outline:'none',
    background:'#F4F8FB', color:'#0F172A', boxSizing:'border-box',
  }

  return (
    <main style={{ minHeight:'100dvh', background:'#fff', display:'flex',
      flexDirection:'column', alignItems:'center', justifyContent:'center',
      padding:'40px 24px', fontFamily:'Inter,Arial,Helvetica,sans-serif' }}>

      {/* Approved logo on white — §6 */}
      <div style={{ width:280, marginBottom:6 }}>
        <Image src="/brand/svg/verigence-logo.svg" alt="Verigence"
          width={280} height={70} priority style={{ width:'100%', height:'auto' }} />
      </div>

      {/* Tagline */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:36,
        fontSize:11, fontWeight:600, letterSpacing:'0.15em',
        color:'#31506E', textTransform:'uppercase' }}>
        <span>Audit</span>
        <span style={{ width:5, height:5, borderRadius:'50%', background:'#00AFA8', display:'inline-block' }} />
        <span>Governance</span>
        <span style={{ width:5, height:5, borderRadius:'50%', background:'#00AFA8', display:'inline-block' }} />
        <span>Intelligence</span>
      </div>

      <div style={{ width:'100%', maxWidth:380, border:'0.5px solid #E2E8F0',
        borderRadius:16, padding:'28px 32px', background:'#fff' }}>

        <h1 style={{ fontSize:16, fontWeight:700, color:'#003A82', margin:'0 0 20px' }}>
          Sign in to Verigence
        </h1>

        {error && (
          <div style={{ background:'#FCEBEB', border:'0.5px solid #F09595',
            borderRadius:8, padding:'10px 14px', fontSize:13, color:'#A32D2D', marginBottom:16 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, fontWeight:600, color:'#31506E',
              display:'block', marginBottom:4 }} htmlFor="email">
              Email address
            </label>
            <input id="email" type="email" autoComplete="email"
              placeholder="raj.sharma@dealership.in"
              value={email} onChange={e => { setEmail(e.target.value); setError('') }}
              style={inputStyle} />
          </div>

          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:12, fontWeight:600, color:'#31506E',
              display:'block', marginBottom:4 }} htmlFor="password">
              Password
            </label>
            <input id="password" type="password" autoComplete="current-password"
              placeholder="Your password"
              value={password} onChange={e => { setPassword(e.target.value); setError('') }}
              style={inputStyle} />
          </div>

          <button type="submit" disabled={loading}
            style={{ width:'100%', height:42, background: loading ? '#94A3B8' : '#003A82',
              color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily:'Inter,Arial,Helvetica,sans-serif' }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={{ textAlign:'center', fontSize:12, color:'#31506E', marginTop:16 }}>
          Don&apos;t have an account?{' '}
          <Link href="/sign-up" style={{ color:'#003A82', fontWeight:600 }}>Sign up</Link>
        </p>
      </div>

      <p style={{ marginTop:24, fontSize:11, color:'#94A3B8', display:'flex', alignItems:'center', gap:5 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="#C5D5E8" strokeWidth="2.5" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        Access restricted to registered users only
      </p>
    </main>
  )
}
