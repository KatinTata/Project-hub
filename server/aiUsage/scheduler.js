// Lightweight in-process scheduler (no extra deps): a minute ticker fires jobs
// at fixed Europe/Belgrade wall-clock times. Railway deploy is always-on, so
// this is sufficient (spec §11).

import { syncAzurePrices } from './pricing.js'
import { fetchTodaysRates } from './fx.js'
import { checkBudgets } from './budgets.js'
import { runBackup } from '../backup.js'
import { runDailySnapshots } from '../snapshots.js'
import { pruneAuditLog } from '../audit.js'

function belgradeNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Belgrade', hour: '2-digit', minute: '2-digit', weekday: 'short',
  }).formatToParts(new Date())
  const get = t => parts.find(p => p.type === t)?.value
  return { hhmm: `${get('hour')}:${get('minute')}`, weekday: get('weekday') }
}

let lastPriceRun = ''
let lastFxRun = ''
let lastBudgetRun = ''
let lastBackupRun = ''
let lastSnapshotRun = ''

export function startAiUsageScheduler() {
  setInterval(async () => {
    const { hhmm, weekday } = belgradeNow()
    const today = new Date().toISOString().slice(0, 10)

    // Od 03:00 daily — SQLite backup (retention handled inside) + audit
    // retencija. Prozor umesto tačnog minuta (P2-D2): ako je proces bio ugašen
    // u 03:00, propušten backup se nadoknađuje pri prvom sledećem tiku.
    if (hhmm >= '03:00' && lastBackupRun !== today) {
      lastBackupRun = today
      try {
        const r = await runBackup()
        console.log('[backup] OK ->', r.dest, `(cuva ${r.kept})`)
        if (r.offsite) console.log(`[backup] off-site OK -> ${r.offsite.objectKey} (${r.offsite.bytes} B)`)
        if (r.offsiteError) console.error('[backup] off-site FAILED:', r.offsiteError)
      }
      catch (e) { console.error('[backup] failed:', e.message) }
      const pruned = pruneAuditLog()
      if (pruned > 0) console.log(`[audit] retencija: obrisano ${pruned} zapisa starijih od godinu dana`)
    }

    // 02:00 daily — Azure pricing sync
    if (hhmm === '02:00' && lastPriceRun !== today) {
      lastPriceRun = today
      try { await syncAzurePrices('sync'); console.log('[ai-usage] pricing sync OK') }
      catch (e) { console.error('[ai-usage] pricing sync failed:', e.message) }
    }

    // 09:00 weekdays — NBS exchange rates
    const isWeekday = !['Sat', 'Sun'].includes(weekday)
    if (hhmm === '09:00' && isWeekday && lastFxRun !== today) {
      lastFxRun = today
      try { await fetchTodaysRates(); console.log('[ai-usage] fx rates OK') }
      catch (e) { console.error('[ai-usage] fx rates failed:', e.message) }
    }

    // Od 22:00 daily — snapshot svih aktivnih projekata (P2-E3). Prozor umesto
    // tačnog minuta: ako je proces bio ugašen u 22:00, nadoknada do ponoći.
    // DO NOTHING u insertu čuva klijentski snapshot istog dana.
    if (hhmm >= '22:00' && lastSnapshotRun !== today) {
      lastSnapshotRun = today
      try {
        const r = await runDailySnapshots()
        console.log(`[snapshot] ${r.day}: ${r.ok} novih, ${r.skipped} preskočeno, ${r.failed} palo (${r.total} projekata)`)
      } catch (e) { console.error('[snapshot] failed:', e.message) }
    }

    // 09:30 daily — budget warning / limit emails (once per month per threshold)
    if (hhmm === '09:30' && lastBudgetRun !== today) {
      lastBudgetRun = today
      try {
        const r = await checkBudgets()
        if (r.results.length) console.log('[ai-usage] budget alerts:', JSON.stringify(r.results))
      } catch (e) { console.error('[ai-usage] budget check failed:', e.message) }
    }
  }, 30 * 1000)
}
