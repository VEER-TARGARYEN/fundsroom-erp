import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'
import { env } from '../config/env'

/**
 * Authenticated encryption for third-party tokens at rest.
 *
 * Google refresh tokens are long-lived and, with the scopes this app requests,
 * grant read/write access to a user's Sheets, Calendar and the ability to send
 * mail as them. A database leak shouldn't hand those over, so they're encrypted
 * with AES-256-GCM before storage.
 *
 * GCM is chosen over CBC because it authenticates as well as encrypts — a
 * tampered ciphertext fails to decrypt rather than yielding garbage that later
 * code might act on. The IV is random per encryption and stored alongside.
 *
 * Format: v1.<iv-b64>.<tag-b64>.<ciphertext-b64>
 */

const VERSION = 'v1'

function key(): Buffer {
  if (!env.TOKEN_ENC_KEY) {
    throw new Error('TOKEN_ENC_KEY is required to store Google tokens')
  }
  // Accept any reasonable secret and derive a fixed 32 bytes, so a key that
  // isn't exactly 32 raw bytes (e.g. Render's generated value) still works.
  return createHash('sha256').update(env.TOKEN_ENC_KEY).digest()
}

export const tokenEncryptionAvailable = () => Boolean(env.TOKEN_ENC_KEY)

export function encryptToken(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [
    VERSION,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    enc.toString('base64'),
  ].join('.')
}

export function decryptToken(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split('.')
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted token')
  }
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}
