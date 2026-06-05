import { useState, useEffect } from 'react'
import BrainAnimation from '../components/BrainAnimation.jsx'
import { api } from '../api.js'
import JqlEditor from '../components/JqlEditor.jsx'
import { useT } from '../lang.jsx'

export default function AddProjectPage({ onAdd, onCancel }) {
  const t = useT()

  const TABS = [
    { id: 'epic', label: t('addProject.tab.epic') },
    { id: 'jql', label: t('addProject.tab.jql') },
    { id: 'combined', label: t('addProject.tab.combined') },
  ]
  const [tab, setTab] = useState('epic')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Epic tab state
  const [epicKey, setEpicKey] = useState('')
  const [epicName, setEpicName] = useState('')

  // JQL tab state
  const [jqlQuery, setJqlQuery] = useState('')
  const [jqlName, setJqlName] = useState('')
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testError, setTestError] = useState('')

  // Combined tab state
  const [cEpicKey, setCEpicKey] = useState('')
  const [cFixVersion, setCFixVersion] = useState('')
  const [cClientScope, setCClientScope] = useState('')
  const [cClientRequested, setCClientRequested] = useState('')
  const [cDateFrom, setCDateFrom] = useState('')
  const [cDateTo, setCDateTo] = useState('')
  const [cName, setCName] = useState('')
  const [cJql, setCJql] = useState('')

  // Reset results when tab changes
  useEffect(() => { setError(''); setTestResult(null); setTestError('') }, [tab])

  // Build JQL from combined filters
  const combinedJql = buildCombinedJql({ epicKey: cEpicKey, fixVersion: cFixVersion, clientScope: cClientScope, clientRequested: cClientRequested, dateFrom: cDateFrom, dateTo: cDateTo })

  // Sync JqlEditor when auto-built JQL changes
  useEffect(() => { if (tab === 'combined') setCJql(combinedJql) }, [combinedJql])

  async function handleTestJql() {
    const q = tab === 'jql' ? jqlQuery : combinedJql
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
      if (tab === 'epic') {
        if (!epicKey.trim()) { setError(t('addProject.err.epicRequired')); setLoading(false); return }
        await onAdd({ epicKey: epicKey.trim(), displayName: epicName.trim() || undefined, filterType: 'epic' })
      } else if (tab === 'jql') {
        if (!jqlQuery.trim()) { setError(t('addProject.err.jqlRequired')); setLoading(false); return }
        if (!jqlName.trim()) { setError(t('addProject.err.nameRequired')); setLoading(false); return }
        await onAdd({ displayName: jqlName.trim(), filterType: 'jql', filterJql: jqlQuery.trim() })
      } else {
        if (!cJql.trim()) { setError(t('addProject.err.filterRequired')); setLoading(false); return }
        if (!cName.trim()) { setError(t('addProject.err.nameRequired')); setLoading(false); return }
        const meta = { epicKey: cEpicKey, fixVersion: cFixVersion, clientScope: cClientScope, clientRequested: cClientRequested, dateFrom: cDateFrom, dateTo: cDateTo }
        await onAdd({ displayName: cName.trim(), filterType: 'combined', filterJql: cJql.trim(), filterMeta: meta, epicKey: cEpicKey || undefined })
      }
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
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
          <h1 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 22, color: 'var(--text)', marginBottom: 4 }}>{t('addProject.title')}</h1>
          <p style={{ color: 'var(--textMuted)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 14, marginBottom: 20 }}>
            {t('addProject.subtitle')}
          </p>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
            {TABS.map(tabItem => (
              <button
                key={tabItem.id}
                onClick={() => setTab(tabItem.id)}
                style={{
                  padding: '10px 20px',
                  fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
                  fontWeight: tab === tabItem.id ? 600 : 400,
                  fontSize: 14,
                  color: tab === tabItem.id ? 'var(--accent)' : 'var(--textMuted)',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: tab === tabItem.id ? '2px solid var(--accent)' : '2px solid transparent',
                  marginBottom: -1,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                {tabItem.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: '24px 32px 28px' }}>
          {tab === 'epic' && (
            <EpicTab t={t} epicKey={epicKey} setEpicKey={setEpicKey} displayName={epicName} setDisplayName={setEpicName} />
          )}
          {tab === 'jql' && (
            <JqlTab
              t={t}
              jql={jqlQuery} setJql={setJqlQuery}
              name={jqlName} setName={setJqlName}
              onTest={handleTestJql} testLoading={testLoading}
              testResult={testResult} testError={testError}
            />
          )}
          {tab === 'combined' && (
            <CombinedTab
              t={t}
              epicKey={cEpicKey} setEpicKey={setCEpicKey}
              fixVersion={cFixVersion} setFixVersion={setCFixVersion}
              clientScope={cClientScope} setClientScope={setCClientScope}
              clientRequested={cClientRequested} setClientRequested={setCClientRequested}
              dateFrom={cDateFrom} setDateFrom={setCDateFrom}
              dateTo={cDateTo} setDateTo={setCDateTo}
              name={cName} setName={setCName}
              jql={cJql} setJql={setCJql}
              onTest={handleTestJql} testLoading={testLoading}
              testResult={testResult} testError={testError}
            />
          )}

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
            {loading ? t('addProject.submitting') : t('addProject.submit')}
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

function CombinedTab({ t, epicKey, setEpicKey, fixVersion, setFixVersion, clientScope, setClientScope, clientRequested, setClientRequested, dateFrom, setDateFrom, dateTo, setDateTo, name, setName, jql, setJql, onTest, testLoading, testResult, testError }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>{t('addProject.combined.epicKey')}</label>
          <input value={epicKey} onChange={e => setEpicKey(e.target.value)} placeholder="PROJECT-184" style={inputStyle} onFocus={e => e.target.style.borderColor = 'var(--accent)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
        </div>
        <div>
          <label style={labelStyle}>{t('addProject.combined.fixVersion')}</label>
          <input value={fixVersion} onChange={e => setFixVersion(e.target.value)} placeholder={t('addProject.combined.fixVersionPlaceholder')} style={inputStyle} onFocus={e => e.target.style.borderColor = 'var(--accent)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
        </div>
        <div>
          <label style={labelStyle}>{t('addProject.combined.clientScope')}</label>
          <input value={clientScope} onChange={e => setClientScope(e.target.value)} placeholder={t('addProject.combined.clientRequestedPlaceholder')} style={inputStyle} onFocus={e => e.target.style.borderColor = 'var(--accent)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
        </div>
        <div>
          <label style={labelStyle}>{t('addProject.combined.clientRequested')}</label>
          <input value={clientRequested} onChange={e => setClientRequested(e.target.value)} placeholder={t('addProject.combined.clientRequestedPlaceholder')} style={inputStyle} onFocus={e => e.target.style.borderColor = 'var(--accent)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
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

function buildCombinedJql({ epicKey, fixVersion, clientScope, clientRequested, dateFrom, dateTo }) {
  const parts = []
  if (epicKey?.trim()) parts.push(`parent = ${epicKey.trim().toUpperCase()}`)
  if (fixVersion?.trim()) parts.push(`fixVersion = "${fixVersion.trim()}"`)
  if (clientScope?.trim()) parts.push(`cf[11529] = "${clientScope.trim()}"`)
  if (clientRequested?.trim()) parts.push(`"Client Requested" = "${clientRequested.trim()}"`)
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
