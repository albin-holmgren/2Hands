import { z } from 'zod'

// ============================================
// AGENT VALIDATION SCHEMAS
// ============================================

export const agentConfigSchema = z.object({
  description: z.string().max(5000).optional(),
  schedule_type: z.enum(['once', 'scheduled', 'continuous']).optional(),
  schedule_cron: z.string().max(100).optional(),
  schedule_timezone: z.string().max(50).optional(),
  credentials: z.array(z.string().max(100)).max(20).optional(),
  approval_actions: z.array(z.string().max(200)).max(50).optional(),
  risk_level: z.enum(['low', 'medium', 'high']).optional(),
  progress_log: z.array(z.object({
    timestamp: z.string(),
    type: z.string(),
    message: z.string().max(1000),
  })).max(50).optional(),
}).passthrough() // Allow additional fields for flexibility

export const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  mission: z.string().min(1).max(2000),
  config: agentConfigSchema.optional(),
})

export const updateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  mission: z.string().min(1).max(2000).optional(),
  status: z.enum(['idle', 'working', 'paused', 'completed', 'failed', 'terminated']).optional(),
  config: agentConfigSchema.optional(),
})

// ============================================
// PROGRESS UPDATE VALIDATION
// ============================================

export const progressUpdateSchema = z.object({
  agentId: z.string().uuid(),
  type: z.enum(['started', 'progress', 'completed', 'failed', 'insight']),
  message: z.string().max(5000),
  data: z.object({}).passthrough().optional(),
})

// ============================================
// MESSAGES VALIDATION
// ============================================

export const createMessageSchema = z.object({
  conversation_id: z.string().uuid(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(100000), // Allow long messages for AI responses
  metadata: z.object({}).passthrough().optional(),
})

export const getMessagesQuerySchema = z.object({
  conversation_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
})

// ============================================
// CHAT VALIDATION
// ============================================

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(50000),
})

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(100),
  conversationId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
})

// ============================================
// STRIPE/CHECKOUT VALIDATION
// ============================================

export const checkoutRequestSchema = z.object({
  priceId: z.string().min(1).max(100),
  type: z.enum(['subscription', 'one_time']),
})

// ============================================
// SETTINGS VALIDATION
// ============================================

export const updateSettingsSchema = z.object({
  full_name: z.string().max(100).optional(),
  avatar_url: z.string().url().max(500).optional(),
  ai_name: z.string().max(50).optional(),
  settings: z.object({
    language: z.string().max(10).optional(),
    timezone: z.string().max(50).optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
  }).optional(),
  notifications: z.object({
    email_updates: z.boolean().optional(),
    agent_alerts: z.boolean().optional(),
    marketing: z.boolean().optional(),
  }).optional(),
})

// ============================================
// CRON EXPRESSION VALIDATION
// ============================================

export const cronExpressionSchema = z.string().refine(
  (val) => {
    const parts = val.split(' ')
    if (parts.length !== 5) return false
    // Basic validation - full cron validation is complex
    return parts.every(part => /^[\*0-9,\-\/]+$/.test(part))
  },
  { message: 'Invalid cron expression format (expected 5 space-separated parts)' }
)

// ============================================
// UUID VALIDATION HELPER
// ============================================

export const uuidSchema = z.string().uuid()

// ============================================
// VALIDATION HELPER FUNCTIONS
// ============================================

export type ValidationResult<T> = 
  | { success: true; data: T }
  | { success: false; error: string; details?: z.ZodError }

export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): ValidationResult<T> {
  const result = schema.safeParse(input)
  
  if (result.success) {
    return { success: true, data: result.data }
  }
  
  // Format error message
  const errorMessages = result.error.issues
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((e: any) => `${e.path?.join('.') || 'field'}: ${e.message}`)
    .join('; ')
  
  return {
    success: false,
    error: errorMessages || 'Validation failed',
    details: result.error,
  }
}

/**
 * Validate and sanitize agent ID parameter
 */
export function validateAgentId(id: string | null | undefined): ValidationResult<string> {
  if (!id) {
    return { success: false, error: 'Agent ID is required' }
  }
  return validateInput(uuidSchema, id)
}

/**
 * Validate and sanitize conversation ID parameter
 */
export function validateConversationId(id: string | null | undefined): ValidationResult<string> {
  if (!id) {
    return { success: false, error: 'Conversation ID is required' }
  }
  return validateInput(uuidSchema, id)
}

// ============================================
// API REQUEST SCHEMAS
// ============================================

/**
 * Schema for POST /api/agents - Create a new agent
 */
export const createAgentRequestSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less').trim(),
  type: z.string().min(1, 'Type is required').max(50),
  mission: z.string().min(1).max(5000).trim().optional(),
  config: agentConfigSchema.optional(),
})

/**
 * Schema for PATCH /api/agents/[id] - Update an agent
 */
export const updateAgentRequestSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  mission: z.string().min(1).max(5000).trim().optional(),
  config: agentConfigSchema.optional(),
  schedule_type: z.enum(['once', 'scheduled', 'realtime']).optional(),
  schedule_cron: z.string().max(100).optional(),
  schedule_timezone: z.string().max(50).optional(),
  status: z.enum(['idle', 'working', 'paused', 'completed', 'failed', 'terminated', 'initializing']).optional(),
})

/**
 * Schema for POST /api/agents/provision
 */
export const provisionAgentRequestSchema = z.object({
  agentId: z.string().uuid('Invalid agent ID format'),
})

/**
 * Schema for POST /api/agents/terminate
 */
export const terminateAgentRequestSchema = z.object({
  agentId: z.string().uuid('Invalid agent ID format'),
})

/**
 * Schema for POST /api/chat
 */
export const chatApiRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.union([z.string(), z.array(z.unknown())]), // String or array for images
  })).min(1, 'At least one message is required'),
  conversationId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(), // When chatting with an agent directly
  model: z.string().optional(), // Model override from user's model selector
  assistantMsgId: z.string().uuid().optional(), // Client-generated UUID for durable manager-turn placeholder
})

/**
 * Schema for GET /api/messages query params
 */
export const messagesQuerySchema = z.object({
  conversation_id: z.string().uuid('Invalid conversation ID'),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})

/**
 * Schema for POST /api/messages
 */
export const createMessageRequestSchema = z.object({
  id: z.string().uuid().optional(),
  conversation_id: z.string().uuid('Invalid conversation ID'),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1, 'Content is required').max(100000),
  metadata: z.record(z.string(), z.unknown()).optional(),
  workspaceId: z.string().uuid().optional(),
})

/**
 * Schema for POST /api/conversations
 */
export const createConversationRequestSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  agent_id: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
})

/**
 * Schema for PATCH /api/conversations/[id]
 */
export const updateConversationRequestSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200).trim(),
})

/**
 * Schema for POST /api/stripe/checkout
 */
export const stripeCheckoutRequestSchema = z.object({
  priceType: z.enum(['subscription', 'credits']),
  plan: z.enum(['starter', 'pro', 'business']).optional(),
  interval: z.enum(['monthly', 'yearly']).optional(),
  tierKey: z.enum(['t1', 't2', 't3']).optional(),
  packType: z.enum(['small', 'medium', 'large', 'xlarge', 'custom']).optional(),
  customAmount: z.number().int().min(1000).max(1000000).optional(),
})

/**
 * Schema for PUT /api/settings
 */
export const settingsUpdateRequestSchema = z.object({
  settings: z.object({
    theme: z.enum(['light', 'dark', 'system']).optional(),
    language: z.string().max(10).optional(),
    timezone: z.string().max(50).optional(),
  }).optional(),
  notifications: z.object({
    email_updates: z.boolean().optional(),
    agent_alerts: z.boolean().optional(),
    marketing: z.boolean().optional(),
  }).optional(),
  profile: z.object({
    full_name: z.string().max(100).optional(),
    avatar_url: z.string().url().max(500).optional(),
    ai_name: z.string().max(50).optional(),
  }).optional(),
})

/**
 * Schema for POST /api/referral
 */
export const referralRequestSchema = z.object({
  referralCode: z.string().min(1, 'Referral code is required').max(50),
})

// ============================================
// ASYNC REQUEST VALIDATION HELPERS
// ============================================

export interface ParseResult<T> {
  success: true
  data: T
}

export interface ParseError {
  success: false
  error: string
  status: number
}

/**
 * Parse and validate JSON request body with a Zod schema
 * Returns structured error on failure
 */
export async function parseAndValidate<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<ParseResult<T> | ParseError> {
  let body: unknown
  
  try {
    body = await request.json()
  } catch {
    return {
      success: false,
      error: 'Invalid JSON body',
      status: 400,
    }
  }
  
  const result = schema.safeParse(body)
  
  if (!result.success) {
    const errors = result.error.issues
      .map(e => e.path.length > 0 ? `${e.path.join('.')}: ${e.message}` : e.message)
      .join('; ')
    return {
      success: false,
      error: errors || 'Validation failed',
      status: 400,
    }
  }
  
  return { success: true, data: result.data }
}

/**
 * Parse and validate URL query parameters with a Zod schema
 */
export function parseQueryParams<T>(
  url: string,
  schema: z.ZodSchema<T>
): ParseResult<T> | Omit<ParseError, 'status'> {
  const { searchParams } = new URL(url)
  const params: Record<string, string> = {}
  
  searchParams.forEach((value, key) => {
    params[key] = value
  })
  
  const result = schema.safeParse(params)
  
  if (!result.success) {
    const errors = result.error.issues
      .map(e => e.path.length > 0 ? `${e.path.join('.')}: ${e.message}` : e.message)
      .join('; ')
    return {
      success: false,
      error: errors || 'Invalid query parameters',
    }
  }
  
  return { success: true, data: result.data }
}

/**
 * Create a standardized validation error response
 */
export function validationErrorResponse(error: string, status: number = 400) {
  return {
    error,
    code: 'VALIDATION_ERROR' as const,
  }
}
