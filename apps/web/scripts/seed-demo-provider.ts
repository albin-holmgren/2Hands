// Seed the Demo Account Provider manifest into provider_manifests.
// Run with: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-demo-provider.ts
//
// The manifest is the built-in one from @2hands/account-broker (validated at
// module load against specs/provider-auth-manifest.schema.json).

import { demoAccountProviderManifest, validateProviderManifest } from '@2hands/account-broker'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  console.log(
    'Run with: NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-demo-provider.ts',
  )
  process.exit(1)
}

// Optional override so local/CI runs can point the demo provider pages at a
// different origin without editing the built-in manifest.
const DEMO_PROVIDER_ORIGIN = process.env.DEMO_PROVIDER_ORIGIN?.trim()

const manifest = DEMO_PROVIDER_ORIGIN
  ? {
      ...demoAccountProviderManifest,
      browser: {
        ...demoAccountProviderManifest.browser,
        allowedOrigins: [DEMO_PROVIDER_ORIGIN],
        allowedRedirectOrigins: [DEMO_PROVIDER_ORIGIN],
      },
    }
  : demoAccountProviderManifest

const validation = validateProviderManifest(manifest)
if (!validation.valid) {
  console.error(`❌ Demo provider manifest failed validation: ${validation.errors.join('; ')}`)
  process.exit(1)
}

async function seed() {
  const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`🌱 Seeding ${manifest.providerId} manifest into ${SUPABASE_URL} ...`)
  const { data, error } = await supabase
    .from('provider_manifests')
    .upsert(
      {
        provider_id: manifest.providerId,
        version: manifest.version,
        display_name: manifest.displayName,
        status: manifest.status,
        manifest,
        is_demo: true,
      },
      { onConflict: 'provider_id,version' },
    )
    .select('id, provider_id, version, status')
    .single()

  if (error) {
    console.error(`❌ Upsert failed: ${error.message}`)
    process.exit(1)
  }

  console.log(`✅ Upserted ${data.provider_id} v${data.version} (${data.status}) — ${data.id}`)
}

seed()
