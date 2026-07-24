/**
 * Demo Account Provider — shared route-handler helpers (POST-redirect-GET).
 */
import { NextRequest, NextResponse } from 'next/server'

/** 303 See Other to a same-origin path (or an absolute URL for the
 * `redirect_wrong_origin` injection-test scenario). */
export function seeOther(request: NextRequest, pathOrUrl: string): NextResponse {
  const url = pathOrUrl.startsWith('http')
    ? new URL(pathOrUrl)
    : new URL(pathOrUrl, request.nextUrl.origin)
  return NextResponse.redirect(url, 303)
}

/** Parse the POST body; an absent/unparseable body yields an empty FormData so
 * each route's own field validation decides the outcome. */
export async function readForm(request: NextRequest): Promise<FormData> {
  try {
    return await request.formData()
  } catch {
    return new FormData()
  }
}

export function formString(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}
