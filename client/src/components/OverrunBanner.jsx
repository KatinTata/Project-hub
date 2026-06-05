import { useT } from '../lang.jsx'
import { useWindowSize } from '../hooks/useWindowSize.js'

export default function OverrunBanner({ overTasks = [] }) {
  const t = useT()
  const { isMobile } = useWindowSize()
  if (overTasks.length === 0) return null

  return (
    <div className="glass-card" style={{
      background: '#EF444408',
      border: '1px solid #EF444430',
      borderRadius: 10,
      padding: '12px 16px',
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      alignItems: isMobile ? 'flex-start' : 'center',
      gap: 12,
      flexWrap: 'wrap',
    }}>
      <span style={{ color: 'var(--red)', fontWeight: 600, fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 14 }}>
        ⚠️  {overTasks.length} {overTasks.length === 1 ? t('overrun.singular') : overTasks.length < 5 ? t('overrun.plural') : t('overrun.plural2')}
      </span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {overTasks.map(task => (
          <span key={task.key} style={{
            background: 'var(--redTint)',
            color: 'var(--red)',
            borderRadius: 6,
            padding: '3px 8px',
            fontFamily: "'DM Mono'",
            fontSize: 12,
          }}>
            {task.key} {task.overPct > 0 ? `+${task.overPct}%` : ''}
          </span>
        ))}
      </div>
    </div>
  )
}
