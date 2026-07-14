import { useState, useEffect, useRef } from 'react'
import BrainAnimation from '../components/BrainAnimation.jsx'
import { api } from '../api.js'
import JqlEditor from '../components/JqlEditor.jsx'
import { useT } from '../lang.jsx'

// Normalize a stored filterMeta value to picker shape [{ value, label }].
// Old projects stored plain strings; new ones store arrays already.
function asPick(v) {
  if (Array.isArray(v)) return v.filter(x => x && x.value != null)
  const s = String(v || '').trim()
  return s ? [{ value: s, label: s }] : []
}
function parseMeta(project) {
  if (!project?.filterMeta) return {}
  try { return typeof project.filterMeta === 'string' ? JSON.parse(project.filterMeta) : project.filterMeta } catch { return {} }
}

export default function AddProjectPage({ onAdd, onCancel, editProject = null }) {
  const t = useT()
  const initMeta = parseMeta(editProject)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testError, setTestError] = useState('')

  // Combined state — prefilled from editProject's filterMeta when editing
  const [cEpicKey, setCEpicKey] = useState(initMeta.epicKey || (editProject?.filterType === 'epic' ? editProject?.epicKey || '' : ''))
  const [cProject, setCProject] = useState(asPick(initMeta.project))
  const [cStatus, setCStatus] = useState(asPick(initMeta.status))
  const [cFixVersion, setCFixVersion] = useState(asPick(initMeta.fixVersion))
  const [cClientScope, setCClientScope] = useState(asPick(initMeta.clientScope))
  const [cClientRequested, setCClientRequested] = useState(asPick(initMeta.clientRequested))
  const [cDateFrom, setCDateFrom] = useState(initMeta.dateFrom || '')
  const [cDateTo, setCDateTo] = useState(initMeta.dateTo || '')
  const [cSprints, setCSprints] = useState(asPick(initMeta.sprints))
  const [cName, setCName] = useState(editProject ? (editProject.displayName || editProject.epicKey || '') : '')
  const [cJql, setCJql] = useState(editProject?.filterJql || '')

  // Build JQL from combined filters
  const combinedJql = buildCombinedJql({ epicKey: cEpicKey, project: cProject, fixVersion: cFixVersion, clientScope: cClientScope, clientRequested: cClientRequested, sprints: cSprints, status: cStatus, dateFrom: cDateFrom, dateTo: cDateTo })

  // Sync JqlEditor when the auto-built JQL changes (manual edits survive until a
  // filter changes). In edit mode skip the mount sync so the stored JQL isn't
  // overwritten (legacy JQL-only projects have empty meta → empty combinedJql).
  const skipFirstSync = useRef(!!editProject)
  useEffect(() => {
    if (skipFirstSync.current) { skipFirstSync.current = false; return }
    setCJql(combinedJql)
  }, [combinedJql])

  async function handleTestJql() {
    const q = cJql || combinedJql
    if (!q.trim()) return
    setTestLoading(true)
    setTestResult(null)
    setTestError('')
    try {
      const res = await api.testJql(q)
      setTestResult(res)
    } catch (err) {
      setTestError(err.message)
    } finally {
      setTestLoading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (!cJql.trim()) { setError(t('addProject.err.filterRequired')); setLoading(false); return }
      if (!cName.trim()) { setError(t('addProject.err.nameRequired')); setLoading(false); return }
      const meta = { epicKey: cEpicKey, project: cProject, fixVersion: cFixVersion, clientScope: cClientScope, clientRequested: cClientRequested, sprints: cSprints, status: cStatus, dateFrom: cDateFrom, dateTo: cDateTo }
      await onAdd({ displayName: cName.trim(), filterType: 'combined', filterJql: cJql.trim(), filterMeta: meta, epicKey: cEpicKey || undefined })
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 500, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 20px', overflowY: 'auto' }}>
      <BrainAnimation opacity={0.35} fullscreen />

      <button
        onClick={onCancel}
        style={{ position: 'absolute', top: 20, left: 20, zIndex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', color: 'var(--textMuted)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 14, cursor: 'pointer', transition: 'all 0.2s ease' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--borderHover)'; e.currentTarget.style.color = 'var(--text)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--textMuted)' }}
      >
        ← {t('addProject.back')}
      </button>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 560, background: 'var(--surface)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '28px 32px 0' }}>
          <h1 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 22, color: 'var(--text)', marginBottom: 4 }}>{editProject ? 'Izmeni projekat' : t('addProject.title')}</h1>
          <p style={{ color: 'var(--textMuted)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 14, marginBottom: 20 }}>
            {t('addProject.subtitle')}
          </p>

        </div>

        {/* Body — single unified form */}
        <form onSubmit={handleSubmit} style={{ padding: '24px 32px 28px' }}>
          <CombinedTab
            t={t}
            epicKey={cEpicKey} setEpicKey={setCEpicKey}
            project={cProject} setProject={setCProject}
            status={cStatus} setStatus={setCStatus}
            fixVersion={cFixVersion} setFixVersion={setCFixVersion}
            clientScope={cClientScope} setClientScope={setCClientScope}
            clientRequested={cClientRequested} setClientRequested={setCClientRequested}
            dateFrom={cDateFrom} setDateFrom={setCDateFrom}
            dateTo={cDateTo} setDateTo={setCDateTo}
            sprints={cSprints} setSprints={setCSprints}
            name={cName} setName={setCName}
            jql={cJql} setJql={setCJql}
            onTest={handleTestJql} testLoading={testLoading}
            testResult={testResult} testError={testError}
          />

          {error && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--redTint)', border: '1px solid #EF444430', borderRadius: 8, color: 'var(--red)', fontSize: 13, fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', background: 'var(--accent)', color: '#fff', borderRadius: 8, padding: '11px', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', border: 'none', opacity: loading ? 0.7 : 1, transition: 'all 0.2s ease' }}
          >
            {loading ? t('addProject.submitting') : (editProject ? 'Sačuvaj izmene' : t('addProject.submit'))}
          </button>
        </form>
      </div>
    </div>
  )
}

function EpicTab({ t, epicKey, setEpicKey, displayName, setDisplayName }) {
  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>{t('addProject.epic.key')}</label>
        <input value={epicKey} onChange={e => setEpicKey(e.target.value)} placeholder={t('addProject.epic.keyPlaceholder')} required autoFocus style={inputStyle} onFocus={e => e.target.style.borderColor = 'var(--accent)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
      </div>
      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>{t('addProject.epic.name')}</label>
        <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={t('addProject.epic.namePlaceholder')} style={inputStyle} onFocus={e => e.target.style.borderColor = 'var(--accent)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
      </div>
    </>
  )
}

function JqlTab({ t, jql, setJql, name, setName, onTest, testLoading, testResult, testError }) {
  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>{t('addProject.jql.query')}</label>
        <JqlEditor
          value={jql}
          onChange={setJql}
          placeholder={"npr. cf[11529] = 'Knjaz Miloš Srbija' AND created >= -60d"}
          rows={4}
        />
        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onTest}
            disabled={testLoading || !jql.trim()}
            style={{ background: 'transparent', border: '1px solid var(--accent)', borderRadius: 6, padding: '5px 14px', color: 'var(--accent)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, cursor: testLoading || !jql.trim() ? 'not-allowed' : 'pointer', opacity: !jql.trim() ? 0.5 : 1, transition: 'all 0.2s ease' }}
          >
            {testLoading ? t('addProject.jql.testing') : t('addProject.jql.test')}
          </button>
        </div>
        <TestResult t={t} result={testResult} error={testError} jql={jql} />
      </div>
      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>{t('addProject.projectName')}</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder={t('addProject.jql.namePlaceholder')} style={inputStyle} onFocus={e => e.target.style.borderColor = 'var(--accent)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
      </div>
    </>
  )
}

function CombinedTab({ t, epicKey, setEpicKey, project, setProject, status, setStatus, fixVersion, setFixVersion, clientScope, setClientScope, clientRequested, setClientRequested, dateFrom, setDateFrom, dateTo, setDateTo, sprints, setSprints, name, setName, jql, setJql, onTest, testLoading, testResult, testError }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Projekat</label>
          <FieldSelect fieldName="project" values={project} onChange={setProject} placeholder="npr. Pricing project" />
        </div>
        <div>
          <label style={labelStyle}>{t('addProject.combined.epicKey')}</label>
          <input value={epicKey} onChange={e => setEpicKey(e.target.value)} placeholder="PROJECT-184" style={inputStyle} onFocus={e => e.target.style.borderColor = 'var(--accent)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
        </div>
        <div>
          <label style={labelStyle}>{t('addProject.combined.fixVersion')}</label>
          <FieldSelect fieldName="fixVersion" values={fixVersion} onChange={setFixVersion} placeholder="npr. 6.6 Gallium" />
        </div>
        <div>
          <label style={labelStyle}>{t('addProject.combined.clientScope')}</label>
          <FieldSelect fieldName="Client - Impact Scope" values={clientScope} onChange={setClientScope} placeholder="npr. General" />
        </div>
        <div>
          <label style={labelStyle}>{t('addProject.combined.clientRequested')}</label>
          <FieldSelect fieldName="Client Requested" values={clientRequested} onChange={setClientRequested} placeholder="npr. Wurth" />
        </div>
        <div>
          <label style={labelStyle}>Status</label>
          <FieldSelect fieldName="status" values={status} onChange={setStatus} placeholder="npr. Resolved, Closed" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={labelStyle}>{t('addProject.combined.dateFrom')}</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} onFocus={e => e.target.style.borderColor = 'var(--accent)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
          </div>
          <div>
            <label style={labelStyle}>{t('addProject.combined.dateTo')}</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} onFocus={e => e.target.style.borderColor = 'var(--accent)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
          </div>
        </div>
      </div>

      {/* Sprint — picked by name, JQL uses the id (so you never type sprint ids) */}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Sprint</label>
        <FieldSelect fieldName="Sprint" values={sprints} onChange={setSprints} placeholder="npr. grooming" />
      </div>

      {/* JQL editor */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>{t('addProject.jql.query')}</label>
        <JqlEditor
          value={jql}
          onChange={setJql}
          placeholder={t('addProject.combined.jqlPlaceholder')}
          rows={3}
        />
        {jql.trim() && (
          <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onTest}
              disabled={testLoading}
              style={{ background: 'transparent', border: '1px solid var(--accent)', borderRadius: 6, padding: '5px 14px', color: 'var(--accent)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, cursor: testLoading ? 'not-allowed' : 'pointer', transition: 'all 0.2s ease' }}
            >
              {testLoading ? t('addProject.jql.testing') : t('addProject.jql.test')}
            </button>
          </div>
        )}
        <TestResult t={t} result={testResult} error={testError} jql={jql} />
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>{t('addProject.projectName')}</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder={t('addProject.jql.namePlaceholder')} style={inputStyle} onFocus={e => e.target.style.borderColor = 'var(--accent)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
      </div>
    </>
  )
}

const WRONG_FIELDS_MAP = {
  updatedDate:    'updated',
  createdDate:    'created',
  dueDate:        'due',
  resolutionDate: 'resolutiondate',
  reporterEmail:  'reporter',
  assigneeEmail:  'assignee',
}

function enrichJiraError(error, jql) {
  const msg = error || ''
  const suggestions = []

  // Wrong field name in JQL or in error message
  for (const [wrong, correct] of Object.entries(WRONG_FIELDS_MAP)) {
    const inJql = jql && new RegExp(`\\b${wrong}\\b`, 'i').test(jql)
    const inMsg = new RegExp(wrong, 'i').test(msg)
    if (inJql || inMsg) {
      suggestions.push(`"${wrong}" nije validan JQL field — zameni sa "${correct}"`)
    }
  }

  // Field does not exist (generic)
  const noFieldMatch = msg.match(/[Ff]ield\s+['"']?(\w+)['"']?\s+does not exist/i)
    || msg.match(/['"'](\w+)['"']\s+does not exist/i)
  if (noFieldMatch) {
    const f = noFieldMatch[1]
    if (!suggestions.some(s => s.includes(f))) {
      const fix = WRONG_FIELDS_MAP[f]
      suggestions.push(fix
        ? `Field "${f}" ne postoji — koristi "${fix}"`
        : `Field "${f}" ne postoji ili nemaš pristup`)
    }
  }

  // Date format
  const badDate = jql?.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/)
  const dateInError = /date|pars/i.test(msg)
  if (badDate) {
    const [, dd, mm, yyyy] = badDate
    suggestions.push(`Format datuma "${badDate[0]}" nije validan — Jira zahteva "YYYY-MM-DD", npr. "${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}"`)
  } else if (dateInError && !badDate) {
    suggestions.push('Datumi moraju biti u formatu "YYYY-MM-DD", npr. "2026-01-02"')
  }

  // Operator not supported
  const opMatch = msg.match(/operator\s+['"']?([^'"]+)['"']?\s+is not supported/i)
  if (opMatch && !suggestions.length) {
    suggestions.push(`Operator ${opMatch[1]} nije podržan za ovaj field`)
  }

  return suggestions
}

function TestResult({ t, result, error, jql }) {
  if (error) {
    const hints = enrichJiraError(error, jql)
    return (
      <div style={{ marginTop: 8, borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', background: 'var(--redTint)', border: '1px solid #EF444430', color: 'var(--red)', fontSize: 12, fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}>
          <span style={{ fontFamily: "'DM Mono'", marginRight: 6 }}>✗</span>{error}
        </div>
        {hints.length > 0 && (
          <div style={{ padding: '8px 12px', background: 'var(--amberTint)', border: '1px solid rgba(245,158,11,0.25)', borderTop: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {hints.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 12, fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", color: 'var(--amber)' }}>
                <span style={{ flexShrink: 0 }}>→</span>
                <span>{h}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
  if (!result) return null
  return (
    <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--greenTint)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 6 }}>
      <div style={{ fontFamily: "'DM Mono'", fontSize: 12, color: 'var(--green)', marginBottom: result.preview.length ? 8 : 0 }}>
        ✓ {t('addProject.found', { count: result.count })}
      </div>
      {result.preview.map(p => (
        <div key={p.key} style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 3 }}>
          <span style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--accent)', flexShrink: 0 }}>{p.key}</span>
          <span style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, color: 'var(--textMuted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.summary}</span>
          <span style={{ fontFamily: "'DM Mono'", fontSize: 10, color: 'var(--textSubtle)', flexShrink: 0 }}>{p.status}</span>
        </div>
      ))}
    </div>
  )
}

// Generic Jira field picker: type a value, we resolve it via JQL autocomplete.
// Stores [{ value, label }] — value goes into JQL, label is shown as a chip.
function FieldSelect({ fieldName, values, onChange, placeholder }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState([])
  const [loading, setLoading] = useState(false)
  const tRef = useRef(null)
  const mergeIn = list => setOpts(prev => { const m = new Map(prev.map(o => [o.value, o])); for (const o of (list || [])) m.set(o.value, o); return [...m.values()] })
  useEffect(() => {
    if (!open) return undefined
    clearTimeout(tRef.current)
    tRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await api.getJqlSuggestions(fieldName, q)
        mergeIn((r || []).map(x => ({ value: x.value, label: (x.displayName || x.value || '').replace(/<\/?b>/gi, '') })))
      } catch { /* keep */ } finally { setLoading(false) }
    }, 220)
    return () => clearTimeout(tRef.current)
  }, [q, open]) // eslint-disable-line
  const chosen = new Set(values.map(v => v.value))
  const ql = q.trim().toLowerCase()
  const free = opts.filter(o => !chosen.has(o.value) && (!ql || o.label.toLowerCase().includes(ql)))
  const add = o => { if (!chosen.has(o.value)) onChange([...values, o]); setQ('') }
  const addManual = () => { const val = q.trim(); if (val && !values.some(v => v.value === val)) onChange([...values, { value: val, label: val }]); setQ('') }
  const remove = v => onChange(values.filter(x => x.value !== v))
  const chip = { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 6px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--text)' }
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 8px', minHeight: 38, alignItems: 'center' }}>
        {values.map(v => (
          <span key={v.value} style={chip}>{v.label}<button type="button" onMouseDown={e => { e.preventDefault(); remove(v.value) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--textMuted)', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button></span>
        ))}
        <input value={q} onChange={e => setQ(e.target.value)} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 160)}
          onKeyDown={e => { if (e.key === 'Enter' && q.trim()) { e.preventDefault(); addManual() } }}
          placeholder={values.length ? '' : (placeholder || 'Kucaj za pretragu…')}
          style={{ flex: '1 1 120px', minWidth: 100, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: '2px' }} />
      </div>
      {open && (loading || free.length > 0) && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.18)', maxHeight: 240, overflowY: 'auto' }}>
          {loading && <div style={{ padding: '8px 10px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--textMuted)' }}>Učitavam…</div>}
          {!loading && free.map(o => (
            <button key={o.value} type="button" onMouseDown={e => { e.preventDefault(); add(o) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', padding: '7px 10px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--text)' }}>
              {o.label}
            </button>
          ))}
          {!loading && free.length === 0 && <div style={{ padding: '8px 10px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--textMuted)' }}>Nema predloga — Enter da dodaš ručno</div>}
        </div>
      )}
    </div>
  )
}

// Quote each picked value for JQL: numeric ids unquoted (e.g. sprint), rest quoted.
function jqlList(arr) {
  return (arr || []).map(v => {
    const s = String(v.value)
    return /^\d+$/.test(s) ? s : `"${s.replace(/"/g, '')}"`
  }).join(', ')
}
function buildCombinedJql({ epicKey, project, fixVersion, clientScope, clientRequested, sprints, status, dateFrom, dateTo }) {
  const parts = []
  if (project?.length) parts.push(`project in (${jqlList(project)})`)
  if (epicKey?.trim()) parts.push(`parent = ${epicKey.trim().toUpperCase()}`)
  if (fixVersion?.length) parts.push(`fixVersion in (${jqlList(fixVersion)})`)
  if (clientScope?.length) parts.push(`"Client - Impact Scope" in (${jqlList(clientScope)})`)
  if (clientRequested?.length) parts.push(`"Client Requested" in (${jqlList(clientRequested)})`)
  if (sprints?.length) parts.push(`Sprint in (${jqlList(sprints)})`)
  if (status?.length) parts.push(`status in (${jqlList(status)})`)
  if (dateFrom) parts.push(`created >= "${dateFrom}"`)
  if (dateTo) parts.push(`created <= "${dateTo}"`)
  return parts.length ? parts.join(' AND ') + ' ORDER BY created ASC' : ''
}

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontFamily: "'DM Mono'",
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--textMuted)',
  marginBottom: 6,
}

const inputStyle = {
  width: '100%',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '10px 14px',
  color: 'var(--text)',
  fontSize: 14,
  fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  transition: 'border-color 0.2s',
  boxSizing: 'border-box',
}
