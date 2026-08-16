'use client'
/**
 * Sign-up screen — agreed wireframe Screen 2
 *
 * Fields (top to bottom):
 *   1. Onboarding key  — visually separated at top (invite-gated access)
 *   2. First name / Last name
 *   3. Email
 *   4. Mobile (+91 prefix)
 *   5. Password / Confirm password
 *   6. Terms checkbox
 *   7. "Register" button
 *
 * On submit → POST /api/auth/register → Security registration endpoint
 * On success → /registration-received
 */
import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface FormState {
  onboardingKey: string
  firstName: string
  lastName: string
  email: string
  mobile: string
  password: string
  confirmPassword: string
  terms: boolean
}

interface FieldError { [k: string]: string }

export default function SignUpPage() {
  const router = useRouter()
  const [form, setForm] = useState<FormState>({
    onboardingKey:'', firstName:'', lastName:'',
    email:'', mobile:'', password:'', confirmPassword:'', terms: false,
  })
  const [errors, setErrors] = useState<FieldError>({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')

  function set(field: keyof FormState, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => { const n = {...e}; delete n[field]; return n })
  }

  function validate(): boolean {
    const e: FieldError = {}
    if (!form.onboardingKey.trim()) e.onboardingKey = 'Onboarding key is required'
    if (!form.firstName.trim())    e.firstName    = 'First name is required'
    if (!form.lastName.trim())     e.lastName     = 'Last name is required'
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = 'Valid email address is required'
    if (!form.mobile.trim() || !/^\d{10}$/.test(form.mobile.replace(/\s/g,'')))
      e.mobile = 'Valid 10-digit mobile number is required'
    if (!form.password || form.password.length < 8)
      e.password = 'Password must be at least 8 characters'
    if (form.password !== form.confirmPassword)
      e.confirmPassword = 'Passwords do not match'
    if (!form.terms)
      e.terms = 'You must accept the terms to continue'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setServerError('')
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboarding_key: form.onboardingKey,
          first_name:     form.firstName,
          last_name:      form.lastName,
          email:          form.email,
          mobile:         `+91${form.mobile}`,
          password:       form.password,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string; detail?: string }
        setServerError(body.detail ?? body.error ?? `Registration failed (${res.status})`)
        return
      }
      router.push('/registration-received')
    } catch {
      setServerError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle = (field: string): React.CSSProperties => ({
    width: '100%', height: 40, padding: '0 12px',
    border: `1px solid ${errors[field] ? '#DC2626' : '#E2E8F0'}`,
    borderRadius: 8, fontSize: 14, fontFamily: 'Inter,Arial,Helvetica,sans-serif',
    outline: 'none', background: '#F4F8FB', color: '#0F172A',
    boxSizing: 'border-box',
  })

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: '#31506E',
    display: 'block', marginBottom: 4,
  }

  const errorStyle: React.CSSProperties = {
    fontSize: 11, color: '#DC2626', marginTop: 3,
  }

  return (
    <main style={{ minHeight:'100dvh', background:'#fff', display:'flex',
      flexDirection:'column', alignItems:'center', justifyContent:'center',
      padding:'40px 24px', fontFamily:'Inter,Arial,Helvetica,sans-serif' }}>

      {/* Logo */}
      <div style={{ width: 240, marginBottom: 6 }}>
        <Image src="/brand/svg/verigence-logo.svg" alt="Verigence"
          width={240} height={60} priority style={{ width:'100%', height:'auto' }} />
      </div>

      {/* Tagline */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:28,
        fontSize:10, fontWeight:600, letterSpacing:'0.15em', color:'#31506E', textTransform:'uppercase' }}>
        <span>Audit</span>
        <span style={{ width:4, height:4, borderRadius:'50%', background:'#00AFA8', display:'inline-block' }} />
        <span>Governance</span>
        <span style={{ width:4, height:4, borderRadius:'50%', background:'#00AFA8', display:'inline-block' }} />
        <span>Intelligence</span>
      </div>

      <div style={{ width:'100%', maxWidth:440, background:'#fff',
        border:'0.5px solid #E2E8F0', borderRadius:16, padding:'28px 32px' }}>

        <h1 style={{ fontSize:17, fontWeight:700, color:'#003A82', margin:'0 0 20px' }}>
          Create your account
        </h1>

        {serverError && (
          <div style={{ background:'#FCEBEB', border:'0.5px solid #F09595',
            borderRadius:8, padding:'10px 14px', fontSize:13, color:'#A32D2D', marginBottom:16 }}>
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>

          {/* Onboarding key — visually separated */}
          <div style={{ background:'#F4F8FB', borderRadius:8, padding:'14px 16px', marginBottom:20,
            border:'0.5px solid #E2E8F0' }}>
            <label style={labelStyle} htmlFor="onboardingKey">
              Onboarding key
            </label>
            <input id="onboardingKey" type="text" autoComplete="off"
              placeholder="Enter your invitation key"
              value={form.onboardingKey}
              onChange={e => set('onboardingKey', e.target.value)}
              style={inputStyle('onboardingKey')} />
            {errors.onboardingKey && <p style={errorStyle}>{errors.onboardingKey}</p>}
            <p style={{ fontSize:11, color:'#94A3B8', marginTop:6 }}>
              Provided by your system administrator.
            </p>
          </div>

          {/* Name row */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
            <div>
              <label style={labelStyle} htmlFor="firstName">First name</label>
              <input id="firstName" type="text" autoComplete="given-name"
                placeholder="Raj"
                value={form.firstName}
                onChange={e => set('firstName', e.target.value)}
                style={inputStyle('firstName')} />
              {errors.firstName && <p style={errorStyle}>{errors.firstName}</p>}
            </div>
            <div>
              <label style={labelStyle} htmlFor="lastName">Last name</label>
              <input id="lastName" type="text" autoComplete="family-name"
                placeholder="Sharma"
                value={form.lastName}
                onChange={e => set('lastName', e.target.value)}
                style={inputStyle('lastName')} />
              {errors.lastName && <p style={errorStyle}>{errors.lastName}</p>}
            </div>
          </div>

          {/* Email */}
          <div style={{ marginBottom:14 }}>
            <label style={labelStyle} htmlFor="email">Email address</label>
            <input id="email" type="email" autoComplete="email"
              placeholder="raj.sharma@dealership.in"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              style={inputStyle('email')} />
            {errors.email && <p style={errorStyle}>{errors.email}</p>}
          </div>

          {/* Mobile */}
          <div style={{ marginBottom:14 }}>
            <label style={labelStyle} htmlFor="mobile">Mobile number</label>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <div style={{ height:40, padding:'0 10px', background:'#F4F8FB',
                border:'1px solid #E2E8F0', borderRadius:8, display:'flex',
                alignItems:'center', fontSize:14, color:'#31506E', whiteSpace:'nowrap',
                flexShrink:0 }}>
                🇮🇳 +91
              </div>
              <input id="mobile" type="tel" autoComplete="tel-national"
                placeholder="9876543210"
                value={form.mobile}
                onChange={e => set('mobile', e.target.value.replace(/\D/g,'').slice(0,10))}
                style={{ ...inputStyle('mobile') }} />
            </div>
            {errors.mobile && <p style={errorStyle}>{errors.mobile}</p>}
          </div>

          {/* Password */}
          <div style={{ marginBottom:14 }}>
            <label style={labelStyle} htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="new-password"
              placeholder="Minimum 8 characters"
              value={form.password}
              onChange={e => set('password', e.target.value)}
              style={inputStyle('password')} />
            {errors.password && <p style={errorStyle}>{errors.password}</p>}
          </div>

          {/* Confirm password */}
          <div style={{ marginBottom:18 }}>
            <label style={labelStyle} htmlFor="confirmPassword">Confirm password</label>
            <input id="confirmPassword" type="password" autoComplete="new-password"
              placeholder="Repeat your password"
              value={form.confirmPassword}
              onChange={e => set('confirmPassword', e.target.value)}
              style={inputStyle('confirmPassword')} />
            {errors.confirmPassword && <p style={errorStyle}>{errors.confirmPassword}</p>}
          </div>

          {/* Terms */}
          <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:20 }}>
            <input id="terms" type="checkbox" checked={form.terms}
              onChange={e => set('terms', e.target.checked)}
              style={{ marginTop:2, width:16, height:16, accentColor:'#003A82', flexShrink:0 }} />
            <label htmlFor="terms" style={{ fontSize:12, color:'#31506E', cursor:'pointer', lineHeight:'1.5' }}>
              I accept the{' '}
              <a href="#" style={{ color:'#003A82', fontWeight:600 }}>terms of service</a>
              {' '}and{' '}
              <a href="#" style={{ color:'#003A82', fontWeight:600 }}>privacy policy</a>
            </label>
          </div>
          {errors.terms && <p style={{ ...errorStyle, marginTop:-14, marginBottom:12 }}>{errors.terms}</p>}

          {/* Submit */}
          <button type="submit" disabled={submitting}
            style={{ width:'100%', height:42, background: submitting ? '#94A3B8' : '#003A82',
              color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600,
              cursor: submitting ? 'not-allowed' : 'pointer', fontFamily:'Inter,Arial,Helvetica,sans-serif' }}>
            {submitting ? 'Submitting…' : 'Register'}
          </button>
        </form>

        <p style={{ textAlign:'center', fontSize:12, color:'#31506E', marginTop:16 }}>
          Already registered?{' '}
          <Link href="/sign-in" style={{ color:'#003A82', fontWeight:600 }}>Sign in</Link>
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
