'use client'
/**
 * Sign-in page — agreed wireframe:
 * White bg · Approved verigence-logo.svg (on white §6) · Tagline · Clerk SignIn
 *
 * After Clerk auth → redirect /dashboard
 * Dashboard layout calls POST /api/auth/exchange → platform JWT
 */
import { SignIn } from '@clerk/nextjs'
import Image from 'next/image'

export default function SignInPage() {
  return (
    <main style={{
      minHeight:'100dvh', background:'#fff', display:'flex',
      flexDirection:'column', alignItems:'center', justifyContent:'center',
      padding:'40px 24px', fontFamily:'Inter,Arial,Helvetica,sans-serif',
    }}>
      {/* Approved logo on white — §6 Light surfaces */}
      <div style={{ width:300, marginBottom:6 }}>
        <Image src="/brand/svg/verigence-logo.svg" alt="Verigence"
          width={300} height={75} priority style={{ width:'100%', height:'auto' }} />
      </div>

      {/* Tagline */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:40,
        fontSize:11, fontWeight:600, letterSpacing:'0.15em',
        color:'#31506E', textTransform:'uppercase' }}>
        <span>Audit</span>
        <span style={{ width:5, height:5, borderRadius:'50%', background:'#00AFA8', display:'inline-block' }} />
        <span>Governance</span>
        <span style={{ width:5, height:5, borderRadius:'50%', background:'#00AFA8', display:'inline-block' }} />
        <span>Intelligence</span>
      </div>

      <SignIn
        routing="hash"
        fallbackRedirectUrl="/dashboard"
        appearance={{
          layout: { logoPlacement:'none' },
          variables: {
            colorPrimary:         '#003A82',
            colorBackground:      '#FFFFFF',
            colorInputBackground: '#F4F8FB',
            borderRadius:         '8px',
            fontFamily:           'Inter,Arial,Helvetica,sans-serif',
            fontSize:             '14px',
          },
          elements: {
            card:                 'shadow-none border border-[#E2E8F0] rounded-2xl',
            headerTitle:          'hidden',
            headerSubtitle:       'hidden',
            socialButtonsBlockButton: 'hidden',
            dividerRow:           'hidden',
            formButtonPrimary:    'bg-[#003A82] hover:bg-[#0057B8] text-white font-semibold rounded-lg py-3',
            footerActionLink:     'text-[#003A82] font-semibold',
          },
        }}
      />

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
