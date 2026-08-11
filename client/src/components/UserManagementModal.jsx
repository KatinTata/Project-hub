import { useState, useEffect } from 'react'
import { api } from '../api.js'
import { useT } from '../lang.jsx'

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  user: 'Korisnik',
}

const ROLE_COLORS = {
  super_admin: { bg: 'rgba(239,68,68,0.10)', text: 'var(--red)', border: 'rgba(239,68,68,0.25)' },
  admin: { bg: 'rgba(79,142,247,0.10)', text: 'var(--accent)', border: 'rgba(79,142,247,0.25)' },
  user: { bg: 'rgba(107,122,153,0.10)', text: 'var(--textMuted)', border: 'rgba(107,122,153,0.20)' },
}

export default function UserManagementModal({ onClose, isSuperAdmin }) {
  const t = useT()
  const [users, setUsers] = useState([])
  const [organizations, setOrganizations] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [newForm, setNewForm] = useState({ name: '', email: '', password: '', role: 'user', organizationId: '' })
  const [newError, setNewError] = useState('')
  const [newLoading, setNewLoading] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [newOrgLoading, setNewOrgLoading] = useState(false)
  const [newOrgError, setNewOrgError] = useState('')
  const [creatingOrg, setCreatingOrg] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importRows, setImportRows] = useState([])
  const [importResults, setImportResults] = useState(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState('')

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    try {
      setLoading(true)
      const [userData, orgData, projData] = await Promise.all([api.getUsers(), api.getOrganizations(), api.getProjects()])
      setUsers(userData)
      setOrganizations(orgData)
      setProjects(projData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateOrg(e) {
    e.preventDefault()
    setNewOrgError('')
    setNewOrgLoading(true)
    try {
      const { org } = await api.createOrganization(newOrgName.trim())
      setOrganizations(prev => [...prev, org].sort((a, b) => a.name.localeCompare(b.name)))
      setNewOrgName('')
      setCreatingOrg(false)
    } catch (err) {
      setNewOrgError(err.message)
    } finally {
      setNewOrgLoading(false)
    }
  }

  async function handleDeleteOrg(orgId) {
    if (!confirm('Obrisati organizaciju? Korisnici koji joj pripadaju neće biti obrisani, samo će biti bez organizacije.')) return
    try {
      await api.deleteOrganization(orgId)
      setOrganizations(prev => prev.filter(o => o.id !== orgId))
      setUsers(prev => prev.map(u => u.organizationId === orgId ? { ...u, organizationId: null, organizationName: null } : u))
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleCreateUser(e) {
    e.preventDefault()
    setNewError('')
    setNewLoading(true)
    try {
      const body = {
        ...newForm,
        organizationId: newForm.organizationId ? parseInt(newForm.organizationId) : null,
      }
      const { user } = await api.createUser(body)
      setUsers(prev => [...prev, user])
      setNewForm({ name: '', email: '', password: '', role: 'user', organizationId: '' })
      setCreating(false)
    } catch (err) {
      setNewError(err.message)
    } finally {
      setNewLoading(false)
    }
  }

  async function handleEditUser(userId, body) {
    const { user } = await api.updateUser(userId, body)
    setUsers(prev => prev.map(u => u.id === userId ? user : u))
  }

  async function handleDeleteUser(userId) {
    if (!confirm(t('users.deleteConfirm'))) return
    try {
      await api.deleteUser(userId)
      setUsers(prev => prev.filter(u => u.id !== userId))
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleAssignProject(userId, projectId) {
    if (!projectId) return
    try {
      await api.assignProject(userId, parseInt(projectId))
      const assigned = projects.find(p => p.id === parseInt(projectId))
      if (assigned) {
        setUsers(prev => prev.map(u => {
          if (u.id !== userId) return u
          const alreadyAssigned = u.projects.some(p => p.id === assigned.id)
          if (alreadyAssigned) return u
          return { ...u, projects: [...u.projects, { id: assigned.id, epicKey: assigned.epicKey, displayName: assigned.displayName }] }
        }))
      }
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleUnassignProject(userId, projectId) {
    try {
      await api.unassignProject(userId, projectId)
      setUsers(prev => prev.map(u => {
        if (u.id !== userId) return u
        return { ...u, projects: u.projects.filter(p => p.id !== projectId) }
      }))
    } catch (err) {
      alert(err.message)
    }
  }

  function parseCSV(text) {
    const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) return []
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ''))
    return lines.slice(1).map(line => {
      // Handle quoted fields
      const cols = []
      let cur = '', inQ = false
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') { inQ = !inQ }
        else if (line[i] === ',' && !inQ) { cols.push(cur.trim()); cur = '' }
        else cur += line[i]
      }
      cols.push(cur.trim())
      const obj = {}
      headers.forEach((h, i) => { obj[h] = cols[i] || '' })
      return { name: obj.name || obj.ime || '', email: obj.email || obj.mail || '', organization: obj.organization || obj.organizacija || obj.org || '', role: obj.role || obj.uloga || 'user' }
    }).filter(r => r.name || r.email)
  }

  function handleFileUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setImportError('')
    setImportResults(null)
    const reader = new FileReader()
    reader.onload = ev => {
      const rows = parseCSV(ev.target.result)
      if (rows.length === 0) { setImportError('Fajl je prazan ili format nije ispravan'); return }
      setImportRows(rows)
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  async function handleImport() {
    setImportLoading(true)
    setImportError('')
    try {
      const data = await api.importUsers(importRows)
      setImportResults(data.results)
      // Refresh user list
      const updated = await api.getUsers()
      setUsers(updated)
      // Refresh orgs (new ones may have been created)
      const orgsData = await api.getOrganizations()
      setOrganizations(orgsData)
    } catch (err) {
      setImportError(err.message)
    } finally {
      setImportLoading(false)
    }
  }

  function downloadTemplate() {
    const csv = 'name,email,organization,role\nMarko Petrović,marko@klijent.com,Naziv Organizacije,user\nAna Jovanović,ana@firma.com,Naziv Organizacije,user'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'import_template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, width: '100%', maxWidth: 760, maxHeight: '88vh',
        display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontFamily: 'Hanken Grotesk', fontWeight: 800, fontSize: 20, color: 'var(--text)', marginBottom: 2 }}>
              {t('users.title')}
            </h2>
            <p style={{ fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, color: 'var(--textMuted)' }}>
              {t('users.subtitle')}
            </p>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border)', background: 'transparent', color: 'var(--textMuted)', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surfaceAlt)'; e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--textMuted)' }}
          >×</button>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--redTint)', border: '1px solid #EF444430', borderRadius: 8, color: 'var(--red)', fontSize: 13, fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif" }}>{error}</div>
          )}

          {/* Organizations section — super admin only */}
          {isSuperAdmin && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontFamily: "'Hanken Grotesk'", fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--textMuted)' }}>
                  Organizacije
                </div>
                {!creatingOrg && (
                  <button onClick={() => setCreatingOrg(true)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 10px', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, color: 'var(--textMuted)', cursor: 'pointer', transition: 'all 0.2s ease' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--textMuted)' }}
                  >+ Dodaj organizaciju</button>
                )}
              </div>

              {creatingOrg && (
                <form onSubmit={handleCreateOrg} style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
                  <input
                    value={newOrgName}
                    onChange={e => setNewOrgName(e.target.value)}
                    placeholder="Naziv organizacije"
                    required
                    autoFocus
                    style={inputStyle}
                    onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  />
                  <button type="submit" disabled={newOrgLoading} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 14px', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {newOrgLoading ? 'Kreiranje...' : 'Kreiraj'}
                  </button>
                  <button type="button" onClick={() => { setCreatingOrg(false); setNewOrgError('') }} style={{ background: 'transparent', color: 'var(--textMuted)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 14px', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    Otkaži
                  </button>
                </form>
              )}
              {newOrgError && <div style={{ marginBottom: 8, padding: '6px 10px', background: 'var(--redTint)', border: '1px solid #EF444430', borderRadius: 6, color: 'var(--red)', fontSize: 12 }}>{newOrgError}</div>}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {organizations.length === 0 ? (
                  <span style={{ fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, color: 'var(--textSubtle)', fontStyle: 'italic' }}>Nema organizacija</span>
                ) : organizations.map(o => (
                  <span key={o.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 20, padding: '3px 12px', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, color: 'var(--text)' }}>
                    {o.name}
                    <button onClick={() => handleDeleteOrg(o.id)} style={{ background: 'transparent', border: 'none', color: 'var(--textMuted)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--textMuted)'}
                    >×</button>
                  </span>
                ))}
              </div>
              <div style={{ marginTop: 16, borderBottom: '1px solid var(--border)' }} />
            </div>
          )}

          {/* Add user / Import buttons */}
          {!creating && !importing && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <button onClick={() => setCreating(true)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s ease' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--accentHover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--accent)'}
              >+ Dodaj korisnika</button>
              <button onClick={() => { setImporting(true); setImportRows([]); setImportResults(null); setImportError('') }}
                style={{ background: 'transparent', color: 'var(--textMuted)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 18px', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, cursor: 'pointer', transition: 'all 0.2s ease' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--textMuted)' }}
              >↑ Import CSV</button>
            </div>
          )}

          {/* CSV Import panel */}
          {importing && !importResults && (
            <div style={{ marginBottom: 20, padding: '20px', background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Import korisnika iz CSV-a</div>
                <button onClick={() => { setImporting(false); setImportRows([]) }} style={{ background: 'transparent', border: 'none', color: 'var(--textMuted)', cursor: 'pointer', fontSize: 18 }}>×</button>
              </div>

              <div style={{ fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, color: 'var(--textMuted)', marginBottom: 14, lineHeight: 1.6 }}>
                CSV kolone: <code style={{ background: 'var(--bg)', padding: '1px 6px', borderRadius: 4, fontFamily: "'Hanken Grotesk'", fontSize: 11 }}>name, email, organization, role</code><br />
                Kolona <code style={{ background: 'var(--bg)', padding: '1px 6px', borderRadius: 4, fontFamily: "'Hanken Grotesk'", fontSize: 11 }}>role</code> je opciona (default: user). Organizacija se kreira automatski ako ne postoji.
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: '#fff', borderRadius: 7, padding: '7px 14px', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  Odaberi CSV fajl
                  <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} style={{ display: 'none' }} />
                </label>
                <button onClick={downloadTemplate} style={{ background: 'transparent', color: 'var(--textMuted)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 14px', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, cursor: 'pointer' }}>
                  ↓ Preuzmi template
                </button>
              </div>

              {importError && <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--redTint)', border: '1px solid #EF444430', borderRadius: 6, color: 'var(--red)', fontSize: 12 }}>{importError}</div>}

              {importRows.length > 0 && (
                <>
                  <div style={{ fontFamily: "'Hanken Grotesk'", fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--textMuted)', marginBottom: 8 }}>
                    Preview — {importRows.length} {importRows.length === 1 ? 'red' : 'redova'}
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 14 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif" }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)' }}>
                          {['Ime', 'Email', 'Organizacija', 'Uloga'].map(h => (
                            <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontFamily: "'Hanken Grotesk'", fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--textMuted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.map((r, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '6px 10px', color: 'var(--text)' }}>{r.name || <span style={{ color: 'var(--red)' }}>!</span>}</td>
                            <td style={{ padding: '6px 10px', color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk'", fontSize: 11 }}>{r.email || <span style={{ color: 'var(--red)' }}>!</span>}</td>
                            <td style={{ padding: '6px 10px', color: 'var(--textMuted)' }}>{r.organization || '—'}</td>
                            <td style={{ padding: '6px 10px' }}>
                              <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 10, padding: '2px 7px', borderRadius: 20, background: (ROLE_COLORS[r.role] || ROLE_COLORS.user).bg, color: (ROLE_COLORS[r.role] || ROLE_COLORS.user).text }}>
                                {ROLE_LABELS[r.role] || r.role || 'user'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleImport} disabled={importLoading} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 18px', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, fontSize: 13, cursor: importLoading ? 'not-allowed' : 'pointer', opacity: importLoading ? 0.7 : 1 }}>
                      {importLoading ? 'Importujem...' : `Importuj ${importRows.length} korisnika`}
                    </button>
                    <button onClick={() => setImportRows([])} style={{ background: 'transparent', color: 'var(--textMuted)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 14px', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, cursor: 'pointer' }}>
                      Otkaži
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Import results */}
          {importResults && (
            <div style={{ marginBottom: 20, padding: '20px', background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Rezultati importa</div>
                <button onClick={() => { setImporting(false); setImportResults(null); setImportRows([]) }} style={{ background: 'transparent', border: 'none', color: 'var(--textMuted)', cursor: 'pointer', fontSize: 18 }}>×</button>
              </div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
                {[
                  { label: 'Kreirano', count: importResults.filter(r => r.status === 'created').length, color: 'var(--green)' },
                  { label: 'Preskočeno', count: importResults.filter(r => r.status === 'skipped').length, color: 'var(--amber)' },
                  { label: 'Greška', count: importResults.filter(r => r.status === 'error').length, color: 'var(--red)' },
                ].map(s => (
                  <div key={s.label} style={{ fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13 }}>
                    <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 20, color: s.color }}>{s.count}</span>
                    <span style={{ color: 'var(--textMuted)', marginLeft: 6 }}>{s.label}</span>
                  </div>
                ))}
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif" }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      {['Status', 'Ime', 'Email', 'Org', 'Privremena lozinka'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontFamily: "'Hanken Grotesk'", fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--textMuted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importResults.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: r.status === 'error' ? 'var(--redTint)' : r.status === 'skipped' ? 'var(--amberTint)' : 'transparent' }}>
                        <td style={{ padding: '6px 10px' }}>
                          <span style={{ color: r.status === 'created' ? 'var(--green)' : r.status === 'skipped' ? 'var(--amber)' : 'var(--red)', fontFamily: "'Hanken Grotesk'", fontSize: 10 }}>
                            {r.status === 'created' ? '✓ OK' : r.status === 'skipped' ? '— skip' : '✕ err'}
                          </span>
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--text)' }}>{r.name}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk'", fontSize: 11 }}>{r.email}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--textMuted)' }}>{r.organization || '—'}</td>
                        <td style={{ padding: '6px 10px' }}>
                          {r.tempPassword
                            ? <code style={{ background: 'var(--bg)', padding: '2px 7px', borderRadius: 4, fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--text)', userSelect: 'all' }}>{r.tempPassword}</code>
                            : <span style={{ color: 'var(--textMuted)', fontSize: 11 }}>{r.reason || '—'}</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 10, fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, color: 'var(--textMuted)' }}>
                Sačuvaj privremene lozinke pre nego što zatvoriš ovaj prozor.
              </div>
            </div>
          )}

          {/* Create form */}
          {creating && (
            <form onSubmit={handleCreateUser} style={{ marginBottom: 20, padding: '16px 20px', background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 14 }}>
                Novi korisnik
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 130px', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={labelStyle}>IME</label>
                  <input value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} placeholder="Ime i prezime" required style={inputStyle} onFocus={e => e.target.style.borderColor = 'var(--accent)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                </div>
                <div>
                  <label style={labelStyle}>EMAIL</label>
                  <input type="email" value={newForm.email} onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))} placeholder="email@domen.com" required style={inputStyle} onFocus={e => e.target.style.borderColor = 'var(--accent)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                </div>
                <div>
                  <label style={labelStyle}>LOZINKA</label>
                  <input type="password" value={newForm.password} onChange={e => setNewForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" required style={inputStyle} onFocus={e => e.target.style.borderColor = 'var(--accent)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                </div>
                <div>
                  <label style={labelStyle}>ULOGA</label>
                  <select value={newForm.role} onChange={e => setNewForm(f => ({ ...f, role: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="user">Korisnik</option>
                    <option value="admin">Admin</option>
                    {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                  </select>
                </div>
              </div>
              {newForm.role === 'user' && organizations.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <label style={labelStyle}>ORGANIZACIJA</label>
                  <select value={newForm.organizationId} onChange={e => setNewForm(f => ({ ...f, organizationId: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer', maxWidth: 280 }}>
                    <option value="">Bez organizacije</option>
                    {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              )}
              {newError && <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--redTint)', border: '1px solid #EF444430', borderRadius: 6, color: 'var(--red)', fontSize: 12 }}>{newError}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" disabled={newLoading} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 16px', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, fontSize: 13, cursor: newLoading ? 'not-allowed' : 'pointer', opacity: newLoading ? 0.7 : 1 }}>
                  {newLoading ? 'Kreiranje...' : 'Kreiraj'}
                </button>
                <button type="button" onClick={() => { setCreating(false); setNewError('') }} style={{ background: 'transparent', color: 'var(--textMuted)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 16px', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, cursor: 'pointer' }}>
                  Otkaži
                </button>
              </div>
            </form>
          )}

          {/* Users list */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif" }}>
              Učitavam korisnike...
            </div>
          ) : users.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif" }}>
              Nema korisnika. Dodajte prvog klikom na dugme iznad.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {users.map(u => (
                <UserRow
                  key={u.id}
                  user={u}
                  adminProjects={projects}
                  organizations={organizations}
                  isSuperAdmin={isSuperAdmin}
                  onDelete={() => handleDeleteUser(u.id)}
                  onEdit={(body) => handleEditUser(u.id, body)}
                  onAssign={(projectId) => handleAssignProject(u.id, projectId)}
                  onUnassign={(projectId) => handleUnassignProject(u.id, projectId)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function UserRow({ user, adminProjects, organizations, isSuperAdmin, onDelete, onEdit, onAssign, onUnassign }) {
  const [selectedProject, setSelectedProject] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({ name: user.name, email: user.email, role: user.role, password: '', organizationId: user.organizationId || '' })
  const [editError, setEditError] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  const isUserRole = user.role === 'user'
  const roleColors = ROLE_COLORS[user.role] || ROLE_COLORS.user
  const assignedIds = new Set((user.projects || []).map(p => p.id))
  const availableProjects = adminProjects.filter(p => !assignedIds.has(p.id))

  async function handleSaveEdit(e) {
    e.preventDefault()
    setEditError('')
    setEditLoading(true)
    try {
      await onEdit({
        ...editForm,
        organizationId: editForm.organizationId ? parseInt(editForm.organizationId) : null,
      })
      setEditMode(false)
    } catch (err) {
      setEditError(err.message)
    } finally {
      setEditLoading(false)
    }
  }

  return (
    <div style={{
      padding: '14px 16px',
      background: 'var(--surfaceAlt)',
      border: `1px solid ${roleColors.border}`,
      borderRadius: 10,
    }}>
      {/* User info row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: editMode ? 14 : (isUserRole ? 10 : 0) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: roleColors.text, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
            {user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{user.name}</span>
              <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 20, background: roleColors.bg, color: roleColors.text, border: `1px solid ${roleColors.border}` }}>
                {ROLE_LABELS[user.role] || user.role}
              </span>
              {user.organizationName && (
                <span style={{ fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 11, color: 'var(--textMuted)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 20, padding: '1px 8px' }}>
                  {user.organizationName}
                </span>
              )}
            </div>
            <div style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--textMuted)' }}>{user.email}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => { setEditMode(m => !m); setEditError(''); setEditForm({ name: user.name, email: user.email, role: user.role, password: '', organizationId: user.organizationId || '' }) }}
            style={{ background: editMode ? 'var(--surfaceAlt)' : 'transparent', color: 'var(--textMuted)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, cursor: 'pointer', transition: 'all 0.2s ease' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--textMuted)' }}
          >
            {editMode ? 'Otkaži' : 'Izmeni'}
          </button>
          <button onClick={onDelete}
            style={{ background: 'transparent', color: 'var(--red)', border: '1px solid #EF444430', borderRadius: 6, padding: '4px 10px', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, cursor: 'pointer', transition: 'all 0.2s ease' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--redTint)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            Obriši
          </button>
        </div>
      </div>

      {/* Edit form */}
      {editMode && (
        <form onSubmit={handleSaveEdit} style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 130px 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={labelStyle}>IME</label>
              <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} required style={inputStyle} onFocus={e => e.target.style.borderColor = 'var(--accent)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
            </div>
            <div>
              <label style={labelStyle}>EMAIL</label>
              <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} required style={inputStyle} onFocus={e => e.target.style.borderColor = 'var(--accent)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
            </div>
            <div>
              <label style={labelStyle}>ULOGA</label>
              <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="user">Korisnik</option>
                <option value="admin">Admin</option>
                {isSuperAdmin && <option value="super_admin">Super Admin</option>}
              </select>
            </div>
            <div>
              <label style={labelStyle}>NOVA LOZINKA</label>
              <input type="password" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} placeholder="(ne menjati)" style={inputStyle} onFocus={e => e.target.style.borderColor = 'var(--accent)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
            </div>
          </div>
          {editForm.role === 'user' && (
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>ORGANIZACIJA</label>
              <select value={editForm.organizationId} onChange={e => setEditForm(f => ({ ...f, organizationId: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer', maxWidth: 280 }}>
                <option value="">Bez organizacije</option>
                {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          {editError && <div style={{ marginBottom: 10, padding: '7px 12px', background: 'var(--redTint)', border: '1px solid #EF444430', borderRadius: 6, color: 'var(--red)', fontSize: 12 }}>{editError}</div>}
          <button type="submit" disabled={editLoading} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 18px', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, fontSize: 13, cursor: editLoading ? 'not-allowed' : 'pointer', opacity: editLoading ? 0.7 : 1 }}>
            {editLoading ? 'Čuvam...' : 'Sačuvaj izmene'}
          </button>
        </form>
      )}

      {/* Assigned projects — users only */}
      {isUserRole && !editMode && (
        <>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: "'Hanken Grotesk'", fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--textMuted)', marginBottom: 6 }}>
              Projekti
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(user.projects || []).length === 0 ? (
                <span style={{ fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, color: 'var(--textSubtle)', fontStyle: 'italic' }}>Nema dodeljenih projekata</span>
              ) : (
                (user.projects || []).map(p => (
                  <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(79,142,247,0.1)', border: '1px solid rgba(79,142,247,0.25)', borderRadius: 20, padding: '3px 10px', fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--accent)' }}>
                    {p.displayName || p.epicKey}
                    <button onClick={() => onUnassign(p.id)} style={{ background: 'transparent', border: 'none', color: 'var(--textMuted)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--textMuted)'}
                    >×</button>
                  </span>
                ))
              )}
            </div>
          </div>
          {availableProjects.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", cursor: 'pointer' }}>
                <option value="">Dodeli projekat...</option>
                {availableProjects.map(p => <option key={p.id} value={p.id}>{p.displayName || p.epicKey}</option>)}
              </select>
              <button onClick={() => { if (selectedProject) { onAssign(selectedProject); setSelectedProject('') } }} disabled={!selectedProject}
                style={{ background: selectedProject ? 'var(--accent)' : 'var(--border)', color: selectedProject ? '#fff' : 'var(--textMuted)', border: 'none', borderRadius: 6, padding: '5px 12px', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, cursor: selectedProject ? 'pointer' : 'not-allowed', transition: 'all 0.2s ease' }}
              >
                Dodeli
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const labelStyle = {
  display: 'block', fontSize: 10, fontFamily: "'Hanken Grotesk'",
  textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--textMuted)', marginBottom: 5,
}

const inputStyle = {
  width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 7, padding: '8px 12px', color: 'var(--text)', fontSize: 13,
  fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
  transition: 'border-color 0.2s',
}
