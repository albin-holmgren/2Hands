/**
 * System Skills — Built-in skill definitions for 2Hands
 *
 * These are pre-installed for every workspace and can be enabled/disabled
 * but not deleted. They serve as both useful defaults and examples.
 */

import type { SkillCategory } from './skill-registry'

export interface SystemSkillDefinition {
  name: string
  description: string
  instructions: string
  category: SkillCategory
  icon: string
  allowed_tools: string[]
}

export const SYSTEM_SKILLS: SystemSkillDefinition[] = [
  {
    name: 'deep-research',
    description: 'Research topics thoroughly with source verification and synthesis. Use this skill whenever the user mentions research, "look into", "find out about", "what do we know about", "investigate", "dig into", analysis of a topic, fact-checking, or needs any comprehensive information gathering — even if they don\'t explicitly say "research".',
    category: 'research',
    icon: '🔍',
    allowed_tools: ['web_search', 'analyze_url', 'manage_memory_box'],
    instructions: `# Deep Research

## Purpose
Research topics thoroughly with source verification, cross-referencing, and honest confidence assessment.

## Phase 1 — Clarify
Before searching, identify if any of these are unclear:
- What specific angle or question matters most?
- How current does the information need to be?
- What will the output be used for (decision, presentation, reference)?
If the request is clear enough, skip to Phase 2 without asking.

## Phase 2 — Discovery
- Run 2-3 targeted web_search queries covering different angles of the topic
- Aim to surface 6-10 distinct sources across primary, secondary, and specialist categories
- Note any major disagreements or contradictions between sources immediately

## Phase 3 — Deep Reading
- Use analyze_url on the 3-4 most authoritative or data-rich sources found in Phase 2
- For each source record: key claims, evidence quality, publication date, and potential bias
- Cross-reference: does source B confirm, contradict, or add nuance to source A?

## Phase 4 — Synthesis & Verification
- Assign a confidence level to each major finding:
  - ✅ **High** — confirmed by 2+ independent primary sources
  - ⚠️ **Medium** — single credible source or consistent secondary sources
  - ❓ **Low** — one weak source, conflicting evidence, or inference only
- Flag any claim that could not be verified with the available tools

## Phase 5 — Store & Report
- Save a concise summary to a memory box named "Research" using manage_memory_box
- Deliver the structured report below

## Output Format
- **Executive Summary** — 3-5 key bullet points, each with a confidence marker
- **Detailed Findings** — Organized by sub-topic with [Source](url) citations
- **Confidence Overview** — Brief table: claim → confidence level → evidence
- **Sources** — Annotated list of authoritative URLs
- **Knowledge Gaps** — Specific questions that could not be answered and why
- **Suggested Next Steps** — What to research further if needed

## Quality Standards
- Never present low-confidence findings as facts
- Cite every significant claim with [Source](url)
- Note publication dates for time-sensitive information
- Cross-reference at least 2 sources for any claim marked High confidence`,
  },
  {
    name: 'competitor-analysis',
    description: 'Research and compare competitors — pricing, features, positioning, market share. Use this skill whenever the user mentions competitors, rival companies, market analysis, competitive landscape, "what are others doing", pricing comparison, feature comparison, SWOT analysis, market positioning, or wants to understand their competitive environment — even if they just name a competitor.',
    category: 'research',
    icon: '🏆',
    allowed_tools: ['web_search', 'analyze_url', 'manage_memory_box', 'manage_board'],
    instructions: `# Competitor Analysis

## Purpose
Systematically research and compare competitors to surface real strategic insights, not just a feature list.

## Phase 1 — Scope
Before researching, confirm:
- What product/service/company are we comparing against?
- Are we looking at direct competitors, indirect, or both?
- Is there a specific decision this analysis should support (pricing, feature roadmap, positioning)?
Proceed without asking if the context is already clear.

## Phase 2 — Competitor Discovery
- Run web_search queries to identify direct competitors (same category, same buyer)
- Run a second search for indirect competitors (alternative solutions buyers might consider)
- Shortlist the top 5 most relevant competitors with a brief rationale for each

## Phase 3 — Deep Profile Each Competitor
For each shortlisted competitor, use analyze_url on their homepage and pricing page:
- Product offering and core value proposition
- Pricing model and public tier structure (note the date checked)
- Target customer segment
- Key differentiators they claim
- Any notable weaknesses visible from public signals (reviews, complaints, missing features)

## Phase 4 — Comparative Analysis
- Build a feature comparison matrix across all competitors
- Identify:
  - Where we (or the subject) lead
  - Where competitors lead
  - Gaps no one is filling (opportunities)
  - Threats from competitor strengths

## Phase 5 — Strategic Synthesis
- Assign a market position to each competitor: Leader / Challenger / Niche / Emerging
- Clearly separate confirmed facts from marketing claims (label with ✅ confirmed / ⚠️ claimed)
- Produce 3-5 concrete strategic recommendations with the evidence behind each

## Phase 6 — Store & Track
- Save findings to memory box "Competitors" using manage_memory_box
- Create a board card for each actionable recommendation using manage_board

## Output Format
- **Competitor Shortlist** — Who we researched and why
- **Individual Profiles** — One section per competitor
- **Feature Comparison Matrix** — Table format
- **Pricing Comparison** — Side-by-side, with dates
- **Opportunity & Threat Map** — Gaps and risks
- **Strategic Recommendations** — Numbered, evidence-backed

## Quality Standards
- Always note the date pricing data was collected
- Distinguish ✅ confirmed features from ⚠️ marketing claims
- Never present a competitor strength without evidence from their public presence`,
  },
  {
    name: 'content-strategy',
    description: 'Plan content marketing — topics, formats, distribution channels. Use this skill whenever the user mentions content planning, blog strategy, editorial calendar, content marketing, SEO content, social media strategy, "what should we write about", thought leadership, content pillars, or any kind of publishing plan — even if they just say "we need more content".',
    category: 'writing',
    icon: '📝',
    allowed_tools: ['web_search', 'analyze_url', 'manage_memory_box', 'manage_board'],
    instructions: `# Content Strategy

## Purpose
Plan content marketing campaigns with topics, formats, and distribution.

## Workflow
1. **Audience Research**: Understand the target audience and their pain points
2. **Topic Discovery**: Use web_search to find trending topics and content gaps
3. **Keyword Analysis**: Identify high-value keywords and search intent
4. **Content Calendar**: Plan content pieces with formats and publishing schedule
5. **Distribution Plan**: Map content to channels (blog, social, email, etc.)
6. **Track**: Create board cards for each content piece

## Output Format
- **Audience Profile** — Who we're creating content for
- **Content Pillars** — 3-5 core topics to focus on
- **Content Calendar** — Weekly/monthly plan with:
  - Topic
  - Format (blog, video, social, infographic)
  - Target keyword
  - Distribution channels
  - Estimated effort
- **KPIs** — Success metrics for each content type

## Quality Standards
- Each topic should address a specific audience pain point
- Include a mix of content formats
- Balance evergreen content with timely pieces
- Consider SEO intent for each piece`,
  },
  {
    name: 'code-review',
    description: 'Review code for quality, bugs, security, and best practices. Use this skill whenever the user shares code snippets, asks for code feedback, mentions "review this", "is this good", "any issues with", security audit, code quality, pull request review, or wants a second opinion on any code — even if they just paste code without explicit instructions.',
    category: 'coding',
    icon: '💻',
    allowed_tools: [],
    instructions: `# Code Review

## Purpose
Provide thorough code review covering quality, bugs, security, and best practices.

## Workflow
1. **Understand Context**: Ask about the code's purpose and requirements if unclear
2. **Structure Review**: Analyze code organization and architecture
3. **Bug Hunt**: Look for logical errors, edge cases, and race conditions
4. **Security Check**: Identify security vulnerabilities (XSS, injection, auth issues)
5. **Performance**: Flag performance concerns and optimization opportunities
6. **Style**: Check naming, formatting, and consistency

## Output Format
- **Summary** — Overall assessment (1-2 sentences)
- **Critical Issues** 🔴 — Must fix (bugs, security vulnerabilities)
- **Improvements** 🟡 — Should fix (performance, readability)
- **Suggestions** 🟢 — Nice to have (style, minor optimizations)
- **Positive Notes** ✅ — What's done well

## Review Checklist
- [ ] Error handling is comprehensive
- [ ] Input validation is present
- [ ] No hardcoded secrets or credentials
- [ ] Edge cases are handled
- [ ] Naming is clear and consistent
- [ ] Functions are focused (single responsibility)
- [ ] No unnecessary complexity
- [ ] Performance is acceptable`,
  },
  {
    name: 'debug-systematic',
    description: 'Systematic debugging workflow for tracking down and fixing bugs. Use this skill whenever the user mentions a bug, error, crash, "it\'s broken", "doesn\'t work", "something is wrong", stack trace, exception, unexpected behavior, regression, or any troubleshooting scenario — even if they just paste an error message.',
    category: 'coding',
    icon: '🐛',
    allowed_tools: ['web_search'],
    instructions: `# Systematic Debugging

## Purpose
Methodically identify the root cause of a bug using evidence-driven reasoning — not guessing.

## Phase 1 — Characterise the Bug
Before forming any theories, establish:
- **Observed behaviour**: what is actually happening?
- **Expected behaviour**: what should happen instead?
- **Reproduction**: is it consistent, intermittent, or environment-specific?
- **Blast radius**: what is affected? What is NOT affected?
- **Recent changes**: what changed in the codebase, environment, or data before this appeared?

## Phase 2 — Gather Evidence
- Read error messages and stack traces in full — do not skim
- Identify the exact file, line, and call path where the failure surfaces
- Use web_search if the error is a known library/framework issue or if the error text is not obvious
- Collect: error messages, logs, failing inputs, environment details

## Phase 3 — Form Hypotheses (ranked)
Based on the evidence, produce 2-3 specific hypotheses:
- Each must name a concrete mechanism (not "maybe it's a timing issue" but "the async call at X resolves after Y reads stale state")
- Rank by likelihood based on evidence
- Identify what would prove or disprove each hypothesis without changing code

## Phase 4 — Test Hypotheses Systematically
- Address the most likely hypothesis first
- Change one thing at a time
- For each test: state what you expect → observe actual result → update hypothesis ranking
- Stop testing when root cause is confirmed with evidence, not just when the symptom disappears

## Phase 5 — Fix & Verify
- Implement the minimal targeted fix (prefer upstream over downstream workaround)
- State clearly: what the fix changes and why it addresses the root cause
- Identify at least one verification step the user can run to confirm the fix
- Flag any related code that may have the same bug (regression risk)

## Output Format
- **Bug Summary** — Observed vs expected, one paragraph
- **Evidence Collected** — Key signals used to diagnose
- **Hypotheses** — Ranked list with rationale
- **Root Cause** — Confirmed cause with evidence
- **Fix** — What to change and why
- **Verification Steps** — Concrete commands or checks to confirm
- **Regression Risk** — Any similar patterns elsewhere in the code

## Debugging Principles
- Never declare root cause without evidence — label inferences as hypotheses
- Change one variable at a time
- Prefer fixing root cause over patching symptom
- Consider recent changes as the most likely culprit first`,
  },
  {
    name: 'api-design',
    description: 'Design REST or GraphQL APIs with proper conventions. Use this skill whenever the user mentions API design, endpoint planning, REST API, GraphQL schema, data modeling, "how should I structure the API", request/response format, API architecture, webhooks, or needs to plan any backend interface — even if they just say "I need an API for X".',
    category: 'coding',
    icon: '🔌',
    allowed_tools: ['web_search'],
    instructions: `# API Design

## Purpose
Design clean, consistent, and well-documented APIs.

## Workflow
1. **Requirements**: Understand what the API needs to do
2. **Resource Modeling**: Define the core resources and relationships
3. **Endpoint Design**: Map CRUD operations to endpoints
4. **Schema Design**: Define request/response schemas
5. **Error Handling**: Design consistent error responses
6. **Documentation**: Provide OpenAPI-compatible specs

## Output Format
- **Resources** — Core entities and relationships
- **Endpoints** — Method, path, description, auth requirements
- **Request/Response Schemas** — JSON examples for each endpoint
- **Error Codes** — Consistent error response format
- **Authentication** — Auth strategy and flow

## REST Design Principles
- Use plural nouns for resources (/users, /posts)
- Use HTTP methods correctly (GET=read, POST=create, PUT=update, DELETE=delete)
- Use proper status codes (200, 201, 400, 401, 403, 404, 500)
- Support pagination for list endpoints
- Version the API (/v1/...)
- Return consistent error format: { error: { code, message, details } }`,
  },
  {
    name: 'user-stories',
    description: 'Convert requirements into well-structured user stories with acceptance criteria. Use this skill whenever the user mentions user stories, sprint planning, feature breakdown, requirements, backlog, acceptance criteria, "break this down into tasks", epic planning, ticket writing, or needs to translate ideas into actionable work items — even if they just describe a feature they want built.',
    category: 'product',
    icon: '📋',
    allowed_tools: ['manage_board'],
    instructions: `# User Story Writer

## Purpose
Convert product requirements into actionable user stories with clear acceptance criteria.

## Workflow
1. **Understand**: Clarify the feature or requirement
2. **Identify Users**: Define the user personas involved
3. **Break Down**: Split into individual, testable stories
4. **Write Stories**: Use standard format with acceptance criteria
5. **Prioritize**: Suggest priority order (MoSCoW)
6. **Track**: Create board cards for each story

## Story Format
**As a** [user type]
**I want** [action/feature]
**So that** [benefit/value]

### Acceptance Criteria
- Given [context], when [action], then [result]
- Given [context], when [action], then [result]

### Notes
- Technical considerations
- Dependencies
- Edge cases

## Output Format
- **Epic Summary** — The overarching feature/goal
- **User Stories** — Each with:
  - Story (As a / I want / So that)
  - Acceptance criteria (Given / When / Then)
  - Priority (Must/Should/Could/Won't)
  - Estimate (S/M/L/XL)
  - Dependencies

## Quality Standards
- Each story should be independently testable
- Stories should be small enough for one sprint
- Acceptance criteria should be specific and measurable
- Include edge cases in acceptance criteria`,
  },
  {
    name: 'doc-writer',
    description: 'Write technical documentation — READMEs, guides, API docs, how-tos. Use this skill whenever the user mentions documentation, README, guide, tutorial, API docs, "write docs for", "document this", onboarding guide, runbook, or needs any written explanation of code, products, or processes — even if they just say "explain how this works".',
    category: 'writing',
    icon: '📖',
    allowed_tools: ['manage_memory_box'],
    instructions: `# Documentation Writer

## Purpose
Create clear, comprehensive technical documentation.

## Workflow
1. **Scope**: Understand what needs to be documented and the target audience
2. **Structure**: Outline the document sections
3. **Write**: Create content section by section
4. **Examples**: Add code examples and usage scenarios
5. **Review**: Check for completeness and clarity

## Document Types

### README
- Project title and description
- Quick start / Installation
- Usage examples
- Configuration
- Contributing guidelines
- License

### API Documentation
- Overview and authentication
- Endpoint reference with examples
- Error codes and handling
- Rate limits and pagination
- SDKs and client libraries

### How-To Guide
- Prerequisites
- Step-by-step instructions
- Screenshots or code snippets
- Troubleshooting section

## Quality Standards
- Write for the audience's skill level
- Every code example should be copy-pasteable
- Include both common and edge case scenarios
- Keep paragraphs short (3-4 sentences max)
- Use headers, lists, and code blocks for scannability
- Include a table of contents for long docs`,
  },
  {
    name: 'test-generator',
    description: 'Generate test cases from code or requirements. Use this skill whenever the user mentions tests, testing, unit tests, integration tests, test plan, test coverage, "write tests for", QA, edge cases, regression tests, or needs any form of automated or manual testing — even if they just say "how do I test this".',
    category: 'coding',
    icon: '🧪',
    allowed_tools: [],
    instructions: `# Test Generator

## Purpose
Generate comprehensive test cases for code and requirements.

## Workflow
1. **Analyze**: Understand the code/feature to test
2. **Identify Cases**: Map out test scenarios:
   - Happy path (normal usage)
   - Edge cases (boundaries, empty inputs, max values)
   - Error cases (invalid input, network failures)
   - Security cases (injection, auth bypass)
3. **Write Tests**: Generate test code or test plan
4. **Coverage**: Ensure all code paths are covered

## Output Format
- **Test Plan Summary** — What's being tested and approach
- **Test Cases** — Organized by category:
  - Happy path tests
  - Edge case tests
  - Error handling tests
  - Integration tests (if applicable)
- **Coverage Notes** — What's covered and any gaps

## Test Naming Convention
\`\`\`
describe('[Component/Function]', () => {
  it('should [expected behavior] when [condition]', () => {})
})
\`\`\`

## Quality Standards
- Each test should test one thing
- Tests should be independent (no shared state)
- Use descriptive test names
- Include setup and teardown when needed
- Mock external dependencies
- Assert both positive and negative outcomes`,
  },
  {
    name: 'meeting-prep',
    description: 'Prepare for meetings — research topics, create agendas, draft talking points. Use this skill whenever the user mentions a meeting, call, presentation, pitch, standup, 1-on-1, board meeting, "I have a meeting with", agenda, talking points, preparation, or needs help getting ready for any kind of discussion — even if they just mention an upcoming event.',
    category: 'product',
    icon: '🤝',
    allowed_tools: ['web_search', 'analyze_url', 'manage_memory_box'],
    instructions: `# Meeting Preparation

## Purpose
Help prepare for meetings with research, agendas, and talking points.

## Workflow
1. **Context**: Understand the meeting purpose, attendees, and goals
2. **Research**: Look up relevant information about topics or attendees
3. **Agenda**: Create a structured meeting agenda
4. **Talking Points**: Draft key points and questions
5. **Materials**: Identify any materials needed
6. **Store**: Save prep notes to memory box

## Output Format
- **Meeting Overview** — Purpose, attendees, time, location
- **Agenda** — Timed sections with topics and owners
- **Talking Points** — Key messages to communicate
- **Questions to Ask** — Important questions for discussion
- **Preparation Checklist** — Materials and actions needed before the meeting
- **Follow-up Actions** — Anticipated action items

## Quality Standards
- Agenda items should have time estimates
- Include specific data points where relevant
- Prepare for potential objections or questions
- Keep talking points concise (one sentence each)
- Include decision points that need resolution`,
  },
  {
    name: 'skill-creator',
    description: 'Create new custom skills from conversations and workflows. Use this skill whenever the user says "turn this into a skill", "save this workflow", "create a skill for", "make this repeatable", "I do this often", or wants to capture any process, workflow, or pattern as a reusable skill — even if they just say "I want to automate this".',
    category: 'product',
    icon: '✨',
    allowed_tools: ['manage_memory_box'],
    instructions: `# Skill Creator

## Purpose
Help users create new custom skills by capturing workflows, processes, and patterns from conversations.

## Workflow

### 1. Capture Intent
Understand what the user wants to turn into a skill:
- What should this skill enable the AI to do?
- When should this skill trigger? (what user phrases/contexts)
- What's the expected output format?
- What tools does it need? (web_search, analyze_url, manage_board, etc.)

If the current conversation already contains a workflow (e.g., they say "turn this into a skill"), extract the steps, tools used, corrections made, and output format from the conversation history.

### 2. Interview
Ask about:
- Edge cases and special scenarios
- Input/output formats
- Success criteria
- Required integrations or tools

### 3. Write the Skill
Structure the skill with these components:

**name**: Lowercase with hyphens (e.g., "weekly-report")
**description**: IMPORTANT — Make this "pushy". Include both what the skill does AND specific trigger phrases/contexts. Example: Instead of "Generates weekly reports", write "Generate weekly status reports with metrics, highlights, and blockers. Use this whenever the user mentions weekly report, status update, team update, progress summary, or asks 'what happened this week' — even if they don't say 'report'."
**category**: research | coding | writing | analysis | product | custom
**instructions**: The step-by-step workflow in markdown

### 4. Create via API
Once confirmed, create the skill using the Skills API. Present the final skill to the user for review.

## Skill Writing Guidelines

### Progressive Disclosure
- Keep instructions under 500 lines
- Put the most important workflow steps first
- Add detailed reference info in resources if needed

### Writing Style
- Use imperative form ("Search for...", "Analyze the...")
- Explain WHY steps matter, not just WHAT to do
- Include concrete examples of inputs and outputs
- Be general enough to handle variations, not just one specific case

### Description Optimization
The description is the primary trigger mechanism. It should:
- Describe what the skill does
- List specific keywords that trigger it
- Include example phrases users might say
- Be slightly "pushy" — better to trigger too often than not enough

## Output Format
Present the complete skill definition:
\`\`\`
Name: [skill-name]
Description: [pushy description]
Category: [category]
Icon: [emoji]
Allowed Tools: [list]

Instructions:
[full markdown instructions]
\`\`\`

Then ask: "Should I create this skill? You can edit it later in Mission Control → Skills."`,
  },
  // ── Growth & Marketing Skills ───────────────────────────────────────
  {
    name: 'seo-audit',
    description: 'Audits websites for SEO issues and provides actionable optimization recommendations. Use whenever the user mentions SEO, search rankings, organic traffic, keywords, meta tags, site speed, Google ranking, "why aren\'t we ranking", search optimization, or wants to improve their website\'s search visibility — even if they just share a URL and ask "how can we improve this".',
    category: 'research',
    icon: '🔎',
    allowed_tools: ['web_search', 'analyze_url', 'manage_board'],
    instructions: `# SEO Audit

## Workflow
1. **Analyze the target URL** with analyze_url — check title tags, meta descriptions, headings, content structure
2. **Research keywords** — use web_search to find what competitors rank for
3. **Assess technical factors** — page load hints, mobile-friendliness, URL structure
4. **Identify gaps** — missing keywords, thin content, broken link patterns
5. **Create action items** — add high-priority fixes as board cards

## Output Format
### Technical Issues 🔴
- [Critical issues that block ranking]

### Content Opportunities 🟡
- [Keywords/topics to target with estimated search volume]

### Quick Wins 🟢
- [Changes that can be made today]

### Competitor Insights
- [What top-ranking pages do differently]

Be specific: name exact pages, exact keywords, exact fixes. No vague "improve your content" advice.`,
  },
  {
    name: 'email-copywriting',
    description: 'Writes high-converting email copy — cold outreach, newsletters, drip campaigns, transactional emails. Use whenever the user mentions email, newsletter, outreach, drip campaign, email sequence, subject line, "write an email", cold email, follow-up email, or needs any kind of email content — even if they just say "I need to email someone about X".',
    category: 'writing',
    icon: '📧',
    allowed_tools: ['web_search', 'manage_memory_box'],
    instructions: `# Email Copywriting

## Workflow
1. **Clarify context**: Who is the recipient? What's the goal? What tone?
2. **Determine email type**:
   - **Cold outreach?** → Lead with value, personalize, keep under 100 words
   - **Newsletter?** → Hook opener, scannable format, clear CTA
   - **Follow-up?** → Reference prior contact, add new value
   - **Transactional?** → Clear, action-oriented, minimal friction
3. **Write the email** with subject line options
4. **Store templates** in memory for reuse

## Quality Standards
- Subject lines: 6-10 words, create curiosity or urgency
- Body: One idea per paragraph, max 3 paragraphs for cold emails
- CTA: Single, clear, low-friction action
- Always provide 3 subject line options ranked by style (curiosity / direct / benefit)

## Example Format
**Subject lines:**
1. [Curiosity]: ...
2. [Direct]: ...
3. [Benefit]: ...

**Body:**
[email content]

**CTA:**
[specific action]`,
  },
  {
    name: 'social-media-post',
    description: 'Creates engaging social media content — LinkedIn posts, Twitter/X threads, Instagram captions. Use whenever the user mentions social media, LinkedIn post, tweet, thread, Instagram, social content, "write a post about", engagement, or needs content for any social platform — even if they just say "post about this".',
    category: 'writing',
    icon: '📱',
    allowed_tools: ['web_search', 'manage_memory_box'],
    instructions: `# Social Media Content

## Workflow
1. **Identify platform and goal**: Which platform? What action do we want?
2. **Determine content type**:
   - **LinkedIn?** → Professional tone, storytelling hooks, 1300 chars sweet spot
   - **Twitter/X?** → Punchy, thread-friendly, hooks in first line
   - **Instagram?** → Visual-first, hashtags, emoji-friendly
3. **Write the post** with platform-specific formatting
4. **Add engagement hooks** — questions, polls, CTAs

## Platform Guidelines

### LinkedIn
- Open with a bold statement or counterintuitive insight
- Use line breaks liberally (one idea per line)
- End with a question to drive comments
- No hashtag spam (3 max)

### Twitter/X
- Hook in first 7 words
- If thread: number tweets, each must stand alone
- End thread with summary + CTA

### Instagram
- Lead with value, not ask
- 5-10 relevant hashtags after line break
- Include emoji naturally, don't force them

Provide 2 versions: one safe/professional, one bold/edgy.`,
  },
  {
    name: 'outbound-sequence',
    description: 'Designs multi-step outbound sales or partnership sequences — emails, LinkedIn messages, follow-ups. Use whenever the user mentions outreach, sales sequence, prospecting, lead generation, "reach out to", partnership outreach, cold outbound, follow-up sequence, or wants to systematically contact a list of people — even if they just say "I want to connect with X".',
    category: 'writing',
    icon: '🎯',
    allowed_tools: ['web_search', 'analyze_url', 'manage_board', 'manage_memory_box'],
    instructions: `# Outbound Sequence Design

## Workflow
1. **Define the ICP** (Ideal Customer Profile) — who are we targeting?
2. **Research the prospect/company** via web_search
3. **Design the sequence** (typically 4-6 touches over 2-3 weeks)
4. **Write each touchpoint** with personalization placeholders
5. **Create board cards** for tracking

## Sequence Structure
### Touch 1 (Day 0): Cold Email
- Personalized opener referencing their company/role
- One specific value proposition
- Soft CTA (question, not meeting request)

### Touch 2 (Day 3): LinkedIn Connection
- Short note referencing email
- Add mutual connection context

### Touch 3 (Day 7): Follow-up Email
- New angle or case study
- Social proof (specific metrics)
- Slightly firmer CTA

### Touch 4 (Day 14): Breakup Email
- Acknowledge they're busy
- Final value add
- Easy out + door open

## Quality Standards
- Every message under 100 words
- Personalization beyond {{first_name}} — reference their actual work
- No generic "hope you're well" openers
- Each touch adds NEW value, doesn't repeat`,
  },
  // ── Operations & Data Skills ────────────────────────────────────────
  {
    name: 'data-analysis',
    description: 'Analyzes data sets, identifies trends, creates insights from numbers. Use whenever the user shares data, spreadsheets, metrics, KPIs, dashboards, "analyze this data", "what do these numbers mean", growth rates, churn, conversion rates, or needs any kind of quantitative analysis — even if they just paste some numbers.',
    category: 'analysis',
    icon: '📊',
    allowed_tools: ['calculate', 'manage_memory_box', 'create_visual_report'],
    instructions: `# Data Analysis

## Workflow
1. **Understand the data**: What does each column/metric represent?
2. **Clean & validate**: Check for missing values, outliers, inconsistencies
3. **Analyze**:
   - Trends over time
   - Comparisons across segments
   - Statistical significance where relevant
   - Correlations between variables
4. **Visualize**: Create a visual report with key charts
5. **Recommend**: Actionable insights, not just observations

## Output Format
### Data Summary
- [rows, columns, date range, completeness]

### Key Findings
1. [Finding with specific number and % change]
2. [Finding with comparison to benchmark]
3. [Finding with statistical context]

### Trends & Patterns
- [What's improving, declining, stable]

### Anomalies ⚠️
- [Unexpected data points with possible explanations]

### Recommendations
- [Specific action → expected impact]

## Quality Standards
- Always show the actual numbers, not just "increased"
- Include % changes and absolute values
- Compare to benchmarks or prior periods when possible
- Flag low sample sizes or unreliable data honestly`,
  },
  {
    name: 'financial-model',
    description: 'Builds financial projections, unit economics, and business models. Use whenever the user mentions financial model, revenue projection, unit economics, CAC, LTV, burn rate, runway, pricing model, P&L, forecast, "how much will we make", break-even analysis, or needs any financial planning — even if they just say "what should we charge".',
    category: 'analysis',
    icon: '💰',
    allowed_tools: ['calculate', 'web_search', 'manage_memory_box'],
    instructions: `# Financial Modeling

## Workflow
1. **Gather inputs**: Revenue model, cost structure, growth assumptions
2. **Build model**:
   - **SaaS?** → MRR, churn, expansion, CAC, LTV
   - **E-commerce?** → AOV, frequency, margins, COGS
   - **Marketplace?** → Take rate, GMV, supply/demand economics
   - **Services?** → Utilization, hourly/project rates, capacity
3. **Project 12-month forecast** with conservative/base/optimistic scenarios
4. **Calculate unit economics**
5. **Identify sensitivities** — what assumptions matter most?

## Output Format
### Assumptions
| Metric | Conservative | Base | Optimistic |
|--------|-------------|------|------------|
| [key metrics with specific values] |

### Monthly Projections (Base Case)
| Month | Revenue | Costs | Profit | Cumulative |

### Unit Economics
- CAC: $X
- LTV: $X
- LTV:CAC ratio: X:1
- Payback period: X months
- Gross margin: X%

### Sensitivity Analysis
- If churn increases 1% → impact on ARR
- If CAC increases 20% → impact on payback

### Key Risks
- [Assumption most likely to be wrong and why]

Always state assumptions explicitly. Never present projections without showing the inputs.`,
  },
  {
    name: 'incident-response',
    description: 'Guides structured incident response for production issues, outages, or security events. Use whenever the user mentions incident, outage, downtime, "site is down", production issue, error spike, security breach, postmortem, "something broke in production", or any urgent technical problem — even if they just say "help, everything is broken".',
    category: 'coding',
    icon: '🚨',
    allowed_tools: ['web_search', 'manage_board'],
    instructions: `# Incident Response

## Immediate Triage (first 5 minutes)
Copy this checklist:
\`\`\`
Incident Response:
- [ ] Step 1: Assess severity
- [ ] Step 2: Identify blast radius
- [ ] Step 3: Implement quick mitigation
- [ ] Step 4: Root cause investigation
- [ ] Step 5: Full fix + verification
- [ ] Step 6: Postmortem draft
\`\`\`

### Step 1: Assess Severity
- **P0 (Critical)**: Service completely down, data loss, security breach
- **P1 (High)**: Major feature broken, significant user impact
- **P2 (Medium)**: Degraded performance, workaround exists
- **P3 (Low)**: Minor issue, cosmetic, edge case

### Step 2: Identify Blast Radius
- Which users/services are affected?
- When did it start?
- What changed recently? (deploys, config changes, traffic spikes)

### Step 3: Quick Mitigation
- Can we rollback the last deploy?
- Can we feature-flag the broken component?
- Can we scale up to handle load?
- Can we redirect traffic?

### Step 4: Root Cause Investigation
- Check logs for the specific error
- Check monitoring for the exact start time
- Correlate with recent changes
- Test the hypothesis before applying a fix

### Step 5: Fix + Verification
- Apply the fix
- Verify in staging first if possible
- Monitor for 15 minutes after deployment
- Confirm metrics return to normal

### Step 6: Postmortem
- Timeline of events
- Root cause
- What went well / what didn't
- Action items to prevent recurrence`,
  },
  {
    name: 'onboarding-flow',
    description: 'Designs user onboarding flows — activation sequences, welcome emails, product tours, checklists. Use whenever the user mentions onboarding, activation, "new user experience", welcome flow, first-time user, setup wizard, product tour, time-to-value, user retention, "users aren\'t activating", or wants to improve how new users experience their product — even if they just say "we\'re losing users after signup".',
    category: 'product',
    icon: '🚀',
    allowed_tools: ['web_search', 'manage_board', 'manage_memory_box'],
    instructions: `# Onboarding Flow Design

## Workflow
1. **Define the "aha moment"** — what action proves value to the user?
2. **Map the current flow** — every step from signup to activation
3. **Identify drop-off points** — where are users leaving?
4. **Design the optimized flow**:
   - Remove unnecessary steps
   - Add progressive disclosure
   - Include social proof at friction points
5. **Create implementation tasks** on the board

## Output Format
### Activation Metric
- [Specific action that correlates with retention, e.g., "Created first project within 24 hours"]

### Onboarding Steps
| Step | Action | Goal | Drop-off Risk |
|------|--------|------|---------------|
| 1 | [specific step] | [what user learns] | [risk level] |

### Welcome Email Sequence
- **Email 1 (immediate)**: Welcome + quick start
- **Email 2 (Day 1)**: Feature highlight + social proof
- **Email 3 (Day 3)**: Check-in + offer help
- **Email 4 (Day 7)**: Advanced feature + case study

### Friction Reducers
- [Specific UI/UX improvements at each drop-off point]

### Metrics to Track
- Signup → first action rate
- Time to first value
- Day 1/7/30 retention
- Feature adoption by cohort`,
  },
  // ── Strategy & Planning Skills ──────────────────────────────────────
  {
    name: 'pitch-deck',
    description: 'Structures compelling pitch decks for investors, partners, or customers. Use whenever the user mentions pitch deck, investor presentation, fundraising, "we need a deck", startup pitch, demo day, partnership proposal, sales deck, or needs to present their company/product to any audience — even if they just say "I have a meeting with investors".',
    category: 'writing',
    icon: '🎤',
    allowed_tools: ['web_search', 'manage_memory_box'],
    instructions: `# Pitch Deck Structure

## Workflow
1. **Clarify audience**: Investors? Partners? Customers? Board?
2. **Gather key data**: Metrics, traction, team, market size
3. **Structure the narrative**
4. **Write slide-by-slide content**

## Standard Investor Deck (10-12 slides)

### Slide 1: Title
- Company name, one-line description, your name

### Slide 2: Problem
- Specific pain point with data/story
- Who has this problem and how badly

### Slide 3: Solution
- What you built and how it solves the problem
- Demo screenshot or flow

### Slide 4: Market Size
- TAM → SAM → SOM with sources
- Why now? (timing/trends)

### Slide 5: Traction
- Key metrics (MRR, users, growth rate)
- Customer logos if available

### Slide 6: Business Model
- How you make money
- Unit economics (CAC, LTV, margins)

### Slide 7: Product
- Key features / differentiation
- Screenshots or demo flow

### Slide 8: Competition
- Positioning matrix (2x2)
- Why you win

### Slide 9: Team
- Key people + relevant experience
- Why this team for this problem

### Slide 10: Financials
- Revenue projection (3 years)
- Key assumptions

### Slide 11: Ask
- How much you're raising
- What you'll do with it (18-month milestones)

### Slide 12: Contact
- Name, email, website

For each slide, provide: **headline** (one bold sentence), **key points** (3-5 bullets), **data/visual suggestion**.`,
  },
  {
    name: 'growth-experiment',
    description: 'Designs growth experiments with hypotheses, metrics, and success criteria. Use whenever the user mentions growth, A/B test, experiment, hypothesis, conversion optimization, funnel optimization, "how do we grow faster", growth hacking, activation rate, "test this idea", or wants to validate any growth idea — even if they just say "I have an idea to try".',
    category: 'analysis',
    icon: '🧪',
    allowed_tools: ['calculate', 'web_search', 'manage_board'],
    instructions: `# Growth Experiment Design

## Workflow
1. **Define the hypothesis**: "If we [change], then [metric] will [improve by X%] because [reason]"
2. **Design the experiment**
3. **Set success criteria** before running
4. **Create tracking plan**
5. **Add to board** as experiment card

## Output Format
### Hypothesis
If we [specific change], then [specific metric] will [direction + magnitude] because [reasoning based on data/insight].

### Experiment Design
- **Type**: A/B test / before-after / cohort analysis
- **Duration**: X weeks (minimum for statistical significance)
- **Sample size needed**: N users (use calculate tool)
- **Control**: [what stays the same]
- **Variant**: [what changes]

### Success Criteria (defined BEFORE running)
- **Primary metric**: [metric] improves by ≥X% (p < 0.05)
- **Guardrail metrics**: [metrics that must NOT degrade]
- **Decision framework**:
  - If primary ≥ X% AND guardrails hold → Ship it
  - If primary < X% but positive → Extend test
  - If primary negative → Kill it, document learnings

### Tracking Plan
| Event | Trigger | Properties |
|-------|---------|------------|

### Risks & Mitigations
- [What could invalidate results and how to prevent it]

Never recommend running an experiment without defined success criteria.`,
  },
  {
    name: 'weekly-standup',
    description: 'Generates structured weekly status updates, standup reports, and progress summaries. Use whenever the user mentions weekly update, standup, status report, progress report, "what happened this week", team update, weekly sync, sprint review, or needs to summarize recent work for stakeholders — even if they just say "what did we accomplish".',
    category: 'product',
    icon: '📅',
    allowed_tools: ['manage_board', 'manage_memory_box'],
    instructions: `# Weekly Status Report

## Workflow
1. **Check the board** for recently completed and in-progress items
2. **Check memories** for key decisions and learnings
3. **Structure the update**
4. **Store summary** in memory for future reference

## Output Format
### 🟢 Completed This Week
- [Specific accomplishment with measurable outcome]
- [Another accomplishment]

### 🔵 In Progress
- [Task] — [% complete, expected completion, blockers if any]

### 🔴 Blocked / At Risk
- [Issue] — [why it's blocked, what's needed to unblock]

### 📊 Key Metrics
- [Metric 1]: [value] ([change vs last week])
- [Metric 2]: [value] ([change vs last week])

### 🎯 Next Week's Focus
1. [Top priority with expected outcome]
2. [Second priority]
3. [Third priority]

### 💡 Decisions Needed
- [Decision needed from stakeholder + recommended option]

Keep each bullet to one line. Be specific: "Shipped new onboarding flow — activation rate improved from 12% to 18%" not "Worked on onboarding".`,
  },
  {
    name: 'brand-voice',
    description: 'Defines and applies brand voice guidelines — tone, vocabulary, personality, do\'s and don\'ts. Use whenever the user mentions brand voice, tone of voice, writing style guide, brand guidelines, "how should we sound", brand personality, messaging framework, or wants consistency in their written communications — even if they just say "this doesn\'t sound like us".',
    category: 'writing',
    icon: '🎨',
    allowed_tools: ['web_search', 'analyze_url', 'manage_memory_box'],
    instructions: `# Brand Voice Definition

## Workflow
1. **Audit existing content** — analyze current website/emails/social for patterns
2. **Define voice attributes** — 3-4 personality traits with spectrums
3. **Create the guide** with do's, don'ts, and examples
4. **Store in memory** for consistent future use

## Output Format
### Brand Personality
- **[Trait 1]**: [Description on a spectrum, e.g., "Professional but not stiff"]
- **[Trait 2]**: [Description]
- **[Trait 3]**: [Description]

### Voice Chart
| Attribute | We Are | We're Not |
|-----------|--------|-----------|
| [trait] | [positive] | [anti-pattern] |

### Vocabulary
- **Use**: [preferred words and phrases]
- **Avoid**: [words that don't fit the brand]

### Examples by Channel
**Website hero:**
✅ [on-brand example]
❌ [off-brand example]

**Email subject:**
✅ [on-brand example]
❌ [off-brand example]

**Social post:**
✅ [on-brand example]
❌ [off-brand example]

### Tone Adjustments by Context
- **Error messages**: [softer, empathetic]
- **Success states**: [celebratory but not over the top]
- **Sales pages**: [confident, specific]
- **Support**: [warm, helpful, no jargon]`,
  },
  {
    name: 'pricing-strategy',
    description: 'Analyzes and recommends pricing models, tiers, and strategies. Use whenever the user mentions pricing, "how much should we charge", pricing tiers, freemium, pricing page, monetization, revenue model, willingness-to-pay, pricing experiment, or wants to optimize how they make money — even if they just say "our pricing doesn\'t feel right".',
    category: 'analysis',
    icon: '💎',
    allowed_tools: ['web_search', 'analyze_url', 'calculate', 'manage_memory_box'],
    instructions: `# Pricing Strategy

## Workflow
1. **Research competitors** — analyze pricing pages of 5+ competitors
2. **Understand value metrics** — what unit of value does the customer buy?
3. **Design tier structure**
4. **Calculate economics** — ensure margins work at each tier
5. **Model scenarios** — revenue impact of different price points

## Output Format
### Competitive Landscape
| Competitor | Plans | Price Range | Value Metric |
|-----------|-------|-------------|--------------|

### Recommended Pricing Model
- **Model type**: Per-seat / usage / flat / hybrid
- **Value metric**: [what you charge for]
- **Rationale**: [why this model fits]

### Tier Recommendations
| Tier | Price | Target | Key Features | Margin |
|------|-------|--------|--------------|--------|
| Free/Starter | $X | [who] | [features] | [%] |
| Growth | $X | [who] | [features] | [%] |
| Pro/Business | $X | [who] | [features] | [%] |
| Enterprise | Custom | [who] | [features] | [%] |

### Revenue Projections
- At X customers with current mix → $Y MRR
- Sensitivity: ±10% price → ±Z% revenue

### Pricing Psychology
- Anchor: [which plan serves as anchor]
- Decoy: [if applicable]
- Key contrast: [what makes the upgrade compelling]

Always base recommendations on data (competitor research + unit economics), not gut feel.`,
  },
  {
    name: 'customer-interview',
    description: 'Designs customer interview scripts, analyzes feedback, and synthesizes insights. Use whenever the user mentions customer interview, user research, customer feedback, voice of customer, NPS analysis, survey design, "talk to customers", discovery interviews, feedback synthesis, or wants to understand their customers better — even if they just say "we need to understand why users are churning".',
    category: 'research',
    icon: '🎙️',
    allowed_tools: ['web_search', 'manage_memory_box', 'manage_board'],
    instructions: `# Customer Research

## Determine Mode
**Designing interviews?** → Follow Interview Design below
**Analyzing feedback?** → Follow Feedback Synthesis below

## Interview Design

### Script Structure (30 min)
1. **Warm-up** (2 min): Build rapport, explain purpose
2. **Context** (5 min): Current workflow, tools, challenges
3. **Core questions** (15 min): Deep dive on specific topic
4. **Feature feedback** (5 min): Show concepts, get reactions
5. **Wrap-up** (3 min): Anything else? Can we follow up?

### Question Types
- **Open**: "Walk me through how you currently..."
- **Probing**: "You mentioned X — tell me more about that"
- **Contrast**: "How does that compare to when you used..."
- **Impact**: "What happens when that goes wrong?"

### Rules
- NEVER ask "would you use X?" (hypothetical = unreliable)
- NEVER ask leading questions
- DO ask about past behavior, not future intentions
- DO follow up on emotions ("you seemed frustrated — why?")

## Feedback Synthesis

### From raw feedback to insights:
1. **Tag each piece** of feedback: theme, sentiment, frequency
2. **Group by theme** — what patterns emerge?
3. **Quantify**: How many people mentioned each theme?
4. **Prioritize**: Impact × Frequency matrix
5. **Extract quotes** — verbatim customer language is gold

### Output Format
| Theme | Frequency | Sentiment | Impact | Sample Quote |
|-------|-----------|-----------|--------|-------------|

### Top Insights
1. [Insight with data: "7/10 users mentioned X, primarily because Y"]
2. [Insight]

### Recommended Actions
- [Action tied to specific insight]`,
  },
  {
    name: 'process-automation',
    description: 'Identifies and designs process automations — workflow optimization, repetitive task elimination, integration design. Use whenever the user mentions automation, workflow, "this takes too long", repetitive task, manual process, integration, Zapier, "automate this", efficiency, streamline, or wants to reduce manual work — even if they just describe a tedious process they do regularly.',
    category: 'product',
    icon: '⚡',
    allowed_tools: ['manage_board', 'manage_memory_box', 'manage_recurring_task'],
    instructions: `# Process Automation

## Workflow
1. **Map the current process**: Every step, who does it, how long it takes
2. **Identify automation candidates**: Repetitive, rule-based, high-frequency
3. **Design the automated flow**
4. **Create implementation tasks**
5. **Set up recurring checks** if needed

## Assessment Framework
For each step in the process:
| Step | Manual Time | Frequency | Rule-Based? | Automate? |
|------|------------|-----------|-------------|-----------|

### Automation Tiers
- **Tier 1 (Quick wins)**: Can be automated with existing tools today
- **Tier 2 (Build)**: Needs custom integration or script
- **Tier 3 (Complex)**: Requires significant engineering effort

## Output Format
### Current Process
[Numbered steps with time estimates]
**Total manual time per occurrence**: X minutes
**Frequency**: X times per week
**Annual time cost**: X hours

### Proposed Automation
[Numbered steps showing what's automated vs manual]
**New manual time**: X minutes (Y% reduction)

### Implementation Plan
| Priority | Automation | Tool/Method | Effort | Impact |
|----------|-----------|-------------|--------|--------|

### ROI Estimate
- Hours saved per month: X
- Cost of implementation: Y hours
- Payback period: Z weeks

Focus on highest-frequency, lowest-complexity automations first.`,
  },
  // ── Multi-Agent Workflow Skills ─────────────────────────────────────
  {
    name: 'sales-pipeline',
    description: 'Orchestrates a full sales pipeline — lead generation, qualification, CRM updates, personalized outreach, follow-ups, and meeting booking. Use whenever the user mentions leads, sales pipeline, prospecting, "find customers", "get meetings", CRM, outbound sales, lead generation, or any end-to-end sales workflow — even if they just say "get me more customers".',
    category: 'product',
    icon: '🏗️',
    allowed_tools: ['web_search', 'analyze_url', 'manage_board', 'manage_memory_box', 'manage_recurring_task'],
    instructions: `# Sales Pipeline Orchestration

## THIS IS A MULTI-AGENT WORKFLOW
You are the MANAGER. Do NOT do this work yourself. Break it into phases and create specialized agents for each phase. Use the board as a lead pipeline tracker.

## CRM + INTEGRATION HONESTY
- Never claim leads were synced to a CRM unless that CRM is actually connected and verified in the current workspace (✅ in CONNECTOR REALITY CHECK).
- If the user names a CRM with a built-in connector (Attio, HubSpot, Shopify): offer to connect it first via setup_integration. Attio uses a single API key — call setup_integration with connector_id "attio".
- Once Attio is connected, ALWAYS use the typed integration_attio_* tools (e.g. integration_attio_inspect_workspace, integration_attio_create_company, integration_attio_create_deal, integration_attio_search_people) instead of generic integration_call. Typed tools enforce correct plural slugs, verify writes, and validate stage names automatically.
- Follow the PROACTIVE INTEGRATION PROTOCOL for every CRM action: DISCOVER prior learnings → VERIFY live workspace state → ACT with typed tools → LEARN by storing lessons.
- If the user names any other CRM or API service: do NOT say it is unavailable. Instead call register_custom_provider with the service's API base URL and auth method, then setup_integration, then integration_call — this works for any service with an HTTP API (Pipedrive, Close, Salesforce, etc.).
- Only fall back to browser automation if the service has no accessible API, or the user declines the API key approach.
- Only fall back to board + CSV if the user declines both API and browser automation.
- Do NOT create CRM-specific agents that claim API-level sync unless a typed tool or integration_call confirms it with a record_id or _verification block.
- If the user specifies a cadence like every day, weekends too, or ASAP, keep that exact cadence and start the first run now unless they explicitly asked you to wait.

## Step 1: Understand the Pipeline
Ask only what you need (skip if the user already provided):
- What does the company do? Who is the ideal customer?
- What CRM do they use, and is it already connected? If not, use our board as the source of truth and be explicit about that.
- What's the offer / value proposition?
- Any existing lead lists or target companies?

## Step 2: Set Up the Board as a Pipeline
Use manage_board to create pipeline stages as cards in different columns:
- **inbox** = Raw leads (unqualified)
- **up_next** = Qualified leads (ready for outreach)
- **in_progress** = Outreach sent (waiting for response)
- **in_review** = Responded (needs follow-up)
- **done** = Meeting booked or deal closed

If CRM sync is unavailable, treat the board as the authoritative lead pipeline and say so plainly.

## Step 3: Deploy the Agent Team
Create these agents IN ORDER. Each agent's output feeds the next:

### Agent 1: Lead Researcher (run once)
Task: "Research and find 20-30 potential leads for [company]. For each lead find: company name, decision-maker name + title, email if possible, company size, why they're a good fit. Focus on [ICP criteria]. Output as a structured list."
Schedule: once

### Agent 2: Lead Qualifier (run once, after Agent 1 completes)
Task: "Review the lead list from research. Score each lead 1-10 based on: company size fit, likely budget, pain point match, accessibility. Filter to top 15 highest-scoring leads. For each, write a 1-sentence personalization hook based on something specific about their company."
Schedule: once

### Agent 3: Outreach Writer (run once, after Agent 2)
Task: "For each of the 15 qualified leads, write a personalized 3-email sequence: (1) Cold intro — personal hook + one value prop + soft CTA, (2) Follow-up day 3 — new angle + social proof, (3) Breakup day 7 — final value + easy out. Keep each email under 100 words. Use the personalization hooks from qualification."
Schedule: once

### Agent 4: Follow-up Monitor (recurring weekly)
Task: "Check the pipeline board for leads in 'in_progress' and 'in_review'. For leads in 'in_progress' for more than 3 days with no response, draft a follow-up email. For leads in 'in_review' who responded, draft a meeting booking message. Move leads forward in the pipeline based on their status. Report summary of pipeline health."
Schedule: weekly_monday

## Step 4: Report to User
After creating agents, tell the user:
"I've set up your sales pipeline with a team of 4 agents:
- **[Name]** is finding leads right now
- **[Name]** will qualify them once found
- **[Name]** will write personalized outreach sequences
- **[Name]** will monitor follow-ups every week

Your board is set up as the pipeline tracker. If CRM sync is available and connected, I'll use it. If not, I'll keep everything accurate on the board and prepare export/handoff options. I'll keep you updated as results come in."

## Step 5: Ongoing Management
- When research agent completes → notify user with top findings, trigger qualifier
- When outreach is ready → present to user for approval before sending
- Weekly follow-up agent → report pipeline status, suggest next actions
- Move leads through board columns as they progress
- Save all lead data to memory box "Sales Pipeline"`,
  },
  {
    name: 'lead-nurture',
    description: 'Manages ongoing lead nurturing — follow-up sequences, response handling, pipeline updates, meeting scheduling. Use whenever the user mentions follow-up, nurture leads, "check on leads", pipeline status, meeting booking, lead status, or wants to advance existing leads through a sales process — even if they just ask "any responses from our outreach?".',
    category: 'product',
    icon: '🌱',
    allowed_tools: ['manage_board', 'manage_memory_box', 'manage_recurring_task', 'web_search'],
    instructions: `# Lead Nurturing

## THIS IS A COORDINATION TASK
Check the current pipeline status and take action.

## Workflow
1. **Check board** for leads in each stage (use manage_board get_board)
2. **Review memory** for lead history and past interactions
3. **For each stage, take appropriate action:**

### Leads in "inbox" (unqualified)
→ Create a qualifier agent to research and score them

### Leads in "up_next" (qualified, not yet contacted)
→ Create an outreach writer agent to craft personalized emails

### Leads in "in_progress" (outreach sent)
→ If >3 days: create agent to draft follow-up
→ If responded positively: move to "in_review"

### Leads in "in_review" (responded)
→ Create agent to draft meeting booking message
→ If meeting booked: move to "done"

### Leads in "blocked" (issues)
→ Investigate why, suggest alternative approach

## Report Format
**Pipeline Health:**
- Total leads: X
- inbox: X | qualified: X | outreach sent: X | responded: X | meetings: X

**This Week:**
- New leads added: X
- Outreach sent: X
- Responses received: X
- Meetings booked: X

**Needs Attention:**
- [Lead] — no response after 7 days, suggest new angle
- [Lead] — responded but unclear intent, suggest follow-up

**Recommended Actions:**
1. [Specific action for specific lead]`,
  },
  {
    name: 'workflow-orchestrator',
    description: 'Breaks down complex multi-step requests into coordinated agent teams. Use whenever the user asks for something that requires multiple phases of work, multiple skills, or ongoing coordination — even if they describe it as a single task. Examples: "build my marketing engine", "set up our hiring process", "create a content publishing system", or any request that needs 3+ steps to complete properly.',
    category: 'product',
    icon: '🎭',
    allowed_tools: ['manage_board', 'manage_memory_box', 'manage_recurring_task'],
    instructions: `# Workflow Orchestrator

## PURPOSE
When a user asks for something complex, break it into a coordinated multi-agent workflow. You are the conductor — agents are the musicians.

## Step 1: Decompose the Request
Break the user's request into sequential phases:
- What needs to happen FIRST? (research, data gathering)
- What depends on the first phase? (analysis, planning)
- What depends on analysis? (execution, creation)
- What's ongoing? (monitoring, follow-up)

## Step 2: Design the Agent Team
For each phase, design a specialized agent:
- Give it a clear, memorable name that reflects its role
- Write a specific task description with exact inputs/outputs
- Set the right schedule (once, recurring, or triggered)
- Define what "done" looks like for this agent

## Step 3: Set Up Tracking
- Create board cards for each major milestone
- Save the workflow plan to memory for reference
- Set up recurring check agents if the workflow is ongoing

## Step 4: Deploy and Report
Create all agents and tell the user:
- How many agents are working
- What each one is doing (in plain language)
- When to expect first results
- How you'll keep them updated

## Decomposition Patterns

### Research → Strategy → Execution
User: "Help me enter a new market"
→ Agent 1: Market research (competitive landscape, market size, regulations)
→ Agent 2: Strategy (entry approach, positioning, pricing)
→ Agent 3: Execution plan (go-to-market timeline, launch assets)

### Gather → Analyze → Act → Monitor
User: "Optimize our pricing"
→ Agent 1: Gather competitor pricing data
→ Agent 2: Analyze price sensitivity and unit economics
→ Agent 3: Design new pricing tiers
→ Agent 4: Monitor metrics after pricing change (recurring)

### Build → Test → Launch → Iterate
User: "Create our content marketing engine"
→ Agent 1: Content strategy (topics, keywords, calendar)
→ Agent 2: Create initial content pieces
→ Agent 3: Distribution plan (channels, scheduling)
→ Agent 4: Performance monitor (recurring weekly)

## KEY PRINCIPLES
- Each agent should have ONE clear job
- Later agents use earlier agents' output
- Always include a monitoring/follow-up agent for ongoing work
- The user should feel like they asked once and got a whole operation running
- Update the user proactively as phases complete`,
  },
  // ── Content Production Pipeline Skills ──────────────────────────────
  {
    name: 'content-engine',
    description: 'Orchestrates a daily content production pipeline — keyword research, SEO article writing, social media posts, newsletters, and comment management. Use whenever the user mentions content marketing, daily posting, SEO content, blog articles, organic growth, "write articles every day", content calendar, publishing pipeline, or wants automated content production — even if they just say "I want more organic traffic".',
    category: 'product',
    icon: '🏭',
    allowed_tools: ['web_search', 'analyze_url', 'manage_board', 'manage_memory_box', 'manage_recurring_task'],
    instructions: `# Content Production Engine

## THIS IS A DAILY MULTI-AGENT PIPELINE
You are the MANAGER. Set up a team of recurring agents that produce content every day like a well-oiled machine.

## Step 1: Understand the Content Engine
Ask only what's needed (skip if provided):
- What's the website/blog URL?
- What industry/niche? Who's the target audience?
- What topics should we focus on? (or should we research?)
- What social media platforms? (LinkedIn, Twitter/X, Instagram, etc.)
- Do they have a newsletter platform? (Mailchimp, ConvertKit, Substack, etc.)
- What CMS do they use? (WordPress, Webflow, Ghost, etc.)

## Step 2: Check Integration Requirements
Be HONEST about what's automated vs manual:
- **Writing articles**: ✅ Agent can research + write full SEO articles
- **Keyword research**: ✅ Agent can research keywords via web_search
- **Social media posts**: ✅ Agent can write posts. ⚠️ POSTING requires integration (Slack→social, or manual copy-paste)
- **Newsletter**: ✅ Agent can write newsletter. ⚠️ SENDING requires email platform integration
- **Posting to website**: ⚠️ Requires CMS integration or GitHub (for static sites)
- **Answering comments**: ⚠️ Requires social media API integration

Tell the user: "I can set up the full content production pipeline. The writing and research is fully automated. For actual posting/sending, I'll prepare everything ready-to-publish — you just hit send. If you connect [platforms], I can automate the posting too."

## Step 3: Deploy the Daily Agent Team

### Agent 1: SEO Keyword Researcher (recurring weekly Monday)
Task: "Research 7 high-value keywords for [niche] targeting [audience]. For each keyword find: search volume estimate, difficulty, search intent, and a specific article angle. Prioritize keywords where we can realistically rank. Check what's already ranking and find gaps. Save the keyword plan to memory and report to board."
Schedule: weekly_monday

### Agent 2: Article Writer (recurring daily 6am)
Task: "Write a 1200-1500 word SEO-optimized blog article. Steps:
1. Check memory for this week's keyword plan (read_agent_data from Keyword Researcher)
2. Pick the next unused keyword
3. Research the topic — read top 3 ranking articles for inspiration (NOT copying)
4. Write the article with: compelling title (60 chars), meta description (155 chars), proper H2/H3 structure, internal linking suggestions, natural keyword usage (2-3%), actionable takeaways
5. Save the full article to memory box 'Content'
6. Report to board with title + keyword + meta description
7. Mark the keyword as used in your workspace"
Schedule: daily_9am

### Agent 3: Social Media Creator (recurring daily 10am)
Task: "Create social media posts for today's article. Steps:
1. Read today's article from the Article Writer agent (read_agent_data)
2. Create platform-specific posts:
   - LinkedIn: Professional hook + key insight + question (1300 chars)
   - Twitter/X: Punchy thread (3-5 tweets) with the article's best insights
   - Instagram: Caption with value-first hook + 5-10 hashtags
3. Create an image description/prompt for the article header
4. Save all posts to memory box 'Social Media'
5. Report to board: 'Social posts ready for [Article Title]'"
Schedule: daily_9am (runs after article writer)

### Agent 4: Newsletter Writer (recurring daily 11am)
Task: "Write a newsletter edition based on today's article. Steps:
1. Read today's article from the Article Writer (read_agent_data)
2. Write a newsletter that:
   - Has a compelling subject line (3 options)
   - Opens with a personal hook or timely angle
   - Summarizes the article's key insights (not just a copy)
   - Adds 1-2 additional quick tips not in the article
   - Ends with a clear CTA (read full article, reply, share)
3. Keep it under 500 words — scannable, valuable, personal
4. Save to memory box 'Newsletters'
5. Report to board: 'Newsletter ready: [Subject Line]'"
Schedule: daily_9am

### Agent 5: Community Monitor (recurring daily 5pm)
Task: "Monitor and draft responses for social media engagement. Steps:
1. Check board for recently posted content
2. Search for any mentions or discussions about our latest content topics
3. Draft thoughtful responses for:
   - Comments on our social posts (if accessible)
   - Relevant discussions in our niche (Reddit, Twitter, forums)
4. Each response should add value, not just say 'thanks'
5. Save drafted responses to memory box 'Community'
6. Report summary: X responses drafted, Y conversations found"
Schedule: daily_9am

## Step 4: Set Up the Content Calendar
Use the board as a content pipeline:
- **inbox** = Keyword ideas and topic backlog
- **up_next** = This week's planned articles
- **in_progress** = Today's article being written
- **in_review** = Article + social + newsletter ready for review
- **done** = Published content

## Step 5: Report to User
"I've set up your content engine with 5 agents:

📊 **Keyword Scout** researches 7 keywords every Monday
✍️ **Writer** produces a full SEO article every day at 6am
📱 **Social Creator** turns each article into platform-specific posts
📧 **Newsletter Writer** creates a newsletter edition for each article
💬 **Community Monitor** drafts responses to engagement every evening

Your board is set up as a content calendar. Each day you'll see:
- A ready-to-publish article with SEO optimization
- Social media posts for all platforms
- A newsletter edition

All you need to do is review and hit publish. First article coming tomorrow morning."

## Ongoing Optimization
- Weekly: Keyword agent checks what's ranking, adjusts strategy
- Monthly: Review which articles got the most traffic, double down on what works
- Save all performance data to memory for continuous improvement`,
  },
  {
    name: 'newsletter-writer',
    description: 'Writes engaging email newsletters — weekly digests, product updates, educational content, promotional campaigns. Use whenever the user mentions newsletter, email marketing, "write a newsletter", subscriber update, email campaign, drip sequence, weekly digest, or wants to communicate with their email list — even if they just say "we should email our subscribers".',
    category: 'writing',
    icon: '💌',
    allowed_tools: ['web_search', 'manage_memory_box', 'manage_board'],
    instructions: `# Newsletter Writing

## Workflow
1. **Determine type**:
   - **Weekly digest?** → Curate top insights/news from the week
   - **Product update?** → Feature announcement with benefits
   - **Educational?** → Teach one concept deeply
   - **Promotional?** → Offer/launch with urgency
2. **Write the newsletter**
3. **Save to memory** for template reuse

## Newsletter Structure
### Subject Line (3 options)
1. [Curiosity-driven]: ...
2. [Benefit-driven]: ...
3. [Number-driven]: ...

### Preview Text
[The text that shows after the subject in inbox — 40-90 chars, complements subject]

### Body
**Opening Hook** (2-3 sentences)
- Personal anecdote, timely reference, or surprising stat
- Never start with "Hi [name]" — that's boring

**Main Content** (3-5 sections)
- Each section: bold subheader + 2-3 sentences + optional bullet list
- One key insight per section
- Scannable — most people skim

**CTA Section**
- Single clear action
- Button text suggestion
- Urgency element if appropriate

**Sign-off**
- Personal, warm
- P.S. line (highest read-rate section — put secondary CTA here)

## Quality Standards
- Under 500 words (respect inbox time)
- One primary CTA, max one secondary
- Mobile-friendly formatting (short paragraphs)
- Subject line A/B test: always provide 3 options
- Never use "no-reply" tone — be human`,
  },
  {
    name: 'social-media-manager',
    description: 'Manages social media presence — content creation, scheduling strategy, engagement monitoring, comment responses, analytics review. Use whenever the user mentions social media management, "manage our social", posting schedule, engagement, followers, social strategy, comment responses, community management, or wants ongoing social media operations — even if they just say "our social media needs work".',
    category: 'product',
    icon: '📲',
    allowed_tools: ['web_search', 'analyze_url', 'manage_board', 'manage_memory_box', 'manage_recurring_task'],
    instructions: `# Social Media Manager

## THIS IS AN ONGOING OPERATION
Set up recurring agents for continuous social media management.

## Determine Scope
- Which platforms? (LinkedIn, Twitter/X, Instagram, TikTok, Facebook)
- What's the brand voice? (check memory for brand-voice data)
- What's the posting frequency goal?
- What content sources exist? (blog, product updates, industry news)

## Agent Team

### Content Creator (recurring, matches posting frequency)
- Create platform-native content (not the same post everywhere)
- LinkedIn: thought leadership, storytelling, carousel ideas
- Twitter/X: threads, hot takes, engagement hooks
- Instagram: visual concepts, captions, hashtag strategy
- Mix: 40% educational, 30% engaging, 20% promotional, 10% personal

### Engagement Monitor (recurring daily)
- Draft responses to comments and DMs
- Find relevant conversations to join
- Track competitor social activity
- Flag any negative mentions or PR issues

### Analytics Reporter (recurring weekly)
- Which posts performed best? Why?
- Engagement rate trends
- Follower growth
- Recommend: do more of X, stop doing Y

## Content Calendar (use board)
- **inbox** = Content ideas backlog
- **up_next** = This week's planned posts
- **in_progress** = Being created
- **in_review** = Ready for approval
- **done** = Published

## Integration Note
Be honest: "I'll prepare all content ready-to-post. For actual auto-publishing, we'll need to connect your social accounts. Until then, I'll have everything queued in your board — just copy-paste and post."`,
  },
  // ── Customer Support & Operations Skills ────────────────────────────
  {
    name: 'support-team',
    description: 'Orchestrates a full customer support operation — email monitoring, ticket response, CRM updates, escalation handling, daily reports, and feature request routing. Use whenever the user mentions customer support, help desk, shared inbox, "be our support team", email monitoring, ticket system, support queue, customer service, "answer customer emails", response times, or wants automated support operations — even if they just say "handle our support".',
    category: 'product',
    icon: '🎧',
    allowed_tools: ['web_search', 'manage_board', 'manage_memory_box', 'manage_recurring_task'],
    instructions: `# Customer Support Operations

## THIS IS AN ALWAYS-ON MULTI-AGENT OPERATION
You are the MANAGER. Set up a support team that monitors, responds, escalates, and reports — continuously.

## Step 1: Understand the Support Setup
Ask only what's essential:
- What email/inbox should we monitor? (Gmail, shared inbox URL)
- What support system do they use? (Zendesk, Intercom, Freshdesk, or just email?)
- What CRM? (HubSpot, Salesforce, or use our board?)
- What's the product/service? (so agents can answer accurately)
- Any existing FAQ, help docs, or knowledge base URL?
- Escalation rules? (when should a human step in?)

## Step 2: Check Integration Requirements
Be HONEST:
- **Reading emails**: ⚠️ Requires Gmail integration (Settings → Integrations → Gmail)
- **Sending replies**: ⚠️ Requires Gmail integration with send permissions
- **CRM updates**: ⚠️ Requires HubSpot/Salesforce integration, OR we use the board as a lightweight CRM
- **Support system**: ⚠️ Requires specific integration. Without it, agents draft responses → you copy-paste
- **Knowledge base**: ✅ Agent can read and learn from any public URL

Tell the user honestly what needs connecting, then set up what we can:
"To run this fully automated, I'll need you to connect Gmail (for reading/sending) and [CRM] in Settings → Integrations. I'll set everything up now — the agents will start working as soon as integrations are live. In the meantime, they'll draft responses for you to send."

## Step 3: Build the Knowledge Base
BEFORE creating support agents, first create a knowledge agent:

### Agent 0: Knowledge Builder (run once)
Task: "Build a support knowledge base for [product]. Steps:
1. Read the product website and help docs using analyze_url
2. Extract: common features, pricing, how-to guides, known limitations
3. Compile into a structured FAQ with categories
4. Save to memory box 'Support Knowledge Base'
5. Report to board when complete"
Schedule: once

This agent's output becomes the source of truth for all support responses.

## Step 4: Deploy the Support Team

### Agent 1: Inbox Monitor (recurring every 30 min)
Task: "Check the support inbox for new messages. Steps:
1. Read new emails/tickets since last check (use integration tools or check board for manually added tickets)
2. For each new message:
   a. Classify: question / bug report / feature request / complaint / spam
   b. Assess urgency: critical (service down) / high (blocked user) / medium (question) / low (feature request)
   c. Create a board card with: subject, sender, classification, urgency
   d. Put critical/high in 'up_next', medium in 'inbox', low in 'inbox'
3. Update workspace with count of new tickets
4. If any CRITICAL tickets → report_to_board immediately with 🚨 prefix"
Schedule: every 30 min (0 */1 * * * for hourly if 30min not available)

### Agent 2: Response Drafter (recurring every 30 min, offset)
Task: "Draft responses for support tickets. Steps:
1. Check board for tickets in 'up_next' (highest priority) and 'inbox'
2. For each unresponded ticket:
   a. Read the customer's message carefully
   b. Search the knowledge base (read_agent_data from Knowledge Builder)
   c. Draft a helpful, empathetic response that:
      - Acknowledges the issue
      - Provides a clear solution or next step
      - Uses the customer's name
      - Matches brand voice (check memory)
   d. If it's a bug: acknowledge, explain workaround if any, note it's being looked at
   e. If can't solve: escalate by moving card to 'blocked' with note for human
   f. Save draft response as card description
   g. Move card to 'in_review' (ready for human to send)
3. Report: X tickets drafted, Y escalated"
Schedule: every 30 min

### Agent 3: Daily Report (recurring daily 8am)
Task: "Generate the daily support report. Steps:
1. Check board for all tickets from last 24 hours
2. Read agent data from Inbox Monitor and Response Drafter
3. Compile report:
   - Total tickets: X (critical: X, high: X, medium: X, low: X)
   - Responded: X | Pending: X | Escalated: X
   - Top 3 issues (most common categories)
   - Any recurring problems or patterns
   - Feature requests received (list them)
   - Average response time estimate
4. Save report to memory box 'Support Reports'
5. Report to board: 'Daily Support Report — [date]'"
Schedule: daily_9am

### Agent 4: Feature Request Router (recurring daily)
Task: "Process feature requests from support tickets. Steps:
1. Check board for cards tagged as 'feature request' or in specific column
2. For each feature request:
   a. Summarize what the customer wants
   b. Check memory for similar past requests (aggregate duplicates)
   c. Score by: frequency (how many asked), impact (how big), effort (estimate)
   d. Create a board card in 'inbox' with: [Feature] prefix, description, requester count
3. Weekly: compile top 5 most-requested features
4. Save to memory box 'Feature Requests'"
Schedule: daily_9am

### Agent 5: CRM Updater (recurring daily)
Task: "Update CRM records based on support interactions. Steps:
1. Check board for resolved tickets (in 'done')
2. For each resolved ticket:
   a. Note the interaction type and resolution
   b. If CRM integration available: update contact record with support interaction
   c. If no CRM: save customer interaction summary to memory box 'Customer Interactions'
   d. Tag customers who had critical issues (potential churn risk)
   e. Tag customers who gave positive feedback (potential advocates)
3. Report: X records updated, Y churn risks flagged, Z advocates identified"
Schedule: daily_9am

## Step 5: Set Up the Support Board
Board columns as ticket pipeline:
- **inbox** = New tickets (unprocessed)
- **up_next** = High priority (need response ASAP)
- **in_progress** = Being handled by agent
- **in_review** = Response drafted (ready for human to review/send)
- **done** = Resolved
- **blocked** = Escalated to human (agent couldn't solve)

## Step 6: Report to User
"Your support team is live with 5 agents:

📬 **Inbox Monitor** checks for new messages every 30 minutes
✍️ **Response Drafter** writes empathetic, knowledgeable replies
📊 **Daily Reporter** gives you a morning briefing at 8am
💡 **Feature Router** captures and prioritizes feature requests
👤 **CRM Updater** keeps customer records current

Your board is now a ticket pipeline. Here's your daily flow:
1. Wake up → read the morning support report
2. Check 'in_review' → approve/edit drafted responses and send
3. Check 'blocked' → handle escalations that need a human touch
4. Feature requests automatically flow to your product backlog

[If integrations pending]: Connect Gmail in Settings → Integrations to enable auto-reading. Until then, forward emails to the chat and I'll process them."

## Escalation Rules (defaults — user can customize)
- **Auto-handle**: FAQ questions, how-to questions, simple bugs with known workarounds
- **Draft for review**: Complaints, refund requests, account issues
- **Escalate to human**: Legal threats, security issues, data deletion requests, angry customers, anything the agent is uncertain about
- **NEVER auto-send**: Refund confirmations, account changes, anything involving money`,
  },
  {
    name: 'feature-request-tracker',
    description: 'Captures, deduplicates, and prioritizes feature requests from customers into a product backlog. Use whenever the user mentions feature requests, product backlog, "customers are asking for", user feedback, product roadmap, feature voting, prioritization, or wants to track what customers want built — even if they just say "what features should we build next?".',
    category: 'product',
    icon: '💡',
    allowed_tools: ['manage_board', 'manage_memory_box', 'web_search'],
    instructions: `# Feature Request Tracker

## Workflow
1. **Capture**: Extract feature requests from any source (support tickets, emails, conversations)
2. **Deduplicate**: Check memory for similar past requests, merge if duplicate
3. **Enrich**: Add context — who asked, why, how many times, potential impact
4. **Prioritize**: Score using RICE framework (Reach × Impact × Confidence ÷ Effort)
5. **Track**: Create/update board cards for each feature request

## For Each Feature Request
### Card Format
Title: [Feature] Short description
Description:
- **What**: Clear description of the feature
- **Who asked**: Customer names/count
- **Why**: The underlying problem they're trying to solve
- **Frequency**: How many customers requested this (or similar)
- **RICE Score**: Reach × Impact × Confidence ÷ Effort = X
- **Status**: New | Under review | Planned | In progress | Shipped

## Prioritization (RICE Framework)
| Factor | Scale | Description |
|--------|-------|-------------|
| **Reach** | 1-10 | How many customers will this affect? |
| **Impact** | 1-3 | How much will it improve their experience? (1=low, 3=massive) |
| **Confidence** | 0.5-1.0 | How sure are we about reach/impact estimates? |
| **Effort** | 1-10 | Engineering weeks to build |

Score = (Reach × Impact × Confidence) ÷ Effort

## Deduplication
Before creating a new feature card:
1. Search memory for similar requests
2. Search board for similar cards
3. If match found: update the existing card with new requester and increment count
4. If no match: create new card

## Weekly Summary Output
### Top Requested Features
| # | Feature | Requests | RICE | Status |
|---|---------|----------|------|--------|
| 1 | [feature] | X customers | X.X | [status] |

### New This Week
- [Feature from Customer X]: [brief description]

### Trending Up
- [Feature] went from 2→5 requests this month`,
  },
  // ── Paid Advertising & Performance Marketing Skills ─────────────────
  {
    name: 'paid-ads-manager',
    description: 'Orchestrates paid advertising operations across platforms — Meta Ads, Google Ads, LinkedIn Ads, TikTok Ads. Handles campaign strategy, ad creation, budget allocation, A/B testing, performance monitoring, and optimization. Use whenever the user mentions paid ads, PPC, SEM, Google Ads, Meta Ads, Facebook Ads, Instagram Ads, LinkedIn Ads, ad spend, ROAS, CPC, CPM, ad budget, "manage our ads", retargeting, conversion campaigns, or any paid marketing — even if they just say "we need to run ads".',
    category: 'analysis',
    icon: '📡',
    allowed_tools: ['web_search', 'analyze_url', 'calculate', 'manage_board', 'manage_memory_box', 'manage_recurring_task'],
    instructions: `# Paid Ads Operations Manager

## THIS IS AN ONGOING MULTI-AGENT OPERATION
You are the MANAGER. Set up a paid ads team that researches, creates, monitors, optimizes, and reports — like having a performance marketing team on staff.

## Step 1: Understand the Ad Setup
Ask only what's needed:
- What platforms are you running ads on? (Meta, Google, LinkedIn, TikTok)
- What's the monthly budget? How is it split across platforms?
- What's the product/service and who is the target audience?
- What's the primary goal? (leads, sales, signups, app installs, brand awareness)
- Any existing campaigns running? What's working/not working?
- Landing page URLs?
- What metrics matter most? (ROAS, CPA, CPL, CTR)

## Step 2: Check Integration Requirements
Be HONEST about capabilities:
- **Campaign strategy & research**: ✅ Fully automated — competitor research, audience analysis, keyword research
- **Ad copywriting**: ✅ Fully automated — headlines, descriptions, hooks, CTAs
- **Creative briefs**: ✅ Agent can write image/video briefs with exact specs
- **Performance monitoring**: ⚠️ Requires platform API access or manual data input. Agent can analyze data you share.
- **Actual ad creation in platform**: ⚠️ Requires browser agent with platform login, OR user creates from agent's specs
- **Budget changes in platform**: ⚠️ Same — agent recommends, user executes (or browser agent if credentials provided)
- **A/B test setup**: ✅ Agent designs tests. ⚠️ Implementation in platform needs access.

Tell user: "I'll set up your full ads operation. My team will handle strategy, copywriting, creative briefs, competitor research, and performance analysis. For making actual changes in ad platforms, I'll need either login credentials (Settings → Integrations) or I'll give you exact step-by-step instructions to execute my recommendations in 2 minutes."

## Step 3: Deploy the Ads Team

### Agent 0: Market & Competitor Intel (run once, then monthly)
Task: "Research the paid advertising landscape for [product/niche]. Steps:
1. Search for competitor ads using web_search (search '[competitor] ads', 'facebook ad library [competitor]')
2. Analyze competitor landing pages with analyze_url
3. Identify: what messaging they use, what offers, what platforms, estimated ad spend
4. Research target audience: demographics, interests, pain points, where they hang out
5. For Google Ads: research keyword opportunities, CPCs, search volumes
6. Save all intelligence to memory box 'Ad Intelligence'
7. Report findings to board"
Schedule: once, then monthly_1st

### Agent 1: Campaign Strategist (run once per campaign)
Task: "Design the campaign strategy for [goal]. Steps:
1. Read market intel from Agent 0 (read_agent_data)
2. Design campaign structure:
   - Platform allocation: which platforms get what % of budget and why
   - Campaign types per platform (awareness, consideration, conversion)
   - Audience segments: 3-5 target audiences with targeting specs
   - Funnel: awareness → retargeting → conversion
3. Budget allocation:
   - Split by platform, campaign, and audience
   - Include testing budget (15-20% for experiments)
   - Daily vs lifetime budget recommendations
4. Define KPIs and targets for each campaign
5. Save strategy to memory box 'Ad Strategy'
6. Report to board: 'Campaign strategy ready for review'"
Schedule: once

### Agent 2: Ad Copywriter (recurring weekly)
Task: "Create ad copy and creative briefs for this week's campaigns. Steps:
1. Read campaign strategy (read_agent_data from Strategist)
2. For each active campaign, create:
   **Meta/Instagram Ads:**
   - 3 primary text variations (short/medium/long)
   - 5 headline options
   - 3 description options
   - Image/video creative brief with exact specs (1080x1080, 1080x1920)
   - Hook in first 3 seconds for video

   **Google Search Ads:**
   - 5 responsive search ad headlines (30 chars each)
   - 4 descriptions (90 chars each)
   - Sitelink extensions (4)
   - Callout extensions (4)

   **LinkedIn Ads:**
   - Sponsored content: professional hook + value prop + CTA
   - Message ads: personalized opener + benefit + soft CTA

3. For A/B tests: create variant pairs (change ONE element per test)
4. Save all copy to memory box 'Ad Creative'
5. Report to board: 'New ad copy ready — X variations across Y platforms'"
Schedule: weekly_monday

### Agent 3: Performance Analyst (recurring daily)
Task: "Analyze ad performance and recommend optimizations. Steps:
1. Check board and memory for latest performance data
2. If platform data available (via integration or user-shared):
   - Calculate: CPC, CPM, CTR, CPA, ROAS for each campaign
   - Compare against targets from strategy
   - Identify: top performers, underperformers, trends
3. If no platform data: search for industry benchmarks, remind user to share data
4. Generate optimization recommendations:
   - Budget shifts: move money from losers to winners
   - Creative fatigue: flag ads with declining CTR
   - Audience refinement: narrow or expand based on results
   - Bid adjustments: raise bids on high-ROAS campaigns
   - New test ideas based on what's working
5. Classify recommendations by impact:
   🔴 Urgent (losing money — act today)
   🟡 Important (optimize this week)
   🟢 Opportunity (test when ready)
6. Save analysis to memory box 'Ad Performance'
7. Report to board: 'Daily Ad Report — [date]'"
Schedule: daily_9am

### Agent 4: Budget Controller (recurring weekly)
Task: "Review and optimize ad budget allocation. Steps:
1. Read performance data from Analyst (read_agent_data)
2. Calculate:
   - Total spend vs budget this month
   - ROAS by platform, campaign, audience
   - Cost per lead/sale by channel
   - Pacing: are we on track to hit monthly budget?
3. Recommend budget shifts:
   - Which platforms deserve more/less budget?
   - Which campaigns should be paused?
   - Where should we increase spend?
4. Create a simple budget table:
   | Platform | Current Budget | Recommended | Change | Reason |
5. Flag if any platform is overspending or underpacing
6. Report to board: 'Weekly Budget Review'"
Schedule: weekly_monday

## Step 4: Set Up the Ads Board
Board columns as campaign pipeline:
- **inbox** = New campaign ideas, ad concepts waiting for approval
- **up_next** = Approved — ready to launch
- **in_progress** = Live campaigns being monitored
- **in_review** = Performance reports, optimization recommendations
- **done** = Completed campaigns, implemented optimizations

## Step 5: Report to User
"Your paid ads team is live with 5 agents:

🔍 **Intel Agent** researches competitors and market monthly
🎯 **Strategist** designs campaigns with audience targeting and budgets
✍️ **Copywriter** creates fresh ad copy and creative briefs weekly
📊 **Analyst** monitors performance and flags issues daily
💰 **Budget Controller** optimizes spend allocation weekly

Your board tracks everything:
- New ad concepts → approval → live → performance review

Each morning you'll get: what's performing, what needs attention, and budget status.
Each week you'll get: fresh ad copy, creative briefs, and budget recommendations.

[If no platform access]: Share your ad platform screenshots or export CSVs and I'll analyze them. Connect your ad accounts in Settings for automated monitoring."

## Budget Management Principles
- Never recommend spending more than the user's stated budget
- Always recommend a 15-20% testing budget for experiments
- Kill underperformers fast (3-5 days of bad data = pause)
- Double down on winners (if ROAS > target, increase budget gradually — 20% every 3 days)
- Platform diversification: never put 100% in one platform
- Seasonal awareness: flag upcoming holidays, events, industry seasons`,
  },
  {
    name: 'ad-copywriter',
    description: 'Writes high-converting ad copy for any platform — Meta, Google, LinkedIn, TikTok. Creates headlines, descriptions, hooks, CTAs, and creative briefs with platform-specific specs. Use whenever the user mentions ad copy, "write an ad", headlines, ad creative, Facebook ad, Google ad, video script for ads, ad hooks, or needs copy for any paid campaign — even if they just say "I need ads for this".',
    category: 'writing',
    icon: '🎪',
    allowed_tools: ['web_search', 'analyze_url', 'manage_memory_box'],
    instructions: `# Ad Copywriting

## Workflow
1. **Understand**: Product, audience, platform, goal, budget tier
2. **Research**: Check competitor ads, landing page, existing copy in memory
3. **Write**: Platform-specific copy with multiple variations
4. **Brief**: Creative/visual briefs with exact specs

## Platform Specs & Copy Formats

### Meta/Instagram Ads
- **Primary text**: 125 chars visible (up to 500 total), hook in first line
- **Headline**: 27 chars (40 max)
- **Description**: 27 chars
- **Image**: 1080×1080 (feed), 1080×1920 (stories/reels)
- **Video**: Hook in first 3 seconds, 15-60 sec, captions required

Provide: 3 primary text variations × 5 headlines × 3 descriptions = mix and match

### Google Search Ads (RSA)
- **Headlines**: Up to 15, each max 30 chars (provide 10+)
- **Descriptions**: Up to 4, each max 90 chars
- Pin headline 1 = brand/product, headline 2 = key benefit
- Include keywords naturally
- Add: 4 sitelinks, 4 callouts, structured snippets

### Google Display/YouTube
- **Display**: Short headline (25), long headline (90), description (90), business name (25)
- **YouTube**: Hook in 5 sec (before skip), CTA overlay text

### LinkedIn Ads
- **Sponsored content**: Intro text (150 chars ideal), headline (70 chars)
- **Message ads**: Subject (60), body (<500 words), CTA button
- Professional tone, no clickbait, data-driven hooks

### TikTok Ads
- **Text overlay**: 1-2 lines max, large font
- **Hook**: First 1 second must stop the scroll
- **Script**: Problem → agitate → solution → CTA, 15-30 sec
- Native feel — don't look like an ad

## A/B Testing Copy
For every campaign, create test pairs. Change ONLY ONE element:
- Test A vs B: different hook, same offer
- Test C vs D: same hook, different CTA
- Test E vs F: same copy, different creative brief

## Creative Brief Format
For each ad:
- **Visual concept**: What the image/video shows
- **Text overlay**: Exact text on the creative
- **Format**: Size, duration, orientation
- **Mood**: Colors, style, energy level
- **Reference**: "Similar to [brand] style" if applicable

## Quality Standards
- Every headline must have a clear benefit or curiosity hook
- Never use ALL CAPS for entire text (one word max for emphasis)
- Include social proof where possible (numbers, testimonials)
- CTA must be specific ("Get 50% off" not "Learn more")
- Write for the scroll — if someone is thumb-stopping, what do they see first?`,
  },
  // ── Recruiting & HR Skills ──────────────────────────────────────────
  {
    name: 'recruiting-pipeline',
    description: 'Orchestrates hiring — job descriptions, sourcing, candidate evaluation, outreach, interview prep. Use whenever the user mentions hiring, recruiting, "find me a developer", job posting, candidates, talent, interview, "we need to hire", team building, sourcing, headhunting, or any staffing need — even if they just say "I need more people".',
    category: 'product',
    icon: '👥',
    allowed_tools: ['web_search', 'analyze_url', 'manage_board', 'manage_memory_box', 'manage_recurring_task'],
    instructions: `# Recruiting Pipeline

## MULTI-AGENT OPERATION
Deploy agents for each phase of hiring.

## Step 1: Understand the Role
- What role? (title, seniority, team)
- Must-have skills vs nice-to-have?
- Remote/hybrid/onsite? Location?
- Salary range?
- Timeline — when do they need to start?

## Step 2: Deploy Recruiting Team

### Agent 1: Job Spec Writer (once)
Task: "Write a compelling job description for [role]. Include: engaging company intro, what they'll do (not a chore list), requirements (must-have vs nice-to-have), what we offer, salary range if provided. Also create: LinkedIn job post version, short social media version. Save to memory."

### Agent 2: Talent Sourcer (once, then weekly)
Task: "Find 20 potential candidates for [role]. Search LinkedIn profiles, GitHub (for devs), personal sites. For each: name, current role, relevant experience, contact method, why they're a fit. Score 1-10. Save top candidates to board as cards."
Schedule: weekly

### Agent 3: Outreach Writer (once)
Task: "Write personalized outreach sequences for top candidates. 3-message sequence: (1) Personal hook + role intro, (2) Company vision + why them specifically, (3) Soft close. Keep each under 80 words. Reference their specific work."

### Agent 4: Interview Prep (once per candidate)
Task: "Prepare interview materials: 10 role-specific questions, evaluation rubric, take-home assignment if applicable, red flags to watch for. Save to memory."

## Board as Hiring Pipeline
- **inbox** = Candidates to review
- **up_next** = Approved for outreach
- **in_progress** = Outreach sent / in conversation
- **in_review** = Interview scheduled/completed
- **done** = Hired / Passed`,
  },
  // ── Product Launch Skills ───────────────────────────────────────────
  {
    name: 'product-launch',
    description: 'Orchestrates a product launch — go-to-market strategy, launch timeline, press/PR, landing pages, email announcements, social campaigns, community activation. Use whenever the user mentions launch, "we\'re launching", go-to-market, GTM, product release, beta launch, public launch, launch plan, Product Hunt, announcement, or any product release — even if they just say "we\'re almost ready to launch".',
    category: 'product',
    icon: '🎯',
    allowed_tools: ['web_search', 'analyze_url', 'manage_board', 'manage_memory_box', 'manage_recurring_task'],
    instructions: `# Product Launch Orchestration

## MULTI-AGENT OPERATION — TIME-SENSITIVE
Every launch has a countdown. Set up agents with deadlines.

## Step 1: Launch Brief
- What's launching? (product, feature, update)
- Launch date?
- Target audience?
- Channels? (ProductHunt, email, social, press, community)
- Budget for launch?
- Success metrics? (signups, revenue, press coverage)

## Step 2: Deploy Launch Team

### Agent 1: Launch Strategist (once, immediately)
Task: "Create the launch plan. T-minus countdown:
T-30 days: Positioning, messaging, landing page copy
T-14 days: Press list, influencer outreach, early access
T-7 days: Social content calendar, email sequences drafted
T-3 days: Everything queued, beta tester feedback incorporated
T-0: Launch execution checklist
T+7: Post-launch analysis
Save full plan to memory, create milestone cards on board."

### Agent 2: Copy & Content (once)
Task: "Write all launch assets: landing page copy (hero, features, social proof, CTA), launch announcement email, press release, Product Hunt listing (tagline, description, first comment), 5 social media announcement posts. Save all to memory."

### Agent 3: Press & Outreach (once)
Task: "Research 30 relevant journalists, bloggers, and influencers. For each: name, outlet, beat, email, why they'd care about our launch. Draft personalized pitch for top 10. Save list to board."

### Agent 4: Launch Day Monitor (once on launch day)
Task: "Monitor launch performance: track mentions, respond to comments, flag issues, compile hourly stats. Report to board every 2 hours."

### Agent 5: Post-Launch Analyst (T+7 days)
Task: "Analyze launch results: signups, traffic, press coverage, social engagement, conversion rate. Compare to goals. Identify what worked, what didn't. Recommend next steps."

## Board as Launch Timeline
- **inbox** = Launch tasks backlog
- **up_next** = This week's launch prep
- **in_progress** = Being worked on
- **in_review** = Ready for founder review
- **done** = Completed launch tasks`,
  },
  // ── Fundraising Skills ──────────────────────────────────────────────
  {
    name: 'fundraising',
    description: 'Orchestrates fundraising — investor research, deck preparation, outreach, pipeline tracking, due diligence prep. Use whenever the user mentions fundraising, raising money, investors, VC, angel investors, seed round, Series A, "we need funding", valuation, term sheet, pitch, fundraise, or any capital raising — even if they just say "we need money to grow".',
    category: 'product',
    icon: '💸',
    allowed_tools: ['web_search', 'analyze_url', 'manage_board', 'manage_memory_box', 'manage_recurring_task'],
    instructions: `# Fundraising Operations

## MULTI-AGENT OPERATION
Deploy agents for investor research, materials prep, outreach, and pipeline tracking.

## Step 1: Fundraising Brief
- How much raising? What stage? (pre-seed, seed, A, B)
- Current metrics? (ARR, MRR, users, growth rate)
- What's the money for? (hiring, marketing, product)
- Any existing investors or warm intros?
- Timeline — when do you need the money?

## Step 2: Deploy Fundraising Team

### Agent 1: Investor Researcher (once)
Task: "Find 50 investors who actively invest in [stage] [industry] companies. For each: name, firm, check size, recent investments in similar space, thesis/focus, best intro path (mutual connections, cold email, Twitter DM). Score by fit 1-10. Save to board as pipeline cards."

### Agent 2: Materials Preparer (once)
Task: "Prepare fundraising materials: executive summary (1-pager), pitch deck outline with data for each slide (use pitch-deck skill), financial model summary, FAQ document (common investor questions + answers). Save all to memory."

### Agent 3: Outreach Campaigner (once)
Task: "Write personalized investor outreach for top 20 investors. Each email: specific reference to their portfolio/thesis, one-line company description, key metric that proves traction, soft ask (intro call). 3-touch sequence per investor. Save to memory."

### Agent 4: Pipeline Tracker (recurring weekly)
Task: "Update investor pipeline status. Check board for: who was contacted, who responded, meetings scheduled, follow-ups needed. Compile weekly pipeline report. Flag investors going cold (no response in 7+ days). Suggest next batch of outreach."

## Board as Investor Pipeline
- **inbox** = Researched investors (not yet contacted)
- **up_next** = Approved for outreach
- **in_progress** = Outreach sent
- **in_review** = In conversation / meeting scheduled
- **done** = Term sheet / committed / passed`,
  },
  // ── Industry & Market Monitoring Skills ─────────────────────────────
  {
    name: 'industry-monitor',
    description: 'Continuously monitors industry news, competitor moves, market trends, and regulatory changes. Use whenever the user mentions "keep me updated on", industry news, market monitoring, competitor tracking, trend watching, "what\'s happening in our space", alerts, or wants ongoing intelligence about their market — even if they just say "I want to stay on top of things".',
    category: 'research',
    icon: '📡',
    allowed_tools: ['web_search', 'analyze_url', 'manage_board', 'manage_memory_box', 'manage_recurring_task'],
    instructions: `# Industry Monitoring

## RECURRING OPERATION
Set up agents that continuously scan and report.

## Step 1: Define Monitoring Scope
- What industry/niche?
- Key competitors to track? (names)
- Topics of interest? (AI, funding, regulation, product launches)
- How often? (daily brief, weekly digest, instant for critical)

## Step 2: Deploy Monitoring Team

### Agent 1: Daily Scanner (recurring daily)
Task: "Scan for industry news and developments. Search for: [competitors] news, [industry] funding, [industry] product launches, [industry] regulation. For each relevant item: headline, source, date, why it matters to us, impact level (high/medium/low). Save top 5 to board. Save all to memory box 'Industry Intel'."
Schedule: daily_9am

### Agent 2: Competitor Tracker (recurring weekly)
Task: "Deep-check each competitor: new features, pricing changes, funding, hiring patterns (check their careers page), social media activity, press mentions. Compare to last week. Flag anything significant. Report changes to board."
Schedule: weekly_monday

### Agent 3: Weekly Digest (recurring weekly)
Task: "Compile the week's intelligence into a digest: Top 5 industry developments, competitor moves, opportunities spotted, threats identified, recommended actions. Format as a brief executive briefing (under 500 words)."
Schedule: weekly_monday

## Output: Morning Brief Format
**🌅 Industry Brief — [Date]**
- 🔴 [Critical]: [headline + why it matters]
- 🟡 [Notable]: [headline + context]
- 🟢 [Opportunity]: [trend + how to capitalize]
- 📊 [Competitor]: [what they did + our response]`,
  },
  {
    name: 'brand-monitor',
    description: 'Monitors brand reputation — mentions, reviews, sentiment, PR crises. Use whenever the user mentions brand monitoring, reputation, reviews, "what are people saying about us", mentions, sentiment analysis, PR crisis, negative reviews, or wants to track their online reputation — even if they just say "I want to know what people think of us".',
    category: 'research',
    icon: '👁️',
    allowed_tools: ['web_search', 'analyze_url', 'manage_board', 'manage_memory_box', 'manage_recurring_task'],
    instructions: `# Brand Monitoring

## RECURRING OPERATION

## Deploy Monitoring Team

### Agent 1: Mention Scanner (recurring daily)
Task: "Search for brand mentions: '[brand name]' on Twitter, Reddit, HackerNews, review sites (G2, Capterra, Trustpilot). Classify each: positive, neutral, negative. Flag any negative mentions immediately. Save all to memory box 'Brand Mentions'."
Schedule: daily_9am

### Agent 2: Review Monitor (recurring weekly)
Task: "Check review platforms for new reviews. For each: rating, key quote, sentiment, actionable feedback. Track average rating over time. Draft responses for negative reviews (empathetic, solution-oriented). Save to board."
Schedule: weekly_monday

### Agent 3: Sentiment Reporter (recurring weekly)
Task: "Compile weekly sentiment report: total mentions, sentiment breakdown (positive/neutral/negative %), trending topics about us, comparison to last week, any PR risks, recommended responses. Save to memory."
Schedule: weekly_monday

## Crisis Protocol
If Agent 1 detects a CRITICAL negative mention (viral complaint, press article, security issue):
→ Report to board immediately with 🚨 prefix
→ Draft crisis response options
→ Flag for human review — NEVER auto-respond to crises`,
  },
  // ── Business Planning Skills ────────────────────────────────────────
  {
    name: 'business-plan',
    description: 'Creates comprehensive business plans — market analysis, business model, financial projections, go-to-market strategy. Use whenever the user mentions business plan, business model canvas, market opportunity, "starting a business", startup plan, business case, feasibility study, or needs to plan a new venture — even if they just say "I have a business idea".',
    category: 'analysis',
    icon: '📑',
    allowed_tools: ['web_search', 'analyze_url', 'calculate', 'manage_board', 'manage_memory_box'],
    instructions: `# Business Plan

## MULTI-AGENT OPERATION

## Deploy Planning Team

### Agent 1: Market Researcher (once)
Task: "Research the market for [business idea]: TAM/SAM/SOM with sources, growth rate, key trends, competitive landscape (top 5 players + positioning), customer segments, regulatory considerations. Save to memory."

### Agent 2: Business Model Designer (once)
Task: "Design the business model: value proposition canvas, revenue model, cost structure, key resources/activities/partners, channels, customer relationships. Create Business Model Canvas. Save to memory."

### Agent 3: Financial Modeler (once)
Task: "Build 3-year financial projections: revenue model by stream, cost breakdown, unit economics, cash flow forecast, break-even analysis. Conservative/base/optimistic scenarios. Save to memory."

### Agent 4: Strategy Writer (once)
Task: "Compile the complete business plan document. Read all agent findings (read_agent_data). Structure:
1. Executive Summary
2. Problem & Solution
3. Market Opportunity (from Agent 1)
4. Business Model (from Agent 2)
5. Go-to-Market Strategy
6. Financial Plan (from Agent 3)
7. Team & Execution
8. Risks & Mitigations
9. Funding Requirements
Save to memory. Report to board."`,
  },
  {
    name: 'partnership-manager',
    description: 'Manages partnership development — partner research, outreach, proposal writing, relationship tracking. Use whenever the user mentions partnerships, "find partners", business development, channel partners, affiliates, integrations, co-marketing, strategic alliances, "we should partner with", or any B2B relationship building — even if they just say "we need to grow through partners".',
    category: 'product',
    icon: '🤝',
    allowed_tools: ['web_search', 'analyze_url', 'manage_board', 'manage_memory_box', 'manage_recurring_task'],
    instructions: `# Partnership Management

## MULTI-AGENT OPERATION

## Step 1: Partnership Strategy
- What type? (technology, channel, co-marketing, affiliate, integration)
- Ideal partner profile? (size, industry, audience overlap)
- What do we offer them? What do we want from them?

## Step 2: Deploy Partnership Team

### Agent 1: Partner Researcher (once)
Task: "Find 30 potential partners for [company]. For each: company name, what they do, audience overlap, partnership potential, key contact, how to reach them, strategic fit score 1-10. Focus on [partnership type]. Save to board as pipeline."

### Agent 2: Proposal Writer (once)
Task: "Write a partnership proposal template: what we bring, what they bring, mutual benefits, suggested structure (rev share, co-marketing, integration), success metrics, next steps. Customize for top 5 partners. Save to memory."

### Agent 3: Outreach Manager (once)
Task: "Write personalized outreach for top 10 partners. 3-touch sequence: (1) Mutual value intro, (2) Specific collaboration idea, (3) Easy next step. Keep each under 100 words."

### Agent 4: Relationship Tracker (recurring weekly)
Task: "Update partnership pipeline. Check board for status changes, follow-ups needed, meetings coming up. Weekly report: active conversations, pipeline value, next actions needed."

## Board as Partnership Pipeline
- **inbox** = Researched partners
- **up_next** = Outreach approved
- **in_progress** = In conversation
- **in_review** = Proposal sent / negotiating
- **done** = Partnership live`,
  },
  {
    name: 'employee-onboarding',
    description: 'Creates employee onboarding programs — welcome sequences, training plans, 30/60/90 day goals, documentation. Use whenever the user mentions employee onboarding, "new hire starting", training plan, onboarding checklist, 30-60-90, new employee, team onboarding, or wants to prepare for bringing someone new onto the team — even if they just say "we just hired someone".',
    category: 'product',
    icon: '🎓',
    allowed_tools: ['manage_board', 'manage_memory_box', 'web_search'],
    instructions: `# Employee Onboarding

## Workflow
1. **Understand the role**: What position, team, seniority?
2. **Create onboarding plan**
3. **Set up tracking**

## Output: Onboarding Package

### Welcome Email Template
- Warm welcome from team
- Start date, time, where to go
- What to bring/set up before day 1
- Who they'll meet first

### Day 1 Checklist
- [ ] Access: email, Slack, tools, repos
- [ ] Meet: manager, buddy, team
- [ ] Read: company handbook, product docs
- [ ] Set up: dev environment / workspace

### Week 1 Plan
| Day | Focus | Key Activities |
|-----|-------|---------------|
| Mon | Welcome | Orientation, meet team, access setup |
| Tue | Product | Product deep-dive, customer stories |
| Wed | Process | Workflows, tools, communication norms |
| Thu | Role | First task (small win), shadow a colleague |
| Fri | Check-in | 1:1 with manager, questions, feedback |

### 30/60/90 Day Goals
**30 Days — Learn**
- Understand product, customers, and market
- Complete all initial training
- Ship first small contribution

**60 Days — Contribute**
- Own a project end-to-end
- Build cross-team relationships
- Identify one improvement opportunity

**90 Days — Own**
- Operate independently in role
- Deliver measurable results
- Propose and lead an initiative

### Buddy Program
- Assign an onboarding buddy (not the manager)
- Weekly 30-min check-ins for first month
- Buddy handles: "where do I find X?", culture questions, unwritten rules`,
  },
  // ── Productivity & Operations Skills ─────────────────────────────────
  {
    name: 'meeting-notes',
    description: 'Summarizes meetings, extracts action items, sends follow-ups, and tracks commitments. Use whenever the user mentions meeting notes, "summarize this meeting", action items, meeting recap, follow-up from meeting, "what did we decide", minutes, or shares any meeting transcript/recording — even if they just paste a wall of text from a call.',
    category: 'product',
    icon: '📝',
    allowed_tools: ['manage_board', 'manage_memory_box'],
    instructions: `# Meeting Notes & Action Items

## Workflow
1. **Process the input**: meeting transcript, notes, or verbal recap
2. **Extract and structure**
3. **Create action items on board**
4. **Save decisions to memory**

## Output Format
### Meeting Summary
**Date**: [date] | **Attendees**: [names] | **Duration**: ~[X] min

### Key Decisions
1. [Decision made + brief rationale]
2. [Decision made]

### Action Items
| Owner | Action | Deadline |
|-------|--------|----------|
| [name] | [specific task] | [date] |

→ Each action item also created as a board card in 'up_next'

### Discussion Notes
- [Topic 1]: [key points, different viewpoints, conclusion]
- [Topic 2]: [key points]

### Open Questions / Parking Lot
- [Question that needs follow-up]

### Follow-up Email Draft
Subject: Recap: [Meeting Topic] — [Date]
[Summary + action items + next steps in email format]

## Quality Standards
- Action items must have an owner and deadline
- Decisions must be clearly stated (not buried in discussion)
- If something was unresolved, put it in Open Questions — don't pretend it was decided`,
  },
  {
    name: 'project-tracker',
    description: 'Manages projects — milestones, timelines, task breakdowns, status tracking, blockers, team coordination. Use whenever the user mentions project management, milestones, timeline, "track this project", Gantt chart, sprint, backlog, deadlines, project status, "are we on track", or wants to manage any multi-week initiative — even if they just say "help me manage this".',
    category: 'product',
    icon: '📐',
    allowed_tools: ['manage_board', 'manage_memory_box', 'manage_recurring_task'],
    instructions: `# Project Management

## Workflow
1. **Define the project**: goal, scope, deadline, team
2. **Break into milestones** (2-4 week chunks)
3. **Break milestones into tasks**
4. **Set up tracking on board**
5. **Create recurring status check agent**

## Project Setup

### Milestone Breakdown
For each milestone:
| Milestone | Tasks | Owner | Deadline | Dependencies |
|-----------|-------|-------|----------|-------------|

### Task Cards (on board)
Each task card includes:
- Title: [Verb] [Object] — e.g., "Design landing page wireframe"
- Description: acceptance criteria, context
- Column: inbox → up_next → in_progress → in_review → done

### Weekly Status Agent (recurring)
Deploy a weekly status agent that:
1. Checks board for task progress
2. Identifies: completed this week, in progress, blocked, at risk
3. Calculates: % complete, days until deadline, burn rate
4. Flags: tasks overdue, milestones at risk, blockers needing attention
5. Reports to user with recommendations

## Status Report Format
**Project: [Name]** — [X]% complete, [Y] days remaining

🟢 On Track | 🟡 At Risk | 🔴 Behind

### This Week
- ✅ [Completed tasks]
- 🔄 [In progress]
- 🚫 [Blocked — reason + needed action]

### Next Week Focus
1. [Priority task]
2. [Priority task]

### Risks
- [Risk + mitigation]`,
  },
  {
    name: 'crm-manager',
    description: 'Manages CRM operations — contact enrichment, deal tracking, pipeline health, data cleanup, activity logging. Use whenever the user mentions CRM, HubSpot, Salesforce, contacts, deals, pipeline, "clean up our CRM", contact data, customer records, deal stages, or any customer relationship management — even if they just say "our CRM is a mess".',
    category: 'product',
    icon: '🗄️',
    allowed_tools: ['web_search', 'analyze_url', 'manage_board', 'manage_memory_box', 'manage_recurring_task'],
    instructions: `# CRM Management

## Determine Mode
**Setting up CRM?** → Design pipeline stages, fields, workflows
**Cleaning CRM?** → Audit data quality, deduplicate, enrich
**Managing pipeline?** → Track deals, forecast, identify actions

## CRM Setup (if no CRM exists)
Use the board as a lightweight CRM:
- **inbox** = New contacts/leads
- **up_next** = Qualified / ready for outreach
- **in_progress** = Active deals / conversations
- **in_review** = Proposal sent / negotiating
- **done** = Won / Closed

Each card = one contact/deal with: name, company, value, stage, next action, last contact date

## Pipeline Health Agent (recurring weekly)
Task: "Analyze CRM pipeline health:
- Total pipeline value by stage
- Deals stuck >7 days in same stage (flag for action)
- Deals with no activity in 14+ days (at risk)
- Win rate by source/stage
- Forecast: likely closes this month
- Data quality: contacts missing email, company, or stage
Report: pipeline summary + top 5 actions needed"

## Contact Enrichment Agent (once or as needed)
Task: "For each contact missing data, research: company size, industry, role, LinkedIn profile, recent company news. Update records. Flag contacts that may have changed jobs."

## Integration Note
Be honest: "For full CRM sync, connect HubSpot or Salesforce in Settings → Integrations. Until then, I'll manage your pipeline on the board and save all contact data to memory."`,
  },
  {
    name: 'churn-prevention',
    description: 'Identifies churn risk signals and creates retention strategies. Use whenever the user mentions churn, retention, "customers are leaving", cancellations, "why are users quitting", customer health score, engagement drop, win-back, or any customer retention concern — even if they just say "we\'re losing customers".',
    category: 'analysis',
    icon: '🛡️',
    allowed_tools: ['web_search', 'analyze_url', 'calculate', 'manage_board', 'manage_memory_box'],
    instructions: `# Churn Prevention

## Workflow
1. **Identify churn signals**: What data/indicators do we have?
2. **Analyze patterns**: Why are customers leaving?
3. **Build retention playbook**: Actions for each risk level
4. **Set up monitoring**: Recurring alerts for at-risk accounts

## Churn Signal Analysis
Ask for (or research):
- Cancellation reasons (if available)
- Usage drop patterns
- Support ticket frequency
- Payment failures
- Feature adoption rates
- Time since last login

## Output Format
### Churn Risk Assessment
| Risk Level | Signals | # Accounts | Recommended Action |
|------------|---------|------------|-------------------|
| 🔴 Critical | [signals] | X | [immediate action] |
| 🟡 At Risk | [signals] | X | [proactive outreach] |
| 🟢 Healthy | [signals] | X | [nurture] |

### Retention Playbook
**For Critical Risk:**
1. Personal outreach within 24 hours
2. Offer: [specific save offer based on their usage]
3. Schedule success call

**For At Risk:**
1. Automated re-engagement email sequence
2. Feature education based on unused features
3. Check-in from success team

**For Win-Back (already churned):**
1. Wait 30 days
2. Send "what's changed" email with new features
3. Offer comeback incentive

### Metrics to Track
- Monthly churn rate: [current vs target]
- Net revenue retention: [current]
- Save rate: [% of at-risk saved]`,
  },
  {
    name: 'legal-docs',
    description: 'Drafts common business legal documents — privacy policies, terms of service, contracts, NDAs, agreements. Use whenever the user mentions legal, privacy policy, terms of service, ToS, NDA, contract, agreement, GDPR, compliance, "we need legal docs", data processing, or any legal document need — even if they just say "do we need a privacy policy?".',
    category: 'writing',
    icon: '⚖️',
    allowed_tools: ['web_search', 'analyze_url', 'manage_memory_box'],
    instructions: `# Legal Document Drafting

## CRITICAL DISCLAIMER
Always include: "This is a draft template for reference. I strongly recommend having a qualified attorney review this before use. Legal requirements vary by jurisdiction."

## Workflow
1. **Determine document type**
2. **Gather requirements** (jurisdiction, business type, data handling)
3. **Research current requirements** (GDPR, CCPA, etc.)
4. **Draft the document**
5. **Save to memory**

## Document Types

### Privacy Policy
Must include: what data collected, how used, who shared with, retention period, user rights (access, delete, portability), cookie policy, contact information, children's data, international transfers.

### Terms of Service
Must include: acceptance terms, service description, user responsibilities, prohibited uses, intellectual property, limitation of liability, termination, dispute resolution, governing law.

### NDA (Non-Disclosure Agreement)
Must include: definition of confidential information, obligations, exclusions, term, return of materials, remedies.

### SaaS Agreement
Must include: license grant, service levels (SLA), data ownership, security, payment terms, support, maintenance windows.

## Quality Standards
- Use plain language where possible (not legalese for the sake of it)
- Include jurisdiction-specific requirements
- Date the document and include version number
- ALWAYS recommend lawyer review — never present as final legal advice`,
  },
  {
    name: 'kpi-dashboard',
    description: 'Creates KPI tracking frameworks, dashboard designs, and metrics reports. Use whenever the user mentions KPIs, metrics, dashboard, "what should we track", OKRs, performance metrics, scorecards, "how are we doing", analytics setup, or wants to measure business performance — even if they just say "I don\'t know if we\'re doing well".',
    category: 'analysis',
    icon: '📊',
    allowed_tools: ['calculate', 'manage_board', 'manage_memory_box', 'manage_recurring_task'],
    instructions: `# KPI Dashboard & Metrics

## Workflow
1. **Understand the business**: What stage? What model? What goals?
2. **Define metrics framework**: What matters at this stage
3. **Design the dashboard**: What to track weekly/monthly
4. **Set up reporting**: Recurring agent for updates

## Metrics Framework by Business Stage

### Pre-Product/Market Fit
- User signups (weekly)
- Activation rate (% who complete key action)
- Retention (week 1, week 4)
- Qualitative feedback themes
- Burn rate / runway

### Post-PMF / Growth Stage
- MRR / ARR + growth rate
- Net revenue retention
- CAC by channel
- LTV:CAC ratio
- Churn rate (monthly)
- Activation rate
- Feature adoption

### Scale Stage
- Revenue growth rate
- Gross margin
- Rule of 40 (growth + profit margin)
- Sales efficiency (new ARR / S&M spend)
- Net dollar retention
- Magic number

## Dashboard Template
### Weekly Pulse (track every Monday)
| Metric | This Week | Last Week | Change | Target |
|--------|-----------|-----------|--------|--------|
| [metric] | [value] | [value] | [+/-] | [target] |

### Monthly Deep Dive
- Revenue breakdown by source/plan
- Cohort retention curves
- Funnel conversion rates
- Unit economics update

## Reporting Agent (recurring weekly)
Deploy agent to compile metrics from available data and present weekly pulse to user every Monday morning.`,
  },
  {
    name: 'translation',
    description: 'Translates and localizes content — websites, apps, documents, marketing materials. Use whenever the user mentions translation, localization, "translate to", multilingual, internationalization, i18n, "expand to [country]", language support, or any content that needs to work in another language — even if they just say "we want to go international".',
    category: 'writing',
    icon: '🌍',
    allowed_tools: ['web_search', 'manage_memory_box'],
    instructions: `# Translation & Localization

## Workflow
1. **Scope**: What content? Which languages? Audience?
2. **Translate**: Preserve meaning, tone, and intent — not word-for-word
3. **Localize**: Adapt cultural references, formats, conventions
4. **Review**: Flag uncertain translations

## Translation Principles
- Meaning over literal: "It's raining cats and dogs" → local equivalent idiom
- Preserve brand voice: formal stays formal, casual stays casual
- Cultural sensitivity: check for offensive or inappropriate meaning in target culture
- Format localization: dates, currencies, addresses, phone numbers

## For Each Piece of Content
**Original**: [source text]
**Translation**: [translated text]
**Localization Notes**: [any cultural adaptations made]
**Confidence**: High / Medium / Low
**Needs Native Review**: Yes / No + reason

## Quality Standards
- ALWAYS flag translations you're less confident about
- Note cultural differences that may affect messaging
- Keep consistent terminology (save glossary to memory)
- For marketing: creative transcreation > literal translation
- For legal/technical: accuracy > style

## Recommend professional review for: legal documents, medical content, financial disclosures, anything with legal liability.`,
  },
  {
    name: 'vendor-sourcing',
    description: 'Researches and evaluates vendors, suppliers, and service providers. Use whenever the user mentions finding a vendor, supplier, agency, "who should we use for", service provider comparison, RFP, procurement, outsourcing, or needs to evaluate any external partner — even if they just say "we need someone to do X for us".',
    category: 'research',
    icon: '🔗',
    allowed_tools: ['web_search', 'analyze_url', 'manage_board', 'manage_memory_box'],
    instructions: `# Vendor Sourcing & Evaluation

## Workflow
1. **Define requirements**: What do you need? Budget? Timeline?
2. **Research candidates**: Find 8-12 potential vendors
3. **Evaluate**: Score against criteria
4. **Present shortlist**: Top 3-5 with comparison

## Research Phase
For each vendor find:
- Company overview, size, years in business
- Relevant case studies or portfolio
- Pricing model and estimated cost
- Reviews (G2, Clutch, Trustpilot)
- Key differentiators
- Red flags (complaints, lawsuits, bad reviews)

## Evaluation Matrix
| Vendor | Quality | Price | Experience | Reviews | Support | Total |
|--------|---------|-------|------------|---------|---------|-------|
| Weight | 25% | 20% | 20% | 15% | 20% | 100% |
| [vendor] | X/10 | X/10 | X/10 | X/10 | X/10 | X/10 |

## Output Format
### Recommendation
**Top pick**: [Vendor] — [why in one sentence]
**Runner-up**: [Vendor] — [why]
**Budget option**: [Vendor] — [why]

### Detailed Comparison
[Table with all evaluated criteria]

### Questions to Ask
- [Specific question for each shortlisted vendor]
- [Red flag to probe on]

### Next Steps
1. [Contact top 3 for proposals]
2. [Request specific references]
3. [Schedule demos]`,
  },
  {
    name: 'contract-review',
    description: 'Reviews contracts and agreements — flags risks, unusual clauses, missing protections, negotiation points. Use whenever the user mentions "review this contract", agreement review, "is this a good deal", terms analysis, red flags, contract negotiation, SLA review, or shares any legal document for feedback — even if they just paste contract text.',
    category: 'analysis',
    icon: '🔍',
    allowed_tools: ['manage_memory_box'],
    instructions: `# Contract Review

## DISCLAIMER
Always include: "This is an AI-assisted review for informational purposes. Consult a qualified attorney before making legal decisions based on this analysis."

## Workflow
1. **Read the full contract** carefully
2. **Identify key terms**
3. **Flag risks and unusual clauses**
4. **Compare to market standards**
5. **Recommend negotiation points**

## Review Checklist
### Financial Terms
- [ ] Payment terms and schedule
- [ ] Price escalation or auto-renewal clauses
- [ ] Penalties for early termination
- [ ] Hidden fees or variable costs

### Liability & Risk
- [ ] Limitation of liability (is it reasonable?)
- [ ] Indemnification (who bears risk?)
- [ ] Insurance requirements
- [ ] Force majeure clause

### Term & Termination
- [ ] Contract length
- [ ] Auto-renewal (how to opt out?)
- [ ] Termination notice period
- [ ] What happens to data/assets on termination?

### IP & Data
- [ ] Who owns work product?
- [ ] Data ownership and portability
- [ ] Confidentiality obligations
- [ ] Non-compete or exclusivity clauses

## Output Format
### Summary
- **Type**: [contract type]
- **Parties**: [who]
- **Term**: [duration]
- **Value**: [financial terms]

### 🔴 Red Flags (address before signing)
- [Clause + why it's risky + suggested change]

### 🟡 Negotiation Points (nice to improve)
- [Clause + market standard + suggested improvement]

### 🟢 Standard / Acceptable
- [Terms that look normal]

### Missing Protections
- [Clauses you'd expect to see but aren't there]

### Recommended Changes (in priority order)
1. [Most important change + specific language suggestion]
2. [Second most important]`,
  },
]
