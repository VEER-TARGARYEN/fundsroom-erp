import { googleLoginUrl } from '@/api/google.api'
import { cn } from '@/lib/utils'

/** Google's mark, inlined — a remote image would be blocked by the CSP. */
function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

/**
 * Anchor rather than a button: the OAuth start endpoint issues a redirect to
 * Google, which the browser has to follow as a top-level navigation.
 */
export function GoogleButton({
  label = 'Continue with Google',
  redirect = '/',
  className,
}: {
  label?: string
  redirect?: string
  className?: string
}) {
  return (
    <a
      href={googleLoginUrl(redirect)}
      className={cn(
        'inline-flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border border-outline-variant/25 bg-surface-container-high px-4 text-body-sm font-medium text-on-surface transition-all hover:border-outline-variant/50 hover:bg-surface-container-highest active:scale-[0.99]',
        className,
      )}
    >
      <GoogleMark />
      {label}
    </a>
  )
}

export { GoogleMark }
