'use client'
/**
 * Sidebar — approved logo on white (§6), Teal active indicator (§9)
 * Permission-aware nav from default_role_templates.json permissions
 */
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePermissions } from '@/lib/auth-context'
import { useClerk } from '@clerk/nextjs'

const NAV = [
  { href:'/dashboard',    label:'Dashboard',    permission:'audit.project.read'   },
  { href:'/journeys',     label:'Journeys',     permission:'audit.journey.read'   },
  { href:'/deliveries',   label:'Deliveries',   permission:'audit.delivery.read'  },
  { href:'/payments',     label:'Payments',     permission:'audit.payment.read'   },
  { href:'/observations', label:'Observations', permission:'audit.finding.read'   },
  { href:'/escalations',  label:'Escalations',  permission:'audit.escalation.read'},
  { href:'/daily-ops',    label:'Daily ops',    permission:'audit.daily_ops.read' },
  { href:'/analytics',    label:'Analytics',    permission:'audit.analytics.read' },
  { href:'/masters',      label:'Masters',      permission:'audit.master.read'    },
] as const

export default function Sidebar() {
  const pathname  = usePathname()
  const { can }   = usePermissions()
  const { signOut } = useClerk()

  return (
    <aside style={{ width:200, background:'#fff', borderRight:'0.5px solid #E2E8F0',
      display:'flex', flexDirection:'column', flexShrink:0,
      fontFamily:'Inter,Arial,Helvetica,sans-serif' }}>

      {/* Approved logo on white — no modification */}
      <div style={{ padding:'16px 14px 14px', borderBottom:'0.5px solid #E2E8F0' }}>
        <Image src="/brand/svg/verigence-logo.svg" alt="Verigence"
          width={140} height={35} priority style={{ width:140, height:'auto', display:'block' }} />
      </div>

      <nav style={{ flex:1, padding:'8px 0', overflowY:'auto' }}>
        {NAV.filter(i => can(i.permission)).map(item => {
          const active = pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href} style={{
              display:'flex', alignItems:'center', gap:8, padding:'9px 14px',
              fontSize:12, fontWeight:active?700:500,
              color:active?'#003A82':'#31506E',
              background:active?'#F4F8FB':'transparent',
              borderLeft:active?'3px solid #00AFA8':'3px solid transparent',
              textDecoration:'none',
            }}>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div style={{ padding:'10px 14px', borderTop:'0.5px solid #E2E8F0',
        display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ width:28, height:28, borderRadius:'50%', background:'#E6F1FB',
          color:'#003A82', display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:10, fontWeight:700, flexShrink:0 }}>VG</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:11, fontWeight:600, color:'#003A82' }}>My account</div>
        </div>
        <button onClick={() => signOut({ redirectUrl:'/sign-in' })}
          title="Sign out" aria-label="Sign out"
          style={{ background:'none', border:'none', cursor:'pointer',
            fontSize:16, color:'#94A3B8', padding:0 }}>⏻</button>
      </div>
    </aside>
  )
}
