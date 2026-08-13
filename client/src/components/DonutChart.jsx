import { useEffect, useRef, useState } from 'react'
import { useT } from '../lang.jsx'
import { useWindowSize } from '../hooks/useWindowSize.js'

// `onSegmentClick` je opcion: kad se prosledi, stavke legende postaju dugmad
// (klijentski portal koristi to da otvori spisak zadataka te kategorije).
export default function DonutChart({ segments = [], size = 200, innerRadius = 70, horizontal = false, centerText, centerSubtext, onSegmentClick, activeSegment }) {
  const t = useT()
  const { isMobile } = useWindowSize()
  const [animated, setAnimated] = useState(false)
  const svgRef = useRef(null)

  const cx = size / 2
  const cy = size / 2
  const r = innerRadius
  const circumference = 2 * Math.PI * r
  const gap = 4

  const total = segments.reduce((s, seg) => s + seg.value, 0)

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 50)
    return () => clearTimeout(timer)
  }, [])

  // Build arc data
  let offset = 0
  const arcs = segments.map((seg) => {
    const pct = total > 0 ? seg.value / total : 0
    const length = circumference * pct - (pct > 0 ? gap : 0)
    const arc = { ...seg, dashArray: `${Math.max(0, length)} ${circumference}`, dashOffset: -offset, pct }
    offset += circumference * pct
    return arc
  })

  const doneSeg = segments[0]
  const donePct = total > 0 ? Math.round((doneSeg?.value || 0) / total * 100) : 0

  return (
    <div style={horizontal ? { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 24 } : {}}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} ref={svgRef} style={{ flexShrink: 0 }}>
        {/* Background ring */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={20} />

        {arcs.map((arc, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={arc.color}
            strokeWidth={20}
            strokeDasharray={animated ? arc.dashArray : `0 ${circumference}`}
            strokeDashoffset={arc.dashOffset}
            strokeLinecap="butt"
            style={{
              transition: 'stroke-dasharray 0.6s ease',
              transform: 'rotate(-90deg)',
              transformOrigin: `${cx}px ${cy}px`,
            }}
          />
        ))}

        {/* Center text */}
        <text x={cx} y={cy - 6} textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily: 'Hanken Grotesk', fontSize: 22, fontWeight: 800, fill: 'var(--text)' }}>
          {centerText ?? `${donePct}%`}
        </text>
        <text x={cx} y={cy + 18} textAnchor="middle"
          style={{ fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, fill: 'var(--textMuted)' }}>
          {centerSubtext ?? t('donut.done')}
        </text>
      </svg>

      {/* Legend bars */}
      <div style={{
        marginTop: horizontal ? 0 : 16,
        flex: horizontal ? 1 : undefined,
        maxWidth: horizontal ? (isMobile ? '100%' : 320) : undefined,
        alignSelf: horizontal ? 'center' : undefined,
        display: 'flex',
        flexDirection: 'column',
        gap: horizontal ? 6 : 10,
      }}>
        {segments.map((seg, i) => {
          const pct = total > 0 ? Math.round(seg.value / total * 100) : 0
          const clickable = !!onSegmentClick
          const isActive = clickable && activeSegment != null && activeSegment === (seg.id ?? seg.label)
          const Row = clickable ? 'button' : 'div'
          return (
            <Row
              key={i}
              {...(clickable ? {
                type: 'button',
                onClick: () => onSegmentClick(seg.id ?? seg.label),
                'aria-expanded': isActive,
                title: seg.actionTitle || seg.label,
                style: {
                  display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                  background: isActive ? 'var(--surfaceAlt)' : 'transparent',
                  border: `1px solid ${isActive ? 'var(--borderHover)' : 'transparent'}`,
                  borderRadius: 8, padding: '6px 8px', transition: 'background 0.15s, border-color 0.15s',
                },
              } : {})}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: horizontal ? 11 : 12 }}>
                <span style={{ color: seg.color, fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 500, fontSize: horizontal ? 11 : 12 }}>
                  ● {seg.label}
                </span>
                <span style={{ fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--textMuted)', fontSize: 11 }}>
                  {seg.displayValue ?? `${seg.value}/${total}`}
                  {clickable && <span style={{ marginLeft: 6, color: 'var(--accent)' }}>{isActive ? '▾' : '›'}</span>}
                </span>
              </div>
              <div style={{ height: 4, width: '100%', maxWidth: horizontal ? (isMobile ? '100%' : 280) : undefined, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: animated ? `${pct}%` : '0%',
                  background: seg.color,
                  borderRadius: 2,
                  transition: 'width 0.6s ease',
                }} />
              </div>
            </Row>
          )
        })}
      </div>
    </div>
  )
}
