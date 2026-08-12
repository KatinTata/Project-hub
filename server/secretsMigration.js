// Jednokratna (idempotentna) migracija tajni iz starog CBC formata u GCM
// (P1-15). Poziva se pri startu servera: redovi koji su već 'v2:' se
// preskaču, pa je ponovno pokretanje besplatno. Red koji ne može da se
// dešifruje (npr. upisan drugim ključem) se NE dira i samo se loguje.

import db from './db.js'
import { encryptToken, decryptToken, isLegacyEncrypted } from './jiraClient.js'

export function migrateSecretsToGcm() {
  let migrated = 0
  let failed = 0

  const reencrypt = (value) => encryptToken(decryptToken(value))

  const migrateColumn = (table, idCol, col) => {
    const rows = db.prepare(`SELECT ${idCol} AS id, ${col} AS val FROM ${table} WHERE ${col} IS NOT NULL`).all()
    const update = db.prepare(`UPDATE ${table} SET ${col} = ? WHERE ${idCol} = ?`)
    for (const row of rows) {
      if (!isLegacyEncrypted(row.val)) continue
      try {
        update.run(reencrypt(row.val), row.id)
        migrated++
      } catch (err) {
        failed++
        console.error(`[secrets] ${table}.${col} id=${row.id}: dekripcija starog formata nije uspela — red ostaje netaknut (${err.message})`)
      }
    }
  }

  try {
    migrateColumn('users', 'id', 'jira_token')
    migrateColumn('users', 'id', 'anthropic_key')
    migrateColumn('integration_api_configs', 'id', 'service_password_enc')
  } catch (err) {
    console.error('[secrets] Migracija tajni u GCM preskočena:', err.message)
  }

  if (migrated > 0 || failed > 0) {
    console.log(`[secrets] GCM migracija: ${migrated} re-enkriptovano, ${failed} neuspešno (ostavljeno u starom formatu)`)
  }
}
