import { useState, useEffect, useRef, useMemo } from 'react'
import { api } from '../api.js'
import MetricCards from './MetricCards.jsx'
import DonutChart from './DonutChart.jsx'
import BarChart from './BarChart.jsx'
import TaskTable from './TaskTable.jsx'
import Badge from './ui/Badge.jsx'
import { fmtHours, buildAssigneeData, buildComponentData, buildModuleData, billableSecondsOf, taskAttribution } from '../utils.js'
import AssigneeWorkload from './AssigneeWorkload.jsx'
import ComponentBreakdown from './ComponentBreakdown.jsx'
import OverrunHeatmap from './OverrunHeatmap.jsx'
import ModuleChart from './ModuleChart.jsx'
import PhaseBuilder, { PhaseCharts } from './PhaseBuilder.jsx'
import StackMatrix from './StackMatrix.jsx'
import PhaseForecast from './PhaseForecast.jsx'
import ProjectEstimateSummary from './ProjectEstimateSummary.jsx'
import TeamRoster from './TeamRoster.jsx'
import ProjectTrend from './ProjectTrend.jsx'
import { buildStackMatrix } from '../utils/stacks.js'
import { useWindowSize } from '../hooks/useWindowSize.js'
import { useT } from '../lang.jsx'

function fmtLastRefresh(date, t) {
  if (!date) return null
  const diff = Math.floor((Date.now() - date) / 1000)
  if (diff < 60) return t('time.justNow')
  if (diff < 3600) return t('time.minutesAgo', { n: Math.floor(diff / 60) })
  return t('time.hoursAgo', { n: Math.floor(diff / 3600) })
}

function jiraLink(jiraUrl, key) {
  if (!jiraUrl) return null
  const base = jiraUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return `https://${base}/browse/${key}`
}

function ChangeTypeIcon({ type, toStatus, color }) {
  const s = { width: 14, height: 14, flexShrink: 0 }
  if (type === 'new') return (
    <svg viewBox="0 0 14 14" fill="none" style={s}>
      <circle cx="7" cy="7" r="6" stroke={color} strokeWidth="1.5"/>
      <path d="M7 4v6M4 7h6" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
  if (type === 'spent') return (
    <svg viewBox="0 0 14 14" fill="none" style={s}>
      <circle cx="7" cy="7" r="6" stroke={color} strokeWidth="1.5"/>
      <path d="M7 4v3.5l2 1.5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
  if (type === 'est') return (
    <svg viewBox="0 0 14 14" fill="none" style={s}>
      <rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke={color} strokeWidth="1.5"/>
      <path d="M4 7h6M4 4.5h3M4 9.5h4" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
  if (type === 'status') {
    if (['Resolved', 'Closed', 'Done'].includes(toStatus)) return (
      <svg viewBox="0 0 14 14" fill="none" style={s}>
        <circle cx="7" cy="7" r="6" stroke={color} strokeWidth="1.5"/>
        <path d="M4.5 7l2 2 3-3" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
    return (
      <svg viewBox="0 0 14 14" fill="none" style={s}>
        <circle cx="7" cy="7" r="6" stroke={color} strokeWidth="1.5"/>
        <path d="M5 5.5C5.3 4.6 6.1 4 7 4c1.1 0 2 .9 2 2 0 1.5-2 2-2 3.5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="7" cy="11" r="0.75" fill={color}/>
      </svg>
    )
  }
  return <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
}

function changeColor(type, toStatus) {
  if (type === 'new') return 'var(--accent)'
  if (type === 'spent') return 'var(--textMuted)'
  if (type === 'est') return 'var(--textMuted)'
  if (type === 'status') {
    if (['Resolved', 'Closed', 'Done'].includes(toStatus)) return 'var(--green)'
    if (['For Testing', 'TESTING STARTED'].includes(toStatus)) return 'var(--amber)'
    return 'var(--accent)'
  }
  return 'var(--textMuted)'
}

function computeChanges(data, previousData) {
  if (!previousData?.tasks) return []
  const prevMap = {}
  previousData.tasks.forEach(t => { prevMap[t.key] = t })
  const changes = []
  for (const task of data.tasks) {
    const prev = prevMap[task.key]
    if (!prev) {
      changes.push({ type: 'new', key: task.key, summary: task.summary })
    } else {
      if (prev.status !== task.status) {
        changes.push({ type: 'status', key: task.key, summary: task.summary, from: prev.status, to: task.status })
      }
      if (Math.abs(task.est - prev.est) > 300) {
        changes.push({ type: 'est', key: task.key, summary: task.summary, from: prev.est, to: task.est })
      }
      if (task.spent - prev.spent > 300) {
        changes.push({ type: 'spent', key: task.key, summary: task.summary, diff: task.spent - prev.spent })
      }
    }
  }
  return changes
}

function findAuthor(changelog, reporter, assignee, changeType) {
  if (changeType === 'new') {
    return changelog[0]?.author || reporter || null
  }
  if (changeType === 'spent') {
    // Jira logs worklog changes under 'timespent', 'worklogid' or 'worklog' — check all
    const entry = changelog.find(h => h.items.some(i => {
      const f = i.field.toLowerCase()
      return f === 'timespent' || f === 'worklogid' || f === 'worklog'
    }))
    // Never fall back to assignee — they're often not the one who logged time
    return entry?.author || null
  }
  const fieldMap = { status: 'status', est: 'timeoriginalestimate' }
  const field = fieldMap[changeType]
  if (!field) return null
  const entry = changelog.find(h => h.items.some(i => i.field.toLowerCase() === field))
  return entry?.author || assignee || reporter || null
}

function ChangesFeed({ data, previousData, previousTime, jiraUrl, projectId }) {
  const storageKey = `task_changes_${projectId}`
  const t = useT()

  const [stored, setStored] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey)) } catch { return null }
  })
  const [authorMap, setAuthorMap] = useState({}) // key -> author string
  const fetchedRef = useRef(null)

  // When a refresh happens (previousTime changes), compute new changes and persist them
  useEffect(() => {
    if (!previousData?.tasks) return
    const changes = computeChanges(data, previousData)
    const entry = { changes, time: previousTime || Date.now() }
    localStorage.setItem(storageKey, JSON.stringify(entry))
    setStored(entry)
    setAuthorMap({})
    fetchedRef.current = null
  }, [previousTime])

  // Fetch authors for changed tasks (admin only, non-blocking)
  useEffect(() => {
    if (!stored?.changes?.length) return
    const cacheKey = stored.time
    if (fetchedRef.current === cacheKey) return
    fetchedRef.current = cacheKey

    stored.changes.forEach(async (c) => {
      try {
        const { changelog, reporter, assignee } = await api.getChangelog(c.key)
        const author = findAuthor(changelog, reporter, assignee, c.type)
        if (author) setAuthorMap(prev => ({ ...prev, [c.key + c.type]: author }))
      } catch {}
    })
  }, [stored])

  // Never refreshed yet — don't show anything
  if (!stored) return null

  const changes = stored.changes
  const time = stored.time

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 16px',
        background: 'var(--surfaceAlt)',
        borderBottom: changes.length > 0 ? '1px solid var(--border)' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {changes.length === 0 ? (
            <svg viewBox="0 0 14 14" fill="none" style={{ width: 14, height: 14, flexShrink: 0 }}>
              <circle cx="7" cy="7" r="6" stroke="var(--green)" strokeWidth="1.5"/>
              <path d="M4.5 7l2 2 3-3" stroke="var(--green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg viewBox="0 0 14 14" fill="none" style={{ width: 14, height: 14, flexShrink: 0 }}>
              <rect x="1" y="8" width="3" height="5" rx="0.5" fill="var(--textMuted)"/>
              <rect x="5.5" y="5" width="3" height="8" rx="0.5" fill="var(--accent)"/>
              <rect x="10" y="2" width="3" height="11" rx="0.5" fill="var(--green)"/>
            </svg>
          )}
          <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
            {changes.length === 0 ? 'Nema novih promena' : `${changes.length} ${changes.length === 1 ? 'promena' : changes.length < 5 ? 'promene' : 'promena'} od poslednjeg osvežavanja`}
          </span>
        </div>
        {time && (
          <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--textSubtle)' }}>
            {fmtLastRefresh(time, t)}
          </span>
        )}
      </div>

      {/* Change rows */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {changes.map((c, i) => {
          const link = jiraLink(jiraUrl, c.key)
          const color = changeColor(c.type, c.to)
          const author = authorMap[c.key + c.type]
          return (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 16px',
              borderBottom: i < changes.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <ChangeTypeIcon type={c.type} toStatus={c.to} color={color} />
              {link ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontFamily: "'Hanken Grotesk'", fontSize: 12, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}
                  onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                  onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                >{c.key}</a>
              ) : (
                <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 12, color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>{c.key}</span>
              )}
              <span style={{ fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                {c.summary}
              </span>
              {author && (
                <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--text)', flexShrink: 0, background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>
                  {author}
                </span>
              )}
              <span style={{ fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, fontWeight: 600, color, flexShrink: 0 }}>
                {c.type === 'new'    && 'Novi task'}
                {c.type === 'status' && <>{c.from} <span style={{ color: 'var(--textSubtle)' }}>→</span> {c.to}</>}
                {c.type === 'est'    && <>{fmtHours(c.from)} <span style={{ color: 'var(--textSubtle)' }}>→</span> {fmtHours(c.to)}</>}
                {c.type === 'spent'  && `+${fmtHours(c.diff)} utrošeno`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}


export default function ProjectCard({
  project, data, onArchive, loading, error,
  hasJira, refreshing, lastRefresh, onRefresh,
  previousData, previousTime, isClient, onOpenMessages, jiraUrl,
  autoRefreshTime, isSuperAdmin, onEditProject,
}) {
  const { isMobile, isTablet } = useWindowSize()
  const t = useT()
  const [activeTab, setActiveTab] = useState('tasks') // 'tasks' | 'phases'
  const [chartPhases, setChartPhases] = useState([])
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!project?.id || typeof project.id === 'string') return
    api.getPhases(project.id).then(d => setChartPhases(d?.phases || [])).catch(() => {})
  }, [project?.id])

  const [team, setTeam] = useState([])
  useEffect(() => {
    if (!project?.id || typeof project.id === 'string') { setTeam([]); return }
    api.getTeam(project.id).then(t => setTeam(t || [])).catch(() => setTeam([]))
  }, [project?.id])
  async function addTeamMember(name, stack) {
    try { const { member } = await api.addTeamMember(project.id, name, stack); setTeam(t => [...t, member]) }
    catch (e) { alert(e.message || 'Greška pri dodavanju') }
  }
  async function removeTeamMember(id) {
    setTeam(t => t.filter(m => m.id !== id))
    try { await api.removeTeamMember(project.id, id) } catch {}
  }
  const peoplePerStackMap = useMemo(() => {
    if (!team.length) return null
    const m = { Backend: 0, Frontend: 0, Testing: 0, Ostalo: 0 }
    for (const mem of team) if (m[mem.stack] !== undefined) m[mem.stack]++
    return m
  }, [team])

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif" }}>
        Učitavam podatke iz Jire...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>❌</div>
        <div style={{ color: 'var(--red)', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", marginBottom: 8 }}>{error}</div>
        <button onClick={onArchive} style={{ color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13 }}>
          Ukloni projekat
        </button>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif" }}>
        Nema podataka
      </div>
    )
  }

  const { tasks, totalEst, totalSpent, done, inprog, testing, todo, total, overTasks } = data

  // Build phase chart data from chartPhases + tasks
  const chartTaskPhaseMap = {}
  for (const p of chartPhases) for (const k of (p.taskKeys || [])) chartTaskPhaseMap[k] = p.id
  const chartTasksByPhase = {}
  for (const p of chartPhases) chartTasksByPhase[p.id] = []
  for (const t of tasks) {
    const pid = chartTaskPhaseMap[t.key]
    if (pid != null && chartTasksByPhase[pid]) chartTasksByPhase[pid].push(t)
  }

  const assigneeData   = !isClient ? buildAssigneeData(tasks)   : null
  const componentData  = !isClient ? buildComponentData(tasks)  : null
  const { moduleData, noModuleTasks } = !isClient ? buildModuleData(tasks) : { moduleData: [], noModuleTasks: [] }

  const donePct = total > 0 ? done / total : 0
  const inprogPct = total > 0 ? inprog / total : 0
  const testingPct = total > 0 ? testing / total : 0

  const statusLabel = donePct >= 0.8 ? 'active' : donePct >= 0.4 ? 'paused' : 'active'
  const statusColor = donePct >= 0.8 ? 'green' : donePct >= 0.4 ? 'amber' : 'blue'

  const barData = tasks
    .filter(task => task.est > 0)
    .map(task => ({ label: task.key, est: task.est, spent: task.spent }))

  const donutSegments = [
    { value: done,    color: 'var(--green)',      label: t('donut.label.done')   },
    { value: testing, color: 'var(--amber)',      label: 'Testing'               },
    { value: inprog,  color: 'var(--accent)',     label: t('donut.label.inprog') },
    { value: todo,    color: 'var(--textSubtle)', label: t('donut.label.todo')   },
  ]

  async function handleExportExcel() {
    if (exporting) return
    setExporting(true)
    try {
      // per-person hours on each task (worklog authors) for the detail sheet
      const assigneeTasks = {}
      for (const task of tasks) {
        for (const [name, seconds] of Object.entries(taskAttribution(task))) {
          if (!assigneeTasks[name]) assigneeTasks[name] = []
          assigneeTasks[name].push({ key: task.key, summary: task.summary, status: task.status, seconds })
        }
      }
      for (const name of Object.keys(assigneeTasks)) assigneeTasks[name].sort((a, b) => b.seconds - a.seconds)

      await api.exportProjectExcel(project.id, {
        meta: { epicKey: project.epicKey, jiraUrl, filterType: project.filterType },
        totals: { total, done, inprog, testing, todo, totalEst, totalSpent },
        tasks,
        assignees: assigneeData || [],
        assigneeTasks,
        components: componentData || [],
        modules: moduleData || [],
        phases: chartPhases || [],
        stackMatrix: buildStackMatrix(tasks, chartPhases || []),
        hasBillableField: !!data.hasBillableField,
      })
    } catch (err) {
      alert(err.message || 'Greška pri exportu Excel izveštaja')
    } finally {
      setExporting(false)
    }
  }

  const billableSpent    = tasks.reduce((s, t) => s + billableSecondsOf(t), 0)
  const nonBillableSpent = totalSpent - billableSpent
  const billablePct      = totalSpent > 0 ? Math.round((billableSpent / totalSpent) * 100) : 0
  const billableSegments = [
    { value: billableSpent,    displayValue: `${(billableSpent / 3600).toFixed(1)}h`,    color: 'var(--green)',      label: 'Billable'     },
    { value: nonBillableSpent, displayValue: `${(nonBillableSpent / 3600).toFixed(1)}h`, color: 'var(--textSubtle)', label: 'Non-billable' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Project header */}
      <div className="glass-card" style={{
        padding: isMobile ? '16px' : '20px 24px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
      }}>
        {/* Top row: name/status left, progress right */}
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
        }}>
          <div>
            <h2 style={{ fontFamily: 'Hanken Grotesk', fontWeight: 800, fontSize: isMobile ? 20 : 24, color: 'var(--text)', marginBottom: 8 }}>
              {project.displayName || project.epicKey}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Badge color={statusColor}>{statusLabel}</Badge>
              <FilterBadge project={project} />
              {onEditProject && (
                <button
                  onClick={onEditProject}
                  title="Izmeni kriterijume projekta"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, border: '1px solid var(--border)', background: 'transparent', color: 'var(--accent)', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(79,142,247,0.08)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                  Izmeni
                </button>
              )}
              <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 12, color: 'var(--textMuted)' }}>
                {total} taskova
              </span>
            </div>
          </div>

          <div style={isMobile ? { width: '100%' } : { flex: '0 0 320px' }}>
            {/* Percentages row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 20, color: 'var(--green)' }}>{Math.round(donePct * 100)}%</span>
                <span style={{ fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 11, color: 'var(--textMuted)' }}>završeno</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 20, color: 'var(--amber)' }}>{Math.round(testingPct * 100)}%</span>
                <span style={{ fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 11, color: 'var(--textMuted)' }}>testing</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 20, color: 'var(--accent)' }}>{Math.round(inprogPct * 100)}%</span>
                <span style={{ fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 11, color: 'var(--textMuted)' }}>in progress</span>
              </div>
            </div>

            {/* Multi-segment progress bar */}
            <div style={{ height: 10, background: 'var(--border)', borderRadius: 5, overflow: 'hidden', display: 'flex' }}>
              {donePct > 0 && <div style={{ width: `${donePct * 100}%`, background: 'var(--green)', transition: 'width 0.6s ease' }} />}
              {testingPct > 0 && <div style={{ width: `${testingPct * 100}%`, background: 'var(--amber)', transition: 'width 0.6s ease' }} />}
              {inprogPct > 0 && <div style={{ width: `${inprogPct * 100}%`, background: 'var(--accent)', opacity: 0.7, transition: 'width 0.6s ease' }} />}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 12, marginTop: 7, flexWrap: 'wrap' }}>
              {[
                { color: 'var(--green)',      label: 'Završeno',    count: done    },
                { color: 'var(--amber)',      label: 'Testing',     count: testing },
                { color: 'var(--accent)',     label: 'In Progress', count: inprog  },
                { color: 'var(--textSubtle)', label: 'To Do',       count: todo    },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 11, color: 'var(--textMuted)' }}>{s.label}</span>
                  <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color: s.color }}>{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Refresh strip */}
        {hasJira && !isClient && (
          <div style={{
            borderTop: '1px solid var(--border)',
            marginTop: 16,
            paddingTop: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <button
              onClick={onRefresh}
              disabled={refreshing || loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '6px 14px',
                fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
                fontWeight: 600,
                fontSize: 13,
                cursor: refreshing || loading ? 'not-allowed' : 'pointer',
                opacity: refreshing || loading ? 0.7 : 1,
                transition: 'all 0.2s ease',
                minHeight: 36,
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, flexShrink: 0, animation: refreshing || loading ? 'spin 1s linear infinite' : 'none' }}>
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
              </svg>
              Osveži
            </button>

            <button
              onClick={handleExportExcel}
              disabled={exporting}
              title="Izvezi profesionalni Excel izveštaj"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'var(--green)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '6px 14px',
                fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
                fontWeight: 600,
                fontSize: 13,
                cursor: exporting ? 'not-allowed' : 'pointer',
                opacity: exporting ? 0.7 : 1,
                transition: 'all 0.2s ease',
                minHeight: 36,
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, flexShrink: 0, animation: exporting ? 'spin 1s linear infinite' : 'none' }}>
                {exporting
                  ? <><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></>
                  : <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></>}
              </svg>
              {exporting ? 'Generišem...' : 'Export Excel'}
            </button>

            {lastRefresh && (
              <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 12, color: 'var(--textSubtle)', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                {refreshing || loading ? 'Osvežavam...' : `${fmtLastRefresh(lastRefresh, t)}`}
                {!refreshing && !loading && autoRefreshTime && (
                  <span style={{ background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', fontSize: 11, color: 'var(--textMuted)' }}>
                    auto {autoRefreshTime}
                  </span>
                )}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Project resource & completion estimate — admin only */}
      {!isClient && <ProjectEstimateSummary tasks={tasks} phases={chartPhases} createdAt={project.createdAt} peoplePerStackMap={peoplePerStackMap} />}

      {/* Changes feed — admin only, above metrics */}
      {!isClient && (
        <ChangesFeed
          data={data}
          previousData={previousData}
          previousTime={previousTime}
          jiraUrl={jiraUrl}
          projectId={project.id}
        />
      )}

      {/* Metric cards */}
      <MetricCards data={{ total, done, inprog, testing, todo, totalEst, totalSpent, overTasks }} isClient={isClient} />

      {/* Charts row: Distribucija + Estimacija/Utrošeno */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isClient ? '1fr' : (isMobile || isTablet ? '1fr' : '340px 1fr'),
        gap: 16,
      }}>
        {/* Donut — Distribucija taskova */}
        <div className="glass-card" style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: isMobile ? '16px' : '20px 24px',
        }}>
          <h3 style={{ fontFamily: 'Hanken Grotesk', fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>
            Distribucija taskova
          </h3>
          <DonutChart segments={donutSegments} size={isMobile ? 160 : 200} innerRadius={isMobile ? 56 : 70} horizontal={isClient && !isMobile} />
        </div>

        {/* Bar chart — Estimacija vs Utrošeno, admin only */}
        {!isClient && (
          <div className="glass-card" style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: isMobile ? '16px' : '20px 24px',
            overflow: 'hidden',
          }}>
            <h3 style={{ fontFamily: 'Hanken Grotesk', fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>
              Estimacija vs Utrošeno (top taskovi)
            </h3>
            <div style={{ overflowX: isMobile ? 'auto' : 'hidden' }}>
              <BarChart data={barData} width={isMobile ? 340 : 600} height={isMobile ? 200 : 260} />
            </div>
          </div>
        )}
      </div>

      {/* Module chart + Billable donut — between row1 and assignee workload */}
      {!isClient && (moduleData.length > 0 || data.hasBillableField) && !isMobile && (
        <div style={{ display: 'grid', gridTemplateColumns: (moduleData.length > 0 && data.hasBillableField && !isTablet) ? '1fr 300px' : '1fr', gap: 16, alignItems: 'start' }}>
          {moduleData.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 12, color: 'var(--textMuted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Moduli</div>
                  <div style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, color: 'var(--textMuted)', marginTop: 2 }}>Distribucija logovanog vremena po modulu</div>
                </div>
                <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--textMuted)', background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px' }}>
                  {moduleData.filter(d => d.name !== 'Bez modula').length} modula
                </span>
              </div>
              <ModuleChart moduleData={moduleData} noModuleTasks={noModuleTasks} jiraUrl={jiraUrl} />
            </div>
          )}

          {data.hasBillableField && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', ...(moduleData.length === 0 ? { maxWidth: 300 } : {}) }}>
              <h3 style={{ fontFamily: 'Hanken Grotesk', fontSize: 12, fontWeight: 700, color: 'var(--textMuted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Billable sati</h3>
              <DonutChart segments={billableSegments} size={180} innerRadius={62} centerText={`${billablePct}%`} centerSubtext="billable" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
                    <span style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: 'var(--text)' }}>Billable</span>
                  </div>
                  <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--textMuted)' }}>{(billableSpent / 3600).toFixed(1)}h</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--textSubtle)', flexShrink: 0 }} />
                    <span style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: 'var(--text)' }}>Non-billable</span>
                  </div>
                  <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--textMuted)' }}>{(nonBillableSpent / 3600).toFixed(1)}h</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Phases */}
      <PhaseCharts phases={chartPhases} tasksByPhase={chartTasksByPhase} />

      {/* Admin analytics charts */}
      {!isClient && (
        <>
          {/* Assignee Workload — full width */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 12, color: 'var(--textMuted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Opterećenje po članu tima
                </div>
                <div style={{ fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 11, color: 'var(--textMuted)', marginTop: 2 }}>
                  Logovano vreme i distribucija taskova
                </div>
              </div>
              <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--textMuted)', background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px' }}>
                {assigneeData.filter(d => d.name !== 'Neraspoređeno').length} članova
              </span>
            </div>
            <AssigneeWorkload data={assigneeData} tasks={tasks} jiraUrl={jiraUrl} />
          </div>

          {/* Component Breakdown + Overrun Heatmap — side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile || isTablet ? '1fr' : '1fr 1fr', gap: 16 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 12, color: 'var(--textMuted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Component Breakdown
                  </div>
                  <div style={{ fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 11, color: 'var(--textMuted)', marginTop: 2 }}>
                    Distribucija logovanog vremena po komponenti
                  </div>
                </div>
                <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--textMuted)', background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px' }}>
                  {componentData.length} komponenti
                </span>
              </div>
              <ComponentBreakdown data={componentData} />
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 12, color: 'var(--textMuted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Overrun Heatmap
                  </div>
                  <div style={{ fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 11, color: 'var(--textMuted)', marginTop: 2 }}>
                    Prekoračenje estimacije po tasku
                  </div>
                </div>
                <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--textMuted)', background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px' }}>
                  {tasks.filter(task => task.est > 0).length} sa estimacijom
                </span>
              </div>
              <OverrunHeatmap tasks={tasks} />
            </div>
          </div>

        </>
      )}

      {/* Tabs: Taskovi / Faze */}
      <div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {[
            { id: 'tasks', label: 'Taskovi' },
            { id: 'phases', label: 'Faze' },
            ...(!isClient ? [{ id: 'stacks', label: 'Stekovi' }, { id: 'trend', label: 'Trend' }] : []),
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '6px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600,
                fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
                cursor: 'pointer', transition: 'all 0.15s',
                background: activeTab === tab.id ? 'var(--accent)' : 'transparent',
                color: activeTab === tab.id ? '#fff' : 'var(--textMuted)',
                border: activeTab === tab.id ? '1px solid var(--accent)' : '1px solid var(--border)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'tasks' && (
          <TaskTable tasks={tasks} overTasks={overTasks} isClient={isClient} projectId={project.id} onOpenMessages={onOpenMessages} jiraUrl={jiraUrl} hasBillableField={!!data.hasBillableField} />
        )}
        {activeTab === 'phases' && (
          <PhaseBuilder projectId={project.id} tasks={tasks} isClient={isClient} onPhasesChange={setChartPhases} jiraUrl={jiraUrl} />
        )}
        {activeTab === 'stacks' && !isClient && (
          <>
            <TeamRoster team={team} tasks={tasks} onAdd={addTeamMember} onRemove={removeTeamMember} />
            <StackMatrix tasks={tasks} phases={chartPhases} />
            <PhaseForecast tasks={tasks} phases={chartPhases} createdAt={project.createdAt} peoplePerStackMap={peoplePerStackMap} canEditConfig={isSuperAdmin} />
          </>
        )}
        {activeTab === 'trend' && !isClient && (
          <ProjectTrend projectId={project.id} />
        )}
      </div>
    </div>
  )
}

function FilterBadge({ project }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const ft = project.filterType || 'epic'

  if (ft === 'epic') {
    return (
      <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--textMuted)', background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}>
        Epic {project.epicKey}
      </span>
    )
  }

  const label = ft === 'jql' ? 'Custom JQL' : 'Kombinovani filteri'
  const tooltip = project.filterJql || ''

  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--accent)', background: 'rgba(79,142,247,0.1)', border: '1px solid rgba(79,142,247,0.25)', borderRadius: 4, padding: '2px 6px', cursor: 'default' }}>
        {label}
      </span>
      {showTooltip && tooltip && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          padding: '8px 12px', minWidth: 260, maxWidth: 400,
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--textMuted)',
          lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {tooltip}
        </div>
      )}
    </span>
  )
}
