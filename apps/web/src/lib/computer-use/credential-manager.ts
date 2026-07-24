/**
 * Secure Credential Manager for Agent Authentication
 * 
 * Handles encrypted storage and injection of credentials
 * for agent login to external services.
 * 
 * Uses AES-256-GCM for authenticated encryption:
 * - 256-bit key derived from CREDENTIAL_ENCRYPTION_KEY env var
 * - Random 12-byte IV (nonce) per encryption
 * - 128-bit authentication tag for integrity verification
 * - User ID bound to ciphertext to prevent credential theft between users
 */

import { createAdminClient } from '@/lib/supabase/admin'
import crypto from 'crypto'

// Encryption constants
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16 // 128 bits
const KEY_LENGTH = 32 // 256 bits

export interface StoredCredential {
  id: string
  user_id: string
  service: string // e.g., 'gmail', 'twitter', 'shopify'
  username: string
  encrypted_password: string // Never stored in plain text
  metadata?: {
    display_name?: string
    last_used?: string
    created_at?: string
  }
}

export interface CredentialInput {
  service: string
  username: string
  password: string
}

/**
 * Get the encryption key from environment
 * Throws if not configured - credentials cannot be stored without it
 */
function getEncryptionKey(): Buffer {
  const keyHex = (process.env.CREDENTIAL_ENCRYPTION_KEY || '').trim()
  if (!keyHex) {
    throw new Error(
      'CREDENTIAL_ENCRYPTION_KEY environment variable is required for credential storage. ' +
      'Generate with: openssl rand -hex 32'
    )
  }
  
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `CREDENTIAL_ENCRYPTION_KEY must be exactly ${KEY_LENGTH * 2} hex characters (${KEY_LENGTH} bytes). ` +
      'Generate with: openssl rand -hex 32'
    )
  }
  
  return key
}

/**
 * Encrypt password using AES-256-GCM
 * 
 * Format: iv:authTag:ciphertext (all hex encoded)
 * The userId is used as additional authenticated data (AAD) to bind
 * the ciphertext to a specific user, preventing credential theft.
 */
export function encryptPassword(password: string, userId: string): string {
  const key = getEncryptionKey()
  
  // Generate random IV for each encryption
  const iv = crypto.randomBytes(IV_LENGTH)
  
  // Create cipher with AES-256-GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  })
  
  // Use userId as Additional Authenticated Data (AAD)
  // This binds the ciphertext to this specific user
  cipher.setAAD(Buffer.from(userId, 'utf8'))
  
  // Encrypt the password
  let encrypted = cipher.update(password, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  
  // Get the authentication tag
  const authTag = cipher.getAuthTag()
  
  // Return format: iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

/**
 * Decrypt password using AES-256-GCM
 * 
 * Verifies the authentication tag and AAD (userId) to ensure
 * the ciphertext hasn't been tampered with and belongs to this user.
 */
export function decryptPassword(encrypted: string, userId: string): string {
  const key = getEncryptionKey()
  
  // Parse the encrypted format: iv:authTag:ciphertext
  const parts = encrypted.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted credential format')
  }
  
  const [ivHex, authTagHex, ciphertext] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  
  // Validate component lengths
  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid IV length in encrypted credential')
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Invalid auth tag length in encrypted credential')
  }
  
  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  })
  
  // Set the authentication tag for verification
  decipher.setAuthTag(authTag)
  
  // Set AAD - must match what was used during encryption
  // If userId doesn't match, decryption will fail
  decipher.setAAD(Buffer.from(userId, 'utf8'))
  
  try {
    // Decrypt - this will throw if auth tag verification fails
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    // Auth tag verification failed - either wrong key, wrong user, or tampered data
    throw new Error('Credential decryption failed - authentication error')
  }
}

/**
 * Store credentials securely for an agent
 */
export async function storeCredential(
  userId: string,
  agentId: string,
  credential: CredentialInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient()
  
  try {
    const encryptedPassword = encryptPassword(credential.password, userId)
    
    // Store in agent_credentials table
    const { error } = await supabase
      .from('agent_credentials')
      .upsert({
        user_id: userId,
        agent_id: agentId,
        service: credential.service,
        username: credential.username,
        encrypted_password: encryptedPassword,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
    
    if (error) {
      console.error('Failed to store credential:', error)
      return { success: false, error: error.message }
    }
    
    return { success: true }
  } catch (error) {
    console.error('Credential storage error:', error)
    return { success: false, error: 'Failed to encrypt and store credential' }
  }
}

/**
 * Retrieve credentials for agent use (decrypted)
 */
export async function getAgentCredentials(
  userId: string,
  agentId: string
): Promise<{ service: string; username: string; password: string }[]> {
  const supabase = createAdminClient()
  
  const { data, error } = await supabase
    .from('agent_credentials')
    .select('service, username, encrypted_password')
    .eq('user_id', userId)
    .eq('agent_id', agentId)
  
  if (error || !data) {
    console.error('Failed to retrieve credentials:', error)
    return []
  }
  
  return (data as { service: string; username: string; encrypted_password: string }[]).map(cred => ({
    service: cred.service,
    username: cred.username,
    password: decryptPassword(cred.encrypted_password, userId),
  }))
}

/**
 * Delete credentials for an agent
 */
export async function deleteAgentCredentials(
  userId: string,
  agentId: string,
  service?: string
): Promise<boolean> {
  const supabase = createAdminClient()
  
  let query = supabase
    .from('agent_credentials')
    .delete()
    .eq('user_id', userId)
    .eq('agent_id', agentId)
  
  if (service) {
    query = query.eq('service', service)
  }
  
  const { error } = await query
  
  return !error
}

/**
 * Generate login instructions for the agent
 * This creates a step-by-step guide for the agent to login to a service
 */
export function generateLoginInstructions(
  service: string,
  username: string,
  password: string
): string {
  const serviceInstructions: Record<string, string> = {
    gmail: `
LOGIN TO GMAIL:
1. Open browser and go to gmail.com
2. Click "Sign in" if not already on login page
3. Enter email: ${username}
4. Click "Next"
5. Enter password: ${password}
6. Click "Next"
7. Handle 2FA if prompted (report if you see 2FA request)
8. Wait for inbox to load
9. Take screenshot to confirm login success`,
    
    twitter: `
LOGIN TO TWITTER/X:
1. Open browser and go to twitter.com or x.com
2. Click "Sign in"
3. Enter username/email: ${username}
4. Click "Next"
5. Enter password: ${password}
6. Click "Log in"
7. Handle any security prompts
8. Wait for home feed to load
9. Take screenshot to confirm login success`,
    
    linkedin: `
LOGIN TO LINKEDIN:
1. Open browser and go to linkedin.com
2. Enter email: ${username}
3. Enter password: ${password}
4. Click "Sign in"
5. Handle any security verification
6. Wait for feed to load
7. Take screenshot to confirm login success`,
    
    shopify: `
LOGIN TO SHOPIFY ADMIN:
1. Open browser and go to ${username.includes('.myshopify.com') ? username : `${username}.myshopify.com`}/admin
2. Enter email if prompted
3. Enter password: ${password}
4. Click "Log in"
5. Handle any 2FA if required
6. Wait for dashboard to load
7. Take screenshot to confirm login success`,
    
    default: `
LOGIN TO ${service.toUpperCase()}:
1. Open browser and navigate to the ${service} login page
2. Enter username/email: ${username}
3. Enter password: ${password}
4. Click the login/sign in button
5. Handle any additional verification steps
6. Wait for the main page to load
7. Take screenshot to confirm login success`
  }
  
  return serviceInstructions[service.toLowerCase()] || serviceInstructions.default
}

/**
 * Build complete task description with credentials injected
 */
export function buildTaskWithCredentials(
  taskDescription: string,
  credentials: { service: string; username: string; password: string }[]
): string {
  if (credentials.length === 0) {
    return taskDescription
  }
  
  const loginInstructions = credentials
    .map(cred => generateLoginInstructions(cred.service, cred.username, cred.password))
    .join('\n\n---\n\n')
  
  return `${taskDescription}

=== CREDENTIALS PROVIDED ===
${loginInstructions}

=== SECURITY RULES ===
- NEVER share these credentials in your responses
- NEVER include passwords in report_insight messages
- If login fails, report the issue WITHOUT revealing the password
- If you see 2FA/MFA prompt, report it and wait for user guidance
- Clear any "remember me" or "stay signed in" options after login`
}
