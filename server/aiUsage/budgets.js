// Monthly EUR budget per tenant: current-month spend, early-warning + limit
// alerts by email (once per calendar month per threshold).

import db from '../db.js'
import { getTenants, getUsageSummary, AdminApiNotConfiguredError } from './adminApi.js'
import { makePriceResolver, groupCost } from './pricing.js'
import { usdConversion } from './fx.js'
import { sendMail, budgetAlertHtml, mailConfigured } from './mailer.js'

export const currentMonthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export function monthRange(d = new Date()) {
  const from = new Date(d.getFullYear(), d.getMonth(), 1)
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  to.setHours(23, 59, 59, 999)
  return { fromDate: from.toISOString(), toDate: to.toISOString() }
}

// Spend (EUR) for one tenant in a period, merged across its two GUIDs.
export async function tenantSpendEur(guids, fromDate, toDate) {
  const conv = usdConversion('EUR', toDate)
  const resolve = makePriceResolver()
  const sums = await Promise.all(guids.map(g =>
    getUsageSummary({ fromDate, toDate, tenantId: g, groupBy: 'Model' }).catch(() => null)))
  let usd = 0, requests = 0, tokens = 0
  for (const data of sums) {
    if (!data) continue
    requests += data.totals?.requests || 0
    tokens += data.totals?.totalTokens || 0
    for (const g of (data.groups || [])) if (g.modelName) usd += groupCost(resolve, g)
  }
  return { eur: usd * conv.factor, usd, requests, tokens, currency: conv.currency, rateAvailable: conv.rateAvailable }
}

function guidsOf(row) {
  const out = []
  if (row.sl_tenant_guid) out.push(row.sl_tenant_guid)
  if (row.eproc_tenant_guid) out.push(row.eproc_tenant_guid)
  if (!out.length && row.tenant_id) out.push(row.tenant_id)
  return out
}

function recipients(tenantId, extraEmails) {
  const admins = db.prepare("SELECT email FROM users WHERE role IN ('admin','super_admin') AND email IS NOT NULL").all().map(r => r.email)
  const clients = db.prepare(`
    SELECT u.email FROM client_tenant_users ctu JOIN users u ON u.id = ctu.user_id WHERE ctu.tenant_id = ?
  `).all(tenantId).map(r => r.email).filter(Boolean)
  const extra = String(extraEmails || '').split(/[,;\s]+/).filter(e => e.includes('@'))
  return [...new Set([...admins, ...clients, ...extra])]
}

// Status for one budgeted tenant (used by the dashboard and the checker).
export async function budgetStatus(row) {
  const { fromDate, toDate } = monthRange()
  const spend = await tenantSpendEur(guidsOf(row), fromDate, toDate)
  const limit = Number(row.monthly_limit_eur) || 0
  const pct = limit > 0 ? (spend.eur / limit) * 100 : null
  const warnAt = Number(row.warning_pct) || 80
  return {
    tenant_id: row.tenant_id,
    tenant_name: row.tenant_name || row.tenant_id,
    month: currentMonthKey(),
    spent_eur: spend.eur,
    requests: spend.requests,
    tokens: spend.tokens,
    limit_eur: limit || null,
    warning_pct: warnAt,
    pct,
    level: pct == null ? 'none' : pct >= 100 ? 'limit' : pct >= warnAt ? 'warning' : 'ok',
    rate_available: spend.rateAvailable,
  }
}

export async function listBudgetStatuses() {
  const rows = db.prepare(`
    SELECT b.*, m.tenant_name, m.sl_tenant_guid, m.eproc_tenant_guid
    FROM tenant_budgets b
    LEFT JOIN client_tenant_mappings m ON m.tenant_id = b.tenant_id
    WHERE b.monthly_limit_eur > 0
  `).all()
  const out = []
  for (const r of rows) {
    try { out.push(await budgetStatus(r)) } catch { /* skip unreachable tenant */ }
  }
  return out.sort((a, b) => (b.pct || 0) - (a.pct || 0))
}

// Checker: raise an in-app alert once per month per threshold; email is a
// best-effort extra on top (works with SMTP off).
export async function checkBudgets() {
  const month = currentMonthKey()
  const rows = db.prepare(`
    SELECT b.*, m.tenant_name, m.sl_tenant_guid, m.eproc_tenant_guid
    FROM tenant_budgets b
    LEFT JOIN client_tenant_mappings m ON m.tenant_id = b.tenant_id
    WHERE b.notify_enabled = 1 AND b.monthly_limit_eur > 0
  `).all()
  const results = []
  for (const row of rows) {
    try {
      const st = await budgetStatus(row)
      if (st.level !== 'limit' && st.level !== 'warning') continue
      const level = st.level

      // The alerts table itself is the dedup (UNIQUE tenant+level+month)
      const ins = db.prepare(`
        INSERT OR IGNORE INTO ai_usage_alerts (tenant_id, tenant_name, level, month, spent_eur, limit_eur, pct)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(row.tenant_id, st.tenant_name, level, month, st.spent_eur, st.limit_eur, st.pct)
      if (ins.changes === 0) continue // already raised this month

      let mail = { ok: false, skipped: true, error: 'SMTP nije podešen' }
      if (mailConfigured()) {
        mail = await sendMail({
          to: recipients(row.tenant_id, row.extra_emails),
          subject: level === 'limit'
            ? `[Intelisale] Prekoračen AI limit — ${st.tenant_name} (${month})`
            : `[Intelisale] AI potrošnja na ${Math.round(st.pct)}% limita — ${st.tenant_name} (${month})`,
          html: budgetAlertHtml({ level, tenantName: st.tenant_name, spent: st.spent_eur, limit: st.limit_eur, pct: st.pct, month }),
        })
        if (mail.ok) {
          db.prepare('UPDATE ai_usage_alerts SET mail_sent = 1 WHERE tenant_id = ? AND level = ? AND month = ?').run(row.tenant_id, level, month)
          db.prepare(`UPDATE tenant_budgets SET ${level === 'limit' ? 'limit_sent_month' : 'warning_sent_month'} = ? WHERE tenant_id = ?`)
            .run(month, row.tenant_id)
        }
      }
      results.push({ tenant: st.tenant_name, level, pct: Math.round(st.pct), mail })
    } catch (err) {
      if (err instanceof AdminApiNotConfiguredError) break
      results.push({ tenant: row.tenant_name || row.tenant_id, error: err.message })
    }
  }
  return { month, mail_configured: mailConfigured(), results }
}

// In-app notes: unacknowledged alerts (admins see all, clients only theirs)
export function listAlerts(userId, isAdminUser) {
  if (isAdminUser) {
    return db.prepare('SELECT * FROM ai_usage_alerts WHERE acked_at IS NULL ORDER BY created_at DESC LIMIT 50').all()
  }
  return db.prepare(`
    SELECT a.* FROM ai_usage_alerts a
    JOIN client_tenant_users ctu ON ctu.tenant_id = a.tenant_id
    WHERE ctu.user_id = ? AND a.acked_at IS NULL
    ORDER BY a.created_at DESC LIMIT 20
  `).all(userId)
}
