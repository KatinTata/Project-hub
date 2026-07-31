import { useState } from 'react'
import Badge from './ui/Badge.jsx'
import ProgressBar from './ui/ProgressBar.jsx'
import { fmtHours, getStatusCategory } from '../utils.js'
import { useWindowSize } from '../hooks/useWindowSize.js'
import { useT } from '../lang.jsx'

function statusColor(name) {
  const cat = getStatusCategory(name)
  if (cat === 'done') return 'green'
  if (cat === 'inprog') return 'blue'
  if (name === 'On Hold') return 'amber'
  return 'gray'
}

const COL_DESKTOP        = '130px 1fr 165px 160px 80px 100px'
const COL_DESKTOP_CLIENT = '130px 1fr 165px 160px'
const COL_TABLET         = '120px 1fr 140px 140px 90px'
const COL_TABLET_CLIENT  = '120px 1fr 140px 140px'
const COL_MOBILE         = '90px 1fr 90px'

function TaskKey({ taskKey, jiraUrl, over, isClient }) {
  const color = (!isClient && over) ? 'var(--red)' : 'var(--accent)'
  if (jiraUrl && !isClient) {
    const base = jiraUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
    const href = `https://${base}/browse/${taskKey}`
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        style={{ fontFamily: "'Hanken Grotesk'", fontSize: 12, color, fontWeight: 500, textDecoration: 'none' }}
        onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
        onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
      >{taskKey}</a>
    )
  }
  return <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 12, color, fontWeight: 500 }}>{taskKey}</span>
}

function BillableBadge() {
  return (
    <div style={{
      marginTop: 4,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      fontSize: 10,
      fontFamily: "'Hanken Grotesk'",
      fontWeight: 500,
      borderRadius: 4,
      padding: '1px 6px',
      color: 'var(--green)',
      background: 'var(--greenTint)',
      border: '1px solid var(--green)',
    }}>
      € billable
    </div>
  )
}

function TaskRow({ task, expanded, onToggle, isMobile, isTablet, isClient, onOpenQuickMsg, jiraUrl }) {
  const [hovered, setHovered] = useState(false)
  const pct = task.est > 0 ? Math.min(task.spent / task.est, 2) : 0
  const barColor = (!isClient && task.over) ? 'var(--red)' : 'var(--accent)'
  const col = isMobile
    ? COL_MOBILE
    : isTablet
      ? (isClient ? COL_TABLET_CLIENT : COL_TABLET)
      : (isClient ? COL_DESKTOP_CLIENT : COL_DESKTOP)

  return (
    <>
      <div
        onClick={onToggle}
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: col,
          alignItems: 'center',
          padding: isMobile ? '10px 12px' : '12px 16px',
          borderBottom: '1px solid var(--border)',
          cursor: task.subtasks?.length || isMobile ? 'pointer' : 'default',
          background: (!isClient && task.over) ? 'var(--redTint)' : hovered ? 'var(--surfaceAlt)' : 'transparent',
          transition: 'background 0.15s',
          minHeight: 44,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {onOpenQuickMsg && !isMobile && hovered && (
          <button
            onClick={e => { e.stopPropagation(); onOpenQuickMsg(task) }}
            title="Pošalji poruku vezanu za ovaj task"
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 2,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '3px 8px',
              fontSize: 13,
              cursor: 'pointer',
              color: 'var(--textMuted)',
              fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--textMuted)' }}
          >
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 2.5A1 1 0 012 1.5h8a1 1 0 011 1v5a1 1 0 01-1 1H7L5.5 10 4 8.5H2a1 1 0 01-1-1z"/>
            </svg>
          </button>
        )}
        {/* ID */}
        <div>
          <TaskKey taskKey={task.key} jiraUrl={jiraUrl} over={task.over} isClient={isClient} />
          {!isClient && task.over && !isMobile && (
            <div style={{ fontSize: 10, color: 'var(--red)', fontFamily: "'Hanken Grotesk'", marginTop: 2 }}>
              +{task.overPct}%
            </div>
          )}
          {task.billable && !isMobile && <BillableBadge />}
        </div>

        {/* Summary */}
        <div style={{
          fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
          fontSize: isMobile ? 12 : 13,
          color: 'var(--text)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          paddingRight: 8,
        }}>
          {(task.subtasks?.length > 0 || isMobile) && (
            <span style={{ marginRight: 6, opacity: 0.4, fontSize: 10 }}>{expanded ? '▼' : '▶'}</span>
          )}
          {task.isOrphanSubtask && (
            <span title={task.parentKey ? `Subtask taska ${task.parentKey} (parent nije u obuhvatu projekta)` : 'Subtask — parent nije u obuhvatu projekta'}
              style={{ marginRight: 6, fontFamily: "'Hanken Grotesk'", fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(107,122,153,0.15)', color: 'var(--textMuted)', border: '1px solid rgba(107,122,153,0.3)', verticalAlign: 'middle' }}>
              subtask
            </span>
          )}
          {task.summary}
        </div>

        {/* Status — minWidth 0 + hidden overflow so long statuses truncate instead of overlapping Napredak */}
        <div style={{ minWidth: 0, overflow: 'hidden', paddingRight: 8 }} title={task.status}>
          <Badge color={statusColor(task.status)}>{task.status}</Badge>
        </div>

        {/* Progress — tablet + desktop */}
        {!isMobile && (
          <div style={{ paddingRight: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11, color: 'var(--textMuted)' }}>
              <span style={{ fontFamily: "'Hanken Grotesk'" }}>{task.est > 0 ? `${Math.round(pct * 100)}%` : '–'}</span>
            </div>
            {task.est > 0 && <ProgressBar value={pct} color={barColor} height={6} />}
          </div>
        )}

        {/* Est — desktop only, admin only */}
        {!isClient && !isMobile && !isTablet && (
          <div style={{ fontFamily: "'Hanken Grotesk'", fontSize: 12, color: 'var(--textMuted)' }}>
            {task.est > 0 ? fmtHours(task.est) : '–'}
          </div>
        )}

        {/* Spent — tablet + desktop, admin only */}
        {!isClient && !isMobile && (
          <div style={{
            fontFamily: "'Hanken Grotesk'",
            fontSize: 12,
            color: task.over ? 'var(--red)' : task.spent > 0 ? 'var(--green)' : 'var(--textMuted)',
          }}>
            {task.spent > 0 ? fmtHours(task.spent) : '–'}
          </div>
        )}
      </div>

      {/* Mobile expand: show detail info + subtasks */}
      {isMobile && expanded && (
        <div style={{
          padding: '8px 12px 12px',
          background: 'var(--surfaceAlt)',
          borderBottom: '1px solid var(--border)',
        }}>
          {/* Detail row */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: task.subtasks?.length ? 10 : 0 }}>
            {!isClient && (
              <div>
                <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk'", color: 'var(--textMuted)', textTransform: 'uppercase', marginBottom: 2 }}>Napredak</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 80 }}><ProgressBar value={pct} color={barColor} height={6} /></div>
                  <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--textMuted)' }}>
                    {task.est > 0 ? `${Math.round(pct * 100)}%` : '–'}
                  </span>
                </div>
              </div>
            )}
            {!isClient && (
              <div>
                <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk'", color: 'var(--textMuted)', textTransform: 'uppercase', marginBottom: 2 }}>Est.</div>
                <div style={{ fontFamily: "'Hanken Grotesk'", fontSize: 12, color: 'var(--textMuted)' }}>
                  {task.est > 0 ? fmtHours(task.est) : '–'}
                </div>
              </div>
            )}
            {!isClient && (
              <div>
                <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk'", color: 'var(--textMuted)', textTransform: 'uppercase', marginBottom: 2 }}>Utrošeno</div>
                <div style={{ fontFamily: "'Hanken Grotesk'", fontSize: 12, color: task.over ? 'var(--red)' : task.spent > 0 ? 'var(--green)' : 'var(--textMuted)' }}>
                  {task.spent > 0 ? fmtHours(task.spent) : '–'}
                </div>
              </div>
            )}
            {!isClient && task.over && (
              <div>
                <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk'", color: 'var(--red)', textTransform: 'uppercase', marginBottom: 2 }}>Prekoračenje</div>
                <div style={{ fontFamily: "'Hanken Grotesk'", fontSize: 12, color: 'var(--red)' }}>+{task.overPct}%</div>
              </div>
            )}
          </div>

          {/* Subtasks on mobile */}
          {task.subtasks?.map(sub => (
            <div key={sub.key} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 0',
              borderTop: '1px solid var(--border)',
              flexWrap: 'wrap',
            }}>
              <span style={{ flexShrink: 0 }}><TaskKey taskKey={sub.key} jiraUrl={jiraUrl} over={false} isClient={isClient} /></span>
              <span style={{ fontSize: 12, color: 'var(--textMuted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub.summary}</span>
              <Badge color={statusColor(sub.status)}>{sub.status}</Badge>
            </div>
          ))}
        </div>
      )}

      {/* Desktop/tablet subtasks */}
      {!isMobile && expanded && task.subtasks?.map(sub => (
        <div key={sub.key} style={{
          display: 'grid',
          gridTemplateColumns: isClient
            ? (isTablet ? COL_TABLET_CLIENT : COL_DESKTOP_CLIENT)
            : (isTablet ? COL_TABLET : COL_DESKTOP),
          alignItems: 'center',
          padding: isTablet ? '8px 12px 8px 36px' : '8px 16px 8px 48px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surfaceAlt)',
        }}>
          <div><TaskKey taskKey={sub.key} jiraUrl={jiraUrl} over={false} isClient={isClient} /></div>
          <div style={{ fontSize: 12, color: 'var(--textMuted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', gap: 6, alignItems: 'center' }}>
            {sub.components?.length > 0 && <Badge color="gray">{sub.components[0]}</Badge>}
            <span>{sub.summary}</span>
          </div>
          <div style={{ minWidth: 0, overflow: 'hidden', paddingRight: 8 }} title={sub.status}><Badge color={statusColor(sub.status)}>{sub.status}</Badge></div>
          <div />
          {!isClient && !isTablet && (
            <div style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--textMuted)' }}>
              {sub.timeoriginalestimate > 0 ? fmtHours(sub.timeoriginalestimate) : '–'}
            </div>
          )}
          {!isClient && (
            <div style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--textMuted)' }}>
              {sub.timespent > 0 ? fmtHours(sub.timespent) : '–'}
            </div>
          )}
        </div>
      ))}
    </>
  )
}

export default function TaskTable({ tasks = [], overTasks = [], isClient, projectId, onOpenMessages, jiraUrl, hasBillableField }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState({})
  const { isMobile, isTablet } = useWindowSize()
  const t = useT()

  const overKeys = new Set(overTasks.map(task => task.key))

  const filtered = tasks.filter(task => {
    const matchSearch = !search || task.key.toLowerCase().includes(search.toLowerCase()) || task.summary.toLowerCase().includes(search.toLowerCase())
    if (!matchSearch) return false
    if (filter === 'done') return task.statusCategory === 'done'
    if (filter === 'testing') return task.statusCategory === 'testing'
    if (filter === 'inprog') return task.statusCategory === 'inprog'
    if (filter === 'todo') return task.statusCategory === 'todo'
    if (filter === 'over') return overKeys.has(task.key)
    if (filter === 'noest') return !task.est || task.est === 0
    if (filter === 'billable') return task.billable === true
    return true
  })

  const counts = {
    all:     tasks.length,
    done:    tasks.filter(task => task.statusCategory === 'done').length,
    testing: tasks.filter(task => task.statusCategory === 'testing').length,
    inprog:  tasks.filter(task => task.statusCategory === 'inprog').length,
    todo:    tasks.filter(task => task.statusCategory === 'todo').length,
    over:     overTasks.length,
    noest:    tasks.filter(task => !task.est || task.est === 0).length,
    billable: tasks.filter(task => task.billable === true).length,
  }

  const filterPills = [
    { key: 'all',     label: t('table.filter.all'),     count: counts.all,     title: t('table.title.allTasks') },
    { key: 'done',    label: t('table.filter.done'),    count: counts.done,    title: t('table.title.done') },
    { key: 'testing', label: t('table.filter.testing'), count: counts.testing, title: t('table.title.testing') },
    { key: 'inprog',  label: t('table.filter.inprog'),  count: counts.inprog,  title: t('table.title.inprog') },
    { key: 'todo',    label: t('table.filter.todo'),    count: counts.todo,    title: t('table.title.todo') },
    ...(!isClient ? [{ key: 'over',     label: t('table.filter.over'),  count: counts.over,     title: t('table.tooltip.message') }] : []),
    ...(!isClient ? [{ key: 'noest',    label: t('table.filter.noest'), count: counts.noest,    title: t('table.title.noest') }] : []),
    ...(!isClient && hasBillableField ? [{ key: 'billable', label: '€ Billable', count: counts.billable, title: 'Taskovi sa billable = Yes u Jiri' }] : []),
  ]

  function toggleExpand(key) {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const col = isMobile
    ? COL_MOBILE
    : isTablet
      ? (isClient ? COL_TABLET_CLIENT : COL_TABLET)
      : (isClient ? COL_DESKTOP_CLIENT : COL_DESKTOP)

  return (
    <div className="glass-card" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', overflowX: isMobile ? 'auto' : 'hidden' }}>
      {/* Header */}
      <div style={{ padding: isMobile ? '12px' : '16px 20px', borderBottom: '1px solid var(--border)' }}>
        {/* Title + search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          <span style={{ fontFamily: 'Hanken Grotesk', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Taskovi</span>
          <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 12, color: 'var(--textMuted)' }}>({tasks.length})</span>
          <input
            placeholder={t('table.search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              marginLeft: 'auto',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '6px 12px',
              color: 'var(--text)',
              fontSize: 13,
              fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
              width: isMobile ? '120px' : '200px',
              minHeight: 36,
            }}
          />
        </div>

        {/* Filter pills — horizontal scroll on mobile */}
        <div style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          scrollbarWidth: 'none',
          paddingBottom: 2,
        }}>
          {filterPills.map(p => {
            const active = filter === p.key
            return (
              <button
                key={p.key}
                title={p.title}
                onClick={() => setFilter(p.key)}
                style={{
                  fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
                  fontWeight: 500,
                  fontSize: 12,
                  height: isMobile ? 36 : 28,
                  padding: isMobile ? '0 14px' : '0 12px',
                  borderRadius: 14,
                  border: active ? 'none' : '1px solid var(--border)',
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? '#fff' : 'var(--textMuted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--surfaceAlt)'; e.currentTarget.style.color = 'var(--text)' } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--textMuted)' } }}
              >
                {p.label} · {p.count}
              </button>
            )
          })}
        </div>

      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: col,
        padding: isMobile ? '8px 12px' : '8px 16px',
        background: 'var(--surfaceAlt)',
        borderBottom: '1px solid var(--border)',
        fontSize: 11,
        fontFamily: "'Hanken Grotesk'",
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--textMuted)',
      }}>
        <div>{t('table.header.id')}</div>
        <div>{t('table.header.name')}</div>
        <div>{t('table.header.status')}</div>
        {!isMobile && <div>{t('table.header.progress')}</div>}
        {!isMobile && !isTablet && !isClient && <div>{t('table.header.est')}</div>}
        {!isMobile && !isClient && <div>{t('table.header.spent')}</div>}
      </div>

      {/* Rows */}
      {filtered.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif" }}>
          Nema taskova
        </div>
      ) : (
        filtered.map(task => (
          <TaskRow
            key={task.key}
            task={task}
            expanded={!!expanded[task.key]}
            onToggle={() => toggleExpand(task.key)}
            isMobile={isMobile}
            isTablet={isTablet}
            isClient={isClient}
            onOpenQuickMsg={onOpenMessages ? (task) => onOpenMessages(task.key) : undefined}
            jiraUrl={jiraUrl}
          />
        ))
      )}

    </div>
  )
}
