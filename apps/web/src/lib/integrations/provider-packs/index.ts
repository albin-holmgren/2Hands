import type { ProviderPack } from '../types'
import { gmailProviderPack } from './gmail'
import { slackProviderPack } from './slack'
import { outlookProviderPack } from './outlook'
import { teamsProviderPack } from './teams'
import { hubspotProviderPack } from './hubspot'
import { shopifyProviderPack } from './shopify'
import { notionProviderPack } from './notion'
import { openaiProviderPack } from './openai'
import { perplexityProviderPack } from './perplexity'
import { firecrawlProviderPack } from './firecrawl'
import { elevenlabsProviderPack } from './elevenlabs'
import { attioProviderPack } from './attio'
import { githubProviderPack } from './github'

export const providerPacks: Record<string, ProviderPack> = {
  gmail: gmailProviderPack,
  slack: slackProviderPack,
  outlook: outlookProviderPack,
  teams: teamsProviderPack,
  hubspot: hubspotProviderPack,
  shopify: shopifyProviderPack,
  notion: notionProviderPack,
  openai: openaiProviderPack,
  perplexity: perplexityProviderPack,
  firecrawl: firecrawlProviderPack,
  elevenlabs: elevenlabsProviderPack,
  attio: attioProviderPack,
  github: githubProviderPack,
}

export function getProviderPack(providerId: string): ProviderPack | null {
  return providerPacks[providerId] || null
}

export function listProviderPacks(): ProviderPack[] {
  return Object.values(providerPacks)
}

export {
  gmailProviderPack, slackProviderPack, outlookProviderPack, teamsProviderPack,
  hubspotProviderPack, shopifyProviderPack, notionProviderPack,
  openaiProviderPack, perplexityProviderPack, firecrawlProviderPack, elevenlabsProviderPack,
  attioProviderPack, githubProviderPack,
}

export { GITHUB_TOOLS } from './github-tools'
export { VERCEL_TOOLS } from './vercel-tools'
export { attioTools } from './attio-tools'
