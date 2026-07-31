import { useState } from 'react'
import { fmtHours } from '../utils.js'
import { useT } from '../lang.jsx'

const COLLAPSED_COUNT = 8
const MAX_COUNT = 20

function cardStyle(overPct) {
  if (overPct > 50)  return { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }
  if (overPct > 15)  return { background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }
  return { background: 'var(--greenTint)', border: '1px solid rgba(34,197,94,0.2)' }
}

export default function OverrunHeatmap({ tasks = [] }) {
  const [expanded, setExpanded] = useState(false)
  const t = useT()

  function pctLabel(overPct) {
    if (overPct > 0)  return { text: `+${overPct}%`, color: 'var(--red)' }
    if (overPct < -2) return { text: `${overPct}% ${t('chart.below')}`, color: 'var(--green)' }
    return { text: t('chart.onTarget'), color: 'var(--textMuted)' }
  }

  const withEst = tasks
    .filter(task => task.est > 0)
    .slice()
    .sort((a, b) => b.overPct - a.overPct)
    .slice(0, MAX_COUNT)

  if (withEst.length === 0) {
    return (
      <div style={{ color: 'var(--green)', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
        {t('chart.allOnTarget')}
      </div>
    )
  }

  const visible = expanded ? withEst : withEst.slice(0, COLLAPSED_COUNT)
  const hiddenCount = withEst.length - COLLAPSED_COUNT > 0 ? withEst.length - COLLAPSED_COUNT : 0

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
        {visible.map(task => {
          const cs = cardStyle(task.overPct)
          const lbl = pctLabel(task.overPct)
          const spentPct = Math.min(task.spent / task.est, 1)
          const barColor = task.overPct > 15 ? 'var(--red)' : 'var(--green)'

          return (
            <div key={task.key} style={{ ...cs, borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color: task.overPct > 15 ? 'var(--red)' : 'var(--accent)', fontWeight: 600 }}>
                {task.key}
              </span>
              <div style={{
                fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
                fontSize: 12, color: 'var(--textMuted)', lineHeight: 1.4,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                {task.summary}
              </div>
              <div style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--textMuted)', marginTop: 2 }}>
                {fmtHours(task.spent)} / {fmtHours(task.est)}
              </div>
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${spentPct * 100}%`, background: barColor, borderRadius: 2, transition: 'width 0.4s ease' }} />
              </div>
              <div style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, fontWeight: 600, color: lbl.color }}>
                {lbl.text}
              </div>
            </div>
          )
        })}
      </div>

      {/* Toggle */}
      {withEst.length > COLLAPSED_COUNT && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            marginTop: 10, width: '100%', padding: '7px 0',
            background: 'transparent', border: '1px solid var(--border)',
            borderRadius: 7, cursor: 'pointer', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 12, color: 'var(--textMuted)', transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--borderHover)'; e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--textMuted)' }}
        >
          {expanded ? 'Prikaži manje' : `Vidi još ${hiddenCount}`}
        </button>
      )}
    </div>
  )
}
