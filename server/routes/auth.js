import { Router } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import db from '../db.js'
import { authMiddleware } from '../auth.js'
import { encryptToken, makeJiraAuth, jiraGet } from '../jiraClient.js'
import { logAudit } from '../audit.js'
import { requireSuperAdmin } from '../rbac.js'

const router = Router()

function signToken(userId) {
  const tv = db.prepare('SELECT token_version FROM users WHERE id = ?').get(userId)?.token_version || 0
  return jwt.sign({ userId, tv }, process.env.JWT_SECRET, { expiresIn: '7d' })
}

// First-run setup — only works if no users exist yet
router.post('/setup', async (req, res) => {
  try {
    const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c
    if (count > 0) return res.status(403).json({ error: 'Setup već obavljen' })
    const { name, email, password } = req.body
    if (!name || !email || !password) return res.status(400).json({ error: 'Sva polja su obavezna' })
    const hash = await bcrypt.hash(password, 12)
    const result = db.prepare("INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, 'super_admin')").run(email.toLowerCase(), hash, name)
    const token = signToken(result.lastInsertRowid)
    res.json({ token, user: { id: result.lastInsertRowid, email, name, role: 'super_admin' } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Greška servera' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email?.toLowerCase())
    if (!user) {
      logAudit(null, 'login.failure', `email: ${email || '?'}`, req)
      return res.status(401).json({ error: 'Pogrešan email ili lozinka' })
    }

    const match = await bcrypt.compare(password, user.password)
    if (!match) {
      logAudit(user.id, 'login.failure', `email: ${user.email}`, req)
      return res.status(401).json({ error: 'Pogrešan email ili lozinka' })
    }

    logAudit(user.id, 'login.success', `email: ${user.email}`, req)
    const token = signToken(user.id)
    // sharedJira must ship at login too (not only /me) — otherwise admins who
    // inherit the org connection look "unconnected" until a manual refresh.
    const sharedJira = !!db.prepare("SELECT 1 FROM users WHERE role = 'super_admin' AND jira_url IS NOT NULL AND jira_token IS NOT NULL LIMIT 1").get()
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role || 'user', jiraUrl: user.jira_url, jiraEmail: user.jira_email, hasAnthropicKey: !!user.anthropic_key, sharedJira },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Greška servera' })
  }
})

router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, email, name, role, jira_url, jira_email, anthropic_key FROM users WHERE id = ?').get(req.userId)
  if (!user) return res.status(404).json({ error: 'Korisnik nije pronađen' })
  // Admins inherit super-admin connections — tell the client Jira is reachable
  // even without own creds, so it doesn't fall back to demo data.
  const sharedJira = !!db.prepare("SELECT 1 FROM users WHERE role = 'super_admin' AND jira_url IS NOT NULL AND jira_token IS NOT NULL LIMIT 1").get()
  res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role || 'user', jiraUrl: user.jira_url, jiraEmail: user.jira_email, hasAnthropicKey: !!user.anthropic_key, sharedJira } })
})

router.put('/jira-config', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const { jiraUrl, jiraEmail, jiraToken } = req.body
    let encryptedToken = null
    if (jiraToken) {
      encryptedToken = encryptToken(jiraToken)
    } else {
      const existing = db.prepare('SELECT jira_token FROM users WHERE id = ?').get(req.userId)
      encryptedToken = existing?.jira_token || null
    }
    db.prepare('UPDATE users SET jira_url = ?, jira_email = ?, jira_token = ? WHERE id = ?')
      .run(jiraUrl, jiraEmail, encryptedToken, req.userId)
    logAudit(req.userId, 'config.jira.update', `url: ${jiraUrl || '-'}${jiraToken ? ', token promenjen' : ''}`, req)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Greška servera' })
  }
})

router.post('/jira-test', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const { jiraUrl, jiraEmail, jiraToken } = req.body
    const auth = makeJiraAuth(jiraEmail, jiraToken)
    const data = await jiraGet(jiraUrl, '/myself', auth)
    res.json({ ok: true, displayName: data.displayName })
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message })
  }
})

router.put('/ai-config', authMiddleware, requireSuperAdmin, (req, res) => {
  try {
    const { anthropicKey } = req.body
    let encryptedKey = null
    if (anthropicKey) {
      encryptedKey = encryptToken(anthropicKey)
    } else {
      const existing = db.prepare('SELECT anthropic_key FROM users WHERE id = ?').get(req.userId)
      encryptedKey = existing?.anthropic_key || null
    }
    db.prepare('UPDATE users SET anthropic_key = ? WHERE id = ?').run(encryptedKey, req.userId)
    logAudit(req.userId, 'config.ai.update', anthropicKey ? 'Anthropic ključ promenjen' : 'bez izmene ključa', req)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Greška servera' })
  }
})

router.put('/password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId)
    const match = await bcrypt.compare(oldPassword, user.password)
    if (!match) return res.status(400).json({ error: 'Pogrešna trenutna lozinka' })
    const hash = await bcrypt.hash(newPassword, 12)
    // token_version++ poništava sve postojeće tokene; novi token vraćamo da
    // TEKUĆA sesija ne bude izbačena (klijent ga čuva umesto starog).
    db.prepare('UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?').run(hash, req.userId)
    logAudit(req.userId, 'user.password.change', null, req)
    res.json({ ok: true, token: signToken(req.userId) })
  } catch {
    res.status(500).json({ error: 'Greška servera' })
  }
})

router.delete('/account', authMiddleware, async (req, res) => {
  try {
    logAudit(req.userId, 'user.account.delete', 'korisnik obrisao sopstveni nalog', req)
    db.prepare('DELETE FROM users WHERE id = ?').run(req.userId)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Greška servera' })
  }
})

export default router
