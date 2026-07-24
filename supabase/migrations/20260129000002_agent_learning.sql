-- Agent Learning System
-- Enables agents to learn from repetitive tasks and research tools before execution

-- Task execution patterns - learn what works for different task types
CREATE TABLE IF NOT EXISTS task_execution_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  
  -- Task fingerprint for matching similar tasks
  task_fingerprint TEXT NOT NULL, -- hash of normalized task description
  task_type TEXT NOT NULL, -- e.g., 'email_send', 'data_scrape', 'form_fill'
  task_keywords TEXT[] NOT NULL DEFAULT '{}',
  
  -- Learned patterns
  optimal_approach JSONB NOT NULL DEFAULT '{}', -- best steps/tools for this task
  common_pitfalls TEXT[] NOT NULL DEFAULT '{}', -- things that often go wrong
  success_tips TEXT[] NOT NULL DEFAULT '{}', -- what leads to success
  required_preconditions TEXT[] NOT NULL DEFAULT '{}', -- what must be true before starting
  
  -- Execution statistics
  total_executions INTEGER NOT NULL DEFAULT 0,
  successful_executions INTEGER NOT NULL DEFAULT 0,
  avg_steps_to_complete FLOAT,
  avg_duration_seconds FLOAT,
  last_execution_at TIMESTAMPTZ,
  
  -- Learning confidence
  confidence_score FLOAT NOT NULL DEFAULT 0.0, -- 0-1, increases with successful executions
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_patterns_user ON task_execution_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_task_patterns_fingerprint ON task_execution_patterns(task_fingerprint);
CREATE INDEX IF NOT EXISTS idx_task_patterns_type ON task_execution_patterns(task_type);

-- Execution run history for learning
CREATE TABLE IF NOT EXISTS execution_run_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id UUID REFERENCES task_execution_patterns(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Run details
  task_description TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running', -- running, completed, failed
  
  -- What happened
  steps_taken JSONB NOT NULL DEFAULT '[]', -- [{tool, input, result, success}]
  total_steps INTEGER NOT NULL DEFAULT 0,
  successful_steps INTEGER NOT NULL DEFAULT 0,
  failed_steps INTEGER NOT NULL DEFAULT 0,
  
  -- Learning extracted
  what_worked TEXT[] NOT NULL DEFAULT '{}',
  what_failed TEXT[] NOT NULL DEFAULT '{}',
  improvements_identified TEXT[] NOT NULL DEFAULT '{}',
  new_knowledge TEXT[] NOT NULL DEFAULT '{}', -- facts learned during execution
  
  -- Performance
  duration_seconds FLOAT,
  tokens_used INTEGER,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_run_history_pattern ON execution_run_history(pattern_id);
CREATE INDEX IF NOT EXISTS idx_run_history_agent ON execution_run_history(agent_id);

-- Tool/service knowledge base - research stored for reuse
CREATE TABLE IF NOT EXISTS tool_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Tool identification
  tool_name TEXT NOT NULL, -- e.g., 'gmail', 'linkedin', 'notion'
  tool_category TEXT NOT NULL, -- e.g., 'email', 'social', 'productivity'
  
  -- Research content
  overview TEXT, -- what this tool is
  key_features TEXT[] NOT NULL DEFAULT '{}',
  common_workflows JSONB NOT NULL DEFAULT '[]', -- [{name, steps}]
  best_practices TEXT[] NOT NULL DEFAULT '{}',
  common_errors TEXT[] NOT NULL DEFAULT '{}', -- errors and how to fix them
  ui_patterns JSONB NOT NULL DEFAULT '{}', -- {button_locations, form_fields, navigation}
  api_patterns JSONB NOT NULL DEFAULT '{}', -- if using API
  
  -- URLs and references
  documentation_urls TEXT[] NOT NULL DEFAULT '{}',
  tutorial_urls TEXT[] NOT NULL DEFAULT '{}',
  
  -- Quality
  research_depth TEXT NOT NULL DEFAULT 'basic', -- basic, moderate, expert
  last_researched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  research_sources TEXT[] NOT NULL DEFAULT '{}',
  
  -- Usage stats
  times_used INTEGER NOT NULL DEFAULT 0,
  successful_uses INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, tool_name)
);

CREATE INDEX IF NOT EXISTS idx_tool_knowledge_user ON tool_knowledge_base(user_id);
CREATE INDEX IF NOT EXISTS idx_tool_knowledge_name ON tool_knowledge_base(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_knowledge_category ON tool_knowledge_base(tool_category);

-- Pre-execution research cache
CREATE TABLE IF NOT EXISTS pre_execution_research (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Research context
  task_description TEXT NOT NULL,
  detected_tools TEXT[] NOT NULL DEFAULT '{}',
  detected_services TEXT[] NOT NULL DEFAULT '{}',
  
  -- Research results
  research_summary TEXT,
  tool_specific_tips JSONB NOT NULL DEFAULT '{}', -- {tool: [tips]}
  potential_challenges TEXT[] NOT NULL DEFAULT '{}',
  recommended_approach TEXT,
  backup_strategies TEXT[] NOT NULL DEFAULT '{}',
  
  -- Sources
  sources_consulted JSONB NOT NULL DEFAULT '[]', -- [{url, title, relevance}]
  
  -- Timing
  research_duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE INDEX IF NOT EXISTS idx_pre_research_agent ON pre_execution_research(agent_id);

-- Continuous improvement suggestions
CREATE TABLE IF NOT EXISTS improvement_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  pattern_id UUID REFERENCES task_execution_patterns(id) ON DELETE SET NULL,
  
  -- Suggestion
  suggestion_type TEXT NOT NULL, -- 'efficiency', 'reliability', 'speed', 'cost'
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  expected_impact TEXT, -- 'high', 'medium', 'low'
  
  -- Evidence
  based_on_runs INTEGER NOT NULL DEFAULT 0,
  evidence JSONB NOT NULL DEFAULT '{}',
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending', -- pending, applied, dismissed
  applied_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_improvements_user ON improvement_suggestions(user_id);
CREATE INDEX IF NOT EXISTS idx_improvements_status ON improvement_suggestions(status);

-- Learning application tracking - did the learning help?
CREATE TABLE IF NOT EXISTS learning_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_id UUID REFERENCES task_execution_patterns(id) ON DELETE SET NULL,
  
  -- What learning was applied
  learning_type TEXT NOT NULL, -- 'tip', 'pitfall_avoided', 'research_applied', 'workflow_followed'
  learning_content TEXT NOT NULL,
  source TEXT NOT NULL, -- 'pattern', 'research', 'reflection', 'shared_knowledge'
  
  -- Outcome tracking
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome TEXT NOT NULL DEFAULT 'pending', -- 'helped', 'neutral', 'hurt', 'pending'
  outcome_notes TEXT,
  
  -- Context
  task_description TEXT NOT NULL,
  step_number INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learning_apps_agent ON learning_applications(agent_id);
CREATE INDEX IF NOT EXISTS idx_learning_apps_user ON learning_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_apps_outcome ON learning_applications(outcome);
CREATE INDEX IF NOT EXISTS idx_learning_apps_pattern ON learning_applications(pattern_id);

-- RLS Policies
ALTER TABLE learning_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their learning applications"
  ON learning_applications FOR ALL
  USING (auth.uid() = user_id);

-- RLS Policies
ALTER TABLE task_execution_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_run_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_execution_research ENABLE ROW LEVEL SECURITY;
ALTER TABLE improvement_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their task patterns"
  ON task_execution_patterns FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their execution history"
  ON execution_run_history FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their tool knowledge"
  ON tool_knowledge_base FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their research"
  ON pre_execution_research FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their improvements"
  ON improvement_suggestions FOR ALL
  USING (auth.uid() = user_id);

-- Function to find matching task pattern
CREATE OR REPLACE FUNCTION find_matching_pattern(
  p_user_id UUID,
  p_task_fingerprint TEXT,
  p_task_keywords TEXT[]
)
RETURNS TABLE (
  id UUID,
  task_type TEXT,
  optimal_approach JSONB,
  common_pitfalls TEXT[],
  success_tips TEXT[],
  confidence_score FLOAT,
  total_executions INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tep.id,
    tep.task_type,
    tep.optimal_approach,
    tep.common_pitfalls,
    tep.success_tips,
    tep.confidence_score,
    tep.total_executions
  FROM task_execution_patterns tep
  WHERE tep.user_id = p_user_id
    AND (
      tep.task_fingerprint = p_task_fingerprint
      OR tep.task_keywords && p_task_keywords
    )
  ORDER BY 
    CASE WHEN tep.task_fingerprint = p_task_fingerprint THEN 0 ELSE 1 END,
    tep.confidence_score DESC,
    tep.total_executions DESC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update pattern after execution
CREATE OR REPLACE FUNCTION update_pattern_after_execution(
  p_pattern_id UUID,
  p_success BOOLEAN,
  p_steps_taken INTEGER,
  p_duration_seconds FLOAT,
  p_what_worked TEXT[],
  p_what_failed TEXT[]
)
RETURNS void AS $$
DECLARE
  v_current RECORD;
BEGIN
  SELECT * INTO v_current FROM task_execution_patterns WHERE id = p_pattern_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  UPDATE task_execution_patterns SET
    total_executions = total_executions + 1,
    successful_executions = CASE WHEN p_success THEN successful_executions + 1 ELSE successful_executions END,
    avg_steps_to_complete = CASE 
      WHEN avg_steps_to_complete IS NULL THEN p_steps_taken
      ELSE (avg_steps_to_complete * total_executions + p_steps_taken) / (total_executions + 1)
    END,
    avg_duration_seconds = CASE 
      WHEN avg_duration_seconds IS NULL THEN p_duration_seconds
      ELSE (avg_duration_seconds * total_executions + p_duration_seconds) / (total_executions + 1)
    END,
    last_execution_at = now(),
    confidence_score = LEAST(1.0, confidence_score + CASE WHEN p_success THEN 0.05 ELSE -0.02 END),
    success_tips = CASE 
      WHEN p_success AND array_length(p_what_worked, 1) > 0 
      THEN array_cat(success_tips, p_what_worked)
      ELSE success_tips
    END,
    common_pitfalls = CASE 
      WHEN NOT p_success AND array_length(p_what_failed, 1) > 0 
      THEN array_cat(common_pitfalls, p_what_failed)
      ELSE common_pitfalls
    END,
    updated_at = now()
  WHERE id = p_pattern_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
