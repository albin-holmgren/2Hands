/**
 * Skill Bundles — Role-based skill sets for zero-config onboarding
 *
 * When a user creates a workspace, they pick a role/use-case and the right
 * skills are auto-enabled. Users never have to browse or configure skills —
 * they just get the capabilities that match their work.
 */

export interface SkillBundle {
  id: string
  name: string
  description: string
  icon: string
  skills: string[] // skill names to enable
}

export const SKILL_BUNDLES: SkillBundle[] = [
  {
    id: 'startup-founder',
    name: 'Startup Founder',
    description: 'Everything you need to build, grow, and fundraise',
    icon: '🚀',
    skills: [
      'deep-research',
      'competitor-analysis',
      'pitch-deck',
      'financial-model',
      'pricing-strategy',
      'growth-experiment',
      'customer-interview',
      'content-strategy',
      'onboarding-flow',
      'weekly-standup',
      'skill-creator',
    ],
  },
  {
    id: 'marketer',
    name: 'Marketing & Growth',
    description: 'Content, SEO, social media, outreach, and analytics',
    icon: '📈',
    skills: [
      'deep-research',
      'competitor-analysis',
      'content-strategy',
      'seo-audit',
      'email-copywriting',
      'social-media-post',
      'outbound-sequence',
      'brand-voice',
      'data-analysis',
      'growth-experiment',
      'skill-creator',
    ],
  },
  {
    id: 'developer',
    name: 'Developer & Engineering',
    description: 'Code review, debugging, testing, API design, and incident response',
    icon: '💻',
    skills: [
      'code-review',
      'debug-systematic',
      'api-design',
      'test-generator',
      'doc-writer',
      'incident-response',
      'process-automation',
      'deep-research',
      'skill-creator',
    ],
  },
  {
    id: 'product-manager',
    name: 'Product Manager',
    description: 'User stories, roadmaps, customer research, and team updates',
    icon: '📋',
    skills: [
      'user-stories',
      'customer-interview',
      'onboarding-flow',
      'growth-experiment',
      'data-analysis',
      'meeting-prep',
      'weekly-standup',
      'competitor-analysis',
      'deep-research',
      'doc-writer',
      'skill-creator',
    ],
  },
  {
    id: 'sales',
    name: 'Sales & Business Development',
    description: 'Outreach, pitch decks, competitor intel, and CRM workflows',
    icon: '🤝',
    skills: [
      'outbound-sequence',
      'email-copywriting',
      'pitch-deck',
      'competitor-analysis',
      'meeting-prep',
      'deep-research',
      'customer-interview',
      'pricing-strategy',
      'skill-creator',
    ],
  },
  {
    id: 'all-rounder',
    name: 'All Skills',
    description: 'Enable everything — for power users who want full capabilities',
    icon: '⚡',
    skills: [], // empty = enable all system skills
  },
]

/**
 * Get the recommended skill names for a bundle.
 * If skills array is empty (all-rounder), returns null to indicate "enable all".
 */
export function getBundleSkillNames(bundleId: string): string[] | null {
  const bundle = SKILL_BUNDLES.find(b => b.id === bundleId)
  if (!bundle) return null
  if (bundle.skills.length === 0) return null // all skills
  return bundle.skills
}
