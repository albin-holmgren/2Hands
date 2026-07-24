import { redirect } from 'next/navigation'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>
}) {
  // Redirect to unified login page, preserving referral code
  const params = await searchParams
  const ref = params?.ref
  redirect(ref ? `/sign-in?ref=${ref}` : '/sign-in')
}
