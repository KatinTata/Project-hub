import { useState, useRef, useLayoutEffect } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import Badge from '../ui/Badge.jsx'
import ProgressBar from '../ui/ProgressBar.jsx'
import { fmtHours, getStatusCategory } from '../utils.js'
import { api } from '../api.js'
import { toast } from '../ui/Toast.jsx'
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
        style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color, fontWeight: 500, textDecoration: 'none' }}
        onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
        onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
      >{taskKey}</a>
    )
  }
  return <span style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color, fontWeight: 500 }}>{taskKey}</span>
}

function BillableBadge() {
  return (
    <div style={{
      marginTop: 4,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      fontSize: 10,
      fontFamily: "'Hanken Grotesk', sans-serif",
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

// Klijentski tekst taska (prevod naslova + generisan opis): klijent ga vidi
// UMESTO originala; admin ga vidi kao diskretnu liniju ispod originala
// (provera) i klikom otvara izmenu.
// `preview` = admin gleda tabelu kao klijent (isti raspored kao klijentu, ali
// klik i dalje otvara izmenu; taskovi bez teksta su označeni kao „čeka").
function ClientTextLine({ ct, isClient, preview, onEdit }) {
  const t = useT()
  const base = {
    fontSize: 11, color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', sans-serif",
    marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    cursor: onEdit ? 'pointer' : 'default',
  }
  const click = onEdit ? e => { e.stopPropagation(); onEdit() } : undefined
  if (!ct) {
    if (!preview) return null
    return <div onClick={click} style={{ ...base, fontStyle: 'italic', color: 'var(--amber)' }}>{t('table.ct.pending')}</div>
  }
  if (isClient && !ct.one_liner) return null
  if (preview) {
    return (
      <div onClick={click} title={ct.title || ''} style={{ ...base, fontStyle: ct.one_liner ? 'normal' : 'italic' }}>
        {ct.one_liner || t('table.ct.noDesc')}{ct.edited ? ' ✎' : ''}
      </div>
    )
  }
  const text = [ct.title, ct.one_liner].filter(Boolean).join(' — ')
  return (
    <div onClick={click} title={onEdit ? text + '\n(klik za izmenu)' : ct.one_liner || ''} style={base}>
      {!isClient && <span style={{ fontSize: 9, padding: '0 5px', borderRadius: 4, marginRight: 6, background: 'var(--surfaceAlt)', border: '1px solid var(--border)', color: ct.edited ? 'var(--amber)' : 'var(--textMuted)' }}>{ct.edited ? 'EN ✎' : 'EN'}</span>}
      {isClient ? (ct.one_liner || '') : text}
    </div>
  )
}

function TaskRow({ task, expanded, onToggle, isMobile, isTablet, isClient, onOpenQuickMsg, jiraUrl, clientTexts, onEditClientText, clientPreview }) {
  const t = useT()
  const clientText = clientTexts?.[task.key]
  const showAsClient = isClient || clientPreview
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
        {clientPreview && onEditClientText && !isMobile && (
          <button
            onClick={e => { e.stopPropagation(); onEditClientText(task.key, task.summary) }}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', zIndex: 2,
              background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 6, padding: '3px 10px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--accent)',
              fontFamily: "'Hanken Grotesk', sans-serif",
            }}>
            {t('table.ct.editBtn')}
          </button>
        )}
        {onOpenQuickMsg && !isMobile && hovered && !clientPreview && (
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
            <div style={{ fontSize: 10, color: 'var(--red)', fontFamily: "'Hanken Grotesk', sans-serif", marginTop: 2 }}>
              +{task.overPct}%
            </div>
          )}
          {task.billable && !isMobile && <BillableBadge />}
        </div>

        {/* Summary — u pregledu kao klijent klik na naslov/opis otvara izmenu */}
        <div
          onClick={clientPreview && onEditClientText ? e => { e.stopPropagation(); onEditClientText(task.key, task.summary) } : undefined}
          title={clientPreview && onEditClientText ? t('table.ct.clickToEdit') : undefined}
          style={{ overflow: 'hidden', paddingRight: clientPreview ? 90 : 8, cursor: clientPreview && onEditClientText ? 'pointer' : undefined }}>
          <div style={{
            fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: isMobile ? 12 : 13,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {(task.subtasks?.length > 0 || isMobile) && (
              <span style={{ marginRight: 6, opacity: 0.4, fontSize: 10 }}>{expanded ? '▼' : '▶'}</span>
            )}
            {task.isOrphanSubtask && (
              <span title={task.parentKey ? `Subtask taska ${task.parentKey} (parent nije u obuhvatu projekta)` : 'Subtask — parent nije u obuhvatu projekta'}
                style={{ marginRight: 6, fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(107,122,153,0.15)', color: 'var(--textMuted)', border: '1px solid rgba(107,122,153,0.3)', verticalAlign: 'middle' }}>
                subtask
              </span>
            )}
            {showAsClient && clientText?.title ? clientText.title : task.summary}
          </div>
          <ClientTextLine ct={clientText} isClient={isClient} preview={clientPreview} onEdit={onEditClientText ? () => onEditClientText(task.key, task.summary) : undefined} />
        </div>

        {/* Status — minWidth 0 + hidden overflow so long statuses truncate instead of overlapping Napredak */}
        <div style={{ minWidth: 0, overflow: 'hidden', paddingRight: 8 }} title={task.status}>
          <Badge color={statusColor(task.status)}>{task.status}</Badge>
        </div>

        {/* Progress — tablet + desktop */}
        {!isMobile && (
          <div style={{ paddingRight: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11, color: 'var(--textMuted)' }}>
              <span style={{ fontFamily: "'Hanken Grotesk', sans-serif" }}>{task.est > 0 ? `${Math.round(pct * 100)}%` : '–'}</span>
            </div>
            {task.est > 0 && <ProgressBar value={pct} color={barColor} height={6} />}
          </div>
        )}

        {/* Est — desktop only, admin only */}
        {!isClient && !isMobile && !isTablet && (
          <div style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: 'var(--textMuted)' }}>
            {task.est > 0 ? fmtHours(task.est) : '–'}
          </div>
        )}

        {/* Spent — tablet + desktop, admin only */}
        {!isClient && !isMobile && (
          <div style={{
            fontFamily: "'Hanken Grotesk', sans-serif",
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
                <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--textMuted)', textTransform: 'uppercase', marginBottom: 2 }}>Napredak</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 80 }}><ProgressBar value={pct} color={barColor} height={6} /></div>
                  <span style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, color: 'var(--textMuted)' }}>
                    {task.est > 0 ? `${Math.round(pct * 100)}%` : '–'}
                  </span>
                </div>
              </div>
            )}
            {!isClient && (
              <div>
                <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--textMuted)', textTransform: 'uppercase', marginBottom: 2 }}>Est.</div>
                <div style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: 'var(--textMuted)' }}>
                  {task.est > 0 ? fmtHours(task.est) : '–'}
                </div>
              </div>
            )}
            {!isClient && (
              <div>
                <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--textMuted)', textTransform: 'uppercase', marginBottom: 2 }}>Utrošeno</div>
                <div style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: task.over ? 'var(--red)' : task.spent > 0 ? 'var(--green)' : 'var(--textMuted)' }}>
                  {task.spent > 0 ? fmtHours(task.spent) : '–'}
                </div>
              </div>
            )}
            {!isClient && task.over && (
              <div>
                <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--red)', textTransform: 'uppercase', marginBottom: 2 }}>Prekoračenje</div>
                <div style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: 'var(--red)' }}>+{task.overPct}%</div>
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
            <div style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, color: 'var(--textMuted)' }}>
              {sub.timeoriginalestimate > 0 ? fmtHours(sub.timeoriginalestimate) : '–'}
            </div>
          )}
          {!isClient && (
            <div style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, color: 'var(--textMuted)' }}>
              {sub.timespent > 0 ? fmtHours(sub.timespent) : '–'}
            </div>
          )}
        </div>
      ))}
    </>
  )
}

export default function TaskTable({ tasks = [], overTasks = [], isClient, projectId, onOpenMessages, jiraUrl, hasBillableField, clientTexts: clientTextsProp, clientPreview = false }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState({})
  const { isMobile, isTablet } = useWindowSize()
  const t = useT()

  // Klijentski tekstovi: server šalje keš mapu; lokalni overrides čuvaju
  // adminove izmene bez ponovnog fetch-a celog projekta.
  const [ctOverrides, setCtOverrides] = useState({})
  const clientTexts = clientTextsProp ? { ...clientTextsProp, ...ctOverrides } : null
  const [ctEditing, setCtEditing] = useState(null) // { key, summary, title, one_liner }
  const canEditCt = !isClient && !!clientTexts && typeof projectId === 'number'
  function openCtEdit(key, summary) {
    const ct = clientTexts?.[key]
    setCtEditing({ key, summary, title: ct?.title || '', one_liner: ct?.one_liner || '' })
  }
  async function saveCtEdit() {
    try {
      await api.saveClientTaskText(projectId, ctEditing.key, { title: ctEditing.title, one_liner: ctEditing.one_liner })
      setCtOverrides(p => ({ ...p, [ctEditing.key]: { title: ctEditing.title.trim(), one_liner: ctEditing.one_liner.trim() || null, edited: true } }))
      setCtEditing(null)
    } catch (e) { toast.error(e.message) }
  }

  const overKeys = new Set(overTasks.map(task => task.key))

  const filtered = tasks.filter(task => {
    const matchSearch = !search || task.key.toLowerCase().includes(search.toLowerCase()) || task.summary.toLowerCase().includes(search.toLowerCase())
    if (!matchSearch) return false
    if (filter === 'done') return task.statusCategory === 'done'
    if (filter === 'testing') return task.statusCategory === 'testing'
    if (filter === 'inprog') return task.statusCategory === 'inprog'
    if (filter === 'todo') return task.statusCategory === 'todo'
    if (filter === 'unknown') return task.statusCategory === 'unknown'
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
    unknown: tasks.filter(task => task.statusCategory === 'unknown').length,
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
    ...(counts.unknown > 0 ? [{ key: 'unknown', label: t('table.filter.unknown'), count: counts.unknown, title: t('table.title.unknown') }] : []),
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
          <span style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: 'var(--textMuted)' }}>({tasks.length})</span>
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
        fontFamily: "'Hanken Grotesk', sans-serif",
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

      {clientPreview && (
        <div style={{ padding: '8px 16px', background: 'var(--accentTint, var(--surfaceAlt))', borderBottom: '1px solid var(--border)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: 'var(--accent)' }}>
          {t('table.ct.previewBanner')}
        </div>
      )}

      {/* Rows */}
      {filtered.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif" }}>
          Nema taskova
        </div>
      ) : (
        <VirtualRows
          filtered={filtered}
          expanded={expanded}
          toggleExpand={toggleExpand}
          isMobile={isMobile}
          isTablet={isTablet}
          isClient={isClient}
          onOpenMessages={onOpenMessages}
          jiraUrl={jiraUrl}
          clientTexts={clientTexts}
          onEditClientText={canEditCt ? openCtEdit : undefined}
          clientPreview={clientPreview}
        />
      )}

      {/* Izmena klijentskog teksta (admin provera) */}
      {ctEditing && (
        <div onClick={() => setCtEditing(null)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(10,14,25,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, width: 520, maxWidth: '100%' }}>
            <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>
              {t('table.ct.editTitle', { key: ctEditing.key })}
            </div>
            <div style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: 'var(--textMuted)', marginBottom: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ctEditing.summary}
            </div>
            <label style={{ display: 'block', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, color: 'var(--textMuted)', marginBottom: 4 }}>{t('table.ct.title')}</label>
            <input value={ctEditing.title} onChange={e => setCtEditing(p => ({ ...p, title: e.target.value }))}
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13, marginBottom: 10 }} />
            <label style={{ display: 'block', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, color: 'var(--textMuted)', marginBottom: 4 }}>{t('table.ct.oneLiner')}</label>
            <textarea value={ctEditing.one_liner} onChange={e => setCtEditing(p => ({ ...p, one_liner: e.target.value }))} rows={3}
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13, resize: 'vertical' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button onClick={() => setCtEditing(null)} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: "'Hanken Grotesk', sans-serif", border: '1px solid var(--border)', background: 'transparent', color: 'var(--textMuted)', cursor: 'pointer' }}>{t('table.ct.cancel')}</button>
              <button onClick={saveCtEdit} disabled={!ctEditing.title.trim()} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: "'Hanken Grotesk', sans-serif", border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', opacity: ctEditing.title.trim() ? 1 : 0.5 }}>{t('table.ct.save')}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// Virtualizovani redovi (P2-B2): projekat sa 300+ taskova više ne drži sve
// redove u DOM-u. useWindowVirtualizer zadržava skrol STRANICE (bez unutrašnjeg
// skrolbara); measureElement meri stvarnu visinu pa expand/collapse radi.
function VirtualRows({ filtered, expanded, toggleExpand, isMobile, isTablet, isClient, onOpenMessages, jiraUrl, clientTexts, onEditClientText, clientPreview }) {
  const listRef = useRef(null)
  // scrollMargin mora biti APSOLUTNA pozicija liste u dokumentu. Ranije se
  // čitao offsetTop pri prvom renderu (ref još null → 0) i nikad se nije
  // ažurirao, pa je iznad prvih redova ostajala velika prazna površina.
  // Sada merimo pravu poziciju i re-merimo kad se layout iznad liste promeni
  // (sklapanje sekcija, promena taba, resize).
  const [scrollMargin, setScrollMargin] = useState(0)
  useLayoutEffect(() => {
    function measure() {
      const el = listRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY
      setScrollMargin(prev => (Math.abs(prev - top) > 1 ? top : prev))
    }
    measure()
    window.addEventListener('resize', measure)
    const ro = new ResizeObserver(measure)
    ro.observe(document.body)
    return () => { window.removeEventListener('resize', measure); ro.disconnect() }
  }, [])

  const virtualizer = useWindowVirtualizer({
    count: filtered.length,
    estimateSize: () => 56,
    overscan: 12,
    scrollMargin,
    getItemKey: i => filtered[i].key,
  })

  return (
    <div ref={listRef} style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map(vi => {
        const task = filtered[vi.index]
        return (
          <div
            key={task.key}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start - virtualizer.options.scrollMargin}px)` }}
          >
            <TaskRow
              task={task}
              expanded={!!expanded[task.key]}
              onToggle={() => toggleExpand(task.key)}
              isMobile={isMobile}
              isTablet={isTablet}
              isClient={isClient}
              onOpenQuickMsg={onOpenMessages ? (task) => onOpenMessages(task.key) : undefined}
              jiraUrl={jiraUrl}
              clientTexts={clientTexts}
              onEditClientText={onEditClientText}
              clientPreview={clientPreview}
            />
          </div>
        )
      })}
    </div>
  )
}
