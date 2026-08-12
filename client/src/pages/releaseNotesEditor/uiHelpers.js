// UI-only helpers and shared inline-style objects for the release notes editor.

export function statusCat(task) {
  const s = task.fields?.status?.name || ''
  if (['Resolved', 'Done', 'Closed'].includes(s)) return 'resolved'
  if (['In Progress', 'Development', 'Review'].includes(s)) return 'inprog'
  if (['For Testing', 'TESTING STARTED', 'On Hold - Testing'].includes(s)) return 'testing'
  return 'other'
}

export function statusBadgeStyle(cat) {
  const m = {
    resolved: { background: 'var(--greenTint)', color: 'var(--green)', border: '1px solid rgba(34,197,94,0.3)' },
    inprog:   { background: 'rgba(79,142,247,0.12)', color: 'var(--accent)', border: '1px solid rgba(79,142,247,0.3)' },
    testing:  { background: 'var(--amberTint)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.3)' },
    other:    { background: 'var(--surfaceAlt)', color: 'var(--textMuted)', border: '1px solid var(--border)' },
  }
  return m[cat] || m.other
}

export function statusLabel(task) {
  return task.fields?.status?.name || '—'
}

export function buildHelpUrl(key, jiraUrl) {
  if (!key || !jiraUrl) return null
  return 'https://' + jiraUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') + '/browse/' + key
}

// ── Shared style objects ───────────────────────────────────────────────────────

export const inputStyle = {
  width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontFamily: 'Hanken Grotesk', fontSize: 14, boxSizing: 'border-box',
}

export const pillBtnStyle = {
  background: 'var(--surfaceAlt)', border: '1px solid var(--borderHover)', borderRadius: 6,
  color: 'var(--text)', fontSize: 12, fontWeight: 600, fontFamily: 'Hanken Grotesk', cursor: 'pointer', padding: '5px 12px',
  transition: 'all 0.2s ease', whiteSpace: 'nowrap',
}

export const iconBtnStyle = {
  background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14,
  padding: '2px 4px', display: 'flex', alignItems: 'center', flexShrink: 0, transition: 'opacity 0.2s',
}

export const smallBtnStyle = {
  background: 'var(--surfaceAlt)', border: '1px solid var(--borderHover)', borderRadius: 8,
  color: 'var(--text)', fontSize: 12, fontWeight: 600, fontFamily: 'Hanken Grotesk', cursor: 'pointer', padding: '7px 16px',
  transition: 'all 0.2s ease', whiteSpace: 'nowrap',
}

export const labelStyle = {
  fontSize: 11, fontFamily: 'Hanken Grotesk', color: 'var(--textMuted)', textTransform: 'uppercase',
  display: 'block', marginBottom: 6, letterSpacing: '0.05em',
}
