import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign Up',
  description: 'Create your free 2Hands account and start automating tasks with AI agents today.',
  alternates: {
    canonical: 'https://2hands.ai/signup',
  },
  openGraph: {
    title: 'Get Started with 2Hands',
    description: 'Create your free account and automate tasks with AI agents.',
  },
}

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
