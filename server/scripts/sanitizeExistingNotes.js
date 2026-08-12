// Jednokratna migracija: sanitizuj HTML svih postojećih published_notes zapisa.
//
// POKRETANJE (ručno, JEDNOM, uz prethodni backup baze):
//   node server/scripts/sanitizeExistingNotes.js --dry-run   # samo statistika, bez upisa
//   node server/scripts/sanitizeExistingNotes.js             # upis
//
// Ne menja strukturu tabele — samo sadržaj kolone html.

import 'dotenv/config'
import db from '../db.js'
import { sanitizePublishedHtml } from '../sanitize.js'

const dryRun = process.argv.includes('--dry-run')

const rows = db.prepare('SELECT id, token, title, LENGTH(html) as len, html FROM published_notes').all()
console.log(`Ukupno zapisa: ${rows.length}${dryRun ? ' (DRY RUN — bez upisa)' : ''}`)

let changed = 0
let unchanged = 0
const update = db.prepare('UPDATE published_notes SET html = ? WHERE id = ?')

for (const row of rows) {
  const clean = sanitizePublishedHtml(row.html)
  if (clean === row.html) {
    unchanged++
    continue
  }
  changed++
  const delta = row.html.length - clean.length
  console.log(`  #${row.id} "${row.title || row.token}": ${row.html.length} -> ${clean.length} znakova (razlika ${delta})`)
  if (!dryRun) update.run(clean, row.id)
}

console.log(`\nPromenjeno: ${changed}, netaknuto: ${unchanged}`)
if (dryRun && changed > 0) {
  console.log('Pokreni bez --dry-run da upišeš izmene (posle backup-a!).')
}
