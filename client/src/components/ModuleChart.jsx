import { useEffect, useState } from 'react'
import { fmtHours } from '../utils.js'

const MODULE_COLORS = [
  '#4F8EF7', '#34D399', '#F472B6', '#FB923C', '#A78BFA',
  '#60A5FA', '#FBBF24', '#A3E635', '#38BDF8', '#F87171',
]

function getModuleColor(index) {
  return MODULE_COLORS[index % MODULE_COLORS.length]
}

function jiraLink(jiraUrl, key) {
  if (!jiraUrl) return null
  const base = jiraUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return `https://${base}/browse/${key}`
}

const SIZE = 210
const CX = SIZE / 2
const CY = SIZE / 2
const R = 72
const CIRCUMFERENCE = 2 * Math.PI * R
const GAP = 3

export default function ModuleChart({ moduleData = [], noModuleTasks = [], jiraUrl }) {
  const [animated, setAnimated] = useState(false)
  const [showNoModule, setShowNoModule] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 50)
    return () => clearTimeout(t)
  }, [])

  if (moduleData.length === 0) {
    return (
      <div style={{ color: 'var(--textMuted)', fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
        Nema podataka o modulima
      </div>
    )
  }

  const MAX_SLICES = 9
  let named = moduleData.filter(d => d.name !== 'Bez modula').sort((a, b) => b.totalSpent - a.totalSpent)
  const bezModula = moduleData.find(d => d.name === 'Bez modula')
  const hasMore = named.length > MAX_SLICES

  if (!expanded && hasMore) {
    const rest = named.slice(MAX_SLICES)
    const otherSpent = rest.reduce((s, d) => s + d.totalSpent, 0)
    const otherCount = rest.reduce((s, d) => s + d.taskCount, 0)
    named = named.slice(0, MAX_SLICES)
    if (otherSpent > 0) named.push({ name: 'Ostalo', totalSpent: otherSpent, taskCount: otherCount })
  }
  const slices = bezModula ? [...named, { ...bezModula }] : named

  const totalSpent = slices.reduce((s, d) => s + d.totalSpent, 0)

  // Build donut arcs
  let offset = 0
  const arcs = slices.map((d, i) => {
    const isFaded = d.name === 'Bez modula' || d.name === 'Ostalo'
    const color = isFaded ? '#6B7A99' : getModuleColor(i)
    const pct = totalSpent > 0 ? d.totalSpent / totalSpent : 0
    const length = CIRCUMFERENCE * pct - (pct > 0 ? GAP : 0)
    const arc = {
      ...d,
      color,
      isFaded,
      dashArray: `${Math.max(0, length)} ${CIRCUMFERENCE}`,
      dashOffset: -offset,
      pct,
    }
    offset += CIRCUMFERENCE * pct
    return arc
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Donut */}
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ flexShrink: 0 }}>
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border)" strokeWidth={22} />
          {arcs.map((arc, i) => (
            <circle
              key={i}
              cx={CX} cy={CY} r={R}
              fill="none"
              stroke={arc.color}
              strokeWidth={22}
              strokeOpacity={arc.isFaded ? 0.45 : 1}
              strokeDasharray={animated ? arc.dashArray : `0 ${CIRCUMFERENCE}`}
              strokeDashoffset={arc.dashOffset}
              strokeLinecap="butt"
              style={{
                transition: 'stroke-dasharray 0.6s ease',
                transform: 'rotate(-90deg)',
                transformOrigin: `${CX}px ${CY}px`,
              }}
            />
          ))}
          <text x={CX} y={CY - 10} textAnchor="middle" dominantBaseline="middle"
            style={{ fontFamily: 'Syne', fontSize: 18, fontWeight: 800, fill: 'var(--text)' }}>
            {fmtHours(totalSpent)}
          </text>
          <text x={CX} y={CY + 14} textAnchor="middle"
            style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fill: 'var(--textMuted)' }}>
            ukupno
          </text>
        </svg>

        {/* Legend */}
        <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 9 }}>
          {arcs.map((arc, i) => {
            const pct = Math.round(arc.pct * 100)
            return (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                    color: arc.isFaded ? 'var(--textMuted)' : 'var(--text)',
                    fontWeight: 500,
                    overflow: 'hidden',
                  }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: arc.color, flexShrink: 0, opacity: arc.isFaded ? 0.6 : 1 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {arc.name}
                    </span>
                  </span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--textMuted)', flexShrink: 0, marginLeft: 10 }}>
                    {fmtHours(arc.totalSpent)} · {pct}%
                  </span>
                </div>
                <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: animated ? `${pct}%` : '0%',
                    background: arc.color,
                    opacity: arc.isFaded ? 0.45 : 0.85,
                    borderRadius: 2,
                    transition: 'width 0.6s ease',
                  }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Expand / collapse */}
      {hasMore && (
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              cursor: 'pointer', padding: '4px 10px',
              color: 'var(--textMuted)', fontFamily: "'DM Sans', sans-serif", fontSize: 11,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--borderHover)'; e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--textMuted)' }}
          >
            <svg viewBox="0 0 12 12" width={11} height={11}
              style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {expanded ? `Prikaži manje` : `Prikaži sve (${moduleData.filter(d => d.name !== 'Bez modula').length} modula)`}
          </button>
        </div>
      )}

      {/* No-module tasks list */}
      {noModuleTasks.length > 0 && (
        <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <button
            onClick={() => setShowNoModule(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '2px 0', color: 'var(--textMuted)',
              fontFamily: "'DM Sans', sans-serif", fontSize: 12,
            }}
          >
            <svg viewBox="0 0 12 12" width={11} height={11}
              style={{ transform: showNoModule ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
              <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Taskovi bez modula ({noModuleTasks.length})
          </button>

          {showNoModule && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {noModuleTasks.map(t => {
                const href = jiraLink(jiraUrl, t.key)
                return (
                  <div key={t.key} style={{ display: 'flex', alignItems: 'baseline', gap: 8, paddingLeft: 16 }}>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--accent)', flexShrink: 0, textDecoration: 'none' }}
                        onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                        onMouseLeave={e => e.target.style.textDecoration = 'none'}
                      >
                        {t.key}
                      </a>
                    ) : (
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--accent)', flexShrink: 0 }}>
                        {t.key}
                      </span>
                    )}
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--textMuted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.summary}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
