import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api.js'
import { useT } from '../lang.jsx'

const JQL_OPERATORS = ['=', '!=', '~', '!~', '<', '<=', '>', '>=', 'IN', 'NOT IN', 'IS', 'IS NOT', 'WAS', 'WAS IN', 'WAS NOT IN', 'CHANGED']
const JQL_KEYWORDS = ['AND', 'OR', 'NOT', 'ORDER BY', 'ASC', 'DESC', 'EMPTY', 'NULL']
const JQL_FUNCTIONS = ['currentUser()', 'membersOf()', 'now()', 'startOfDay()', 'endOfDay()', 'startOfWeek()', 'endOfWeek()', 'startOfMonth()', 'endOfMonth()', 'startOfYear()', 'endOfYear()']

const OP_PATTERN = /(?:=|!=|~|!~|<=?|>=?|(?:not\s+)?in\b|is(?:\s+not)?\b|was(?:\s+(?:not\s+)?in\b)?|changed\b)/i

function parseCursorContext(text, cursorPos) {
  const before = text.slice(0, cursorPos)

  // Token: what's at the cursor right now (strip leading quote for matching)
  const tokenMatch = before.match(/[\w\[\]"'.-]+$/)
  const currentToken = tokenMatch ? tokenMatch[0].replace(/^"/, '') : ''
  const tokenStart = cursorPos - (tokenMatch ? tokenMatch[0].length : 0)

  // Inside an open quoted value: field = "|cursor
  const openQuoteMatch = before.match(/(?:"([^"]+)"|(\w[\w\[\].-]*))\s*(?:=|!=|~|!~|<=?|>=?|in\b|not\s+in\b|is\b)\s*"([^"]*)$/i)
  if (openQuoteMatch) {
    const field = openQuoteMatch[1] || openQuoteMatch[2] || ''
    const valueToken = openQuoteMatch[3] || ''
    return { type: 'value', field, token: valueToken, tokenStart }
  }

  // After an operator (even with empty token): field = |cursor  or  field = val|cursor
  const afterOpMatch = before.match(/(?:"([^"]+)"|(\w[\w\[\].-]*))\s*(?:=|!=|~|!~|<=?|>=?|(?:not\s+)?in\b|is(?:\s+not)?\b|was(?:\s+(?:not\s+)?in\b)?|changed\b)\s*([\w"'(]*)$/i)
  if (afterOpMatch) {
    const field = afterOpMatch[1] || afterOpMatch[2] || ''
    return { type: 'value', field, token: currentToken, tokenStart }
  }

  // After a field name — operator context
  const stripped = before.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''")
  const afterField = stripped.match(/(\w[\w\[\].-]*)\s+([\w!<>=]*)$/i)
  if (afterField && !JQL_KEYWORDS.includes(afterField[1].toUpperCase())) {
    return { type: 'operator', field: afterField[1], token: currentToken, tokenStart }
  }

  return { type: 'field', field: '', token: currentToken, tokenStart }
}

// JQL looks "runnable" when it has at least one operator + value
const JQL_READY_RE = /\b(?:=|!=|~|!~|<=?|>=?|IN|IS|WAS|CHANGED)\s*\S/i

// ── Live Preview Badge ─────────────────────────────────────────────────────────

function LivePreview({ jql }) {
  const [state, setState] = useState(null) // null | {loading} | {count} | {error}
  const timerRef = useRef(null)
  const lastJql = useRef('')
  const t = useT()

  useEffect(() => {
    const q = jql?.trim() || ''
    if (!q || !JQL_READY_RE.test(q)) { setState(null); return }
    if (q === lastJql.current) return

    clearTimeout(timerRef.current)
    setState({ loading: true })

    timerRef.current = setTimeout(async () => {
      try {
        const data = await api.testJql(q)
        lastJql.current = q
        setState({ count: data.count })
      } catch (err) {
        setState({ error: err.message || t('jql.invalid') })
      }
    }, 900)

    return () => clearTimeout(timerRef.current)
  }, [jql])

  if (!state) return null

  if (state.loading) return (
    <span style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textSubtle)', marginLeft: 6 }}>···</span>
  )
  if (state.error) return (
    <span style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 11, color: 'var(--red)', marginLeft: 6 }} title={state.error}>
      ✗ {state.error.length > 60 ? state.error.slice(0, 60) + '…' : state.error}
    </span>
  )
  return (
    <span style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--green)', marginLeft: 6 }}>
      ✓ {t('jql.issues', { count: state.count })}
    </span>
  )
}

// ── JQL static analysis ────────────────────────────────────────────────────────

const WRONG_FIELDS = {
  updatedDate:    'updated',
  createdDate:    'created',
  dueDate:        'due',
  resolutionDate: 'resolutiondate',
  reporterEmail:  'reporter',
  assigneeEmail:  'assignee',
}

// DD.MM.YYYY or DD/MM/YYYY
const DATE_DMY_RE = /\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/g

function analyzeJql(jql) {
  if (!jql?.trim()) return []
  const hints = []

  for (const [wrong, correct] of Object.entries(WRONG_FIELDS)) {
    if (new RegExp(`\\b${wrong}\\b`, 'i').test(jql)) {
      hints.push({
        message: `"${wrong}" nije validan JQL field — koristi "${correct}"`,
        fix: q => q.replace(new RegExp(`\\b${wrong}\\b`, 'gi'), correct),
      })
    }
  }

  const dateMatches = [...jql.matchAll(DATE_DMY_RE)]
  if (dateMatches.length > 0) {
    const ex = dateMatches[0]
    const d = ex[1].padStart(2, '0'), m = ex[2].padStart(2, '0'), y = ex[3]
    hints.push({
      message: `Format datuma "${ex[0]}" nije validan — treba "${y}-${m}-${d}"`,
      fix: q => q.replace(DATE_DMY_RE, (_, dd, mm, yyyy) =>
        `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`),
    })
  }

  // Unquoted value with spaces/hyphens after = or !=  (but not already quoted)
  const unquotedRe = /\b(\w[\w[\].]*)\s*(?:=|!=)\s*(?!")([A-Za-z\u00C0-\u024F][A-Za-z0-9\u00C0-\u024F]*[-\s][^\s,)AND]+)/g
  for (const m of jql.matchAll(unquotedRe)) {
    const val = m[2].trimEnd()
    hints.push({
      message: `Vrednost "${val}" sadrži specijalne karaktere — treba u navodnicima`,
      fix: q => q.replace(m[0], m[0].replace(val, `"${val}"`)),
    })
    break // one hint is enough
  }

  return hints
}

function JqlHints({ jql, onChange }) {
  const hints = analyzeJql(jql)
  if (!hints.length) return null
  return (
    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {hints.map((hint, i) => (
        <div key={i} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 10px',
          background: 'var(--amberTint)',
          border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 6,
        }}>
          <span style={{ fontSize: 12, flexShrink: 0 }}>⚠</span>
          <span style={{
            fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 12,
            color: 'var(--amber)',
            flex: 1,
          }}>
            {hint.message}
          </span>
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); onChange(hint.fix(jql)) }}
            style={{
              flexShrink: 0,
              background: 'transparent',
              border: '1px solid var(--amber)',
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 11,
              fontFamily: "'DM Mono'",
              color: 'var(--amber)',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.15)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            Primeni
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Main JqlEditor ─────────────────────────────────────────────────────────────

export default function JqlEditor({ value, onChange, placeholder, rows = 4, showPreview = true, style = {} }) {
  const [fields, setFields] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [open, setOpen] = useState(false)
  const [context, setContext] = useState(null)
  const textareaRef = useRef(null)
  const dropdownRef = useRef(null)
  const pendingRef = useRef(null)

  useEffect(() => {
    api.getJqlFields().then(f => setFields(f || [])).catch(() => {})
  }, [])

  const fetchSuggestions = useCallback(async (ctx) => {
    if (!ctx) { setSuggestions([]); setOpen(false); return }
    // For non-value types, require at least one character
    if (!ctx.token && ctx.type !== 'value') { setSuggestions([]); setOpen(false); return }

    const q = ctx.token.toLowerCase()

    if (ctx.type === 'field') {
      const filtered = [
        ...fields.filter(f => f.value.toLowerCase().startsWith(q) || f.displayName.toLowerCase().startsWith(q)).slice(0, 10),
        ...JQL_KEYWORDS.filter(k => k.toLowerCase().startsWith(q)).map(k => ({ value: k, displayName: k, isKeyword: true })).slice(0, 5),
        ...JQL_FUNCTIONS.filter(f => f.toLowerCase().startsWith(q)).map(f => ({ value: f, displayName: f, isFunction: true })).slice(0, 3),
      ]
      setSuggestions(filtered)
      setOpen(filtered.length > 0)
      setActiveIdx(0)
    } else if (ctx.type === 'operator') {
      const filtered = JQL_OPERATORS.filter(op => op.toLowerCase().startsWith(q)).map(op => ({ value: op, displayName: op, isOperator: true }))
      setSuggestions(filtered)
      setOpen(filtered.length > 0)
      setActiveIdx(0)
    } else if (ctx.type === 'value' && ctx.field) {
      clearTimeout(pendingRef.current)
      pendingRef.current = setTimeout(async () => {
        try {
          const results = await api.getJqlSuggestions(ctx.field, ctx.token || '')
          const mapped = (results || []).slice(0, 12).map(r => ({ value: r.value, displayName: r.displayName || r.value, isValue: true }))
          setSuggestions(mapped)
          setOpen(mapped.length > 0)
          setActiveIdx(0)
        } catch { setSuggestions([]); setOpen(false) }
      }, 250)
    } else {
      setSuggestions([]); setOpen(false)
    }
  }, [fields])

  function handleChange(e) {
    const newVal = e.target.value
    onChange(newVal)
    const ctx = parseCursorContext(newVal, e.target.selectionStart)
    setContext(ctx)
    fetchSuggestions(ctx)
  }

  function handleKeyDown(e) {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      if (suggestions[activeIdx]) { e.preventDefault(); applySuggestion(suggestions[activeIdx]) }
    }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  function applySuggestion(suggestion) {
    if (!context || !textareaRef.current) return
    const ta = textareaRef.current
    const before = value.slice(0, context.tokenStart)
    const after = value.slice(ta.selectionStart)
    // Strip any outer quotes the API may already include (prevents double-quoting)
    const insert = suggestion.value.replace(/^"(.*)"$/, '$1')

    if (suggestion.isValue) {
      // Quote values that have spaces or non-ASCII chars (š, ž, ć, etc.)
      const needsQuotes = /[\s\u0080-\uFFFF]/.test(insert)
      const newVal = needsQuotes ? before + `"${insert}" ` + after : before + insert + ' ' + after
      onChange(newVal)
      setOpen(false)
      const pos = before.length + insert.length + (needsQuotes ? 3 : 1)
      setTimeout(() => { ta.focus(); ta.setSelectionRange(pos, pos) }, 0)
      return
    }

    // Field names: quote if has spaces or JQL-special chars (-, [, ], parentheses)
    const needsQuotes = !suggestion.isKeyword && !suggestion.isOperator && !suggestion.isFunction && /[\s\-()\[\]]/.test(insert)
    const quoted = needsQuotes ? `"${insert}"` : insert
    const newVal = before + quoted + ' ' + after
    onChange(newVal)
    setOpen(false)
    const pos = before.length + quoted.length + 1
    setTimeout(() => { ta.focus(); ta.setSelectionRange(pos, pos) }, 0)
  }

  useEffect(() => {
    function h(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) && e.target !== textareaRef.current) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={e => {
          const ctx = parseCursorContext(value, e.target.selectionStart)
          setContext(ctx)
          if (ctx.token || ctx.type === 'value') fetchSuggestions(ctx)
        }}
        onFocus={e => e.target.style.borderColor = 'var(--accent)'}
        onBlur={e => { e.target.style.borderColor = 'var(--border)'; setOpen(false) }}
        placeholder={placeholder}
        rows={rows}
        spellCheck={false}
        style={{
          width: '100%',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '9px 12px',
          color: 'var(--text)',
          fontSize: 13,
          fontFamily: "'DM Mono', monospace",
          lineHeight: 1.6,
          resize: 'vertical',
          boxSizing: 'border-box',
          outline: 'none',
          transition: 'border-color 0.15s',
          ...style,
        }}
      />

      <JqlHints jql={value} onChange={onChange} />

      {/* Live preview row */}
      {showPreview && (
        <div style={{ display: 'flex', alignItems: 'center', minHeight: 20, marginTop: 4 }}>
          <span style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textSubtle)', letterSpacing: '0.04em' }}>
            LIVE
          </span>
          <LivePreview jql={value} />
        </div>
      )}

      {/* Autocomplete dropdown */}
      {open && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            zIndex: 300,
            maxHeight: 220,
            overflowY: 'auto',
            scrollbarWidth: 'thin',
          }}
        >
          {suggestions.map((s, i) => (
            <button
              key={s.value + i}
              onMouseDown={e => { e.preventDefault(); applySuggestion(s) }}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '8px 12px',
                background: i === activeIdx ? 'rgba(79,142,247,0.1)' : 'transparent',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'background 0.1s',
              }}
            >
              <span style={{
                fontFamily: "'DM Mono'",
                fontSize: 9,
                padding: '1px 5px',
                borderRadius: 4,
                flexShrink: 0,
                background: s.isKeyword ? 'rgba(245,158,11,0.15)' : s.isOperator ? 'rgba(139,92,246,0.15)' : s.isFunction ? 'rgba(34,197,94,0.15)' : s.isValue ? 'rgba(79,142,247,0.15)' : 'var(--surfaceAlt)',
                color: s.isKeyword ? 'var(--amber)' : s.isOperator ? '#A78BFA' : s.isFunction ? 'var(--green)' : s.isValue ? 'var(--accent)' : 'var(--textMuted)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}>
                {s.isKeyword ? 'KW' : s.isOperator ? 'OP' : s.isFunction ? 'FN' : s.isValue ? 'VAL' : 'FLD'}
              </span>
              <span style={{ fontFamily: "'DM Mono'", fontSize: 13, color: i === activeIdx ? 'var(--accent)' : 'var(--text)', flex: 1 }}>
                {s.value}
              </span>
              {s.displayName && s.displayName !== s.value && (
                <span style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 11, color: 'var(--textMuted)', flexShrink: 0, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.displayName}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
