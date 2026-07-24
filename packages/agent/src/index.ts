/**
 * @2hands/agent — specialist agent adapter contracts + deterministic demo
 * adapters (Demo Codex implementer, Demo Claude reviewer). Real Codex and
 * Claude adapters plug in behind the same contracts, gated by configuration
 * and the Account Broker.
 */
export * from './types'
export { DemoCodexAdapter, type DemoPatch } from './demo-codex'
export { DemoClaudeAdapter, type DemoReview } from './demo-claude'
