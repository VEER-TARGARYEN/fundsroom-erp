import express, { type Request, type Response, type NextFunction } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import { pinoHttp } from 'pino-http'
import swaggerUi from 'swagger-ui-express'
import { env, normalizeOrigin } from './config/env'
import { logger } from './config/logger'
import { globalLimiter } from './middleware/rateLimit'
import { errorHandler, notFoundHandler } from './middleware/error'
import { openapiSpec } from './swagger'
import apiRouter from './routes'

const app = express()

// Behind nginx/other proxy: trust the first hop so req.ip, secure cookies and
// rate-limiting see the real client address.
app.set('trust proxy', 1)

// Request logging (structured, redacts auth headers/cookies).
app.use(pinoHttp({ logger }))

// Security headers everywhere EXCEPT the Swagger UI, whose inline assets the
// default CSP would otherwise block (blank docs page).
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api/docs')) return next()
  return helmet()(req, res, next)
})

// Strict origin allowlist. `credentials: true` means a reflected origin would
// let ANY site issue authenticated requests with the user's cookie, so the
// allowlist must stay explicit — never reflect the caller's origin here.
const allowedOrigins = new Set(env.corsOrigins)

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header: curl, health checks, server-to-server. Not a browser
      // cross-site request, so there is no cookie to protect.
      if (!origin) return callback(null, true)
      if (allowedOrigins.has(normalizeOrigin(origin))) return callback(null, true)
      // Deny by omitting CORS headers rather than throwing — the browser blocks
      // it either way, and a stray crawler shouldn't surface as a 500.
      logger.warn({ origin }, 'CORS: origin not in allowlist')
      return callback(null, false)
    },
    credentials: true,
  }),
)
app.use(compression())
app.use(cookieParser())
app.use(express.json({ limit: '200kb' }))
app.use(express.urlencoded({ extended: true }))

// Interactive API docs + raw spec.
app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(openapiSpec, {
    customSiteTitle: 'Fundsroom ERP API Docs',
    swaggerOptions: { persistAuthorization: true },
  }),
)
app.get('/api/docs.json', (_req, res) => res.json(openapiSpec))

// Rate limiting + API routes.
app.use('/api', globalLimiter, apiRouter)

// 404 + centralized error handling (must be last).
app.use(notFoundHandler)
app.use(errorHandler)

export default app
