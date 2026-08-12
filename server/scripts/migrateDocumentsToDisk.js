// P2-D4: migracija dokumenata iz SQLite BLOB-a na fajlsistem (DATA_DIR/uploads).
//
// Aditivno i u dve faze, download radi tokom celog prelaza:
//   1. (bez flagova / --dry-run)  BLOB → fajl na disku + popuni file_path;
//      BLOB se NE briše dok se migracija ne potvrdi.
//   2. (--purge)  za dokumente koji imaju file_path i fajl na disku sa tačnom
//      veličinom, isprazni BLOB (file_data = prazan bafer).
//
// Pokretanje (na serveru, uz backup baze pre --purge):
//   node server/scripts/migrateDocumentsToDisk.js --dry-run
//   node server/scripts/migrateDocumentsToDisk.js
//   node server/scripts/migrateDocumentsToDisk.js --purge --dry-run
//   node server/scripts/migrateDocumentsToDisk.js --purge

import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import db from '../db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsDir = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'uploads')
  : path.join(__dirname, '../../data/uploads')

const dryRun = process.argv.includes('--dry-run')
const purge = process.argv.includes('--purge')

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

if (!purge) {
  // Faza 1: BLOB → fajl + file_path (BLOB ostaje)
  const docs = db.prepare(`
    SELECT id, original_name, file_size, length(file_data) AS blob_len, file_path
    FROM documents
    WHERE (file_path IS NULL OR file_path = '') AND file_data IS NOT NULL AND length(file_data) > 0
  `).all()

  console.log(`${dryRun ? '[dry-run] ' : ''}Dokumenata sa BLOB-om bez file_path: ${docs.length}`)
  let ok = 0, failed = 0
  for (const d of docs) {
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`
    const fullPath = path.join(uploadsDir, fileName)
    if (dryRun) {
      console.log(`  [dry-run] #${d.id} "${d.original_name}" (${d.blob_len} B) → ${fileName}`)
      ok++
      continue
    }
    try {
      const { file_data } = db.prepare('SELECT file_data FROM documents WHERE id = ?').get(d.id)
      fs.writeFileSync(fullPath, file_data)
      const written = fs.statSync(fullPath).size
      if (written !== d.blob_len) throw new Error(`veličina se ne poklapa (${written} != ${d.blob_len})`)
      db.prepare('UPDATE documents SET file_path = ? WHERE id = ?').run(fileName, d.id)
      console.log(`  #${d.id} "${d.original_name}" → ${fileName} (${written} B)`)
      ok++
    } catch (e) {
      fs.rmSync(fullPath, { force: true })
      console.error(`  GREŠKA #${d.id} "${d.original_name}": ${e.message}`)
      failed++
    }
  }
  console.log(`Gotovo: ${ok} migrirano, ${failed} grešaka.${dryRun ? ' (ništa nije pisano — dry run)' : ''}`)
  if (!dryRun && ok > 0) console.log('Proveri download u aplikaciji, pa pokreni sa --purge da isprazniš BLOB-ove.')
} else {
  // Faza 2: isprazni BLOB tamo gde fajl postoji i veličina se poklapa
  const docs = db.prepare(`
    SELECT id, original_name, file_size, length(file_data) AS blob_len, file_path
    FROM documents
    WHERE file_path IS NOT NULL AND file_path != '' AND file_data IS NOT NULL AND length(file_data) > 0
  `).all()

  console.log(`${dryRun ? '[dry-run] ' : ''}Dokumenata sa file_path i punim BLOB-om: ${docs.length}`)
  let ok = 0, skipped = 0
  for (const d of docs) {
    const fullPath = path.join(uploadsDir, d.file_path)
    let diskSize = null
    try { diskSize = fs.statSync(fullPath).size } catch { /* nema fajla */ }
    if (diskSize == null || diskSize !== d.blob_len) {
      console.warn(`  PRESKOČEN #${d.id} "${d.original_name}": fajl ${diskSize == null ? 'ne postoji' : `veličina ${diskSize} != ${d.blob_len}`} — BLOB zadržan`)
      skipped++
      continue
    }
    if (dryRun) {
      console.log(`  [dry-run] #${d.id} "${d.original_name}" — BLOB (${d.blob_len} B) bi bio ispražnjen`)
      ok++
      continue
    }
    db.prepare("UPDATE documents SET file_data = x'' WHERE id = ?").run(d.id)
    console.log(`  #${d.id} "${d.original_name}" — BLOB ispražnjen (${d.blob_len} B oslobođeno)`)
    ok++
  }
  console.log(`Gotovo: ${ok} ispražnjeno, ${skipped} preskočeno.${dryRun ? ' (ništa nije pisano — dry run)' : ''}`)
  if (!dryRun && ok > 0) console.log('Napomena: SQLite ne vraća prostor odmah — po želji pokreni VACUUM van radnog vremena.')
}
