#!/usr/bin/env npx tsx

import {
  evaluateChannelTrust,
  markPendingExternalUser,
  approveExternalUser,
  revokeExternalUser,
  getPendingExternalUserIds,
  getAllowedExternalUserIds,
  supportsChannelTrustProvider,
  applyDefaultChannelTrustConfig,
} from '../../src/lib/security/channel-trust'
import { evaluateCapability } from '../../src/lib/security/capability-profile'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++
    console.log(`  ✓ ${message}`)
  } else {
    failed++
    console.log(`  ✗ ${message}`)
  }
}

console.log('\n🔐 Security Policy Tests\n')

// Channel trust policy tests
console.log('Channel trust policy:')

const pairingUnknown = evaluateChannelTrust({
  config: { channel_access_policy: 'pairing', allowed_external_user_ids: ['U123'] },
  externalUserId: 'U999',
})
assert(pairingUnknown.allowed === false, 'Pairing policy blocks unknown users')
assert(pairingUnknown.requiresPairing === true, 'Pairing policy requires pairing for unknown users')

const allowlistAllowed = evaluateChannelTrust({
  config: { channel_access_policy: 'allowlist', allowed_external_user_ids: ['U123'] },
  externalUserId: 'U123',
})
assert(allowlistAllowed.allowed === true, 'Allowlist policy allows listed users')

const openPolicy = evaluateChannelTrust({
  config: { channel_access_policy: 'open' },
  externalUserId: null,
})
assert(openPolicy.allowed === true, 'Open policy allows inbound users')

const disabledPolicy = evaluateChannelTrust({
  config: { channel_access_policy: 'disabled' },
  externalUserId: 'U123',
})
assert(disabledPolicy.allowed === false, 'Disabled policy blocks inbound users')

const pendingConfig = markPendingExternalUser(
  { channel_access_policy: 'pairing', allowed_external_user_ids: ['U123'], pending_external_user_ids: [] },
  'U999'
)
assert(
  getPendingExternalUserIds(pendingConfig).includes('U999'),
  'Unpaired user is persisted as pending candidate'
)

const approvedConfig = approveExternalUser(pendingConfig, 'U999')
assert(
  getAllowedExternalUserIds(approvedConfig).includes('U999'),
  'Approving candidate adds user to allowlist'
)
assert(
  !getPendingExternalUserIds(approvedConfig).includes('U999'),
  'Approving candidate removes user from pending list'
)

const revokedConfig = revokeExternalUser(approvedConfig, 'U999')
assert(
  !getAllowedExternalUserIds(revokedConfig).includes('U999'),
  'Revoking candidate removes user from allowlist'
)

assert(supportsChannelTrustProvider('slack') === true, 'Slack provider supports channel trust controls')
assert(supportsChannelTrustProvider('discord') === true, 'Discord provider supports channel trust controls')
assert(supportsChannelTrustProvider('openai') === false, 'Non-channel providers do not expose channel trust controls')

const discordDefaults = applyDefaultChannelTrustConfig({}, 'discord')
assert(
  discordDefaults.channel_access_policy === 'pairing',
  'Channel-trust providers default to pairing policy'
)

const openAiDefaults = applyDefaultChannelTrustConfig({}, 'openai')
assert(
  typeof openAiDefaults.channel_access_policy === 'undefined',
  'Non-channel providers do not get a default channel policy'
)

// Capability policy tests
console.log('\nCapability profile:')

const fullProfile = evaluateCapability({
  config: { capability_profile: 'full' },
  toolName: 'gmail_send_message',
})
assert(fullProfile.allowed === true, 'Full profile allows all tools')

const readOnlyBlocked = evaluateCapability({
  config: { capability_profile: 'read_only' },
  toolName: 'slack_send_message',
})
assert(readOnlyBlocked.allowed === false, 'Read-only profile blocks write-like tools')

const readOnlyAllowed = evaluateCapability({
  config: { capability_profile: 'read_only' },
  toolName: 'gmail_list_messages',
})
assert(readOnlyAllowed.allowed === true, 'Read-only profile allows read-like tools')

const restrictedBlocked = evaluateCapability({
  config: { capability_profile: 'restricted', allowed_tools: ['gmail_list_messages'] },
  toolName: 'slack_send_message',
})
assert(restrictedBlocked.allowed === false, 'Restricted profile blocks tools not in allowlist')

const restrictedAllowed = evaluateCapability({
  config: { capability_profile: 'restricted', allowed_tools: ['gmail_list_messages'] },
  toolName: 'gmail_list_messages',
})
assert(restrictedAllowed.allowed === true, 'Restricted profile allows tools in allowlist')

console.log('\n' + '='.repeat(50))
console.log(`Results: ${passed} passed, ${failed} failed`)
console.log('='.repeat(50))

if (failed > 0) {
  process.exit(1)
}

process.exit(0)
