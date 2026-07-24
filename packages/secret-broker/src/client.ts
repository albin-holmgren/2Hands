/**
 * Client-safe surface of the Secret Broker: sealing values to a challenge
 * public key. Imported by web and mobile SecureInputCard wiring.
 * Contains NO decryption and NO storage-key material.
 */
export { sealSecretValue, type SealedValue } from './transport'
