-- Voice Profile and Structured Message Types Migration
-- Enables "idealized voice mirroring" and employee-like agent messaging

-- Add voice profile columns to user_settings
ALTER TABLE user_settings 
ADD COLUMN IF NOT EXISTS voice_profile jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS voice_mirroring_level text DEFAULT 'medium' CHECK (voice_mirroring_level IN ('off', 'low', 'medium', 'high')),
ADD COLUMN IF NOT EXISTS preferred_style text DEFAULT 'operator' CHECK (preferred_style IN ('operator', 'consultant', 'friendly'));

-- Add notification tracking columns
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS unread_notification_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_notification_read_at timestamptz DEFAULT NOW();

-- Create notifications table for tracking agent events
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('blocker', 'completion', 'progress', 'assignment', 'handoff')),
  title text NOT NULL,
  body text,
  agent_id uuid REFERENCES agents(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  is_read boolean DEFAULT false,
  requires_action boolean DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT NOW()
);

-- Index for fast notification queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
ON notifications(user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created 
ON notifications(user_id, created_at DESC);

-- RLS for notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications"
ON notifications FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications"
ON notifications FOR UPDATE
USING (auth.uid() = user_id);

-- Function to create notification and update unread count
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text DEFAULT NULL,
  p_agent_id uuid DEFAULT NULL,
  p_conversation_id uuid DEFAULT NULL,
  p_message_id uuid DEFAULT NULL,
  p_requires_action boolean DEFAULT false,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
BEGIN
  -- Insert notification
  INSERT INTO notifications (user_id, type, title, body, agent_id, conversation_id, message_id, requires_action, metadata)
  VALUES (p_user_id, p_type, p_title, p_body, p_agent_id, p_conversation_id, p_message_id, p_requires_action, p_metadata)
  RETURNING id INTO v_notification_id;
  
  -- Update unread count
  UPDATE user_settings 
  SET unread_notification_count = unread_notification_count + 1
  WHERE user_id = p_user_id;
  
  RETURN v_notification_id;
END;
$$;

-- Function to mark notifications as read
CREATE OR REPLACE FUNCTION mark_notifications_read(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Mark all as read
  UPDATE notifications 
  SET is_read = true 
  WHERE user_id = p_user_id AND is_read = false;
  
  -- Reset count
  UPDATE user_settings 
  SET unread_notification_count = 0,
      last_notification_read_at = NOW()
  WHERE user_id = p_user_id;
END;
$$;

-- Function to analyze user messages and extract voice profile
CREATE OR REPLACE FUNCTION analyze_voice_profile(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_messages text[];
  v_total_length integer := 0;
  v_message_count integer := 0;
  v_avg_length numeric;
  v_profile jsonb;
BEGIN
  -- Get last 100 user messages
  SELECT array_agg(content), count(*)
  INTO v_messages, v_message_count
  FROM (
    SELECT m.content
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE c.user_id = p_user_id 
      AND m.role = 'user'
      AND length(m.content) > 10
    ORDER BY m.created_at DESC
    LIMIT 100
  ) sub;
  
  IF v_message_count < 10 THEN
    RETURN NULL; -- Not enough data
  END IF;
  
  -- Calculate average message length
  SELECT avg(length(unnest)) INTO v_avg_length FROM unnest(v_messages);
  
  -- Build basic profile (AI will enhance this)
  v_profile := jsonb_build_object(
    'brevity', CASE 
      WHEN v_avg_length < 50 THEN 'concise'
      WHEN v_avg_length > 150 THEN 'detailed'
      ELSE 'balanced'
    END,
    'directness', 'balanced',
    'tone', 'calm',
    'structure_preference', 'mixed',
    'wants_reassurance', false,
    'common_phrases', '[]'::jsonb,
    'analyzed_at', NOW(),
    'message_count', v_message_count
  );
  
  -- Store in user_settings
  UPDATE user_settings
  SET voice_profile = v_profile
  WHERE user_id = p_user_id;
  
  RETURN v_profile;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_notification TO authenticated;
GRANT EXECUTE ON FUNCTION mark_notifications_read TO authenticated;
GRANT EXECUTE ON FUNCTION analyze_voice_profile TO authenticated;
