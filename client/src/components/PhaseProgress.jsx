export default function PhaseProgress({ phases, tasksByPhase }) {
  const visible = phases.filter(p => p.name !== 'Neraspoređeno' && (tasksByPhase[p.id] || []).length > 0)

  if (visible.length === 0) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13 }}>
        Nema definisanih faza za ovaj projekat.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {visible.map(phase => {
        const pt = tasksByPhase[phase.id] || []
        const total = pt.length
        const done = pt.filter(t => t.statusCategory === 'done').length
        const inprog = pt.filter(t => t.statusCategory === 'inprog' || t.statusCategory === 'testing').length
        const todo = total - done - inprog

        const donePct = total > 0 ? done / total : 0
        const inprogPct = total > 0 ? inprog / total : 0
        const todoPct = total > 0 ? todo / total : 0

        const isComplete = done === total && total > 0
        const isPlanned = done === 0 && inprog === 0
        const statusLabel = isComplete ? 'Završeno' : isPlanned ? 'Planirana' : 'U toku'
        const statusColor = isComplete ? 'var(--green)' : isPlanned ? 'var(--textMuted)' : 'var(--amber)'
        const statusBg = isComplete ? 'var(--greenTint)' : isPlanned ? 'var(--surfaceAlt)' : 'var(--amberTint)'
        const statusBorder = isComplete ? 'rgba(34,197,94,0.3)' : isPlanned ? 'var(--border)' : 'rgba(245,158,11,0.3)'

        return (
          <div
            key={phase.id}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '14px 18px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: phase.color, flexShrink: 0 }} />
              <span style={{
                flex: 1, fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
                fontSize: 13, fontWeight: 600, color: 'var(--text)',
              }}>
                {phase.name}
              </span>
              <span style={{
                fontFamily: "'DM Mono'", fontSize: 10, padding: '3px 9px',
                borderRadius: 20, background: statusBg, color: statusColor,
                border: `1px solid ${statusBorder}`, fontWeight: 600, flexShrink: 0,
              }}>
                {statusLabel}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 18, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                {donePct > 0 && <div style={{ width: `${donePct * 100}%`, background: 'var(--green)', transition: 'width 0.5s' }} />}
                {inprogPct > 0 && <div style={{ width: `${inprogPct * 100}%`, background: 'var(--amber)', transition: 'width 0.5s' }} />}
                {todoPct > 0 && <div style={{ width: `${todoPct * 100}%`, background: 'var(--textSubtle)', opacity: 0.35, transition: 'width 0.5s' }} />}
              </div>
              <span style={{
                fontFamily: 'Syne', fontSize: 13, fontWeight: 700,
                color: statusColor, minWidth: 36, textAlign: 'right', flexShrink: 0,
              }}>
                {Math.round(donePct * 100)}%
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
