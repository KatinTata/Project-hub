import { useState } from 'react'
import { useT } from '../../lang.jsx'
import { useDialogBehavior } from '../../ui/Modal.jsx'

// Publish dialog: pick a section (existing/new/none) + client users who see the note.
export default function PublishModal({ clientUsers, sections = [], onClose, onPublish, publishState }) {
  const t = useT()
  const panelRef = useDialogBehavior(true, onClose)
  const [selected, setSelected] = useState(new Set())
  const [publishing, setPublishing] = useState(false)
  const [sectionDropOpen, setSectionDropOpen] = useState(false)
  const [selectedSection, setSelectedSection] = useState(null) // null | { id, name } | { id: 'new', name: '' }
  const [newSectionName, setNewSectionName] = useState('')

  function toggle(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function getSectionName() {
    if (!selectedSection) return null
    if (selectedSection.id === 'new') return newSectionName.trim() || null
    return selectedSection.name
  }

  async function handleConfirm() {
    setPublishing(true)
    await onPublish([...selected], getSectionName())
    setPublishing(false)
  }

  const isNew = selectedSection?.id === 'new'
  const sectionLabel = !selectedSection ? t('rne.noSection') : isNew ? (newSectionName || t('rne.newSectionEllipsis')) : selectedSection.name

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} ref={panelRef} role="dialog" aria-modal="true" aria-label="Release Notes" tabIndex={-1} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 480, boxShadow: '0 24px 80px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Release Notes</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--textMuted)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '16px 24px' }}>

          {/* Section picker — dropdown */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: 'Hanken Grotesk', fontSize: 11, color: 'var(--textMuted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{t('rne.section')}</div>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setSectionDropOpen(o => !o)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'Hanken Grotesk', fontSize: 13, fontWeight: selectedSection ? 500 : 400, transition: 'all 0.15s',
                  background: selectedSection ? 'rgba(79,142,247,0.08)' : 'var(--bg)',
                  border: `1px solid ${selectedSection ? 'rgba(79,142,247,0.35)' : 'var(--border)'}`,
                  color: selectedSection ? 'var(--accent)' : 'var(--textMuted)',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sectionLabel}</span>
                <span style={{ fontSize: 10, flexShrink: 0, transform: sectionDropOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block', color: 'var(--textMuted)' }}>▾</span>
              </button>
              {sectionDropOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', zIndex: 200, overflow: 'hidden' }}>
                  <div style={{ maxHeight: 220, overflowY: 'auto', padding: 6 }}>
                    {/* No section option */}
                    <button
                      onClick={() => { setSelectedSection(null); setSectionDropOpen(false) }}
                      style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '8px 10px', background: !selectedSection ? 'rgba(79,142,247,0.08)' : 'transparent', border: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s', color: !selectedSection ? 'var(--accent)' : 'var(--textMuted)', fontFamily: 'Hanken Grotesk', fontSize: 13 }}
                      onMouseEnter={e => { if (selectedSection) e.currentTarget.style.background = 'var(--surfaceAlt)' }}
                      onMouseLeave={e => { if (selectedSection) e.currentTarget.style.background = 'transparent' }}
                    >{t('rne.noSection')}</button>
                    {/* Existing sections */}
                    {sections.map(s => (
                      <button key={s.id}
                        onClick={() => { setSelectedSection(s); setSectionDropOpen(false) }}
                        style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '8px 10px', background: selectedSection?.id === s.id ? 'rgba(79,142,247,0.08)' : 'transparent', border: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s', color: selectedSection?.id === s.id ? 'var(--accent)' : 'var(--text)', fontFamily: 'Hanken Grotesk', fontSize: 13, fontWeight: 500 }}
                        onMouseEnter={e => { if (selectedSection?.id !== s.id) e.currentTarget.style.background = 'var(--surfaceAlt)' }}
                        onMouseLeave={e => { if (selectedSection?.id !== s.id) e.currentTarget.style.background = 'transparent' }}
                      >{s.name}</button>
                    ))}
                    {/* Divider + new section */}
                    <div style={{ height: 1, background: 'var(--border)', margin: '4px 6px' }} />
                    <button
                      onClick={() => { setSelectedSection({ id: 'new', name: '' }); setSectionDropOpen(false) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '8px 10px', background: isNew ? 'rgba(79,142,247,0.08)' : 'transparent', border: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s', color: isNew ? 'var(--accent)' : 'var(--textMuted)', fontFamily: 'Hanken Grotesk', fontSize: 13 }}
                      onMouseEnter={e => { if (!isNew) e.currentTarget.style.background = 'var(--surfaceAlt)' }}
                      onMouseLeave={e => { if (!isNew) e.currentTarget.style.background = 'transparent' }}
                    >
                      <span style={{ fontWeight: 700, fontSize: 15, lineHeight: 1 }}>+</span> {t('rne.newSection')}
                    </button>
                  </div>
                </div>
              )}
            </div>
            {isNew && (
              <input
                autoFocus
                value={newSectionName}
                onChange={e => setNewSectionName(e.target.value)}
                placeholder={t('rne.sectionNamePlaceholder')}
                style={{ marginTop: 8, width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13, fontFamily: 'Hanken Grotesk', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
              />
            )}
          </div>

          <div style={{ fontSize: 13, color: 'var(--textMuted)', fontFamily: 'Hanken Grotesk', marginBottom: 16, lineHeight: 1.6 }}>
            {t('rn.assignClients')}
          </div>
          {clientUsers.length === 0 ? (
            <div style={{ color: 'var(--textMuted)', fontFamily: 'Hanken Grotesk', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>{t('rn.noClientUsers')}</div>
          ) : (
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {clientUsers.map(u => (
                <div key={u.id} onClick={() => toggle(u.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <div style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0, border: selected.has(u.id) ? 'none' : '2px solid var(--border)', background: selected.has(u.id) ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease' }}>
                    {selected.has(u.id) && <span style={{ color: '#fff', fontSize: 12 }}>✓</span>}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'Hanken Grotesk', fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{u.name}</div>
                    <div style={{ fontFamily: 'Hanken Grotesk', fontSize: 11, color: 'var(--textMuted)' }}>{u.email}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {publishState?.error && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--redTint)', border: '1px solid var(--red)', borderRadius: 8, fontSize: 13, color: 'var(--red)', fontFamily: 'Hanken Grotesk' }}>
              {publishState.error}
            </div>
          )}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontFamily: 'Hanken Grotesk', background: 'transparent', border: '1px solid var(--border)', color: 'var(--textMuted)', cursor: 'pointer' }}>
            {t('rn.cancel')}
          </button>
          <button onClick={handleConfirm} disabled={publishing || publishState?.loading} style={{ padding: '8px 24px', borderRadius: 8, fontSize: 13, fontFamily: 'Hanken Grotesk', fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', cursor: publishing ? 'wait' : 'pointer' }}>
            {publishing || publishState?.loading ? t('app.loading') : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  )
}
