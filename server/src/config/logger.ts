import pino from 'pino'
import { env } from './env'

/**
 * Structured JSON logger. Pretty-printed in dev, raw JSON (for log aggregators)
 * in production. Never logs secrets — redact known sensitive paths.
 */
export const logger = pino({
  level: env.isProd ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      '*.passwordHash',
    ],
    remove: true,
  },
  transport: env.isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
    : undefined,
})
