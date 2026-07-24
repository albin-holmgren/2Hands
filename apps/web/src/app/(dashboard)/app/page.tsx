import { redirect } from 'next/navigation'

// v3 cutover: the voice-first surface is the application.
// The previous dashboard remains available at /app/legacy.
export default function AppIndex() {
  redirect('/app/v3')
}
