import pino, { LoggerOptions } from 'pino';

// Logger configuration based on environment
const loggerConfig: LoggerOptions = {
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: '2hands-web',
    environment: process.env.NODE_ENV || 'development',
  },
  // Pretty print in development
  transport: process.env.NODE_ENV === 'development' 
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  // Redact sensitive fields
  redact: {
    paths: ['*.password', '*.token', '*.secret', '*.apiKey', 'req.headers.authorization'],
    remove: true,
  },
};

// Create the base logger
const baseLogger = pino(loggerConfig);

/**
 * Get a contextualized logger for a specific module/component
 */
export function getLogger(component: string, metadata?: Record<string, unknown>) {
  return baseLogger.child({ component, ...metadata });
}

/**
 * Pre-configured loggers for common components
 */
export const loggers = {
  agent: getLogger('agent-executor'),
  vm: getLogger('vm-server'),
  integrations: getLogger('integrations'),
  api: getLogger('api-routes'),
  auth: getLogger('auth'),
  db: getLogger('database'),
  semantic: getLogger('semantic-browser'),
};

/**
 * Log agent execution events
 */
export function logAgentEvent(
  event: 'start' | 'complete' | 'error' | 'pause' | 'handoff',
  data: {
    agentId: string;
    taskId?: string;
    userId?: string;
    durationMs?: number;
    error?: Error;
    metadata?: Record<string, unknown>;
  }
) {
  const logger = loggers.agent;
  const baseData = {
    agentId: data.agentId,
    taskId: data.taskId,
    userId: data.userId,
    durationMs: data.durationMs,
    ...data.metadata,
  };

  switch (event) {
    case 'start':
      logger.info(baseData, 'Agent execution started');
      break;
    case 'complete':
      logger.info(baseData, 'Agent execution completed');
      break;
    case 'error':
      logger.error({ ...baseData, error: data.error }, 'Agent execution failed');
      break;
    case 'pause':
      logger.warn(baseData, 'Agent execution paused');
      break;
    case 'handoff':
      logger.info(baseData, 'Agent task handed off');
      break;
  }
}

/**
 * Log VM browser actions
 */
export function logVMAction(
  action: string,
  data: {
    vmIp: string;
    agentId: string;
    success: boolean;
    durationMs: number;
    error?: string;
    metadata?: Record<string, unknown>;
  }
) {
  const logger = loggers.vm;
  const logData = {
    action,
    vmIp: sanitizeIp(data.vmIp),
    agentId: data.agentId,
    success: data.success,
    durationMs: data.durationMs,
    error: data.error,
    ...data.metadata,
  };

  if (data.success) {
    logger.debug(logData, `VM action ${action} succeeded`);
  } else {
    logger.warn(logData, `VM action ${action} failed`);
  }
}

/**
 * Log integration events
 */
export function logIntegrationEvent(
  event: 'trigger' | 'delivery' | 'error' | 'oauth',
  data: {
    provider: string;
    integrationId: string;
    userId?: string;
    success?: boolean;
    error?: Error;
    metadata?: Record<string, unknown>;
  }
) {
  const logger = loggers.integrations;
  const logData = {
    event,
    provider: data.provider,
    integrationId: data.integrationId,
    userId: data.userId,
    success: data.success,
    error: data.error?.message,
    ...data.metadata,
  };

  if (data.error) {
    logger.error(logData, `Integration ${event} failed`);
  } else {
    logger.info(logData, `Integration ${event} succeeded`);
  }
}

/**
 * Sanitize IP address for logging (privacy/security)
 */
function sanitizeIp(ip: string): string {
  if (!ip || ip === 'localhost' || ip === '127.0.0.1') {
    return ip;
  }
  // Return first 2 octets only for privacy
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  return '***';
}

// Re-export the base logger as default
export default baseLogger;
