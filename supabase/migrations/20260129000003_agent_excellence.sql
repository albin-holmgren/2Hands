-- Agent Excellence System
-- Makes agents "shockingly good" with benchmarking, evidence bundles, real research, and quality gates

-- ============================================
-- 1. BENCHMARKING & REGRESSION SUITE
-- ============================================

-- Golden task definitions for benchmarking
CREATE TABLE IF NOT EXISTS benchmark_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Task definition
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  skill_category TEXT NOT NULL, -- gmail, linkedin, shopify, notion, etc.
  difficulty TEXT NOT NULL DEFAULT 'medium', -- easy, medium, hard, complex
  
  -- Expected outcomes
  expected_steps_min INTEGER NOT NULL DEFAULT 5,
  expected_steps_max INTEGER NOT NULL DEFAULT 20,
  expected_duration_seconds INTEGER NOT NULL DEFAULT 120,
  success_criteria JSONB NOT NULL DEFAULT '[]', -- [{check: "text_present", value: "Message sent"}]
  
  -- Test configuration
  requires_credentials TEXT[] NOT NULL DEFAULT '{}',
  requires_setup TEXT, -- setup instructions
  cleanup_instructions TEXT,
  
  -- Metadata
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_benchmark_tasks_skill ON benchmark_tasks(skill_category);
CREATE INDEX idx_benchmark_tasks_active ON benchmark_tasks(is_active);

-- Benchmark run results
CREATE TABLE IF NOT EXISTS benchmark_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES benchmark_tasks(id) ON DELETE CASCADE,
  
  -- Run metadata
  run_number INTEGER NOT NULL DEFAULT 1,
  agent_version TEXT, -- git commit or version tag
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  
  -- Results
  status TEXT NOT NULL DEFAULT 'running', -- running, passed, failed, error
  
  -- Metrics
  total_steps INTEGER,
  screenshot_count INTEGER,
  tool_calls JSONB NOT NULL DEFAULT '{}', -- {tool_name: count}
  retry_count INTEGER NOT NULL DEFAULT 0,
  tokens_used INTEGER,
  cost_usd FLOAT,
  duration_seconds FLOAT,
  
  -- Quality checks
  success_criteria_met JSONB NOT NULL DEFAULT '[]', -- [{check, passed, evidence}]
  all_criteria_passed BOOLEAN,
  
  -- Errors
  error_message TEXT,
  error_step INTEGER,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_benchmark_runs_task ON benchmark_runs(task_id);
CREATE INDEX idx_benchmark_runs_status ON benchmark_runs(status);

-- Benchmark metrics aggregation (for dashboards)
CREATE TABLE IF NOT EXISTS benchmark_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Aggregation period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  skill_category TEXT, -- null for overall
  
  -- Success metrics
  total_runs INTEGER NOT NULL DEFAULT 0,
  passed_runs INTEGER NOT NULL DEFAULT 0,
  failed_runs INTEGER NOT NULL DEFAULT 0,
  success_rate FLOAT,
  
  -- Performance metrics
  avg_steps FLOAT,
  avg_duration_seconds FLOAT,
  avg_tokens FLOAT,
  avg_cost_usd FLOAT,
  p50_duration_seconds FLOAT,
  p90_duration_seconds FLOAT,
  
  -- Comparison to previous period
  success_rate_delta FLOAT,
  avg_duration_delta FLOAT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_benchmark_metrics_period ON benchmark_metrics(period_start, period_end);

-- ============================================
-- 2. EVIDENCE BUNDLES
-- ============================================

-- Evidence bundles for each agent run
CREATE TABLE IF NOT EXISTS evidence_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Run context
  task_description TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  
  -- Before state
  before_url TEXT,
  before_page_title TEXT,
  before_screenshot_url TEXT,
  before_state JSONB NOT NULL DEFAULT '{}',
  
  -- After state
  after_url TEXT,
  after_page_title TEXT,
  after_screenshot_url TEXT,
  after_state JSONB NOT NULL DEFAULT '{}',
  
  -- Artifacts created/modified
  artifacts JSONB NOT NULL DEFAULT '[]', -- [{type, name, url, description}]
  
  -- Confirmation signals captured
  confirmations JSONB NOT NULL DEFAULT '[]', -- [{signal, timestamp, screenshot_url}]
  
  -- Links referenced
  links_visited TEXT[] NOT NULL DEFAULT '{}',
  links_created TEXT[] NOT NULL DEFAULT '{}',
  
  -- Step receipts
  step_receipts JSONB NOT NULL DEFAULT '[]', -- [{step, action, result, screenshot_url, timestamp}]
  
  -- Final summary (like a senior employee update)
  executive_summary TEXT,
  key_outcomes TEXT[] NOT NULL DEFAULT '{}',
  next_steps TEXT[] NOT NULL DEFAULT '{}',
  
  -- Quality score
  evidence_quality_score FLOAT, -- 0-1 based on completeness
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_evidence_bundles_agent ON evidence_bundles(agent_id);
CREATE INDEX idx_evidence_bundles_user ON evidence_bundles(user_id);

-- ============================================
-- 3. REAL WEB RESEARCH WITH CITATIONS
-- ============================================

-- Web research sources (official docs, help centers, etc.)
CREATE TABLE IF NOT EXISTS research_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Source identification
  url TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  title TEXT,
  
  -- Source quality
  source_type TEXT NOT NULL DEFAULT 'general', -- official_docs, help_center, tutorial, blog, forum
  trust_score FLOAT NOT NULL DEFAULT 0.5, -- 0-1
  
  -- Content
  raw_content TEXT,
  extracted_content TEXT, -- cleaned/processed
  content_hash TEXT, -- for deduplication
  
  -- Metadata
  last_fetched_at TIMESTAMPTZ,
  last_modified_at TIMESTAMPTZ,
  fetch_count INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_research_sources_domain ON research_sources(domain);
CREATE INDEX idx_research_sources_type ON research_sources(source_type);

-- Research citations (specific knowledge extracted from sources)
CREATE TABLE IF NOT EXISTS research_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES research_sources(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Citation content
  tool_name TEXT NOT NULL, -- gmail, linkedin, etc.
  knowledge_type TEXT NOT NULL, -- ui_element, workflow, error_solution, best_practice
  content TEXT NOT NULL,
  
  -- Source reference
  source_url TEXT NOT NULL,
  source_section TEXT, -- heading or section where found
  quote TEXT, -- exact quote from source
  
  -- Confidence
  confidence FLOAT NOT NULL DEFAULT 0.7,
  verified_by_usage BOOLEAN NOT NULL DEFAULT false,
  usage_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  
  -- Freshness
  researched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_research_citations_tool ON research_citations(tool_name);
CREATE INDEX idx_research_citations_user ON research_citations(user_id);

-- ============================================
-- 4. SKILL MACROS / COMPILED PLAYBOOKS
-- ============================================

-- Skill macros (deterministic flows compiled from patterns)
CREATE TABLE IF NOT EXISTS skill_macros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Macro identification
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  skill_category TEXT NOT NULL,
  trigger_keywords TEXT[] NOT NULL DEFAULT '{}', -- words that trigger this macro
  
  -- Compiled steps
  steps JSONB NOT NULL DEFAULT '[]', -- [{action, selector/text, validation, retry_on_fail}]
  
  -- Validations
  preconditions JSONB NOT NULL DEFAULT '[]', -- [{check, expected}]
  postconditions JSONB NOT NULL DEFAULT '[]', -- [{check, expected}]
  
  -- Performance
  avg_duration_seconds FLOAT,
  success_rate FLOAT,
  times_used INTEGER NOT NULL DEFAULT 0,
  times_succeeded INTEGER NOT NULL DEFAULT 0,
  
  -- Source
  compiled_from_pattern_id UUID REFERENCES task_execution_patterns(id),
  compiled_at TIMESTAMPTZ,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  requires_review BOOLEAN NOT NULL DEFAULT false,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, name)
);

CREATE INDEX idx_skill_macros_user ON skill_macros(user_id);
CREATE INDEX idx_skill_macros_skill ON skill_macros(skill_category);

-- ============================================
-- 5. QUALITY GATES
-- ============================================

-- Definition of Done templates per task type
CREATE TABLE IF NOT EXISTS quality_gate_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Template identification
  name TEXT NOT NULL UNIQUE,
  task_type TEXT NOT NULL, -- email_send, social_post, data_entry, etc.
  
  -- Checks to perform
  checks JSONB NOT NULL DEFAULT '[]', -- [{name, type, config, required}]
  
  -- Example checks:
  -- {name: "confirmation_visible", type: "text_present", config: {texts: ["sent", "saved"]}, required: true}
  -- {name: "no_error_messages", type: "text_absent", config: {texts: ["error", "failed"]}, required: true}
  -- {name: "artifact_created", type: "url_changed", config: {}, required: false}
  
  -- Metadata
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quality gate results per run
CREATE TABLE IF NOT EXISTS quality_gate_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  template_id UUID REFERENCES quality_gate_templates(id),
  evidence_bundle_id UUID REFERENCES evidence_bundles(id),
  
  -- Results
  checks_performed JSONB NOT NULL DEFAULT '[]', -- [{name, passed, evidence, timestamp}]
  all_required_passed BOOLEAN NOT NULL DEFAULT false,
  overall_score FLOAT, -- 0-1
  
  -- QA pass
  qa_status TEXT NOT NULL DEFAULT 'pending', -- pending, passed, failed, needs_review
  qa_notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_quality_gate_results_agent ON quality_gate_results(agent_id);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE benchmark_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmark_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmark_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_macros ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_gate_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_gate_results ENABLE ROW LEVEL SECURITY;

-- Benchmark tables (admin only for now)
CREATE POLICY "Admins can manage benchmark tasks"
  ON benchmark_tasks FOR ALL
  USING (true); -- TODO: Add admin check

CREATE POLICY "Admins can manage benchmark runs"
  ON benchmark_runs FOR ALL
  USING (true);

CREATE POLICY "Admins can view benchmark metrics"
  ON benchmark_metrics FOR SELECT
  USING (true);

-- Evidence bundles (user-owned)
CREATE POLICY "Users can manage their evidence bundles"
  ON evidence_bundles FOR ALL
  USING (auth.uid() = user_id);

-- Research (shared + user-owned citations)
CREATE POLICY "Anyone can read research sources"
  ON research_sources FOR SELECT
  USING (true);

CREATE POLICY "Users can manage their research citations"
  ON research_citations FOR ALL
  USING (auth.uid() = user_id);

-- Skill macros (user-owned)
CREATE POLICY "Users can manage their skill macros"
  ON skill_macros FOR ALL
  USING (auth.uid() = user_id);

-- Quality gates
CREATE POLICY "Anyone can read quality gate templates"
  ON quality_gate_templates FOR SELECT
  USING (true);

CREATE POLICY "Users can view their quality gate results"
  ON quality_gate_results FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM agents WHERE agents.id = quality_gate_results.agent_id AND agents.user_id = auth.uid()
  ));

-- ============================================
-- SEED DATA: Benchmark tasks + Quality gate templates
-- ============================================

-- Seed benchmark tasks
INSERT INTO benchmark_tasks (name, description, skill_category, difficulty, expected_steps_min, expected_steps_max, expected_duration_seconds, success_criteria, requires_credentials) VALUES
('Gmail: Send Simple Email', 'Compose and send a simple email with subject and body', 'gmail', 'easy', 5, 12, 60, '[{"check": "text_present", "value": "Message sent"}, {"check": "text_present", "value": "Sent"}]', '{"gmail"}'),
('Gmail: Reply to Thread', 'Find and reply to an existing email thread', 'gmail', 'medium', 8, 18, 90, '[{"check": "text_present", "value": "Message sent"}]', '{"gmail"}'),
('LinkedIn: Create Post', 'Create and publish a text post on LinkedIn', 'linkedin', 'easy', 5, 15, 90, '[{"check": "text_present", "value": "Post successful"}, {"check": "url_contains", "value": "/feed/"}]', '{"linkedin"}'),
('Notion: Create Page', 'Create a new page in Notion with title and content', 'notion', 'easy', 5, 12, 60, '[{"check": "text_present", "value": "saved"}, {"check": "url_contains", "value": "notion.so"}]', '{"notion"}'),
('Google Sheets: Update Cell', 'Navigate to a spreadsheet and update a specific cell', 'google-sheets', 'easy', 6, 15, 60, '[{"check": "text_present", "value": "saved"}]', '{"google"}'),
('Web Research: Find Information', 'Search the web and extract specific information', 'web-research', 'medium', 10, 25, 120, '[{"check": "insight_reported", "min_count": 1}]', '{}'),
('Shopify: Update Product Price', 'Find a product and update its price', 'shopify', 'medium', 8, 20, 120, '[{"check": "text_present", "value": "saved"}, {"check": "text_present", "value": "Product"}]', '{"shopify"}')
ON CONFLICT DO NOTHING;

-- Seed quality gate templates
INSERT INTO quality_gate_templates (name, task_type, checks) VALUES
('Email Send', 'email_send', '[
  {"name": "confirmation_visible", "type": "text_present", "config": {"texts": ["Message sent", "Email sent", "Sent"]}, "required": true},
  {"name": "no_error_messages", "type": "text_absent", "config": {"texts": ["error", "failed", "could not"]}, "required": true},
  {"name": "not_in_drafts", "type": "url_not_contains", "config": {"value": "draft"}, "required": false}
]'),
('Social Post', 'social_post', '[
  {"name": "post_published", "type": "text_present", "config": {"texts": ["posted", "published", "shared"]}, "required": true},
  {"name": "no_error_messages", "type": "text_absent", "config": {"texts": ["error", "failed"]}, "required": true},
  {"name": "on_feed_page", "type": "url_contains", "config": {"value": "feed"}, "required": false}
]'),
('Data Entry', 'data_entry', '[
  {"name": "changes_saved", "type": "text_present", "config": {"texts": ["saved", "updated", "success"]}, "required": true},
  {"name": "no_validation_errors", "type": "text_absent", "config": {"texts": ["invalid", "required", "error"]}, "required": true}
]'),
('Document Creation', 'document_creation', '[
  {"name": "document_created", "type": "text_present", "config": {"texts": ["created", "saved", "new"]}, "required": true},
  {"name": "has_content", "type": "text_present", "config": {"texts": []}, "required": false}
]'),
('Web Research', 'web_research', '[
  {"name": "insights_reported", "type": "insight_count", "config": {"min": 1}, "required": true},
  {"name": "sources_cited", "type": "links_captured", "config": {"min": 1}, "required": false}
]')
ON CONFLICT (name) DO NOTHING;
