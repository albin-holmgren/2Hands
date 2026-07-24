import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()

const checks = [
  {
    // Removed with the Paperspace VM plane; kept optional so the guard
    // still bites if the app returns.
    file: 'apps/vm-server/src/index.ts',
    optional: true,
    banned: "VM_SECRET || 'development-secret-change-in-production'",
    message: 'VM server must not use insecure VM_SECRET fallback.',
  },
  {
    file: 'apps/web/src/lib/computer-use/semantic-browser-tools.ts',
    banned: "VM_SECRET || 'development-secret-change-in-production'",
    message: 'Web semantic browser tools must not use insecure VM_SECRET fallback.',
  },
  {
    file: 'apps/web/src/app/api/integrations/connections/route.ts',
    banned: 'store api_key in config directly (fallback)',
    message: 'Integration API key route must not allow plaintext fallback storage.',
  },
]

const failures = []

for (const check of checks) {
  const absolutePath = path.join(repoRoot, check.file)
  if (!fs.existsSync(absolutePath)) {
    if (!check.optional) {
      failures.push(`Missing file: ${check.file}`)
    }
    continue
  }

  const content = fs.readFileSync(absolutePath, 'utf8')
  if (content.includes(check.banned)) {
    failures.push(`${check.message} Found banned pattern in ${check.file}`)
  }
}

if (failures.length > 0) {
  console.error('Security fallback guard failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('Security fallback guard passed.')
