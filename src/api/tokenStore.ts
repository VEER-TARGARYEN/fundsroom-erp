// In-memory access token. Intentionally NOT persisted to localStorage (XSS-safe);
// the refresh token lives in an HttpOnly cookie and re-hydrates the session on load.
let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}
