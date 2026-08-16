'use client'
/**
 * Registration received — agreed wireframe Screen 3
 * Green check · "Registration received" · admin contact note · confirmation email note · Back to sign in
 */
import Image from 'next/image'
import Link from 'next/link'

export default function RegistrationReceivedPage() {
  return (
    <main style={{ minHeight:'100dvh', background:'#fff', display:'flex',
      flexDirection:'column', alignItems:'center', justifyContent:'center',
      padding:'40px 24px', fontFamily:'Inter,Arial,Helvetica,sans-serif' }}>

      <div style={{ width: 200, marginBottom:6 }}>
        <Image src="/brand/svg/verigence-logo.svg" alt="Verigence"
          width={200} height={50} priority style={{ width:'100%', height:'auto' }} />
      </div>

      <div style={{ width:'100%', maxWidth:400, textAlign:'center',
        padding:'40px 32px', border:'0.5px solid #E2E8F0', borderRadius:16, background:'#fff' }}>

        {/* Green check circle */}
        <div style={{ width:64, height:64, borderRadius:'50%', background:'#E1F5EE',
          display:'flex', alignItems:'center', justifyContent:'center',
          margin:'0 auto 20px' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
            stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </div>

        <h1 style={{ fontSize:18, fontWeight:700, color:'#003A82', margin:'0 0 12px' }}>
          Registration received
        </h1>

        <p style={{ fontSize:13, color:'#31506E', margin:'0 0 8px', lineHeight:1.6 }}>
          Your registration request has been submitted. Please contact your system administrator to complete the approval process.
        </p>

        <p style={{ fontSize:12, color:'#94A3B8', margin:'0 0 28px', lineHeight:1.6 }}>
          A confirmation email has been sent to your registered email address.
        </p>

        <Link href="/sign-in" style={{ display:'inline-block',
          background:'#003A82', color:'#fff', textDecoration:'none',
          padding:'10px 24px', borderRadius:8, fontSize:13, fontWeight:600 }}>
          Back to sign in
        </Link>
      </div>
    </main>
  )
}
