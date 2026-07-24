import { redirect } from 'next/navigation'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  redirect('/app')
}
