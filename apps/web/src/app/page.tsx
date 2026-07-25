import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// v3 cutover: 2hands.ai IS the application — there is no marketing landing.
// Signed-in visitors are sent to the app by middleware before this renders;
// this server fallback keeps the same contract, and signed-out visitors are
// handed to sign-in with the app as their post-login destination so they
// always end up inside the product, never on a dead-end page.
// (The previous landing page is archived, unrouted, at
// components/marketing/landing-page.tsx.unused.)
const APP_HOME = '/app/v3'

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

  redirect(user ? APP_HOME : `/sign-in?next=${encodeURIComponent(APP_HOME)}`)
}
