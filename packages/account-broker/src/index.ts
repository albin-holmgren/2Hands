/**
 * @2hands/account-broker — provider auth manifests (types + validator +
 * built-in registry), the 14-state auth-run machine, and the pure
 * ensureCapability decision helper.
 *
 * Pure logic only: IO (Supabase rows, auth_run creation, secret handling)
 * lives in the web service layer and @2hands/secret-broker.
 */
export * from './manifest'
export * from './manifests'
export * from './auth-run-machine'
export * from './capability'
