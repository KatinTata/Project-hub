// Lightweight in-process scheduler (no extra deps): a minute ticker fires jobs
// at fixed Europe/Belgrade wall-clock times. Railway deploy is always-on, so
// this is sufficient (spec §11).

import { syncAzurePrices } from './pricing.js'
import { fetchTodaysRates } from './fx.js'
import { checkBudgets } from './budgets.js'
import { runBackup } from '../backup.js'

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

export function startAiUsageScheduler() {
  setInterval(async () => {
    const { hhmm, weekday } = belgradeNow()
    const today = new Date().toISOString().slice(0, 10)

    // 03:00 daily — SQLite backup (retention handled inside)
    if (hhmm === '03:00' && lastBackupRun !== today) {
      lastBackupRun = today
      try { const r = await runBackup(); console.log('[backup] OK ->', r.dest, `(cuva ${r.kept})`) }
      catch (e) { console.error('[backup] failed:', e.message) }
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
