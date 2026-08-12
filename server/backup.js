// Daily on-disk backup of the SQLite database using better-sqlite3's online
// backup API (WAL-safe — no need to stop writes). Backups land next to the
// live DB on the same volume (zaštita od grešaka u podacima/korupcije).
//
// P2-D2: opcioni OFF-SITE deo — ako su podešene BACKUP_S3_* varijable i
// BACKUP_ENCRYPTION_KEY (64 hex, ZASEBAN ključ, ne ENCRYPTION_KEY), backup se
// gzipuje, šifruje AES-256-GCM i šalje na S3-kompatibilan storage (R2, MinIO,
// B2, AWS...). Bez tih varijabli ponašanje je isto kao pre (samo lokalno).
// Format off-site fajla: iv(12B) | authTag(16B) | AES-256-GCM(gzip(tracker.db))
// Restore postupak: RESTORE.md u korenu repozitorijuma.

import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import zlib from 'zlib'
import { fileURLToPath } from 'url'
import db from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../data')
const backupsDir = path.join(dataDir, 'backups')

const RETENTION = 14 // keep the last N daily backups

// ── Off-site (S3-kompatibilno, env-gated) ────────────────────────────────────

const OFFSITE = {
  endpoint: process.env.BACKUP_S3_ENDPOINT,        // npr. https://<acct>.r2.cloudflarestorage.com
  bucket: process.env.BACKUP_S3_BUCKET,
  accessKey: process.env.BACKUP_S3_ACCESS_KEY,
  secretKey: process.env.BACKUP_S3_SECRET_KEY,
  region: process.env.BACKUP_S3_REGION || 'us-east-1',
  prefix: process.env.BACKUP_S3_PREFIX || 'project-hub',
  encKeyHex: process.env.BACKUP_ENCRYPTION_KEY,
}

export function offsiteConfigured() {
  return !!(OFFSITE.endpoint && OFFSITE.bucket && OFFSITE.accessKey && OFFSITE.secretKey
    && /^[0-9a-fA-F]{64}$/.test(OFFSITE.encKeyHex || ''))
}

function encryptBackup(buf) {
  const key = Buffer.from(OFFSITE.encKeyHex, 'hex')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(buf), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ct])
}

const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest()
const sha256hex = b => crypto.createHash('sha256').update(b).digest('hex')

// Minimalni SigV4 PUT (path-style) — bez AWS SDK zavisnosti.
async function s3Put(objectKey, body) {
  const url = new URL(OFFSITE.endpoint)
  const canonicalUri = `/${OFFSITE.bucket}/${objectKey}`
    .split('/').map(encodeURIComponent).join('/')
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = sha256hex(body)

  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalHeaders = `host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
  const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const scope = `${dateStamp}/${OFFSITE.region}/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n')

  let key = hmac('AWS4' + OFFSITE.secretKey, dateStamp)
  key = hmac(key, OFFSITE.region)
  key = hmac(key, 's3')
  key = hmac(key, 'aws4_request')
  const signature = crypto.createHmac('sha256', key).update(stringToSign).digest('hex')

  const res = await fetch(`${url.origin}${canonicalUri}`, {
    method: 'PUT',
    headers: {
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${OFFSITE.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`S3 upload ${res.status}: ${text.slice(0, 300)}`)
  }
}

async function uploadOffsite(localPath, stamp) {
  const enc = encryptBackup(zlib.gzipSync(fs.readFileSync(localPath)))
  const objectKey = `${OFFSITE.prefix}/tracker-${stamp}.db.gz.enc`
  await s3Put(objectKey, enc)
  return { objectKey, bytes: enc.length }
}

// ── Glavni posao ─────────────────────────────────────────────────────────────

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
    try { fs.unlinkSync(path.join(backupsDir, f)) } catch { /* best-effort */ }
  }

  // Off-site: šifrovana kopija na S3-kompatibilan storage (retencija tamo ide
  // preko bucket lifecycle pravila — vidi RESTORE.md). Pad upload-a ne sme da
  // sruši lokalni backup — vraća se offsiteError za log.
  let offsite = null
  let offsiteError = null
  if (offsiteConfigured()) {
    try { offsite = await uploadOffsite(dest, stamp) }
    catch (e) { offsiteError = e.message }
  }

  return { dest, kept: Math.min(files.length, RETENTION), offsite, offsiteError }
}
