import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { api } from '../../api.js'
import { statusCat } from './uiHelpers.js'

// Parse a previously published note's HTML back into { [taskKey]: { name, description } }.
function parseNoteHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const result = {}
  doc.querySelectorAll('.task-card').forEach(card => {
    const summaryEl = card.querySelector('.task-summary')
    const descInner = card.querySelector('.task-desc-inner')
    // Task key across note generations: data-key (current) → key badge in the
    // title row (old) → /browse/KEY href from the brief linked-title era.
    let key = (card.dataset?.key || '').trim()
    if (!key) key = card.querySelector('.task-row .key-badge')?.textContent.trim() || ''
    if (!key) {
      const href = card.querySelector('a.task-link')?.getAttribute('href') || ''
      const m = /\/browse\/([A-Z][A-Z0-9]+-\d+)/i.exec(href)
      if (m) key = m[1]
    }
    if (!key) return
    const name = summaryEl?.textContent.trim() || ''
    let description = ''
    if (descInner) {
      const clone = descInner.cloneNode(true)
      clone.querySelectorAll('div').forEach(d => d.remove()) // remove image divs
      clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'))
      description = clone.textContent.trim()
    }
    result[key] = { name, description }
  })
  return result
}

// Step-1 data domain: project list, task fetching (project/JQL), quick filters,
// selection, and "copy from existing note". State lives here so it survives
// navigation between wizard steps.
export function useTaskSource({ t, showToast, setConfig }) {
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [taskError, setTaskError] = useState(null)

  const [customJql, setCustomJql] = useState('')
  // Quick filters that compose JQL (multi-select values + in/not-in operator per field)
  const [qf, setQf] = useState({ version: [], impact: [], requested: [] })
  // Svi filteri podrazumevano uključuju izabrane vrednosti ('in'); 'not in' je
  // izuzetak koji korisnik svesno bira po polju.
  const [qfOp, setQfOp] = useState({ version: 'in', impact: 'in', requested: 'in' })
  const [fetchTrigger, setFetchTrigger] = useState(0)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedIds, setSelectedIds] = useState(new Set())

  // copy from existing
  const [copyDropOpen, setCopyDropOpen] = useState(false)
  const [existingNotes, setExistingNotes] = useState(null) // null = not loaded yet
  const [copyLoading, setCopyLoading] = useState(false)
  const [copiedEdits, setCopiedEdits] = useState(null) // { [key]: { name, description } } keyed by task key

  // Ref to skip one useEffect run when copy sets selectedProject directly
  const skipNextFetchRef = useRef(false)

  useEffect(() => {
    api.getProjects().then(setProjects).catch(() => {})
  }, [])

  useEffect(() => {
    if (!copyDropOpen) return
    function close(e) {
      if (!e.target.closest('[data-copy-dropdown]')) setCopyDropOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [copyDropOpen])

  // Normal project/JQL fetch — skipped when copy does it directly
  useEffect(() => {
    if (!selectedProject && !customJql.trim()) { setTasks([]); setTaskError(null); return }
    if (skipNextFetchRef.current) { skipNextFetchRef.current = false; return }
    setLoadingTasks(true)
    setTaskError(null)
    setSelectedIds(new Set())
    const token = localStorage.getItem('jt_token')
    fetch('/api/release-notes/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ ...(selectedProject ? { projectId: selectedProject.id } : {}), ...(customJql.trim() ? { customJql: customJql.trim() } : {}) }),
    })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`); return d })
      .then(data => { setTasks(data.tasks || []) })
      .catch(err => { setTaskError(err.message); setTasks([]) })
      .finally(() => setLoadingTasks(false))
  }, [selectedProject, fetchTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSelected = useCallback(taskId => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(taskId) ? n.delete(taskId) : n.add(taskId); return n })
  }, [])

  const removeFromSelection = useCallback(taskId => {
    setSelectedIds(prev => { const n = new Set(prev); n.delete(taskId); return n })
  }, [])

  // Compose JQL from the quick-filter selections (quoted IN / NOT IN lists).
  function applyQuickFilters() {
    const q = arr => arr.map(v => `"${String(v).replace(/"/g, '')}"`).join(', ')
    const clause = (field, op, vals) => vals.length ? `${field} ${op} (${q(vals)})` : null
    const parts = [
      clause('fixVersion', qfOp.version, qf.version),
      clause('"Client - Impact Scope"', qfOp.impact, qf.impact),
      // Tačan naziv polja u Jiri je "Client - Requesting" (cf[11793]); pod
      // starim nazivom "Client Requested" polje ne postoji, pa su sugestije
      // i JQL uvek bili prazni.
      clause('"Client - Requesting"', qfOp.requested, qf.requested),
    ].filter(Boolean)
    if (!parts.length) { showToast(t('rne.quickFilterEmpty')); return }
    setCustomJql(parts.join(' AND '))
  }

  // Type-ahead values for a Jira field (uses JQL autocomplete suggestions).
  async function fetchFieldSuggestions(fieldName, query) {
    const token = localStorage.getItem('jt_token')
    const res = await fetch('/api/release-notes/field-suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...(selectedProject ? { projectId: selectedProject.id } : {}), fieldName, query }),
    })
    if (!res.ok) return []
    const d = await res.json()
    // `reason` stiže samo kad je prazno — prosleđujemo ga UI-ju da korisnik vidi
    // da li polje uopšte postoji u Jiri ili nema vrednosti (P3 dijagnostika).
    if (!d.results?.length && d.reason) return { results: [], reason: d.reason }
    return d.results || []
  }

  async function handleCopyFromNote(note) {
    if (!note) return
    setCopyLoading(true)
    try {
      const detail = await api.getReleaseNoteDetail(note.id)
      const noteData = detail.note || detail
      const edits = parseNoteHtml(noteData.html || '')
      const keys = Object.keys(edits)
      if (keys.length === 0) { showToast(t('rne.noTasks')); return }

      // Projekat je OPCION: release notes može biti objavljen bez projekta
      // (bare-JQL tok) ili je projekat u međuvremenu arhiviran — tada taskove
      // vučemo čistim JQL-om preko sopstvenih Jira kredencijala.
      const pid = noteData.project_id || note.project_id
      const proj = (pid ? projects.find(p => p.id === pid) : null) || selectedProject || null

      // Fetch only the copied tasks directly (bypass useEffect)
      setLoadingTasks(true)
      const token = localStorage.getItem('jt_token')
      const res = await fetch('/api/release-notes/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ...(proj ? { projectId: proj.id } : {}), customJql: `issuekey IN (${keys.join(', ')})` }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const loaded = data.tasks || []

      // Pre-fill config
      const version = noteData.version || ''
      const clientName = version ? (noteData.title || '').replace(version, '').trim() : (noteData.title || '')
      setConfig({ clientName, version })

      // Skip the useEffect that would fire if project changes
      if (proj && proj.id !== selectedProject?.id) {
        skipNextFetchRef.current = true
        setSelectedProject(proj)
      }
      setCopiedEdits(edits)
      setTasks(loaded)
      setSelectedIds(new Set(loaded.filter(t => edits[t.key]).map(t => t.id)))
      setCustomJql('') // clear JQL — user can add more via JQL below
      setCopyDropOpen(false)
      // Jedan toast — showToast zamenjuje prethodni, pa se poruke spajaju.
      // Bez (vidljivog) projekta korisnik mora znati zašto je polje projekta
      // prazno i da nove taskove dodaje JQL-om.
      showToast(t('rne.copyLoaded') + `: ${loaded.length} / "${noteData.title || 'release notes'}"`
        + (proj ? '' : ` — ${t('rne.copyNoProject')}`))
    } catch (err) {
      showToast(t('rne.errorLabel') + ': ' + (err.message || t('rne.unknownError')))
    } finally {
      setCopyLoading(false)
      setLoadingTasks(false)
    }
  }

  // Adds more tasks via JQL on top of existing list (merge mode when copiedEdits active).
  // Projekat nije obavezan — bez njega server koristi sopstvene Jira kredencijale,
  // pa se dodavanje radi i kad je kopirano iz release notes-a bez projekta.
  async function handleAddByJql() {
    if (!customJql.trim()) return
    setLoadingTasks(true)
    setTaskError(null)
    try {
      const token = localStorage.getItem('jt_token')
      const res = await fetch('/api/release-notes/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ...(selectedProject ? { projectId: selectedProject.id } : {}), customJql: customJql.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const newTasks = data.tasks || []
      // Merge: only add tasks not already in the list
      const existingKeys = new Set(tasks.map(t => t.key))
      const toAdd = newTasks.filter(t => !existingKeys.has(t.key))
      const addedCount = toAdd.length
      setTasks(prev => {
        const prevKeys = new Set(prev.map(t => t.key))
        return [...prev, ...newTasks.filter(t => !prevKeys.has(t.key))]
      })
      setSelectedIds(prev => {
        const n = new Set(prev)
        newTasks.forEach(t => n.add(t.id))
        return n
      })
      // Bez povratne informacije korisnik ne zna da li se nešto dodalo (npr. kad
      // JQL vrati samo taskove koji su već u listi).
      showToast(newTasks.length === 0
        ? t('rne.addNoResults')
        : t('rne.addedTasks', { added: addedCount, total: newTasks.length }))
    } catch (err) {
      setTaskError(err.message)
    } finally {
      setLoadingTasks(false)
    }
  }

  const filteredTasks = useMemo(() => tasks.filter(t => {
    const matchSearch = !search ||
      (t.key || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.fields?.summary || t.summary || '').toLowerCase().includes(search.toLowerCase())
    const matchFilter = statusFilter === 'all' || statusCat(t) === statusFilter
    return matchSearch && matchFilter
  }).sort((a, b) => (b.billable ? 1 : 0) - (a.billable ? 1 : 0)), [tasks, search, statusFilter]) // billable first

  const countByStatus = useMemo(() => ({
    all: tasks.length,
    resolved: tasks.filter(t => statusCat(t) === 'resolved').length,
    inprog: tasks.filter(t => statusCat(t) === 'inprog').length,
    testing: tasks.filter(t => statusCat(t) === 'testing').length,
  }), [tasks])

  return {
    projects, selectedProject, setSelectedProject,
    tasks, loadingTasks, taskError,
    customJql, setCustomJql, qf, setQf, qfOp, setQfOp, setFetchTrigger,
    search, setSearch, statusFilter, setStatusFilter,
    selectedIds, setSelectedIds, toggleSelected, removeFromSelection,
    copyDropOpen, setCopyDropOpen, existingNotes, setExistingNotes, copyLoading, copiedEdits,
    applyQuickFilters, fetchFieldSuggestions, handleCopyFromNote, handleAddByJql,
    filteredTasks, countByStatus,
  }
}
