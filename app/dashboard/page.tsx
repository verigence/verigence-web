'use client'
import useSWR from 'swr'
import Link from 'next/link'
import { useVgAuth, usePermissions } from '@/lib/auth-context'
import { ApiError } from '@/lib/api'

interface DashboardStats {
  bookings_today: number; pending_delivery: number
  payment_verify: number; sent_back: number
}
interface Journey {
  id: string; booking_number: string; customer_name: string
  vehicle_model: string; booking_date: string; status: string
}

const STATUS: Record<string, { bg: string; color: string; label: string }> = {
  PENDING_TL:   { bg:'#FAEEDA', color:'#854F0B', label:'Pending w/ TL' },
  UNDER_REVIEW: { bg:'#E6F1FB', color:'#0C447C', label:'Under review'  },
  SENT_BACK:    { bg:'#FCEBEB', color:'#A32D2D', label:'Sent back'     },
  APPROVED:     { bg:'#E1F5EE', color:'#085041', label:'Approved'      },
}

function Badge({ status }: { status: string }) {
  const s = STATUS[status] ?? { bg:'#F4F8FB', color:'#31506E', label: status }
  return (
    <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px',
      borderRadius:99, background:s.bg, color:s.color, whiteSpace:'nowrap' }}>
      {s.label}
    </span>
  )
}

export default function DashboardPage() {
  const { platformToken } = useVgAuth()
  const { can } = usePermissions()

  function fetcher(url: string) {
    if (!platformToken) throw new Error('no token')
    return fetch(`${process.env.NEXT_PUBLIC_AUDIT_CORE_URL}${url}`, {
      headers: { Authorization: `Bearer ${platformToken}` },
    }).then(async r => {
      if (!r.ok) throw new ApiError(r.status, await r.json().catch(()=>({})))
      return r.json()
    })
  }

  const { data: stats } = useSWR<DashboardStats>(
    can('audit.project.read') ? '/v1/dashboard/stats' : null, fetcher, { refreshInterval: 30_000 })
  const { data: journeys } = useSWR<{ journeys: Journey[] }>(
    can('audit.journey.read') ? '/v1/journeys?limit=5' : null, fetcher, { refreshInterval: 30_000 })

  const cards = [
    { n: stats?.bookings_today   ?? '—', label:'Bookings today',   warn:false },
    { n: stats?.pending_delivery ?? '—', label:'Pending delivery', warn:(stats?.pending_delivery??0)>0 },
    { n: stats?.payment_verify   ?? '—', label:'Payment verify',   warn:false },
    { n: stats?.sent_back        ?? '—', label:'Sent back',        warn:(stats?.sent_back??0)>0 },
  ]

  return (
    <div style={{ padding:'20px 24px', fontFamily:'Inter,Arial,Helvetica,sans-serif' }}>
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:18, fontWeight:700, color:'#003A82', margin:0 }}>Dashboard</h1>
        <p style={{ fontSize:12, color:'#31506E', margin:'2px 0 0' }}>
          {new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}
        </p>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
        {cards.map(c => (
          <div key={c.label} style={{ background:'#fff', border:'0.5px solid #E2E8F0',
            borderRadius:10, padding:'14px 16px' }}>
            <div style={{ fontSize:26, fontWeight:700, color:c.warn?'#D97706':'#003A82', lineHeight:1 }}>{c.n}</div>
            <div style={{ fontSize:11, color:'#31506E', marginTop:4 }}>{c.label}</div>
            <span style={{ fontSize:11, color:'#0057B8', fontWeight:600, marginTop:6, display:'block', cursor:'pointer' }}>View all →</span>
          </div>
        ))}
      </div>

      {/* Recent journeys */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <h2 style={{ fontSize:14, fontWeight:700, color:'#003A82', margin:0 }}>Recent journeys</h2>
        {can('audit.journey.create') && (
          <Link href="/journeys/new" style={{ display:'inline-flex', alignItems:'center', gap:5,
            background:'#003A82', color:'#fff', fontSize:12, fontWeight:600,
            padding:'7px 14px', borderRadius:7, textDecoration:'none' }}>
            + New booking
          </Link>
        )}
      </div>

      <div style={{ background:'#fff', border:'0.5px solid #E2E8F0', borderRadius:10, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr>{['Booking ID','Customer','Vehicle','Date','Status',''].map(h=>(
              <th key={h} style={{ textAlign:'left', fontWeight:600, color:'#31506E',
                padding:'9px 14px', background:'#F4F8FB', borderBottom:'0.5px solid #E2E8F0',
                fontSize:10, textTransform:'uppercase', letterSpacing:'0.3px' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {journeys?.journeys.map((j,i)=>(
              <tr key={j.id} style={{ borderBottom:i<(journeys.journeys.length-1)?'0.5px solid #F4F8FB':'none' }}>
                <td style={{ padding:'10px 14px', fontWeight:700, color:'#003A82' }}>{j.booking_number}</td>
                <td style={{ padding:'10px 14px' }}>{j.customer_name}</td>
                <td style={{ padding:'10px 14px', color:'#31506E' }}>{j.vehicle_model}</td>
                <td style={{ padding:'10px 14px', color:'#31506E' }}>{new Date(j.booking_date).toLocaleDateString('en-IN')}</td>
                <td style={{ padding:'10px 14px' }}><Badge status={j.status} /></td>
                <td style={{ padding:'10px 14px' }}>
                  <Link href={`/journeys/${j.id}`} style={{ color:'#0057B8', fontWeight:600, textDecoration:'none' }}>Open</Link>
                </td>
              </tr>
            ))}
            {!journeys && <tr><td colSpan={6} style={{ padding:'20px 14px', textAlign:'center', color:'#94A3B8', fontSize:12 }}>Loading…</td></tr>}
            {journeys?.journeys.length===0 && <tr><td colSpan={6} style={{ padding:'20px 14px', textAlign:'center', color:'#94A3B8', fontSize:12 }}>No journeys yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
