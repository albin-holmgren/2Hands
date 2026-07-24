-- Agent Collaboration & Advanced Intelligence System
-- Enables agent-to-agent collaboration, AI Manager orchestration, and predictive capabilities

-- ============================================
-- 1. TASK HANDOFF PROTOCOL
-- ============================================

-- Task handoffs between agents
CREATE TABLE IF NOT EXISTS agent_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Source agent
  source_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  source_agent_name TEXT NOT NULL,
  
  -- Target agent (can be null if requesting new agent creation)
  target_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  target_agent_name TEXT,
  
  -- User context
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Handoff details
  reason TEXT NOT NULL, -- why handoff is needed
  handoff_type TEXT NOT NULL DEFAULT 'skill_gap', -- skill_gap, workload, specialization, escalation
  
  -- Task context being handed off
  original_task TEXT NOT NULL,
  subtask_description TEXT NOT NULL,
  context_data JSONB NOT NULL DEFAULT '{}', -- relevant state, credentials needed, etc.
  
  -- Handoff state
  status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, rejected, completed, failed
  priority TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, urgent
  
  -- Results
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result_summary TEXT,
  success BOOLEAN,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_handoffs_source ON agent_handoffs(source_agent_id);
CREATE INDEX idx_agent_handoffs_target ON agent_handoffs(target_agent_id);
CREATE INDEX idx_agent_handoffs_user ON agent_handoffs(user_id);
CREATE INDEX idx_agent_handoffs_status ON agent_handoffs(status);

-- Handoff capability registry (what each agent can do)
CREATE TABLE IF NOT EXISTS agent_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  
  -- Capability definition
  skill_name TEXT NOT NULL, -- gmail, linkedin, shopify, etc.
  proficiency_score FLOAT NOT NULL DEFAULT 0.5, -- 0-1 based on success rate
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  tasks_failed INTEGER NOT NULL DEFAULT 0,
  avg_duration_seconds FLOAT,
  
  -- Learned from
  learned_from_handoffs INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(agent_id, skill_name)
);

CREATE INDEX idx_agent_capabilities_agent ON agent_capabilities(agent_id);
CREATE INDEX idx_agent_capabilities_skill ON agent_capabilities(skill_name);

-- ============================================
-- 2. SHARED LEARNING NETWORK
-- ============================================

-- Real-time learning broadcasts
CREATE TABLE IF NOT EXISTS learning_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Source
  source_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Learning content
  learning_type TEXT NOT NULL, -- success_strategy, error_solution, ui_change, workflow_optimization
  skill_category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  
  -- Context
  task_context TEXT,
  evidence JSONB NOT NULL DEFAULT '{}', -- screenshots, urls, etc.
  
  -- Quality metrics
  confidence FLOAT NOT NULL DEFAULT 0.7,
  verified BOOLEAN NOT NULL DEFAULT false,
  times_applied INTEGER NOT NULL DEFAULT 0,
  times_helped INTEGER NOT NULL DEFAULT 0,
  
  -- Broadcast status
  broadcast_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_learning_broadcasts_user ON learning_broadcasts(user_id);
CREATE INDEX idx_learning_broadcasts_skill ON learning_broadcasts(skill_category);
CREATE INDEX idx_learning_broadcasts_type ON learning_broadcasts(learning_type);

-- Learning subscriptions (which agents listen to what)
CREATE TABLE IF NOT EXISTS learning_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  
  -- What to subscribe to
  skill_category TEXT, -- null means all
  learning_type TEXT, -- null means all
  min_confidence FLOAT NOT NULL DEFAULT 0.6,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(agent_id, skill_category, learning_type)
);

CREATE INDEX idx_learning_subscriptions_agent ON learning_subscriptions(agent_id);

-- ============================================
-- 3. AI MANAGER ORCHESTRATION
-- ============================================

-- Task queue with prioritization
CREATE TABLE IF NOT EXISTS orchestration_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Task details
  task_description TEXT NOT NULL,
  task_type TEXT, -- detected type
  
  -- Assignment
  assigned_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  assignment_reason TEXT,
  
  -- Prioritization
  priority_score FLOAT NOT NULL DEFAULT 0.5, -- 0-1, computed from multiple factors
  priority_factors JSONB NOT NULL DEFAULT '{}', -- {urgency, importance, deadline, dependencies}
  
  -- Scheduling
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deadline TIMESTAMPTZ,
  optimal_start_time TIMESTAMPTZ,
  
  -- Dependencies
  depends_on UUID[], -- other queue items this depends on
  blocks UUID[], -- items blocked by this
  
  -- Status
  status TEXT NOT NULL DEFAULT 'queued', -- queued, assigned, running, completed, failed, cancelled
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Results
  result_summary TEXT,
  success BOOLEAN,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orchestration_queue_user ON orchestration_queue(user_id);
CREATE INDEX idx_orchestration_queue_status ON orchestration_queue(status);
CREATE INDEX idx_orchestration_queue_priority ON orchestration_queue(priority_score DESC);

-- Agent workload tracking
CREATE TABLE IF NOT EXISTS agent_workload (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  
  -- Current state
  current_task_id UUID REFERENCES orchestration_queue(id),
  status TEXT NOT NULL DEFAULT 'idle', -- idle, busy, overloaded, maintenance
  
  -- Capacity
  tasks_in_queue INTEGER NOT NULL DEFAULT 0,
  estimated_completion_time TIMESTAMPTZ,
  
  -- Performance
  tasks_completed_today INTEGER NOT NULL DEFAULT 0,
  avg_task_duration_seconds FLOAT,
  success_rate_24h FLOAT,
  
  -- Health
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  needs_attention BOOLEAN NOT NULL DEFAULT false,
  
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(agent_id)
);

CREATE INDEX idx_agent_workload_status ON agent_workload(status);

-- ============================================
-- 4. PREDICTIVE TASK ANTICIPATION
-- ============================================

-- User task patterns for prediction
CREATE TABLE IF NOT EXISTS task_prediction_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Pattern definition
  pattern_name TEXT NOT NULL,
  trigger_type TEXT NOT NULL, -- time_based, event_based, sequence_based
  
  -- Trigger conditions
  trigger_conditions JSONB NOT NULL DEFAULT '{}',
  -- Examples:
  -- time_based: {day_of_week: [1,2,3,4,5], hour: 9, minute: 0}
  -- event_based: {after_task: "check_email", delay_minutes: 30}
  -- sequence_based: {follows: ["task1", "task2"], probability: 0.8}
  
  -- Predicted task
  predicted_task TEXT NOT NULL,
  predicted_agent_id UUID REFERENCES agents(id),
  
  -- Confidence
  confidence FLOAT NOT NULL DEFAULT 0.5,
  times_triggered INTEGER NOT NULL DEFAULT 0,
  times_correct INTEGER NOT NULL DEFAULT 0,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_prediction_patterns_user ON task_prediction_patterns(user_id);
CREATE INDEX idx_task_prediction_patterns_trigger ON task_prediction_patterns(trigger_type);

-- Predicted tasks (suggestions before user asks)
CREATE TABLE IF NOT EXISTS predicted_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_id UUID REFERENCES task_prediction_patterns(id) ON DELETE SET NULL,
  
  -- Prediction
  predicted_task TEXT NOT NULL,
  prediction_reason TEXT NOT NULL,
  confidence FLOAT NOT NULL,
  
  -- Suggested timing
  suggested_time TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending', -- pending, shown, accepted, rejected, expired
  shown_at TIMESTAMPTZ,
  user_response TEXT, -- accept, reject, later, modify
  
  -- If accepted
  created_agent_id UUID REFERENCES agents(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_predicted_tasks_user ON predicted_tasks(user_id);
CREATE INDEX idx_predicted_tasks_status ON predicted_tasks(status);

-- ============================================
-- 5. FAILURE PATTERN RECOGNITION
-- ============================================

-- Failure patterns across all agents
CREATE TABLE IF NOT EXISTS failure_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Pattern identification
  pattern_signature TEXT NOT NULL, -- hash of error type + context
  error_type TEXT NOT NULL,
  skill_category TEXT,
  
  -- Pattern details
  description TEXT NOT NULL,
  common_causes TEXT[] NOT NULL DEFAULT '{}',
  
  -- Occurrences
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Affected agents
  affected_agent_ids UUID[] NOT NULL DEFAULT '{}',
  
  -- Resolution
  resolution_strategy TEXT,
  resolution_success_rate FLOAT,
  auto_recoverable BOOLEAN NOT NULL DEFAULT false,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, pattern_signature)
);

CREATE INDEX idx_failure_patterns_user ON failure_patterns(user_id);
CREATE INDEX idx_failure_patterns_error ON failure_patterns(error_type);

-- ============================================
-- 6. CROSS-AGENT BENCHMARKING
-- ============================================

-- Agent performance comparisons
CREATE TABLE IF NOT EXISTS agent_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Benchmark period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  -- Rankings
  rankings JSONB NOT NULL DEFAULT '[]', -- [{agent_id, rank, score, metrics}]
  
  -- Top performer insights
  top_performer_id UUID REFERENCES agents(id),
  top_performer_strategies TEXT[] NOT NULL DEFAULT '{}',
  
  -- Areas for improvement
  improvement_recommendations JSONB NOT NULL DEFAULT '[]',
  
  -- Strategy transfers
  strategies_transferred INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_benchmarks_user ON agent_benchmarks(user_id);
CREATE INDEX idx_agent_benchmarks_period ON agent_benchmarks(period_start, period_end);

-- ============================================
-- 7. EMOTION-AWARE INTERACTION
-- ============================================

-- User emotional state tracking
CREATE TABLE IF NOT EXISTS user_emotional_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Current state
  detected_mood TEXT NOT NULL DEFAULT 'neutral', -- positive, neutral, frustrated, stressed, urgent
  confidence FLOAT NOT NULL DEFAULT 0.5,
  
  -- Indicators
  indicators JSONB NOT NULL DEFAULT '{}', -- {message_tone, response_time, word_choices}
  
  -- History
  mood_history JSONB NOT NULL DEFAULT '[]', -- last 10 mood readings
  
  -- Adaptive response
  recommended_tone TEXT NOT NULL DEFAULT 'professional', -- empathetic, professional, encouraging, direct
  recommended_detail_level TEXT NOT NULL DEFAULT 'moderate',
  
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(user_id)
);

CREATE INDEX idx_user_emotional_state_mood ON user_emotional_state(detected_mood);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE agent_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orchestration_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workload ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_prediction_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE predicted_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE failure_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_emotional_state ENABLE ROW LEVEL SECURITY;

-- Handoffs (user can see their agents' handoffs)
CREATE POLICY "Users can manage handoffs for their agents"
  ON agent_handoffs FOR ALL
  USING (auth.uid() = user_id);

-- Capabilities (user owns their agents' capabilities)
CREATE POLICY "Users can view capabilities of their agents"
  ON agent_capabilities FOR ALL
  USING (EXISTS (
    SELECT 1 FROM agents WHERE agents.id = agent_capabilities.agent_id AND agents.user_id = auth.uid()
  ));

-- Learning broadcasts (user's broadcasts)
CREATE POLICY "Users can manage their learning broadcasts"
  ON learning_broadcasts FOR ALL
  USING (auth.uid() = user_id);

-- Learning subscriptions
CREATE POLICY "Users can manage subscriptions for their agents"
  ON learning_subscriptions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM agents WHERE agents.id = learning_subscriptions.agent_id AND agents.user_id = auth.uid()
  ));

-- Orchestration queue
CREATE POLICY "Users can manage their orchestration queue"
  ON orchestration_queue FOR ALL
  USING (auth.uid() = user_id);

-- Agent workload
CREATE POLICY "Users can view workload of their agents"
  ON agent_workload FOR ALL
  USING (EXISTS (
    SELECT 1 FROM agents WHERE agents.id = agent_workload.agent_id AND agents.user_id = auth.uid()
  ));

-- Prediction patterns
CREATE POLICY "Users can manage their prediction patterns"
  ON task_prediction_patterns FOR ALL
  USING (auth.uid() = user_id);

-- Predicted tasks
CREATE POLICY "Users can manage their predicted tasks"
  ON predicted_tasks FOR ALL
  USING (auth.uid() = user_id);

-- Failure patterns
CREATE POLICY "Users can manage their failure patterns"
  ON failure_patterns FOR ALL
  USING (auth.uid() = user_id);

-- Benchmarks
CREATE POLICY "Users can view their agent benchmarks"
  ON agent_benchmarks FOR ALL
  USING (auth.uid() = user_id);

-- Emotional state
CREATE POLICY "Users can view their emotional state"
  ON user_emotional_state FOR ALL
  USING (auth.uid() = user_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to find best agent for a task
CREATE OR REPLACE FUNCTION find_best_agent_for_task(
  p_user_id UUID,
  p_skill_name TEXT,
  p_exclude_agent_id UUID DEFAULT NULL
)
RETURNS TABLE (
  agent_id UUID,
  agent_name TEXT,
  proficiency_score FLOAT,
  current_workload TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.name,
    COALESCE(ac.proficiency_score, 0.5),
    COALESCE(aw.status, 'idle')
  FROM agents a
  LEFT JOIN agent_capabilities ac ON a.id = ac.agent_id AND ac.skill_name = p_skill_name
  LEFT JOIN agent_workload aw ON a.id = aw.agent_id
  WHERE a.user_id = p_user_id
    AND a.status != 'deleted'
    AND (p_exclude_agent_id IS NULL OR a.id != p_exclude_agent_id)
  ORDER BY 
    COALESCE(ac.proficiency_score, 0.5) DESC,
    CASE COALESCE(aw.status, 'idle') 
      WHEN 'idle' THEN 0 
      WHEN 'busy' THEN 1 
      ELSE 2 
    END
  LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get pending learnings for an agent
CREATE OR REPLACE FUNCTION get_pending_learnings_for_agent(
  p_agent_id UUID,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  learning_id UUID,
  learning_type TEXT,
  skill_category TEXT,
  title TEXT,
  content TEXT,
  confidence FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    lb.id,
    lb.learning_type,
    lb.skill_category,
    lb.title,
    lb.content,
    lb.confidence
  FROM learning_broadcasts lb
  JOIN learning_subscriptions ls ON 
    ls.agent_id = p_agent_id 
    AND ls.is_active = true
    AND (ls.skill_category IS NULL OR ls.skill_category = lb.skill_category)
    AND (ls.learning_type IS NULL OR ls.learning_type = lb.learning_type)
    AND lb.confidence >= ls.min_confidence
  WHERE lb.expires_at > now()
    AND lb.source_agent_id != p_agent_id -- Don't show own learnings
  ORDER BY lb.confidence DESC, lb.broadcast_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate priority score
CREATE OR REPLACE FUNCTION calculate_task_priority(
  p_urgency FLOAT,
  p_importance FLOAT,
  p_has_deadline BOOLEAN,
  p_minutes_to_deadline INTEGER,
  p_has_dependencies BOOLEAN
)
RETURNS FLOAT AS $$
DECLARE
  deadline_factor FLOAT := 0;
  dependency_factor FLOAT := 0;
BEGIN
  -- Deadline urgency (0-0.3)
  IF p_has_deadline AND p_minutes_to_deadline IS NOT NULL THEN
    IF p_minutes_to_deadline < 60 THEN
      deadline_factor := 0.3;
    ELSIF p_minutes_to_deadline < 240 THEN
      deadline_factor := 0.2;
    ELSIF p_minutes_to_deadline < 1440 THEN
      deadline_factor := 0.1;
    END IF;
  END IF;
  
  -- Dependency factor (blocking others = higher priority)
  IF p_has_dependencies THEN
    dependency_factor := 0.1;
  END IF;
  
  -- Combined score
  RETURN LEAST(1.0, (p_urgency * 0.3) + (p_importance * 0.3) + deadline_factor + dependency_factor);
END;
$$ LANGUAGE plpgsql IMMUTABLE;
