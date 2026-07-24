import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// v3 cutover: 2hands.ai IS the application. No marketing landing —
// authenticated users land in the voice-first surface, everyone else at
// sign-in. (The previous landing page is archived, unrouted, at
// components/marketing/landing-page.tsx.unused.)
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams

  // Preserve OAuth deep links that land on the root with a code.
  if (params.code) {
    const qs = new URLSearchParams()
    qs.set('code', String(params.code))
    if (params.next) qs.set('next', String(params.next))
    redirect(`/auth/callback?${qs.toString()}`)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  redirect(user ? '/app/v3' : '/sign-in')
}
