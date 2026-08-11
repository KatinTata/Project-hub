import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'path'
import { fileURLToPath } from 'url'
import { authMiddleware } from './auth.js'
import db from './db.js'
import { preparePublishedHtml } from './publishedHtml.js'
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
import { startAiUsageScheduler } from './aiUsage/scheduler.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.set('trust proxy', 1)
const PORT = process.env.PORT || 3001

// Security headers. CSP is disabled here because the SPA relies on inline
// style attributes and the Google Fonts CDN; a per-route CSP is applied to
// the public /rn page below. All other protections (nosniff, HSTS,
// X-Frame-Options, referrer policy) still apply.
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
app.get('/rn/:token', (req, res) => {
  const row = db.prepare('SELECT html FROM published_notes WHERE token = ?').get(req.params.token)
  if (!row) return res.status(404).send('<!DOCTYPE html><html><body><h2>Release notes nisu pronađeni.</h2></body></html>')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(preparePublishedHtml(row.html))
})

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../client/dist')
  app.use(express.static(distPath))
  app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')))
}

startAiUsageScheduler()

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
