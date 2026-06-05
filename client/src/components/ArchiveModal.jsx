import { useState, useEffect } from 'react'
import { api } from '../api.js'
import { useWindowSize } from '../hooks/useWindowSize.js'
import { useT } from '../lang.jsx'

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('sr-Latn', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function ArchiveModal({ onClose, onRestore }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [working, setWorking] = useState(false)
  const { isMobile } = useWindowSize()
  const t = useT()

  useEffect(() => {
    api.getArchivedProjects()
      .then(res => setProjects(res || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleRestore(project) {
    setWorking(true)
    try {
      await onRestore(project)
      setProjects(prev => prev.filter(p => p.id !== project.id))
    } catch (err) {
      alert(err.message)
    } finally {
      setWorking(false)
    }
  }

  async function handlePermanentDelete(id) {
    setWorking(true)
    try {
      await api.permanentDeleteProject(id)
      setProjects(prev => prev.filter(p => p.id !== id))
      setConfirmDeleteId(null)
    } catch (err) {
      alert(err.message)
    } finally {
      setWorking(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.82)',
      display: 'flex',
      alignItems: isMobile ? 'flex-end' : 'center',
      justifyContent: 'center',
    }} onClick={onClose}>
      <div className="glass-card" style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: isMobile ? '16px 16px 0 0' : 14,
        width: isMobile ? '100%' : 520,
        maxHeight: isMobile ? '80vh' : '70vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <h3 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18, color: 'var(--text)', marginBottom: 2 }}>
              📦 {t('archive.title')}
            </h3>
            <p style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, color: 'var(--textMuted)' }}>
              {t('archive.subtitle')}
            </p>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--textMuted)', fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}>
              {t('archive.loading')}
            </div>
          ) : projects.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
              <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>
                {t('archive.empty')}
              </div>
              <div style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, color: 'var(--textMuted)' }}>
                {t('archive.emptySub')}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {projects.map(p => (
                <div key={p.id}>
                  <div style={{
                    padding: '14px 16px',
                    background: 'var(--surfaceAlt)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 3 }}>
                        {p.displayName || p.epicKey}
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{
                          fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textSubtle)',
                          background: 'var(--border)', borderRadius: 4, padding: '1px 6px',
                        }}>
                          {p.epicKey}
                        </span>
                        <span style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 11, color: 'var(--textMuted)' }}>
                          {t('archive.archivedAt', { date: fmtDate(p.archivedAt) })}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => handleRestore(p)}
                        disabled={working}
                        style={{
                          padding: '6px 14px', borderRadius: 7,
                          border: '1px solid var(--accent)', background: 'transparent',
                          color: 'var(--accent)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
                          fontWeight: 600, fontSize: 12, cursor: working ? 'not-allowed' : 'pointer',
                          opacity: working ? 0.6 : 1, transition: 'all 0.2s',
                          whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = '#fff' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--accent)' }}
                      >
                        ↩ {t('archive.restore')}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(p.id)}
                        disabled={working}
                        style={{
                          width: 32, height: 32, borderRadius: 7, flexShrink: 0,
                          border: '1px solid var(--border)', background: 'transparent',
                          color: 'var(--textMuted)', fontSize: 16, cursor: working ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--red)'; e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'var(--redTint)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--textMuted)'; e.currentTarget.style.background = 'transparent' }}
                        title="Trajno izbriši"
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  {/* Permanent delete confirm */}
                  {confirmDeleteId === p.id && (
                    <div style={{
                      margin: '4px 0', padding: '12px 16px',
                      background: 'var(--redTint)', border: '1px solid #EF444430',
                      borderRadius: 8,
                    }}>
                      <div style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, color: 'var(--text)', marginBottom: 10 }}>
                        {t('archive.deleteConfirm')}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setConfirmDeleteId(null)} style={{
                          flex: 1, padding: '8px', borderRadius: 7,
                          border: '1px solid var(--border)', background: 'transparent',
                          color: 'var(--text)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, cursor: 'pointer',
                        }}>
                          {t('archive.cancel')}
                        </button>
                        <button onClick={() => handlePermanentDelete(p.id)} disabled={working} style={{
                          flex: 1, padding: '8px', borderRadius: 7, border: 'none',
                          background: 'var(--red)', color: '#fff',
                          fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, fontSize: 13,
                          cursor: working ? 'not-allowed' : 'pointer', opacity: working ? 0.7 : 1,
                        }}>
                          {t('archive.delete')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
