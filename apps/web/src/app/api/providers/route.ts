import { NextRequest } from 'next/server'
import { resolveV3Scope, success, failureFromError } from '@/lib/v3/route-helpers'
import { listLatestProviderManifests } from '@/lib/v3/auth-runs'

/** List provider manifests — latest version per provider_id, with status. */
export async function GET(request: NextRequest) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const manifests = await listLatestProviderManifests()
    const providers = manifests.map((row) => ({
      providerId: row.provider_id,
      displayName: row.display_name,
      version: row.version,
      status: row.status,
      isDemo: row.is_demo,
      updatedAt: row.updated_at,
    }))
    return success({ providers }, scope.requestId)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
