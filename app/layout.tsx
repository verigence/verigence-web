import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title:       'Verigence',
  description: 'Audit · Governance · Intelligence',
  icons: { icon: '/brand/icons/favicon.svg', apple: '/brand/icons/app-icon.svg' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
}
