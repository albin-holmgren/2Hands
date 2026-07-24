import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to your 2Hands account to manage your AI agents and automated tasks.',
  alternates: {
    canonical: 'https://2hands.ai/sign-in',
  },
}

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
