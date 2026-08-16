'use client'
import { VgAuthProvider, useVgAuth } from '@/lib/auth-context'
import Sidebar from '@/components/shell/sidebar'

function Shell({ children }: { children: React.ReactNode }) {
  const { loading, error } = useVgAuth()
  if (loading) return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center',
      justifyContent:'center', background:'#F4F8FB', fontSize:13, color:'#31506E',
      fontFamily:'Inter,Arial,Helvetica,sans-serif' }}>Loading Verigence…</div>
  )
  if (error) return (
    <div style={{ minHeight:'100dvh', display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center', background:'#F4F8FB',
      fontFamily:'Inter,Arial,Helvetica,sans-serif', gap:8 }}>
      <p style={{ fontWeight:700, color:'#DC2626' }}>Session error</p>
      <p style={{ fontSize:12, color:'#31506E' }}>{error}</p>
    </div>
  )
  return (
    <div style={{ display:'flex', minHeight:'100dvh', background:'#F4F8FB' }}>
      <Sidebar />
      <main style={{ flex:1, overflow:'auto' }}>{children}</main>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <VgAuthProvider><Shell>{children}</Shell></VgAuthProvider>
}
