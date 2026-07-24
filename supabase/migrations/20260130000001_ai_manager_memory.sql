-- AI Manager Memory Cards System
-- Stores important memories from conversations so the AI doesn't need to load full chat history

-- Memory cards table
CREATE TABLE IF NOT EXISTS ai_manager_memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('user_fact', 'preference', 'context', 'topic', 'request', 'insight')),
  content TEXT NOT NULL,
  importance TEXT DEFAULT 'medium' CHECK (importance IN ('high', 'medium', 'low')),
  source TEXT, -- Where this memory came from (e.g., "user mentioned", "inferred")
  last_referenced_at TIMESTAMPTZ,
  reference_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast retrieval by user
CREATE INDEX IF NOT EXISTS idx_ai_manager_memories_user_id ON ai_manager_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_manager_memories_type ON ai_manager_memories(user_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_ai_manager_memories_active ON ai_manager_memories(user_id, is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE ai_manager_memories ENABLE ROW LEVEL SECURITY;

-- Users can only access their own memories
CREATE POLICY "Users can view own memories" ON ai_manager_memories
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own memories" ON ai_manager_memories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memories" ON ai_manager_memories
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own memories" ON ai_manager_memories
  FOR DELETE USING (auth.uid() = user_id);

-- Function to upsert a memory (avoid duplicates)
CREATE OR REPLACE FUNCTION upsert_ai_memory(
  p_user_id UUID,
  p_memory_type TEXT,
  p_content TEXT,
  p_importance TEXT DEFAULT 'medium',
  p_source TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_memory_id UUID;
  v_existing_id UUID;
BEGIN
  -- Check for similar existing memory (simple text match)
  SELECT id INTO v_existing_id
  FROM ai_manager_memories
  WHERE user_id = p_user_id
    AND memory_type = p_memory_type
    AND LOWER(content) = LOWER(p_content)
    AND is_active = true
  LIMIT 1;
  
  IF v_existing_id IS NOT NULL THEN
    -- Update existing memory
    UPDATE ai_manager_memories
    SET reference_count = reference_count + 1,
        last_referenced_at = NOW(),
        updated_at = NOW()
    WHERE id = v_existing_id;
    RETURN v_existing_id;
  ELSE
    -- Insert new memory
    INSERT INTO ai_manager_memories (user_id, memory_type, content, importance, source)
    VALUES (p_user_id, p_memory_type, p_content, p_importance, p_source)
    RETURNING id INTO v_memory_id;
    RETURN v_memory_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get active memories for a user
CREATE OR REPLACE FUNCTION get_ai_memories(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 30
) RETURNS TABLE (
  id UUID,
  memory_type TEXT,
  content TEXT,
  importance TEXT,
  reference_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.memory_type,
    m.content,
    m.importance,
    m.reference_count
  FROM ai_manager_memories m
  WHERE m.user_id = p_user_id
    AND m.is_active = true
  ORDER BY 
    CASE m.importance 
      WHEN 'high' THEN 1 
      WHEN 'medium' THEN 2 
      ELSE 3 
    END,
    m.reference_count DESC,
    m.updated_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark a memory as referenced (for tracking usefulness)
CREATE OR REPLACE FUNCTION reference_ai_memory(p_memory_id UUID) RETURNS VOID AS $$
BEGIN
  UPDATE ai_manager_memories
  SET reference_count = reference_count + 1,
      last_referenced_at = NOW()
  WHERE id = p_memory_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to deactivate old/unused memories (cleanup)
CREATE OR REPLACE FUNCTION cleanup_stale_ai_memories(p_user_id UUID) RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Deactivate memories that haven't been referenced in 30 days and have low importance
  UPDATE ai_manager_memories
  SET is_active = false
  WHERE user_id = p_user_id
    AND is_active = true
    AND importance = 'low'
    AND (last_referenced_at IS NULL OR last_referenced_at < NOW() - INTERVAL '30 days')
    AND created_at < NOW() - INTERVAL '7 days';
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
