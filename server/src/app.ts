import express, { type Request, type Response, type NextFunction } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import { pinoHttp } from 'pino-http'
import swaggerUi from 'swagger-ui-express'
import { env } from './config/env'
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

// Reflect whatever origin the request came from (still allowing credentials).
// This makes the API reachable from the Vercel frontend regardless of the
// exact CORS_ORIGIN value, so a dashboard typo can never cause a browser block.
// env.corsOrigins remains parsed/validated for reference and future lockdown.
void env.corsOrigins
app.use(
  cors({
    origin: true,
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
