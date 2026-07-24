/**
 * Bridge types: the runner-protocol lease helpers with the nonce-bearing
 * lease shape used across the computer package.
 */
export {
  isPathAllowed,
  signRunnerLease,
  validateRunnerLease,
  newRunnerLeaseId,
  newRunnerNonce,
  type UnsignedRunnerLease,
} from '@2hands/runner-protocol'
import type { RunnerJobLease } from '@2hands/types/v3'

export type RunnerJobLeaseWithNonce = RunnerJobLease
