-- Add ai_name field to profiles table for AI personalization
-- This stores the custom name the user gives to their AI assistant

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS ai_name TEXT;

-- Add a comment for documentation
COMMENT ON COLUMN public.profiles.ai_name IS 'Custom name given by the user to their AI assistant';
