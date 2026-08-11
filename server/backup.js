// Daily on-disk backup of the SQLite database using better-sqlite3's online
// backup API (WAL-safe — no need to stop writes). Backups land next to the
// live DB on the same volume, so this protects against app-level data
// mistakes and corruption; it is NOT off-site protection against volume loss
// (that needs external storage, e.g. S3 — out of scope here).

import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import db from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../data')
const backupsDir = path.join(dataDir, 'backups')

const RETENTION = 14 // keep the last N daily backups

export async function runBackup() {
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const dest = path.join(backupsDir, `tracker-${stamp}.db`)

  await db.backup(dest)

  // Prune to the most recent RETENTION files.
  const files = fs.readdirSync(backupsDir)
    .filter(f => f.startsWith('tracker-') && f.endsWith('.db'))
    .sort() // ISO date prefix sorts chronologically
  for (const f of files.slice(0, Math.max(0, files.length - RETENTION))) {
    try { fs.unlinkSync(path.join(backupsDir, f)) } catch {}
  }

  return { dest, kept: Math.min(files.length, RETENTION) }
}
