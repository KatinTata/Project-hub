// SMTP mailer for budget alerts. Configured purely via env vars:
//   SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE
// When SMTP is not configured, send() is a no-op that reports back so callers
// can surface "mail nije podešen" instead of failing.

import nodemailer from 'nodemailer'

let cached = null

export function mailConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

function transporter() {
  if (cached) return cached
  if (!mailConfigured()) return null
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
  return cached
}

export async function sendMail({ to, subject, html }) {
  const t = transporter()
  if (!t) return { ok: false, skipped: true, error: 'SMTP nije podešen' }
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean)
  if (!recipients.length) return { ok: false, skipped: true, error: 'Nema primalaca' }
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: recipients.join(', '),
      subject,
      html,
    })
    return { ok: true, sent: recipients.length }
  } catch (err) {
    console.error('[mailer]', err.message)
    return { ok: false, error: err.message }
  }
}

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

// Branded alert email (same navy hero language as the release notes / reports)
export function budgetAlertHtml({ level, tenantName, spent, limit, pct, month, currency = 'EUR' }) {
  const isLimit = level === 'limit'
  const accent = isLimit ? '#DC2626' : '#EA580C'
  const title = isLimit ? 'Prekoračen mesečni limit AI potrošnje' : 'Približavanje limitu AI potrošnje'
  const money = v => `${(Number(v) || 0).toFixed(2)} ${currency}`
  return `<!DOCTYPE html><html lang="sr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#F0F2F8;font-family:'Segoe UI',Arial,sans-serif;color:#0F1523">
  <div style="max-width:600px;margin:0 auto">
    <div style="background:linear-gradient(135deg,#0b1a2f 0%,#0f2746 55%,#163e6b 100%);border-radius:16px;padding:26px 28px;color:#fff">
      <div style="font-size:11px;letter-spacing:0.16em;color:#38BDF8;margin-bottom:10px">INTELISALE &middot; AI POTROŠNJA</div>
      <div style="font-size:21px;font-weight:700;line-height:1.25">${esc(title)}</div>
      <div style="font-size:14px;color:#9FB2C9;margin-top:8px">${esc(tenantName)} &middot; ${esc(month)}</div>
    </div>
    <div style="background:#fff;border:1px solid #E2E6F0;border-top:none;border-radius:0 0 16px 16px;padding:22px 28px;margin-top:-8px">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#5A6480">Potrošeno ovog meseca</td><td style="padding:6px 0;text-align:right;font-weight:700;color:${accent}">${money(spent)}</td></tr>
        <tr><td style="padding:6px 0;color:#5A6480">Mesečni limit</td><td style="padding:6px 0;text-align:right;font-weight:600">${money(limit)}</td></tr>
        <tr><td style="padding:6px 0;color:#5A6480">Iskorišćeno</td><td style="padding:6px 0;text-align:right;font-weight:600">${Math.round(pct)}%</td></tr>
      </table>
      <div style="height:10px;background:#E2E6F0;border-radius:5px;overflow:hidden;margin:14px 0 6px">
        <div style="width:${Math.min(100, Math.round(pct))}%;height:100%;background:${accent}"></div>
      </div>
      <p style="font-size:13px;color:#5A6480;line-height:1.6;margin:16px 0 0">
        ${isLimit
          ? 'Mesečni limit je prekoračen. Preporučujemo pregled potrošnje po aplikacijama i modelima u Project Hub-u.'
          : 'Potrošnja se približava definisanom mesečnom limitu. Detalje po aplikacijama i modelima možete videti u Project Hub-u.'}
      </p>
      <div style="margin-top:20px;padding-top:14px;border-top:1px solid #E2E6F0;font-size:10px;color:#A0AABF;letter-spacing:0.08em;text-align:center">
        INTELISALE &middot; EMPOWERING SALES EXCELLENCE
      </div>
    </div>
  </div>
</body></html>`
}
