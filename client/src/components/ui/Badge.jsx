export default function Badge({ color = 'gray', children }) {
  const colors = {
    green: { bg: 'var(--greenTint)', text: 'var(--green)', border: 'var(--green)' },
    blue:  { bg: 'rgba(79,142,247,0.12)', text: 'var(--accent)', border: 'var(--accent)' },
    amber: { bg: 'var(--amberTint)', text: 'var(--amber)', border: 'var(--amber)' },
    red:   { bg: 'var(--redTint)', text: 'var(--red)', border: 'var(--red)' },
    gray:  { bg: 'rgba(107,122,153,0.12)', text: 'var(--textMuted)', border: 'var(--textMuted)' },
  }
  const c = colors[color] || colors.gray
  return (
    <span style={{
      display: 'inline-block',
      background: c.bg,
      color: c.text,
      border: `1px solid ${c.border}30`,
      borderRadius: 20,
      padding: '2px 8px',
      fontSize: 11,
      fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif, sans-serif",
      fontWeight: 500,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}
