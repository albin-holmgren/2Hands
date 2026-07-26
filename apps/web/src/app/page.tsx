import { redirect } from 'next/navigation'

import { APP_HOME } from '@/lib/auth/redirect-paths'

/**
 * v3 cutover: 2hands.ai IS the application — there is no marketing landing.
 * (The previous landing page is archived, unrouted, at
 * components/marketing/landing-page.tsx.unused.)
 *
 * Everyone lands in the app, signed in or not. The shell is browsable without
 * a session — you see the real product, and the first action that needs a
 * backend hands you to sign-in with the app as the return destination.
 * Bouncing anonymous visitors straight to a login form made the front door
 * look like a wall.
 *
 * Because the destination no longer depends on who is asking, this does not
 * read the session at all, which spares every root request a Supabase
 * round-trip.
 */
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

  redirect(APP_HOME)
}
