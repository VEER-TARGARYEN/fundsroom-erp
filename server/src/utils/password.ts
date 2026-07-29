import argon2 from 'argon2'

/**
 * Argon2id password hashing with OWASP-recommended parameters (2026):
 * memoryCost 19 MiB, timeCost 2, parallelism 1. argon2 auto-generates a
 * per-hash random salt — never pass your own.
 */
const ARGON_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
}

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON_OPTIONS)
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain)
  } catch {
    // Malformed hash etc. — treat as a failed match, never throw to the caller.
    return false
  }
}
