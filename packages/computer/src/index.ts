/**
 * @2hands/computer — provider-neutral managed computer implementations.
 *
 * Providers: FixtureComputerProvider (CI/no-Docker), LocalDockerComputerProvider
 * (dev/CI/self-host). Hosted adapters (Vercel Sandbox etc.) plug in behind the
 * same ComputerProvider contract via COMPUTER_PROVIDER configuration.
 */
export { FixtureComputerProvider, type FixtureProviderOptions } from './fixture'
export { LocalDockerComputerProvider, type DockerProviderOptions } from './local-docker'
export {
  FlyComputerProvider,
  worstCaseMonthlyUsd,
  PLAN_MACHINE_SPECS,
  WORKSPACE_MOUNT,
  type FlyProviderOptions,
  type PlanId,
  type PlanMachineSpec,
} from './fly'
export { RunnerHost, type RunnerHostOptions } from './runner-host'
export {
  isPathAllowed,
  signRunnerLease,
  validateRunnerLease,
  newRunnerLeaseId,
  newRunnerNonce,
  type UnsignedRunnerLease,
} from './lease-types'
