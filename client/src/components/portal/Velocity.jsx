import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api.js'
import { useT } from '../../lang.jsx'
import { computeVelocity } from '../../utils/portal.js'
import Card from '../../ui/Card.jsx'

// P3-4: tempo rada iz dnevnih snapshot-a. Odluka 14.09.2026. — prikazuje se
// SAMO tempo (završene stavke i nedeljni prosek), nikad projektovan datum
// završetka: projekcija obavezuje na datum koji se u praksi ne drži.

const font = "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif"

export default function Velocity({ projectId, data }) {
  const t = useT()

  // Isti queryKey kao ProgressTrend — jedan fetch služi oba prikaza.
  const { data: snaps } = useQuery({
    queryKey: ['clientSnapshots', projectId],
    queryFn: () => api.getSnapshots(projectId),
    enabled: !!projectId && typeof projectId === 'number',
    staleTime: 5 * 60_000,
  })

  const v = useMemo(() => computeVelocity(snaps), [snaps])
  if (!v.enough) return null // nedovoljno istorije — ćutanje je bolje od izmišljenog broja

  // Tempo se meri iz istorije (snapshot-i), ali "preostalo" mora da bude
  // TRENUTNO stanje iz istog izvora kao donut — inače kartice jedna do druge
  // pokazuju dva različita broja za isti projekat.
  const remaining = data ? Math.max(0, (data.total || 0) - (data.done || 0)) : v.remaining

  return (
    <Card style={{ padding: '20px 24px' }}>
      <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}>
        {t('portal.velocity.title')}
      </div>
      <div style={{ fontFamily: font, fontSize: 12, color: 'var(--textMuted)', marginBottom: 18 }}>
        {t('portal.velocity.sub', { days: v.spanDays })}
      </div>

      {v.completed === 0 ? (
        <div style={{ fontFamily: font, fontSize: 13, color: 'var(--textMuted)', lineHeight: 1.6 }}>
          {t('portal.velocity.none', { days: v.spanDays })}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 800, fontSize: 34, color: 'var(--text)', lineHeight: 1.1 }}>
              {v.completed}
            </div>
            <div style={{ fontFamily: font, fontSize: 12, color: 'var(--textMuted)', marginTop: 2 }}>
              {t('portal.velocity.completed', { days: v.spanDays })}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 800, fontSize: 34, color: 'var(--accent)', lineHeight: 1.1 }}>
              {v.perWeek}
            </div>
            <div style={{ fontFamily: font, fontSize: 12, color: 'var(--textMuted)', marginTop: 2 }}>
              {t('portal.velocity.perWeek')}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 800, fontSize: 34, color: 'var(--textMuted)', lineHeight: 1.1 }}>
              {remaining}
            </div>
            <div style={{ fontFamily: font, fontSize: 12, color: 'var(--textMuted)', marginTop: 2 }}>
              {t('portal.velocity.remaining')}
            </div>
          </div>
        </div>
      )}

      <div style={{ fontFamily: font, fontSize: 11, color: 'var(--textSubtle)', marginTop: 16, lineHeight: 1.5 }}>
        {t('portal.velocity.note')}
      </div>
    </Card>
  )
}
