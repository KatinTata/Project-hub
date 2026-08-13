import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api.js'
import { useT } from '../../lang.jsx'
import { useWindowSize } from '../../hooks/useWindowSize.js'
import DonutChart from '../DonutChart.jsx'
import Card from '../../ui/Card.jsx'

// P3-1: grafikoni za klijentski portal. Sve je izvedeno iz BROJA STAVKI po
// statusu — nijedan interni sat/procena (server ni ne šalje te podatke roli
// `user`). Cilj je da klijent vidi sliku napretka, ne tabelu brojeva.

const font = "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif"

const COLORS = {
  done: 'var(--green)',
  inprog: 'var(--accent)',
  testing: 'var(--amber)',
  todo: 'var(--textSubtle)',
}

// ── Donut: raspodela statusa ──────────────────────────────────────────────────
export function StatusDonut({ data }) {
  const t = useT()
  const { isMobile } = useWindowSize()
  const total = data?.total || 0
  const done = data?.done || 0
  const inprog = data?.inprog || 0
  const testing = data?.testing || 0
  const todo = (data?.todo || 0) + (data?.unknown || 0)
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  const segments = [
    { label: t('portal.chart.done'), value: done, color: COLORS.done },
    { label: t('portal.chart.testing'), value: testing, color: COLORS.testing },
    { label: t('portal.chart.inprog'), value: inprog, color: COLORS.inprog },
    { label: t('portal.chart.todo'), value: todo, color: COLORS.todo },
  ].filter(s => s.value > 0)

  return (
    <Card style={{ padding: '20px 24px' }}>
      <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}>
        {t('portal.chart.statusTitle')}
      </div>
      <div style={{ fontFamily: font, fontSize: 12, color: 'var(--textMuted)', marginBottom: 14 }}>
        {t('portal.chart.statusSub')}
      </div>
      {total === 0 ? (
        <div style={{ fontFamily: font, fontSize: 13, color: 'var(--textMuted)', padding: '20px 0' }}>{t('portal.chart.empty')}</div>
      ) : (
        <DonutChart
          segments={segments}
          size={isMobile ? 170 : 200}
          innerRadius={isMobile ? 60 : 70}
          centerText={`${pct}%`}
          centerSubtext={t('portal.chart.doneCenter')}
          horizontal={!isMobile}
        />
      )}
    </Card>
  )
}

// ── Trend: procenat završenosti kroz vreme (iz dnevnih snapshot-a) ───────────
export function ProgressTrend({ projectId }) {
  const t = useT()
  const { isMobile } = useWindowSize()

  const { data: snaps } = useQuery({
    queryKey: ['clientSnapshots', projectId],
    queryFn: () => api.getSnapshots(projectId),
    enabled: !!projectId && typeof projectId === 'number',
    staleTime: 5 * 60_000,
  })

  // Poslednjih ~90 dana, jedna tačka po danu sa snimljenim stanjem
  const points = useMemo(() => {
    const rows = (snaps || []).filter(s => (s.total || 0) > 0).slice(-90)
    return rows.map(s => ({ day: s.day, pct: Math.round((s.done / s.total) * 100) }))
  }, [snaps])

  if (points.length < 2) return null // trend nema smisla sa jednom tačkom

  const W = 640, H = 160, padL = 34, padR = 12, padT = 12, padB = 24
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const x = i => padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW)
  const y = pct => padT + plotH - (pct / 100) * plotH

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.pct).toFixed(1)}`).join(' ')
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${padT + plotH} L ${x(0).toFixed(1)} ${padT + plotH} Z`
  const first = points[0]
  const last = points[points.length - 1]
  const delta = last.pct - first.pct
  const fmtDay = d => String(d).slice(8, 10) + '.' + String(d).slice(5, 7) + '.'

  return (
    <Card style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
          {t('portal.chart.trendTitle')}
        </div>
        <div style={{ fontFamily: font, fontSize: 12, fontWeight: 600, color: delta > 0 ? 'var(--green)' : 'var(--textMuted)' }}>
          {delta > 0 ? t('portal.chart.trendDelta', { n: delta }) : t('portal.chart.trendFlat')}
        </div>
      </div>
      <div style={{ fontFamily: font, fontSize: 12, color: 'var(--textMuted)', marginBottom: 12 }}>
        {t('portal.chart.trendSub')}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={t('portal.chart.trendTitle')}>
        <defs>
          <linearGradient id="portalTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map(g => (
          <g key={g}>
            <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke="var(--border)" strokeWidth="1" />
            <text x={padL - 6} y={y(g) + 4} textAnchor="end" style={{ fontSize: 10, fill: 'var(--textSubtle)', fontFamily: 'Hanken Grotesk' }}>{g}%</text>
          </g>
        ))}
        <path d={area} fill="url(#portalTrendFill)" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(points.length - 1)} cy={y(last.pct)} r="4" fill="var(--accent)" />
        <text x={padL} y={H - 6} style={{ fontSize: 10, fill: 'var(--textSubtle)', fontFamily: 'Hanken Grotesk' }}>{fmtDay(first.day)}</text>
        <text x={W - padR} y={H - 6} textAnchor="end" style={{ fontSize: 10, fill: 'var(--textSubtle)', fontFamily: 'Hanken Grotesk' }}>{fmtDay(last.day)}</text>
      </svg>
      {isMobile && (
        <div style={{ fontFamily: font, fontSize: 11, color: 'var(--textSubtle)', marginTop: 6 }}>
          {fmtDay(first.day)} — {fmtDay(last.day)}
        </div>
      )}
    </Card>
  )
}

// ── Trake po fazama: koliko je svaka faza završena ───────────────────────────
export function PhaseBars({ phases, tasksByPhase }) {
  const t = useT()
  const rows = (phases || [])
    .filter(p => p.name !== 'Neraspoređeno' && (tasksByPhase[p.id] || []).length > 0)
    .map(p => {
      const list = tasksByPhase[p.id] || []
      const done = list.filter(x => x.statusCategory === 'done').length
      const inprog = list.filter(x => x.statusCategory === 'inprog' || x.statusCategory === 'testing').length
      return { id: p.id, name: p.name, color: p.color, total: list.length, done, inprog, pct: Math.round((done / list.length) * 100) }
    })

  if (!rows.length) return null

  return (
    <Card style={{ padding: '20px 24px' }}>
      <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}>
        {t('portal.chart.phasesTitle')}
      </div>
      <div style={{ fontFamily: font, fontSize: 12, color: 'var(--textMuted)', marginBottom: 16 }}>
        {t('portal.chart.phasesSub')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {rows.map(r => (
          <div key={r.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color || 'var(--accent)', flexShrink: 0 }} />
              <span style={{ fontFamily: font, fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <span style={{ fontFamily: font, fontSize: 12, color: 'var(--textMuted)', flexShrink: 0 }}>{r.done}/{r.total}</span>
              <span style={{ fontFamily: 'Hanken Grotesk', fontSize: 12, fontWeight: 700, color: r.pct === 100 ? 'var(--green)' : 'var(--text)', minWidth: 38, textAlign: 'right' }}>{r.pct}%</span>
            </div>
            <div style={{ height: 10, borderRadius: 6, background: 'var(--surfaceAlt)', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${(r.done / r.total) * 100}%`, background: COLORS.done, transition: 'width 0.4s ease' }} />
              <div style={{ width: `${(r.inprog / r.total) * 100}%`, background: COLORS.inprog, opacity: 0.55, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
        {[
          { c: COLORS.done, l: t('portal.chart.done') },
          { c: COLORS.inprog, l: t('portal.chart.inprog') },
          { c: 'var(--surfaceAlt)', l: t('portal.chart.todo') },
        ].map(x => (
          <span key={x.l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: font, fontSize: 11, color: 'var(--textMuted)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: x.c, border: '1px solid var(--border)' }} />
            {x.l}
          </span>
        ))}
      </div>
    </Card>
  )
}
