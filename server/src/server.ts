import app from './app'
import { env } from './config/env'
import { logger } from './config/logger'
import { prisma } from './config/prisma'
import { ensureDatabaseConstraints } from './db/constraints'

async function main() {
  await prisma.$connect()
  // Apply the CHECK constraint + challan sequence (idempotent) before serving.
  await ensureDatabaseConstraints()

  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 Fundsroom API listening on http://localhost:${env.PORT}`)
    logger.info(`📚 API docs at http://localhost:${env.PORT}/api/docs`)
  })

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully`)
    server.close()
    await prisma.$disconnect()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err) => {
  logger.error(err, 'Fatal error during startup')
  process.exit(1)
})
