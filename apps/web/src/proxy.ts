import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, robots.txt, sitemap.xml, manifest.json
     * - Static assets (svg, png, jpg, etc.)
     * - API routes (they handle their own auth and return JSON 401)
     * - monitoring (Sentry tunnel)
     */
    '/((?!_next/static|_next/image|favicon.*|robots\\.txt|sitemap\\.xml|manifest\\.json|monitoring|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
