import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'path'
import { fileURLToPath } from 'url'
import { authMiddleware } from './auth.js'
import db from './db.js'
import { preparePublishedHtml, setPublishedSecurityHeaders } from './publishedHtml.js'
import authRoutes from './routes/auth.js'
import projectRoutes from './routes/projects.js'
import jiraRoutes from './routes/jira.js'
import usersRoutes from './routes/users.js'
import messagesRoutes from './routes/messages.js'
import releaseNotesRoutes from './routes/releaseNotes.js'
import documentsRoutes from './routes/documents.js'
import phasesRoutes from './routes/phases.js'
import organizationsRoutes from './routes/organizations.js'
import reportsRoutes from './routes/reports.js'
import settingsRoutes from './routes/settings.js'
import aiUsageRoutes from './routes/aiUsage.js'
import auditRoutes from './routes/audit.js'
import { startAiUsageScheduler } from './aiUsage/scheduler.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Surface missing/weak secrets at startup instead of crashing later at first
// login or first token encryption. A hard fail (exit) happens only when a
// secret is entirely absent — that state cannot boot a working app anyway, so
// it never regresses an already-running deploy. Weak/placeholder/bad-format
// values are logged loudly as warnings but do not stop the server.
function validateSecrets() {
  const fatal = []
  const warnings = []
  const jwt = process.env.JWT_SECRET || ''
  if (!jwt) fatal.push('JWT_SECRET nije postavljen.')
  else if (jwt.length < 32 || jwt.startsWith('change-this')) warnings.push('JWT_SECRET je slab (< 32 znaka ili placeholder).')

  const enc = process.env.ENCRYPTION_KEY || ''
  if (!enc) fatal.push('ENCRYPTION_KEY nije postavljen.')
  else if (!/^[0-9a-fA-F]{64}$/.test(enc)) warnings.push('ENCRYPTION_KEY nije 64 hex znaka (32 bajta) — enkripcija tokena neće raditi.')

  if (warnings.length) console.error('\n[KONFIGURACIJA] Upozorenja:\n  - ' + warnings.join('\n  - ') + '\n')
  if (fatal.length) {
    console.error('\n[KONFIGURACIJA] Kritično:\n  - ' + fatal.join('\n  - '))
    if (process.env.NODE_ENV === 'production') {
      console.error('Server se ne pokreće bez ovih tajni.\n')
      process.exit(1)
    }
    console.error('Nastavljam u dev modu, ali auth/enkripcija neće raditi.\n')
  }
}
validateSecrets()

const app = express()
app.set('trust proxy', 1)
const PORT = process.env.PORT || 3001

// Security headers. Global CSP is disabled because the SPA relies on inline
// style attributes and the Google Fonts CDN. The public /rn/:token route DOES
// get a strict per-route CSP via setPublishedSecurityHeaders (publishedHtml.js)
// — only the hashed bootstrap script may execute there. All other protections
// (nosniff, HSTS, X-Frame-Options, referrer policy) still apply globally.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }))
app.use(express.json({ limit: '20mb' }))

// Generous safety-net limiter for the whole API — blocks gross abuse without
// interfering with normal dashboard use.
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 1000, standardHeaders: true, legacyHeaders: false })
app.use('/api', apiLimiter)

// Strict limiter for login: only FAILED attempts count, so legitimate users
// are never blocked but brute-force is throttled.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Previše pokušaja prijave. Pokušajte ponovo za 15 minuta.' },
})
app.use('/api/auth/login', loginLimiter)

// Moderate limiter for the AI enhance endpoint (direct Anthropic cost).
const aiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false })
app.use('/api/release-notes/ai-enhance', aiLimiter)

app.use('/api/auth', authRoutes)
app.use('/api/projects', authMiddleware, projectRoutes)
app.use('/api/jira', authMiddleware, jiraRoutes)
app.use('/api/users', authMiddleware, usersRoutes)
app.use('/api/messages', authMiddleware, messagesRoutes)
app.use('/api/release-notes', authMiddleware, releaseNotesRoutes)
app.use('/api/documents', authMiddleware, documentsRoutes)
app.use('/api/phases', authMiddleware, phasesRoutes)
app.use('/api/organizations', authMiddleware, organizationsRoutes)
app.use('/api/reports', authMiddleware, reportsRoutes)
app.use('/api/settings', authMiddleware, settingsRoutes)
app.use('/api/ai-usage', authMiddleware, aiUsageRoutes)
app.use('/api/audit', authMiddleware, auditRoutes)

// Unknown API route → JSON 404 (so the SPA catch-all below never swallows a
// mistyped/removed endpoint and returns index.html instead of an error).
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint nije pronađen' }))

app.get('/rn/:token', (req, res) => {
  const row = db.prepare('SELECT html FROM published_notes WHERE token = ?').get(req.params.token)
  if (!row) return res.status(404).send('<!DOCTYPE html><html><body><h2>Release notes nisu pronađeni.</h2></body></html>')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  setPublishedSecurityHeaders(res)
  res.send(preparePublishedHtml(row.html))
})

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../client/dist')
  app.use(express.static(distPath))
  app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')))
}

// Global error handler — last resort for errors that escape a route's own
// try/catch. Never leaks internals to the client.
app.use((err, req, res, next) => {
  console.error('Neuhvaćena greška:', err)
  if (res.headersSent) return next(err)
  res.status(500).json({ error: 'Greška servera' })
})

startAiUsageScheduler()

const server = app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))

// Keep the process alive on stray async errors instead of Node's default hard
// crash, but make them visible in logs.
process.on('unhandledRejection', (reason) => console.error('Unhandled promise rejection:', reason))
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err))

// Graceful shutdown so SQLite (WAL) checkpoints cleanly on Railway redeploys.
function shutdown(signal) {
  console.log(`\n${signal} primljen — gašenje...`)
  server.close(() => {
    try { db.close() } catch {}
    process.exit(0)
  })
  // Hard cap so a hung connection can't block the redeploy indefinitely.
  setTimeout(() => process.exit(0), 10000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
