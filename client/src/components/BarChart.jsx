import { useState } from 'react'
import { useT } from '../lang.jsx'
import { getCalcConfig } from '../utils/calcConfig.js'

export default function BarChart({ data = [], width = 600, height = 260 }) {
  const t = useT()
  const [tooltip, setTooltip] = useState(null)

  const paddingLeft = 48
  const paddingRight = 16
  const paddingTop = 16
  const paddingBottom = 56
  const chartW = width - paddingLeft - paddingRight
  const chartH = height - paddingTop - paddingBottom

  // Top 12 tasks by largest estimate
  const filtered = data.filter(d => d.est > 0).sort((a, b) => b.est - a.est).slice(0, 12)
  if (filtered.length === 0) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      {t('chart.noTasks')}
    </div>
  )

  const maxVal = Math.max(...filtered.flatMap(d => [d.est, d.spent])) || 1
  const yMax = Math.ceil(maxVal / 3600 / 5) * 5 // round to nearest 5h

  const barGroupW = chartW / filtered.length
  const barW = Math.min(barGroupW * 0.35, 18)
  const gap = barW * 0.5

  // Y grid lines
  const gridLines = 5
  const yTicks = Array.from({ length: gridLines + 1 }, (_, i) => i * (yMax / gridLines))

  function toY(seconds) {
    return chartH - (seconds / 3600 / yMax) * chartH
  }

  function toBarH(seconds) {
    return (seconds / 3600 / yMax) * chartH
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12, fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif" }}>
        <span><span style={{ color: 'var(--accent)' }}>●</span> {t('chart.legend.est').replace('● ', '')}</span>
        <span><span style={{ color: 'var(--green)' }}>●</span> {t('chart.legend.spent').replace('● ', '')}</span>
        <span><span style={{ color: 'var(--red)' }}>●</span> {t('chart.legend.over').replace('● ', '')}</span>
      </div>

      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
        {/* Y grid lines */}
        {yTicks.map((tick, i) => {
          const y = paddingTop + toY(tick * 3600)
          return (
            <g key={i}>
              <line
                x1={paddingLeft} y1={y}
                x2={paddingLeft + chartW} y2={y}
                stroke="var(--border)" strokeWidth={1}
              />
              <text x={paddingLeft - 4} y={y + 4} textAnchor="end"
                style={{ fontSize: 10, fill: 'var(--textMuted)', fontFamily: "'Hanken Grotesk'" }}>
                {tick}h
              </text>
            </g>
          )
        })}

        {/* Bars */}
        {filtered.map((d, i) => {
          const xCenter = paddingLeft + barGroupW * i + barGroupW / 2
          const xEst = xCenter - gap / 2 - barW
          const xSpent = xCenter + gap / 2

          const estH = toBarH(d.est)
          const spentH = toBarH(d.spent)
          const isOver = d.est > 0 && d.spent > d.est * (1 + getCalcConfig().overrunThresholdPct / 100)
          const spentColor = isOver ? 'var(--red)' : 'var(--green)'

          return (
            <g key={d.label}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.closest('svg').getBoundingClientRect()
                setTooltip({ d, x: xCenter, y: Math.min(paddingTop + toY(Math.max(d.est, d.spent)), chartH - 60) })
              }}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: 'pointer' }}>

              {/* Est bar */}
              <rect
                x={xEst} y={paddingTop + toY(d.est)}
                width={barW} height={estH}
                rx={2} fill="var(--accent)" opacity={0.85}
              />

              {/* Spent bar */}
              <rect
                x={xSpent} y={paddingTop + toY(d.spent)}
                width={barW} height={spentH}
                rx={2} fill={spentColor} opacity={0.85}
              />

              {/* X label */}
              <text
                x={xCenter} y={paddingTop + chartH + 8}
                textAnchor="end"
                transform={`rotate(-45, ${xCenter}, ${paddingTop + chartH + 8})`}
                style={{ fontSize: 10, fill: 'var(--textMuted)', fontFamily: "'Hanken Grotesk'" }}>
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute',
          left: `${(tooltip.x / width) * 100}%`,
          top: tooltip.y,
          transform: 'translateX(-50%)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 12,
          fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          zIndex: 10,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>{tooltip.d.label}</div>
          <div style={{ color: 'var(--accent)' }}>{t('chart.tooltip.est', { v: (tooltip.d.est / 3600).toFixed(1) })}</div>
          <div style={{ color: tooltip.d.spent > tooltip.d.est * 1.15 ? 'var(--red)' : 'var(--green)' }}>
            {t('chart.tooltip.spent', { v: (tooltip.d.spent / 3600).toFixed(1) })}
          </div>
          {tooltip.d.spent > tooltip.d.est * 1.15 && (
            <div style={{ color: 'var(--red)' }}>
              {t('chart.tooltip.over', { pct: Math.round(((tooltip.d.spent - tooltip.d.est) / tooltip.d.est) * 100) })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
