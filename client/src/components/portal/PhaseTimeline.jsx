import { useMemo } from 'react'
import { useT } from '../../lang.jsx'
import { buildTimeline } from '../../utils/portal.js'
import { fmtDateIso } from '../../utils/format.js'
import Card from '../../ui/Card.jsx'

// P3-4: vremenska osa faza za klijenta. Odgovara na "gde smo u odnosu na plan",
// što traka napretka po procentima ne može. Sve se izvodi iz `phases`
// (start_date/due_date) i broja završenih stavki — nijedan interni sat.

const font = "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif"

const STATE_COLOR = {
  done: 'var(--green)',
  late: 'var(--amber)',
  active: 'var(--accent)',
  future: 'var(--textSubtle)',
}

export default function PhaseTimeline({ phases, tasksByPhase }) {
  const t = useT()
  const timeline = useMemo(() => buildTimeline(phases, tasksByPhase), [phases, tasksByPhase])
  if (!timeline) return null

  return (
    <Card style={{ padding: '20px 24px' }}>
      <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}>
        {t('portal.timeline.title')}
      </div>
      <div style={{ fontFamily: font, fontSize: 12, color: 'var(--textMuted)', marginBottom: 18 }}>
        {t('portal.timeline.sub')}
      </div>

      {/* Zajednički okvir svih traka — marker "danas" ide preko cele visine */}
      <div style={{ position: 'relative' }}>
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', top: 0, bottom: 18,
            left: `${timeline.todayPct}%`,
            width: 1, background: 'var(--accent)', opacity: 0.5, zIndex: 1,
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {timeline.rows.map(row => {
            const color = STATE_COLOR[row.state]
            return (
              <div key={row.id}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: font, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{row.name}</span>
                  <span style={{ fontFamily: font, fontSize: 11, color: 'var(--textSubtle)' }}>
                    {fmtDateIso(row.start)} – {fmtDateIso(row.end)}
                  </span>
                  <span style={{
                    fontFamily: font, fontSize: 11, fontWeight: 600, color,
                    padding: '1px 8px', borderRadius: 20, border: `1px solid ${color}`, background: 'var(--surfaceAlt)',
                  }}>
                    {t(`portal.timeline.state.${row.state}`)}
                  </span>
                  {row.total > 0 && (
                    <span style={{ fontFamily: font, fontSize: 11, color: 'var(--textMuted)', marginLeft: 'auto' }}>
                      {row.done}/{row.total} · {row.pct}%
                    </span>
                  )}
                </div>

                {/* Traka: pozicija po datumima, ispuna po završenosti */}
                <div style={{ position: 'relative', height: 14, background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 7 }}>
                  <div
                    title={`${row.name}: ${fmtDateIso(row.start)} – ${fmtDateIso(row.end)}`}
                    style={{
                      position: 'absolute', top: -1, bottom: -1,
                      left: `${row.leftPct}%`, width: `${row.widthPct}%`,
                      background: 'var(--surface)', border: `1px solid ${color}`, borderRadius: 7,
                      overflow: 'hidden', zIndex: 2,
                    }}
                  >
                    <div style={{ width: `${row.pct}%`, height: '100%', background: color, opacity: row.state === 'future' ? 0.35 : 0.75, transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Krajevi ose + oznaka "danas" */}
        <div style={{ position: 'relative', height: 18, marginTop: 6, fontFamily: font, fontSize: 11, color: 'var(--textSubtle)' }}>
          <span style={{ position: 'absolute', left: 0, top: 2 }}>{fmtDateIso(timeline.start)}</span>
          <span style={{ position: 'absolute', right: 0, top: 2 }}>{fmtDateIso(timeline.end)}</span>
          <span style={{
            position: 'absolute', top: 2, left: `${timeline.todayPct}%`, transform: 'translateX(-50%)',
            color: 'var(--accent)', fontWeight: 600, whiteSpace: 'nowrap',
          }}>
            {t('portal.timeline.today')}
          </span>
        </div>
      </div>
    </Card>
  )
}
