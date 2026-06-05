import { useState, useEffect } from 'react'
import { api } from '../api.js'
import Topbar from '../components/Topbar.jsx'
import BrainAnimation from '../components/BrainAnimation.jsx'
import { useT } from '../lang.jsx'

export default function ReleaseNotesPage({ user, theme, onLogout, onGoToDashboard, onGoToEditor, onGoToDocuments, onGoToQA, onOpenSettings, onOpenUsers, onOpenChat }) {
  const t = useT()
  const isClient = user?.role === 'client'

  const [notesList, setNotesList] = useState([])
  const [notesListLoading, setNotesListLoading] = useState(false)
  const [assignModal, setAssignModal] = useState(null)
  const [allClientUsers, setAllClientUsers] = useState([])
  const [selectedNote, setSelectedNote] = useState(null)
  const [noteDetail, setNoteDetailData] = useState(null)
  const [noteDetailLoading, setNoteDetailLoading] = useState(false)

  useEffect(() => { loadNotesList() }, [])

  async function loadNotesList() {
    setNotesListLoading(true)
    try {
      const data = isClient ? await api.getClientReleaseNotes() : await api.getReleaseNotesList()
      setNotesList(data?.notes || [])
    } catch { setNotesList([]) }
    setNotesListLoading(false)
  }

  async function openNote(note) {
    setSelectedNote(note)
    setNoteDetailData(null)
    setNoteDetailLoading(true)
    try {
      const res = await fetch(`/rn/${note.token}`)
      if (res.ok) {
        const html = await res.text()
        setNoteDetailData({ ...note, html })
      } else {
        setNoteDetailData(note)
      }
    } catch { setNoteDetailData(note) }
    setNoteDetailLoading(false)
  }

  function closeNote() {
    setSelectedNote(null)
    setNoteDetailData(null)
  }

  return (
    <div className="page-in" style={{ minHeight: '100vh', background: 'var(--bg)', position: 'relative' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <BrainAnimation opacity={0.45} fullscreen />
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>

      <Topbar
        user={user}
        theme={theme}
        currentPage="releaseNotes"
        onLogout={onLogout}
        onGoToDashboard={onGoToDashboard}
        onGoToReleaseNotesEditor={isClient ? undefined : onGoToEditor}
        onGoToDocuments={onGoToDocuments}
        onGoToQA={onGoToQA}
        onOpenSettings={onOpenSettings}
        onOpenUsers={onOpenUsers}
        onOpenChat={onOpenChat}
      />

      <div style={{ padding: '28px' }}>
        {selectedNote ? (
          <NoteDetailView
            note={selectedNote}
            detail={noteDetail}
            loading={noteDetailLoading}
            isClient={isClient}
            onBack={closeNote}
            onRelease={async () => {
              if (!window.confirm(t('rn.markReleasedConfirm'))) return
              await api.markReleaseNoteReleased(selectedNote.id)
              const updated = { ...selectedNote, status: 'released', released_at: new Date().toISOString() }
              setSelectedNote(updated)
              setNoteDetailData(prev => prev ? { ...prev, status: 'released', released_at: updated.released_at } : prev)
              setNotesList(prev => prev.map(n => n.id === selectedNote.id ? updated : n))
            }}
            onDelete={async () => {
              if (!window.confirm(t('rn.deleteConfirm'))) return
              await api.deleteReleaseNote(selectedNote.id)
              closeNote()
              loadNotesList()
            }}
            onManageClients={async () => {
              const [clientsData, usersData] = await Promise.all([
                api.getReleaseNoteClients(selectedNote.id),
                api.getUsers(),
              ])
              setAllClientUsers((Array.isArray(usersData) ? usersData : []).filter(u => u.role === 'client'))
              setAssignModal({ noteId: selectedNote.id, currentClients: clientsData?.clients || [] })
            }}
          />
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>
                {isClient ? t('rn.availableVersions') : t('rn.publishedVersions')}
              </span>
              <button
                onClick={loadNotesList}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 12, fontFamily: 'DM Mono',
                  background: 'transparent', border: '1px solid var(--border)',
                  color: 'var(--textMuted)', cursor: 'pointer', transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--borderHover)'; e.currentTarget.style.color = 'var(--text)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--textMuted)' }}
              >
                {t('rn.refresh')}
              </button>
            </div>

            {notesListLoading ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--textMuted)', fontFamily: 'DM Sans', fontSize: 14 }}>
                {t('rn.loading')}
              </div>
            ) : notesList.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--textMuted)', fontFamily: 'DM Sans', fontSize: 14 }}>
                {isClient ? t('rn.emptyClient') : t('rn.emptyAdmin')}
              </div>
            ) : (
              <NotesByProject
                notesList={notesList}
                isClient={isClient}
                onOpen={openNote}
                onRelease={async (note) => {
                  if (!window.confirm(t('rn.markReleasedConfirm'))) return
                  await api.markReleaseNoteReleased(note.id)
                  loadNotesList()
                }}
                onDelete={async (note) => {
                  if (!window.confirm(t('rn.deleteConfirm'))) return
                  await api.deleteReleaseNote(note.id)
                  loadNotesList()
                }}
              />
            )}
          </>
        )}
      </div>

      {assignModal && (
        <AssignClientsModal
          assignModal={assignModal}
          allClientUsers={allClientUsers}
          onClose={() => setAssignModal(null)}
          onSave={async (clientIds) => {
            await api.setReleaseNoteClients(assignModal.noteId, clientIds)
            setAssignModal(null)
            loadNotesList()
          }}
        />
      )}
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractVersion(title) {
  const match = (title || '').match(/\bv\d[\d.]*\b/i)
  return match ? match[0] : null
}

function extractName(title, version) {
  if (!title) return 'Release Notes'
  if (!version) return title
  return title.replace(version, '').trim() || title
}

function fmtDate(str) {
  if (!str) return null
  return new Date(str).toLocaleDateString('sr-Latn-RS', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ── NotesByProject ────────────────────────────────────────────────────────────

function NotesByProject({ notesList, isClient, onOpen, onRelease, onDelete }) {
  // Group by section_name; notes without a section go under null key
  const NONE = '__none__'
  const groups = {}
  for (const note of notesList) {
    const key = note.section_name || NONE
    if (!groups[key]) groups[key] = []
    groups[key].push(note)
  }

  const namedSections = Object.keys(groups).filter(k => k !== NONE).sort((a, b) => a.localeCompare(b))
  const hasUnsectioned = !!groups[NONE]

  // Flat list — no grouping if everything is unsectioned
  if (namedSections.length === 0) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 16 }}>
        {notesList.map(note => (
          <NoteCard key={note.id} note={note} isClient={isClient} onOpen={() => onOpen(note)}
            onRelease={() => onRelease(note)} onDelete={() => onDelete(note)} />
        ))}
      </div>
    )
  }

  const orderedKeys = [...namedSections, ...(hasUnsectioned ? [NONE] : [])]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {orderedKeys.map(sectionName => {
        const notes = groups[sectionName]
        return (
          <div key={sectionName}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              marginBottom: 16, paddingBottom: 10,
              borderBottom: '1px solid var(--border)',
            }}>
              <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: 'var(--text)', flex: 1 }}>
                {sectionName === NONE ? 'Ostalo' : sectionName}
              </span>
              <span style={{
                fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textMuted)',
                background: 'var(--surfaceAlt)', border: '1px solid var(--border)',
                borderRadius: 20, padding: '2px 9px',
              }}>
                {notes.length}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 16 }}>
              {notes.map(note => (
                <NoteCard key={note.id} note={note} isClient={isClient} onOpen={() => onOpen(note)}
                  onRelease={() => onRelease(note)} onDelete={() => onDelete(note)} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── NoteCard ──────────────────────────────────────────────────────────────────

function NoteCard({ note, isClient, onOpen, onRelease, onDelete }) {
  const t = useT()
  const [hovered, setHovered] = useState(false)
  const isReleased = note.status === 'released'
  const version = note.version || extractVersion(note.title)
  const displayName = extractName(note.title, version)
  const createdDate = fmtDate(note.created_at)
  const releasedDate = fmtDate(note.released_at)

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--surface)',
        border: `1px solid ${hovered ? 'var(--borderHover)' : 'var(--border)'}`,
        borderRadius: 12, padding: '20px',
        cursor: 'pointer', transition: 'all 0.2s ease',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? '0 4px 20px rgba(0,0,0,0.15)' : 'none',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          padding: '3px 9px', borderRadius: 6, fontSize: 10, fontFamily: "'DM Mono'", fontWeight: 600, letterSpacing: '0.04em',
          background: isReleased ? 'var(--greenTint)' : 'rgba(79,142,247,0.1)',
          color: isReleased ? 'var(--green)' : 'var(--accent)',
          border: `1px solid ${isReleased ? 'rgba(34,197,94,0.35)' : 'rgba(79,142,247,0.3)'}`,
        }}>
          {isReleased ? t('rn.released') : t('rn.published')}
        </span>
        {version && (
          <span style={{
            fontFamily: "'DM Mono'", fontSize: 11, fontWeight: 500,
            color: 'var(--accent)', background: 'rgba(79,142,247,0.08)',
            border: '1px solid rgba(79,142,247,0.2)', borderRadius: 6, padding: '3px 9px',
          }}>
            {version}
          </span>
        )}
      </div>

      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 17, color: 'var(--text)', lineHeight: 1.3 }}>
        {displayName}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {note.project_name && (
          <div style={{ fontFamily: "'DM Mono'", fontSize: 10, color: 'var(--textSubtle)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            {note.project_name}
          </div>
        )}
        <div style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textMuted)' }}>
          {t('rn.publishedOn', { date: createdDate })}
        </div>
        {isReleased && releasedDate ? (
          <div style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--green)' }}>
            {t('rn.releasedOn', { date: releasedDate })}
          </div>
        ) : (
          <div style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textSubtle)' }}>
            {t('rn.notReleased')}
          </div>
        )}
        {!isClient && note.client_count !== undefined && (
          <div style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textMuted)' }}>
            {note.client_count} {note.client_count === 1 ? t('rn.client.singular') : t('rn.client.plural')}
          </div>
        )}
      </div>

      {!isClient && !isReleased && (
        <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <button
            onClick={e => { e.stopPropagation(); onRelease() }}
            style={{
              padding: '6px 14px', borderRadius: 7, fontSize: 12,
              fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
              fontWeight: 600, background: 'transparent', border: '1px solid var(--green)',
              color: 'var(--green)', cursor: 'pointer', transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--green)'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--green)' }}
          >
            {t('rn.markReleased')}
          </button>
        </div>
      )}
    </div>
  )
}

// ── NoteDetailView ────────────────────────────────────────────────────────────

function NoteDetailView({ note, detail, loading, isClient, onBack, onRelease, onDelete, onManageClients }) {
  const t = useT()
  const isReleased = (detail?.status || note.status) === 'released'
  const version = detail?.version || note.version || extractVersion(note.title)
  const displayName = extractName(note.title, version)
  const createdDate = fmtDate(note.created_at)
  const releasedDate = fmtDate(detail?.released_at || note.released_at)
  const publicUrl = `${window.location.origin}/rn/${note.token}`
  const clientCount = detail?.client_count ?? note.client_count

  const btnBase = {
    padding: '7px 16px', borderRadius: 8, fontSize: 13,
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s ease',
    background: 'transparent', border: '1px solid var(--border)', color: 'var(--textMuted)',
  }

  return (
    <div>
      <button
        onClick={onBack}
        style={{ ...btnBase, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--borderHover)'; e.currentTarget.style.color = 'var(--text)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--textMuted)' }}
      >
        {t('rn.back')}
      </button>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '24px', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 16 }}>
          <div>
            <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 22, color: 'var(--text)', lineHeight: 1.2 }}>{displayName}</div>
            {version && (
              <div style={{
                display: 'inline-block', marginTop: 8,
                fontFamily: "'DM Mono'", fontSize: 13, fontWeight: 500,
                color: 'var(--accent)', background: 'rgba(79,142,247,0.1)',
                border: '1px solid rgba(79,142,247,0.25)', borderRadius: 6, padding: '3px 10px',
              }}>{version}</div>
            )}
          </div>
          <span style={{
            flexShrink: 0, padding: '4px 12px', borderRadius: 6, fontSize: 11,
            fontFamily: "'DM Mono'", fontWeight: 600, letterSpacing: '0.04em',
            background: isReleased ? 'var(--greenTint)' : 'rgba(79,142,247,0.1)',
            color: isReleased ? 'var(--green)' : 'var(--accent)',
            border: `1px solid ${isReleased ? 'rgba(34,197,94,0.35)' : 'rgba(79,142,247,0.3)'}`,
          }}>
            {isReleased ? t('rn.released') : t('rn.published')}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 24 }}>
          {[
            { label: t('rn.published'), value: createdDate, color: 'var(--text)' },
            { label: t('rn.released'), value: releasedDate || t('rn.notReleased'), color: releasedDate ? 'var(--green)' : 'var(--textSubtle)' },
            ...(note.project_name ? [{ label: 'Projekat', value: note.project_name, color: 'var(--text)' }] : []),
            ...(!isClient && clientCount !== undefined ? [{ label: t('rn.clients'), value: `${clientCount}`, color: 'var(--text)' }] : []),
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div style={{ fontFamily: "'DM Mono'", fontSize: 10, color: 'var(--textMuted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>{label}</div>
              <div style={{ fontFamily: "'DM Mono'", fontSize: 13, color }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a
            href={publicUrl} target="_blank" rel="noreferrer"
            style={{ ...btnBase, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--textMuted)' }}
          >
            {t('rn.publicLink')}
          </a>
          {!isClient && (
            <>
              <button
                onClick={onManageClients}
                style={{ ...btnBase }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--borderHover)'; e.currentTarget.style.color = 'var(--text)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--textMuted)' }}
              >
                {t('rn.clients')}
              </button>
              {!isReleased && (
                <button
                  onClick={onRelease}
                  style={{ ...btnBase, border: '1px solid var(--green)', color: 'var(--green)', fontWeight: 600 }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--green)'; e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--green)' }}
                >
                  {t('rn.markReleased')}
                </button>
              )}
              <button
                onClick={onDelete}
                style={{ ...btnBase, marginLeft: 'auto' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--red)'; e.currentTarget.style.color = 'var(--red)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--textMuted)' }}
              >
                {t('rn.delete')}
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{
          padding: '12px 20px', borderBottom: '1px solid var(--border)',
          fontFamily: "'DM Mono'", fontSize: 10, color: 'var(--textMuted)',
          textTransform: 'uppercase', letterSpacing: '0.07em',
        }}>
          {t('rn.contentPreview')}
        </div>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 14 }}>
            {t('rn.loadingContent')}
          </div>
        ) : detail?.html ? (
          <iframe
            srcDoc={detail.html}
            style={{ width: '100%', height: 0, border: 'none', display: 'block', overflow: 'hidden' }}
            title="Release Notes Preview"
            onLoad={e => {
              const doc = e.target.contentWindow?.document?.documentElement
              if (doc) e.target.style.height = doc.scrollHeight + 'px'
            }}
          />
        ) : (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 14 }}>
            {t('rn.noContent')}
          </div>
        )}
      </div>
    </div>
  )
}

// ── AssignClientsModal ────────────────────────────────────────────────────────

function AssignClientsModal({ assignModal, allClientUsers, onClose, onSave }) {
  const t = useT()
  const [selected, setSelected] = useState(new Set(assignModal.currentClients.map(c => c.id)))

  function toggle(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 480, boxShadow: '0 24px 80px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{t('rn.assignClients')}</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--textMuted)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '12px 24px', maxHeight: 360, overflowY: 'auto' }}>
          {allClientUsers.length === 0 ? (
            <div style={{ color: 'var(--textMuted)', fontFamily: 'DM Sans', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
              {t('rn.noClientUsers')}
            </div>
          ) : allClientUsers.map(u => (
            <div key={u.id} onClick={() => toggle(u.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
              <div style={{
                width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                border: selected.has(u.id) ? 'none' : '2px solid var(--border)',
                background: selected.has(u.id) ? 'var(--accent)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease',
              }}>
                {selected.has(u.id) && <span style={{ color: '#fff', fontSize: 12 }}>✓</span>}
              </div>
              <div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{u.name}</div>
                <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--textMuted)' }}>{u.email}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontFamily: 'DM Sans', background: 'transparent', border: '1px solid var(--border)', color: 'var(--textMuted)', cursor: 'pointer' }}>{t('rn.cancel')}</button>
          <button onClick={() => onSave([...selected])} style={{ padding: '8px 24px', borderRadius: 8, fontSize: 13, fontFamily: 'DM Sans', fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer' }}>
            {t('rn.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
