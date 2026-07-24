-- Add scheduling fields to agents table for cost-optimized task execution
-- Instead of running VMs 24/7, agents can run on schedules

-- Schedule type: 'realtime' (always running), 'scheduled' (runs at intervals), 'once' (one-time task)
ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS schedule_type TEXT DEFAULT 'once' CHECK (schedule_type IN ('realtime', 'scheduled', 'once'));

-- Cron expression for scheduled tasks (e.g., '0 9 * * *' for daily at 9am)
ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS schedule_cron TEXT;

-- Timezone for schedule (e.g., 'America/New_York')
ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS schedule_timezone TEXT DEFAULT 'UTC';

-- Next scheduled run time
ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ;

-- Last completed run time
ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;

-- Estimated cost per run in credits
ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS estimated_cost_per_run INTEGER DEFAULT 10;

-- Total credits used by this agent
ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS total_credits_used INTEGER DEFAULT 0;

-- Add index for scheduled tasks lookup
CREATE INDEX IF NOT EXISTS idx_agents_next_run ON public.agents(next_run_at) WHERE schedule_type = 'scheduled';

COMMENT ON COLUMN public.agents.schedule_type IS 'realtime: VM always running, scheduled: runs on cron schedule, once: one-time task';
COMMENT ON COLUMN public.agents.schedule_cron IS 'Cron expression for scheduled tasks, e.g., "0 */6 * * *" for every 6 hours';
