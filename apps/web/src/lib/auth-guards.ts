import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'

/**
 * Database Safety Guards
 * Prevent cross-user data access in multi-tenant environment
 */

interface ResourceWithUserId {
  user_id: string
  [key: string]: unknown
}

/**
 * Verify the authenticated user owns the requested resource
 * Returns 403 Forbidden if user_id doesn't match
 */
export function assertResourceOwnership(
  resource: ResourceWithUserId | null,
  user: User
): NextResponse | null {
  if (!resource) {
    return NextResponse.json(
      { error: 'Not found', code: 'NOT_FOUND' },
      { status: 404 }
    )
  }

  if (resource.user_id !== user.id) {
    return NextResponse.json(
      { error: 'Forbidden', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  return null // Ownership verified
}

/**
 * Check if user owns resource (returns boolean)
 */
export function isResourceOwner(
  resource: ResourceWithUserId | null,
  user: User
): boolean {
  return resource !== null && resource.user_id === user.id
}

/**
 * Add user_id filter to Supabase query builder
 * Ensures queries are always scoped to the authenticated user
 */
export function scopeToUser<T extends { eq: (column: string, value: string) => T }>(
  query: T,
  userId: string
): T {
  return query.eq('user_id', userId)
}

/**
 * Validate that a record belongs to user before update/delete
 * Use this in API routes that modify user data
 */
export async function validateOwnershipBeforeMutation(
  supabase: { from: (table: string) => { select: (columns: string) => { eq: (col: string, val: string) => { single: () => Promise<{ data: ResourceWithUserId | null; error: unknown }> } } } },
  table: string,
  recordId: string,
  user: User
): Promise<{ authorized: boolean; error?: NextResponse }> {
  const { data: record } = await supabase
    .from(table)
    .select('user_id')
    .eq('id', recordId)
    .single()

  if (!record) {
    return {
      authorized: false,
      error: NextResponse.json(
        { error: 'Not found', code: 'NOT_FOUND' },
        { status: 404 }
      ),
    }
  }

  if (record.user_id !== user.id) {
    return {
      authorized: false,
      error: NextResponse.json(
        { error: 'Forbidden', code: 'FORBIDDEN' },
        { status: 403 }
      ),
    }
  }

  return { authorized: true }
}
