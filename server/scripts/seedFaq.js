// P2-E1: puni tabelu `faq` postojećim ugrađenim pitanjima (faqSeed.json,
// generisan iz client/src/pages/qaData.jsx — 39 pitanja × sr/en).
//
// Idempotentno: preskače ako tabela već ima redova (osim uz --force, koji
// briše postojeće i ubacuje ponovo — koristiti samo pre prvog ručnog unosa!).
//
//   node server/scripts/seedFaq.js
//   node server/scripts/seedFaq.js --force

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import db from '../db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const force = process.argv.includes('--force')

const existing = db.prepare('SELECT COUNT(*) AS n FROM faq').get().n
if (existing > 0 && !force) {
  console.log(`Tabela faq već ima ${existing} redova — preskačem (pokreni sa --force za ponovni seed).`)
  process.exit(0)
}

const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'faqSeed.json'), 'utf-8'))

const insert = db.prepare(
  'INSERT INTO faq (category, lang, question, answer, keywords, position) VALUES (?, ?, ?, ?, ?, ?)'
)
const run = db.transaction(() => {
  if (force && existing > 0) {
    db.prepare('DELETE FROM faq').run()
    console.log(`Obrisano ${existing} postojećih redova (--force).`)
  }
  for (const r of rows) insert.run(r.category, r.lang, r.question, r.answer, r.keywords || '', r.position || 0)
})
run()

console.log(`Ubačeno ${rows.length} FAQ redova (${new Set(rows.map(r => r.lang)).size} jezika).`)
