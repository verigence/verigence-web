import type { Metadata } from 'next'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: 'Verigence',
  description: 'Audit · Governance · Intelligence',
  icons: { icon: '/brand/icons/favicon.svg', apple: '/brand/icons/app-icon.svg' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
