import { useEffect, useRef, useState } from 'react'
import { fmtHours } from '../utils.js'
import { useT } from '../lang.jsx'

const COMP_COLORS = {
  BACK:    'var(--accent)',
  WEB:     'var(--green)',
  TESTING: 'var(--amber)',
  DB:      '#A78BFA',
}
const FALLBACK_COLORS = ['#60A5FA', '#34D399', '#F472B6', '#FB923C', '#A3E635']

function getCompColor(name, index) {
  return COMP_COLORS[(name || '').toUpperCase()] || FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

const SIZE = 160
const CX = SIZE / 2
const CY = SIZE / 2
const R = 54
const CIRCUMFERENCE = 2 * Math.PI * R
const GAP = 3

export default function ComponentBreakdown({ data = [] }) {
  const [animated, setAnimated] = useState(false)
  const [tooltip, setTooltip] = useState(null)
  const tFn = useT()

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 50)
    return () => clearTimeout(t)
  }, [])

  if (data.length === 0) {
    return (
      <div style={{ color: 'var(--textMuted)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
        {tFn('chart.noComponents')}
      </div>
    )
  }

  const totalSpentAll = data[0]?.totalSpentAll || 0

  // Build donut arcs
  let offset = 0
  const arcs = data.map((d, i) => {
    const color = getCompColor(d.name, i)
    const length = CIRCUMFERENCE * d.pct - (d.pct > 0 ? GAP : 0)
    const arc = { ...d, color, dashArray: `${Math.max(0, length)} ${CIRCUMFERENCE}`, dashOffset: -offset }
    offset += CIRCUMFERENCE * d.pct
    return arc
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      {/* Donut */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border)" strokeWidth={18} />
          {arcs.map((arc, i) => (
            <circle
              key={i}
              cx={CX} cy={CY} r={R}
              fill="none"
              stroke={arc.color}
              strokeWidth={18}
              strokeDasharray={animated ? arc.dashArray : `0 ${CIRCUMFERENCE}`}
              strokeDashoffset={arc.dashOffset}
              strokeLinecap="butt"
              style={{ transition: 'stroke-dasharray 0.6s ease', transform: 'rotate(-90deg)', transformOrigin: `${CX}px ${CY}px`, cursor: 'pointer' }}
              onMouseEnter={e => {
                const rect = e.currentTarget.closest('svg').getBoundingClientRect()
                setTooltip({ arc })
              }}
              onMouseLeave={() => setTooltip(null)}
            />
          ))}
          {/* Center */}
          <text x={CX} y={CY - 7} textAnchor="middle" dominantBaseline="middle"
            style={{ fontFamily: 'Syne', fontSize: 15, fontWeight: 800, fill: 'var(--text)' }}>
            {fmtHours(totalSpentAll)}
          </text>
          <text x={CX} y={CY + 12} textAnchor="middle"
            style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 11, fill: 'var(--textMuted)' }}>
            ukupno
          </text>
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, calc(-50% - 90px))',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '6px 11px',
            fontSize: 12, fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
            color: 'var(--text)', pointerEvents: 'none', whiteSpace: 'nowrap',
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)', zIndex: 100,
          }}>
            <span style={{ color: tooltip.arc.color, fontWeight: 600 }}>{tooltip.arc.name}</span>
            {'  '}{fmtHours(tooltip.arc.totalSpent)} · {Math.round(tooltip.arc.pct * 100)}%
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 100 }}>
        {arcs.map((arc, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: arc.color, flexShrink: 0 }} />
            <span style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textMuted)', flex: 1 }}>{arc.name}</span>
            <span style={{ fontFamily: "'DM Mono'", fontSize: 11, color: arc.color }}>{Math.round(arc.pct * 100)}%</span>
            <span style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textSubtle)', width: 36, textAlign: 'right' }}>{fmtHours(arc.totalSpent)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
