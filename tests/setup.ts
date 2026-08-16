import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  usePathname:   () => '/dashboard',
  useRouter:     () => ({ push: vi.fn(), replace: vi.fn() }),
  redirect:      vi.fn(),
}))

// Mock Next.js Image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return Object.assign(document.createElement('img'), { src: props.src, alt: props.alt })
  },
}))

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => {
    const a = document.createElement('a')
    a.href = href
    return a
  },
}))
