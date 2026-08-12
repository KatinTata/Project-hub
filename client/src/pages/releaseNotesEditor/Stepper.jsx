import { useT } from '../../lang.jsx'

// Wizard progress indicator (selection → content → preview).
export default function Stepper({ step, maxStep, onStepClick }) {
  const t = useT()
  const steps = [
    { n: 1, label: t('rne.stepSelection') },
    { n: 2, label: t('rne.stepContent') },
    { n: 3, label: t('rne.stepPreview') },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 20px' }}>
      {steps.map((s, i) => {
        const isActive = s.n === step
        const isDone = s.n < step
        const isClickable = s.n <= maxStep
        return (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center' }}>
            <div
              onClick={() => isClickable && onStepClick(s.n)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: isClickable ? 'pointer' : 'default', padding: '4px 10px', borderRadius: 6, background: isActive ? 'rgba(79,142,247,0.1)' : 'transparent', transition: 'all 0.2s ease' }}
            >
              <div style={{
                width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontFamily: 'Hanken Grotesk', fontWeight: 500, flexShrink: 0,
                background: isDone ? 'var(--green)' : isActive ? 'var(--accent)' : 'var(--surfaceAlt)',
                color: isDone || isActive ? '#fff' : 'var(--textMuted)',
                border: isDone || isActive ? 'none' : '1px solid var(--border)',
              }}>
                {isDone ? '✓' : s.n}
              </div>
              <span style={{ fontFamily: 'Hanken Grotesk', fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? 'var(--accent)' : isDone ? 'var(--green)' : 'var(--textMuted)' }}>{s.label}</span>
            </div>
            {i < steps.length - 1 && <span style={{ color: 'var(--border)', margin: '0 4px', fontSize: 16, userSelect: 'none' }}>›</span>}
          </div>
        )
      })}
    </div>
  )
}
