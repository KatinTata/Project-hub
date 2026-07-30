import { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'
import Topbar from '../components/Topbar.jsx'
import BrainAnimation from '../components/BrainAnimation.jsx'
import * as pdfjsLib from 'pdfjs-dist'
import { useT } from '../lang.jsx'
import { useWindowSize } from '../hooks/useWindowSize.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

// ── SVG Icons ─────────────────────────────────────────────────────────────────

function IconPdf() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" style={{ width: 32, height: 32 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  )
}

function IconDownload() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 16, height: 16 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 16, height: 16 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  )
}

function IconPencil() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 14, height: 14 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
    </svg>
  )
}

function IconPlus() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" style={{ width: 16, height: 16 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fmtDate(str) {
  if (!str) return ''
  const d = new Date(str)
  return d.toLocaleDateString('sr-Latn-RS', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

async function downloadDoc(id, filename, t) {
  const token = localStorage.getItem('jt_token')
  const res = await fetch(`/api/documents/${id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(t('docs.downloadFailed'))
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── PDF Thumbnail ─────────────────────────────────────────────────────────────

function PdfThumbnail({ docId }) {
  const canvasRef = useRef(null)
  const [state, setState] = useState('loading') // 'loading' | 'done' | 'error'

  useEffect(() => {
    let cancelled = false
    setState('loading')

    async function render() {
      try {
        const token = localStorage.getItem('jt_token')
        const res = await fetch(`/api/documents/${docId}/download`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok || cancelled) { if (!cancelled) setState('error'); return }

        const buf = await res.arrayBuffer()
        if (cancelled) return

        const pdf = await pdfjsLib.getDocument({ data: buf }).promise
        if (cancelled) return

        const page = await pdf.getPage(1)
        if (cancelled) return

        const canvas = canvasRef.current
        if (!canvas) return

        // Render at 480px wide — CSS scales it down to fill the card
        const naturalVp = page.getViewport({ scale: 1 })
        const scale = 480 / naturalVp.width
        const viewport = page.getViewport({ scale })

        canvas.width = viewport.width
        canvas.height = viewport.height

        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
        if (!cancelled) setState('done')
      } catch {
        if (!cancelled) setState('error')
      }
    }

    render()
    return () => { cancelled = true }
  }, [docId])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Canvas — always rendered, hidden while loading */}
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: 'auto',
          display: state === 'done' ? 'block' : 'none',
          verticalAlign: 'top',
        }}
      />

      {/* Fallback: loading or error */}
      {state !== 'done' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--textSubtle)' }}>
          {state === 'loading' ? (
            <div style={{ fontFamily: "'DM Mono'", fontSize: 10, color: 'var(--textSubtle)', letterSpacing: '0.08em', animation: 'pulse 1.5s ease-in-out infinite', opacity: 0.6 }}>···</div>
          ) : (
            <>
              <IconPdf />
              <span style={{ fontFamily: "'DM Mono'", fontSize: 10, letterSpacing: '0.08em' }}>PDF</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Document Card ─────────────────────────────────────────────────────────────

function DocCard({ doc, isAdmin, onDelete }) {
  const t = useT()
  const [hover, setHover] = useState(false)
  const [downloading, setDownloading] = useState(false)

  async function handleDownload(e) {
    e.stopPropagation()
    setDownloading(true)
    try { await downloadDoc(doc.id, doc.original_name, t) } catch {}
    setDownloading(false)
  }

  return (
    <div
      style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'default', transition: 'border-color 0.2s, box-shadow 0.2s', ...(hover ? { borderColor: 'var(--borderHover)', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' } : {}) }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Thumbnail area */}
      <div style={{ width: '100%', height: 180, background: 'var(--surfaceAlt)', position: 'relative', overflow: 'hidden' }}>
        <PdfThumbnail docId={doc.id} />

        {/* Hover overlay */}
        {hover && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <button
              onClick={handleDownload}
              disabled={downloading}
              title="Preuzmi"
              style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
            >
              <IconDownload />
            </button>
            {isAdmin && (
              <button
                onClick={e => { e.stopPropagation(); onDelete(doc.id) }}
                title="Obriši"
                style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(239,68,68,0.25)', border: '1px solid rgba(239,68,68,0.5)', color: '#fca5a5', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.4)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.25)'}
              >
                <IconTrash />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Meta */}
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, fontWeight: 500, color: 'var(--text)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: 6 }}>
          {doc.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: "'DM Mono'", fontSize: 10, color: 'var(--textSubtle)' }}>{fmtDate(doc.created_at)}</span>
          <span style={{ fontFamily: "'DM Mono'", fontSize: 10, color: 'var(--textSubtle)' }}>{fmtFileSize(doc.file_size)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Upload Modal ──────────────────────────────────────────────────────────────

function UploadModal({ sections, onClose, onUploaded }) {
  const t = useT()
  const [step, setStep] = useState(1)
  const [file, setFile] = useState(null)
  const [docName, setDocName] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [newSectionName, setNewSectionName] = useState('')
  const [showNewSection, setShowNewSection] = useState(false)
  const [clients, setClients] = useState([])
  const [selectedClientIds, setSelectedClientIds] = useState(null) // null = all
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const [localSections, setLocalSections] = useState(sections)
  const dropRef = useRef(null)

  useEffect(() => {
    api.getUsers().then(users => setClients(users.filter(u => u.role === 'client'))).catch(() => {})
  }, [])

  function handleFile(f) {
    if (!f) return
    if (f.type !== 'application/pdf') { setError('Samo PDF fajlovi su podržani'); return }
    if (f.size > 20 * 1024 * 1024) { setError('Fajl ne sme biti veći od 20MB'); return }
    setFile(f)
    setDocName(f.name.replace(/\.pdf$/i, ''))
    setError(null)
    setStep(2)
  }

  function toggleClient(id) {
    setSelectedClientIds(prev => {
      const base = prev === null ? clients.map(c => c.id) : prev
      return base.includes(id) ? base.filter(x => x !== id) : [...base, id]
    })
  }

  function allSelected() {
    if (selectedClientIds === null) return true
    return clients.every(c => selectedClientIds.includes(c.id))
  }

  function toggleAll() {
    if (allSelected()) setSelectedClientIds([])
    else setSelectedClientIds(null)
  }

  async function handleCreateSection() {
    if (!newSectionName.trim()) return
    try {
      const s = await api.createDocumentSection(newSectionName.trim())
      setLocalSections(prev => [...prev, s])
      setSectionId(String(s.id))
      setShowNewSection(false)
      setNewSectionName('')
    } catch (err) { setError(err.message) }
  }

  async function handleUpload() {
    if (!file || !docName.trim() || !sectionId) { setError('Popunite sva obavezna polja'); return }
    setUploading(true)
    setProgress(0)
    setError(null)

    const visibleTo = selectedClientIds === null ? 'all' : JSON.stringify(selectedClientIds)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('name', docName.trim())
    fd.append('section_id', sectionId)
    fd.append('visible_to', visibleTo)

    try {
      const doc = await new Promise((resolve, reject) => {
        const token = localStorage.getItem('jt_token')
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = e => { if (e.lengthComputable) setProgress(Math.round(e.loaded / e.total * 100)) }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText))
          else { try { reject(new Error(JSON.parse(xhr.responseText).error)) } catch { reject(new Error(t('docs.uploadFailed'))) } }
        }
        xhr.onerror = () => reject(new Error('Mrežna greška'))
        xhr.open('POST', '/api/documents')
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.send(fd)
      })
      onUploaded(doc, localSections)
    } catch (err) {
      setError(err.message)
      setUploading(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.4)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
            {step === 1 ? t('docs.add') : t('docs.upload')}
          </span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--textMuted)', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {['Fajl', 'Detalji'].map((label, i) => (
            <div key={i} style={{ flex: 1, padding: '10px 0', textAlign: 'center', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, fontWeight: step === i + 1 ? 600 : 400, color: step === i + 1 ? 'var(--accent)' : 'var(--textMuted)', borderBottom: step === i + 1 ? '2px solid var(--accent)' : '2px solid transparent', transition: 'all 0.2s' }}>
              {i + 1}. {label}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {error && (
            <div style={{ padding: '10px 14px', background: 'var(--redTint)', border: '1px solid var(--red)', borderRadius: 8, fontSize: 13, color: 'var(--red)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", marginBottom: 16 }}>
              {error}
            </div>
          )}

          {/* Step 1 */}
          {step === 1 && (
            <div
              ref={dropRef}
              onDragOver={e => { e.preventDefault(); dropRef.current.style.borderColor = 'var(--accent)' }}
              onDragLeave={() => { dropRef.current.style.borderColor = 'var(--border)' }}
              onDrop={e => { e.preventDefault(); dropRef.current.style.borderColor = 'var(--border)'; handleFile(e.dataTransfer.files[0]) }}
              onClick={() => {
                const inp = document.createElement('input')
                inp.type = 'file'; inp.accept = 'application/pdf'
                inp.onchange = ev => handleFile(ev.target.files[0])
                inp.click()
              }}
              style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: '48px 24px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
            >
              <div style={{ color: 'var(--textSubtle)' }}><IconPdf /></div>
              <div style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>Prevuci PDF ili klikni za odabir</div>
              <div style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textSubtle)' }}>PDF · max 20 MB</div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* File info */}
              <div style={{ padding: '10px 14px', background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ color: 'var(--textMuted)' }}><IconPdf /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file?.name}</div>
                  <div style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textMuted)' }}>{fmtFileSize(file?.size)}</div>
                </div>
                <button onClick={() => { setFile(null); setStep(1) }} style={{ background: 'transparent', border: 'none', color: 'var(--textMuted)', cursor: 'pointer', fontSize: 16, padding: 4 }}>×</button>
              </div>

              {/* Name */}
              <div>
                <label style={labelStyle}>NAZIV DOKUMENTA</label>
                <input value={docName} onChange={e => setDocName(e.target.value)} style={inputStyle} placeholder="Naziv koji će videti klijenti..." />
              </div>

              {/* Section */}
              <div>
                <label style={labelStyle}>SEKCIJA</label>
                <select
                  value={sectionId}
                  onChange={e => { if (e.target.value === '__new__') { setShowNewSection(true); setSectionId('') } else { setSectionId(e.target.value); setShowNewSection(false) } }}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="">Odaberi sekciju...</option>
                  {localSections.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                  <option value="__new__">+ Kreiraj novu sekciju</option>
                </select>

                {showNewSection && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input
                      value={newSectionName}
                      onChange={e => setNewSectionName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCreateSection()}
                      placeholder="Naziv nove sekcije..."
                      style={{ ...inputStyle, flex: 1 }}
                      autoFocus
                    />
                    <button onClick={handleCreateSection} style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, fontSize: 13 }}>
                      Kreiraj
                    </button>
                  </div>
                )}
              </div>

              {/* Visibility */}
              {clients.length > 0 && (
                <div>
                  <label style={labelStyle}>VIDLJIVO KLIJENTIMA</label>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    {/* All toggle */}
                    <div onClick={toggleAll} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: 'var(--surfaceAlt)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--surfaceAlt)'}
                    >
                      <Checkbox checked={allSelected()} />
                      <span style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Svi klijenti</span>
                    </div>
                    {/* Individual */}
                    <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                      {clients.map(c => {
                        const checked = selectedClientIds === null || selectedClientIds.includes(c.id)
                        return (
                          <div key={c.id} onClick={() => toggleClient(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surfaceAlt)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <Checkbox checked={checked} />
                            <div>
                              <div style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, color: 'var(--text)' }}>{c.name}</div>
                              <div style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textMuted)' }}>{c.email}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Upload progress */}
              {uploading && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textMuted)' }}>
                    <span>{t('docs.uploading')}</span><span>{progress}%</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 0.2s ease' }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 2 && (
          <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
            <button onClick={() => setStep(1)} disabled={uploading} style={{ padding: '9px 20px', borderRadius: 8, fontSize: 13, fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", background: 'transparent', border: '1px solid var(--border)', color: 'var(--textMuted)', cursor: 'pointer' }}>
              Nazad
            </button>
            <button onClick={handleUpload} disabled={uploading || !docName.trim() || !sectionId} style={{ padding: '9px 24px', borderRadius: 8, fontSize: 13, fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', cursor: uploading ? 'wait' : 'pointer', opacity: (!docName.trim() || !sectionId) ? 0.5 : 1 }}>
              {uploading ? t('docs.uploading') : t('docs.upload')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Checkbox({ checked }) {
  return (
    <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: checked ? 'none' : '2px solid var(--border)', background: checked ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
      {checked && (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 5l2.5 2.5 3.5-4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DocumentsPage({
  user, theme, onLogout, onOpenSettings, onOpenUsers, onGoToDashboard, onGoToReleaseNotes, onGoToReleaseNotesEditor, onGoToDocuments, onGoToQA, onGoToAiUsage, onOpenChat,
}) {
  const t = useT()
  const { isMobile } = useWindowSize()
  const [sections, setSections] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [renameId, setRenameId] = useState(null)
  const [renameName, setRenameName] = useState('')
  const [confirmDeleteSection, setConfirmDeleteSection] = useState(null)
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState(null)

  const isAdmin = user.role !== 'client'

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const [secs, docs] = await Promise.all([api.getDocumentSections(), api.getDocuments()])
      setSections(secs)
      setDocuments(docs)
    } catch {}
    setLoading(false)
  }

  async function handleDeleteDoc(id) {
    if (confirmDeleteDoc !== id) { setConfirmDeleteDoc(id); return }
    await api.deleteDocument(id)
    setDocuments(prev => prev.filter(d => d.id !== id))
    setConfirmDeleteDoc(null)
  }

  async function handleDeleteSection(id) {
    await api.deleteDocumentSection(id)
    setSections(prev => prev.filter(s => s.id !== id))
    setDocuments(prev => prev.filter(d => d.section_id !== id))
    setConfirmDeleteSection(null)
  }

  async function handleRename(id) {
    if (!renameName.trim()) return
    await api.renameDocumentSection(id, renameName.trim())
    setSections(prev => prev.map(s => s.id === id ? { ...s, name: renameName.trim() } : s))
    setRenameId(null)
  }

  function handleUploaded(doc, updatedSections) {
    setDocuments(prev => [doc, ...prev])
    setSections(updatedSections)
    setUploadOpen(false)
  }

  // Group docs by section
  const docsBySection = {}
  const unsectioned = []
  for (const doc of documents) {
    if (doc.section_id) {
      if (!docsBySection[doc.section_id]) docsBySection[doc.section_id] = []
      docsBySection[doc.section_id].push(doc)
    } else {
      unsectioned.push(doc)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', position: 'relative' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <BrainAnimation opacity={0.45} fullscreen />
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>
      <Topbar
        user={user}
        theme={theme}
        onLogout={onLogout}
        onOpenSettings={onOpenSettings}
        onGoToDashboard={onGoToDashboard}
        onGoToReleaseNotes={onGoToReleaseNotes}
        onGoToReleaseNotesEditor={isAdmin ? onGoToReleaseNotesEditor : null}
        onOpenChat={onOpenChat}
        onOpenUsers={onOpenUsers}
        onGoToDocuments={onGoToDocuments}
        onGoToQA={onGoToQA}
        onGoToAiUsage={onGoToAiUsage}
        currentPage="documents"
      />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '20px 16px' : '32px 28px' }}>
        {/* Page header */}
        <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 28, color: 'var(--text)', marginBottom: 4 }}>{t('docs.title')}</h1>
            <div style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, color: 'var(--textMuted)' }}>
              {t('docs.onProject', { n: documents.length })}
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={() => setUploadOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 9, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, fontSize: 14, transition: 'background 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accentHover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--accent)'}
            >
              <IconPlus />
              {t('docs.add')}
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--textMuted)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}>
            {t('app.loading')}
          </div>
        ) : documents.length === 0 && sections.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ color: 'var(--textSubtle)' }}><IconPdf /></div>
            <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>Nema dokumenata</div>
            {isAdmin ? (
              <button onClick={() => setUploadOpen(true)} style={{ padding: '9px 20px', borderRadius: 9, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, fontSize: 14 }}>
                Dodaj prvi dokument
              </button>
            ) : (
              <div style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 14, color: 'var(--textMuted)' }}>Nema dostupnih dokumenata</div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {sections.map(section => {
              const sectionDocs = docsBySection[section.id] || []
              if (sectionDocs.length === 0 && !isAdmin) return null
              const isRenaming = renameId === section.id
              const isConfirmingDelete = confirmDeleteSection === section.id

              return (
                <div key={section.id}>
                  {/* Section header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                    {isRenaming ? (
                      <form onSubmit={e => { e.preventDefault(); handleRename(section.id) }} style={{ display: 'flex', gap: 8, flex: 1 }}>
                        <input
                          value={renameName}
                          onChange={e => setRenameName(e.target.value)}
                          autoFocus
                          style={{ ...inputStyle, flex: 1, fontSize: 15 }}
                        />
                        <button type="submit" style={{ padding: '6px 14px', borderRadius: 7, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, fontSize: 13 }}>Sačuvaj</button>
                        <button type="button" onClick={() => setRenameId(null)} style={{ padding: '6px 12px', borderRadius: 7, background: 'transparent', border: '1px solid var(--border)', color: 'var(--textMuted)', cursor: 'pointer', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13 }}>Otkaži</button>
                      </form>
                    ) : (
                      <>
                        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: 'var(--text)', flex: 1 }}>{section.name}</span>
                        <span style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textMuted)', background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 20, padding: '2px 9px' }}>
                          {sectionDocs.length}
                        </span>
                        {isAdmin && !isConfirmingDelete && (
                          <>
                            <button onClick={() => { setRenameId(section.id); setRenameName(section.name) }} title="Preimenuj sekciju" style={{ width: 28, height: 28, borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--textMuted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--borderHover)'; e.currentTarget.style.color = 'var(--text)' }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--textMuted)' }}>
                              <IconPencil />
                            </button>
                            <button onClick={() => setConfirmDeleteSection(section.id)} title="Obriši sekciju" style={{ width: 28, height: 28, borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--textMuted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'var(--redTint)' }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--textMuted)'; e.currentTarget.style.background = 'transparent' }}>
                              <IconTrash />
                            </button>
                          </>
                        )}
                        {isAdmin && isConfirmingDelete && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, color: 'var(--red)' }}>Obrisati sekciju i sve dokumente?</span>
                            <button onClick={() => handleDeleteSection(section.id)} style={{ padding: '4px 12px', borderRadius: 6, background: 'var(--red)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, fontSize: 12 }}>Obriši</button>
                            <button onClick={() => setConfirmDeleteSection(null)} style={{ padding: '4px 10px', borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--textMuted)', cursor: 'pointer', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12 }}>Otkaži</button>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Documents grid */}
                  {sectionDocs.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                      {sectionDocs.map(doc => (
                        <div key={doc.id}>
                          <DocCard doc={doc} isAdmin={isAdmin} onDelete={handleDeleteDoc} />
                          {confirmDeleteDoc === doc.id && (
                            <div style={{ marginTop: 6, padding: '8px 10px', background: 'var(--redTint)', border: '1px solid var(--red)', borderRadius: 8, display: 'flex', gap: 6 }}>
                              <button onClick={() => handleDeleteDoc(doc.id)} style={{ flex: 1, padding: '4px', borderRadius: 6, background: 'var(--red)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, fontSize: 12 }}>Obriši</button>
                              <button onClick={() => setConfirmDeleteDoc(null)} style={{ flex: 1, padding: '4px', borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--textMuted)', cursor: 'pointer', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12 }}>Otkaži</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : isAdmin ? (
                    <div style={{ padding: '24px 0', color: 'var(--textSubtle)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, textAlign: 'center' }}>
                      Sekcija je prazna
                    </div>
                  ) : null}
                </div>
              )
            })}

            {/* Unsectioned docs */}
            {unsectioned.length > 0 && (
              <div>
                <div style={{ marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: 'var(--textMuted)' }}>Ostalo</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                  {unsectioned.map(doc => (
                    <DocCard key={doc.id} doc={doc} isAdmin={isAdmin} onDelete={handleDeleteDoc} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {uploadOpen && (
        <UploadModal sections={sections} onClose={() => setUploadOpen(false)} onUploaded={handleUploaded} />
      )}
      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block', fontSize: 11, fontFamily: "'DM Mono'",
  textTransform: 'uppercase', letterSpacing: '0.06em',
  color: 'var(--textMuted)', marginBottom: 6,
}

const inputStyle = {
  width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '9px 12px', color: 'var(--text)',
  fontSize: 14, fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  boxSizing: 'border-box',
}
