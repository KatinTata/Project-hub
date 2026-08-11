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
  const [openModule, setOpenModule] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 50)
    return () => clearTimeout(t)
  }, [])

  if (moduleData.length === 0) {
    return (
      <div style={{ color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
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
            style={{ fontFamily: 'Hanken Grotesk', fontSize: 18, fontWeight: 800, fill: 'var(--text)' }}>
            {fmtHours(totalSpent)}
          </text>
          <text x={CX} y={CY + 14} textAnchor="middle"
            style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, fill: 'var(--textMuted)' }}>
            ukupno
          </text>
        </svg>

        {/* Legend */}
        <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 9 }}>
          {arcs.map((arc, i) => {
            const pct = Math.round(arc.pct * 100)
            const canOpen = (arc.people?.length > 0 || arc.tasks?.length > 0)
            const isOpen = openModule === arc.name
            return (
              <div key={i}>
                <div
                  onClick={() => canOpen && setOpenModule(prev => prev === arc.name ? null : arc.name)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, cursor: canOpen ? 'pointer' : 'default', borderRadius: 4 }}
                  title={canOpen ? 'Klikni za detalje — ko je logovao i na kojim taskovima' : undefined}
                >
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12,
                    color: arc.isFaded ? 'var(--textMuted)' : 'var(--text)',
                    fontWeight: 500,
                    overflow: 'hidden',
                  }}>
                    {canOpen && (
                      <svg viewBox="0 0 12 12" width={9} height={9} style={{ flexShrink: 0, transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
                        <path d="M4 2l4 4-4 4" stroke="var(--textSubtle)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: arc.color, flexShrink: 0, opacity: arc.isFaded ? 0.6 : 1 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {arc.name}
                    </span>
                  </span>
                  <span style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, color: 'var(--textMuted)', flexShrink: 0, marginLeft: 10 }}>
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

                {/* Drill-down: people + tasks for this module */}
                {isOpen && (
                  <div style={{ margin: '8px 0 4px 15px', padding: '10px 12px', background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 8 }}>
                    {arc.people?.length > 0 && (
                      <>
                        <div style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--textMuted)', marginBottom: 6 }}>
                          Ko je logovao
                        </div>
                        {arc.people.map(p => {
                          const ppct = arc.totalSpent > 0 ? (p.spent / arc.totalSpent) * 100 : 0
                          return (
                            <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ width: 130, flexShrink: 0, fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11.5, color: p.name === 'Neraspoređeno' ? 'var(--amber)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.name}
                              </span>
                              <div style={{ flex: 1, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${ppct}%`, background: arc.color, opacity: 0.8, borderRadius: 4 }} />
                              </div>
                              <span style={{ width: 78, flexShrink: 0, textAlign: 'right', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, color: 'var(--textMuted)' }}>
                                {fmtHours(p.spent)} · {Math.round(ppct)}%
                              </span>
                            </div>
                          )
                        })}
                      </>
                    )}
                    {arc.tasks?.length > 0 && (
                      <>
                        <div style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--textMuted)', margin: '10px 0 6px' }}>
                          Taskovi ({arc.tasks.length})
                        </div>
                        <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {arc.tasks.map(t => {
                            const href = jiraLink(jiraUrl, t.key)
                            return (
                              <div key={t.key} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                {href ? (
                                  <a href={href} target="_blank" rel="noopener noreferrer"
                                    style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, fontWeight: 600, color: 'var(--accent)', flexShrink: 0, textDecoration: 'none' }}
                                    onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                                    onMouseLeave={e => e.target.style.textDecoration = 'none'}
                                  >{t.key}</a>
                                ) : (
                                  <span style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, fontWeight: 600, color: 'var(--accent)', flexShrink: 0 }}>{t.key}</span>
                                )}
                                <span style={{ flex: 1, fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {t.summary}
                                </span>
                                <span style={{ flexShrink: 0, fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, color: 'var(--textMuted)' }}>
                                  {fmtHours(t.spent)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
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
              color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11,
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
              fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12,
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
                        style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, color: 'var(--accent)', flexShrink: 0, textDecoration: 'none' }}
                        onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                        onMouseLeave={e => e.target.style.textDecoration = 'none'}
                      >
                        {t.key}
                      </a>
                    ) : (
                      <span style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, color: 'var(--accent)', flexShrink: 0 }}>
                        {t.key}
                      </span>
                    )}
                    <span style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: 'var(--textMuted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
