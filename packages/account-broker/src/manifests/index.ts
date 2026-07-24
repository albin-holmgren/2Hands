/**
 * Built-in provider manifest registry. Every manifest is validated at module
 * load; an invalid built-in manifest is a build bug and fails loudly.
 */
import { validateProviderManifest, type ProviderAuthManifest } from '../manifest'
import { demoAccountProviderManifest } from './demo-account-provider'

export { demoAccountProviderManifest }

const BUILT_IN_MANIFESTS: ProviderAuthManifest[] = [demoAccountProviderManifest]

function buildRegistry(manifests: ProviderAuthManifest[]): ReadonlyMap<string, ProviderAuthManifest> {
  const registry = new Map<string, ProviderAuthManifest>()
  for (const candidate of manifests) {
    const result = validateProviderManifest(candidate)
    if (!result.valid) {
      throw new Error(
        `Built-in provider manifest failed validation: ${result.errors.join('; ')}`,
      )
    }
    if (registry.has(result.manifest.providerId)) {
      throw new Error(`Duplicate built-in provider manifest: ${result.manifest.providerId}`)
    }
    registry.set(result.manifest.providerId, result.manifest)
  }
  return registry
}

/** providerId -> validated manifest. */
export const PROVIDER_MANIFEST_REGISTRY: ReadonlyMap<string, ProviderAuthManifest> =
  buildRegistry(BUILT_IN_MANIFESTS)

export function getProviderManifest(providerId: string): ProviderAuthManifest | undefined {
  return PROVIDER_MANIFEST_REGISTRY.get(providerId)
}
