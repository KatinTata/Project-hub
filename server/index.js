import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { authMiddleware } from './auth.js'
import db from './db.js'
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

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.set('trust proxy', 1)
const PORT = process.env.PORT || 3001

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }))
app.use(express.json({ limit: '20mb' }))

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
app.get('/rn/:token', (req, res) => {
  const row = db.prepare('SELECT html FROM published_notes WHERE token = ?').get(req.params.token)
  if (!row) return res.status(404).send('<!DOCTYPE html><html><body><h2>Release notes nisu pronađeni.</h2></body></html>')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // Legacy notes were published while task titles linked to our Jira — strip
  // those anchors on the way out (clients must not get Jira links).
  const cleaned = row.html.replace(
    /<a class="task-summary task-link"[^>]*>([\s\S]*?)<\/a>/g,
    '<span class="task-summary">$1</span>'
  )
  res.send(cleaned)
})

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../client/dist')
  app.use(express.static(distPath))
  app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')))
}

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
