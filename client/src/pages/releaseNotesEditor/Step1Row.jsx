import { useState } from 'react'
import { useT } from '../../lang.jsx'
import { statusCat, statusBadgeStyle, statusLabel } from './uiHelpers.js'

// Single selectable task row in the selection step.
// `origin` ('copied' | 'new' | null) razdvaja stavke preuzete iz starog release
// notes-a od onih dodatih JQL-om posle kopiranja.
export default function Step1Row({ task, selected, onToggle, origin = null }) {
  const t = useT()
  const [hovered, setHovered] = useState(false)
  const cat = statusCat(task)
  const badgeStyle = statusBadgeStyle(cat)

  return (
    <div
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 20px',
        cursor: 'pointer', transition: 'background 0.15s',
        background: selected ? 'rgba(79,142,247,0.06)' : hovered ? 'var(--surfaceAlt)' : 'transparent',
        borderLeft: `3px solid ${selected ? 'var(--accent)' : 'transparent'}`,
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
        border: selected ? 'none' : '2px solid var(--border)',
        background: selected ? 'var(--accent)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease',
      }}>
        {selected && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
      </div>
      <span style={{ fontFamily: 'Hanken Grotesk', fontSize: 11, color: 'var(--accent)', flexShrink: 0, minWidth: 80 }}>{task.key}</span>
      <span style={{ ...badgeStyle, fontSize: 10, fontFamily: 'Hanken Grotesk', padding: '2px 7px', borderRadius: 4, flexShrink: 0 }}>
        {statusLabel(task)}
      </span>
      <span style={{ fontFamily: 'Hanken Grotesk', fontSize: 13, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {task.fields?.summary || task.summary || ''}
      </span>
      {origin && (
        <span style={{
          fontFamily: 'Hanken Grotesk', fontSize: 10, padding: '2px 7px', borderRadius: 4, flexShrink: 0,
          color: origin === 'new' ? 'var(--accent)' : 'var(--textMuted)',
          background: origin === 'new' ? 'rgba(79,142,247,0.1)' : 'var(--surfaceAlt)',
          border: `1px solid ${origin === 'new' ? 'rgba(79,142,247,0.25)' : 'var(--border)'}`,
        }}>
          {origin === 'new' ? t('rne.newTaskBadge') : t('rne.copiedTaskBadge')}
        </span>
      )}
    </div>
  )
}
