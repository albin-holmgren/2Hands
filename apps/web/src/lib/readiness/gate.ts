export interface ReadinessSignals {
  pilotWindowDays: number
  runSuccessRate: number
  retryRunawayCount: number
  p0Incidents: number
  p1Incidents: number
  securityCriticalFailures: number
  securityHighFailures: number
  minimumRunSampleReached: boolean
  ciGreen: boolean
  opsRunbookApproved: boolean
}

export interface ReadinessEvaluation {
  readyForBroadRollout: boolean
  criteria: {
    reliability: boolean
    security: boolean
    observability: boolean
    qualityGates: boolean
    operations: boolean
  }
  failedCriteria: string[]
}

export function evaluateBroadRolloutReadiness(signals: ReadinessSignals): ReadinessEvaluation {
  const reliability =
    signals.pilotWindowDays >= 7
    && signals.p0Incidents === 0
    && signals.p1Incidents === 0
    && signals.runSuccessRate >= 0.9
    && signals.retryRunawayCount === 0

  const security =
    signals.securityCriticalFailures === 0
    && signals.securityHighFailures === 0

  const observability = signals.minimumRunSampleReached
  const qualityGates = signals.ciGreen
  const operations = signals.opsRunbookApproved

  const failedCriteria: string[] = []
  if (!reliability) failedCriteria.push('reliability')
  if (!security) failedCriteria.push('security')
  if (!observability) failedCriteria.push('observability')
  if (!qualityGates) failedCriteria.push('quality_gates')
  if (!operations) failedCriteria.push('operations')

  return {
    readyForBroadRollout: failedCriteria.length === 0,
    criteria: {
      reliability,
      security,
      observability,
      qualityGates,
      operations,
    },
    failedCriteria,
  }
}
