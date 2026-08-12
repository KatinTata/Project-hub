import { useState, useEffect, useRef } from 'react'
import { DndContext, DragOverlay, pointerWithin, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { api } from '../api.js'
import PhaseProgress from './PhaseProgress.jsx'
import { useConfirm } from '../ui/Confirm.jsx'
import { useToast } from '../ui/Toast.jsx'

const PHASE_COLORS = ['#4F8EF7', '#22C55E', '#F59E0B', '#A78BFA', '#14B8A6', '#EF4444', '#F97316', '#64748B']
const UNASSIGNED_ID = '__unassigned__'

// ── TaskChip display ──────────────────────────────────────────────────────────

function TaskChip({ task, faded, jiraUrl }) {
  const sc = task.statusCategory
  const statusColor = sc === 'done' ? '#22C55E' : sc === 'testing' ? '#F59E0B' : sc === 'inprog' ? '#4F8EF7' : '#6B7A99'
  const statusLabel = sc === 'done' ? 'Done' : sc === 'testing' ? 'Testing' : sc === 'inprog' ? 'In Progress' : 'To Do'
  const link = jiraUrl ? `https://${jiraUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}/browse/${task.key}` : null

  return (
    <div style={{
      background: 'var(--surfaceAlt)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '7px 10px',
      opacity: faded ? 0.4 : 1,
      transition: 'opacity 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer"
            style={{ fontFamily: "'Hanken Grotesk'", fontSize: 10, fontWeight: 600, color: 'var(--accent)', flexShrink: 0, textDecoration: 'none' }}
            onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
            onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
          >{task.key}</a>
        ) : (
          <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 10, fontWeight: 600, color: 'var(--accent)', flexShrink: 0 }}>
            {task.key}
          </span>
        )}
        <span style={{
          fontFamily: "'Hanken Grotesk'", fontSize: 9, padding: '1px 5px',
          borderRadius: 3, background: `${statusColor}1A`, color: statusColor,
          border: `1px solid ${statusColor}33`, flexShrink: 0, marginLeft: 'auto',
        }}>
          {statusLabel}
        </span>
      </div>
      <div style={{
        fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: 11, color: 'var(--textMuted)', lineHeight: 1.4,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {task.summary}
      </div>
    </div>
  )
}

// ── DraggableChip ─────────────────────────────────────────────────────────────

function DraggableChip({ task, jiraUrl }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.key })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}>
      <TaskChip task={task} faded={isDragging} jiraUrl={jiraUrl} />
    </div>
  )
}

// ── DroppablePhaseColumn ──────────────────────────────────────────────────────

function DueDateBadge({ dueDate, isDone, small = false }) {
  if (!dueDate) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate); due.setHours(0, 0, 0, 0)
  const diffDays = Math.ceil((due - today) / 86400000)
  const status = isDone ? 'done' : diffDays < 0 ? 'overdue' : diffDays <= 7 ? 'atrisk' : 'ok'
  const colors = {
    done:    { color: 'var(--green)',    bg: 'var(--greenTint)', label: '' },
    overdue: { color: 'var(--red)',      bg: 'var(--redTint)',   label: `${Math.abs(diffDays)}d kasni` },
    atrisk:  { color: 'var(--amber)',    bg: 'var(--amberTint)', label: diffDays === 0 ? 'danas' : `${diffDays}d` },
    ok:      { color: 'var(--textSubtle)', bg: 'transparent',   label: '' },
  }
  const { color, bg, label } = colors[status]
  const fmt = new Date(dueDate).toLocaleDateString('sr-Latn-RS', { day: 'numeric', month: 'short' })
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontFamily: "'Hanken Grotesk'", fontSize: small ? 9 : 10,
      color, background: bg, borderRadius: 4,
      padding: small ? '1px 5px' : '2px 6px',
      border: `1px solid ${status === 'ok' ? 'var(--border)' : color + '44'}`,
    }}>
      <svg viewBox="0 0 10 10" fill="none" style={{ width: 8, height: 8, flexShrink: 0 }}>
        <rect x="1" y="1.5" width="8" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M3.5 1v1M6.5 1v1M1 4h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
      {fmt}{label ? ` · ${label}` : ''}
    </span>
  )
}

function DroppablePhaseColumn({ id, phase, tasks, isUnassigned = false, onRename, onDelete, onUpdateDueDate, onUpdateStartDate, activeTaskKey, jiraUrl }) {
  const confirmDialog = useConfirm()
  const { setNodeRef, isOver } = useDroppable({ id })
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(phase.name)
  const [editingDate, setEditingDate] = useState(false)
  const inputRef = useRef(null)
  const dateRef = useRef(null)

  const doneTasks = tasks.filter(t => t.statusCategory === 'done').length
  const donePct = tasks.length > 0 ? (doneTasks / tasks.length) * 100 : 0

  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus() }, [editing])
  useEffect(() => { if (editingDate && dateRef.current) dateRef.current.focus() }, [editingDate])

  function commitRename() {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== phase.name) onRename?.(trimmed)
    setEditing(false)
  }

  const borderColor = isOver ? 'var(--accent)' : isUnassigned ? 'var(--border)' : 'var(--border)'
  const borderStyle = isUnassigned ? 'dashed' : 'solid'

  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        minWidth: 210, maxWidth: 240, flexShrink: 0,
        background: isOver ? 'rgba(79,142,247,0.04)' : 'var(--surface)',
        border: `1px ${borderStyle} ${borderColor}`,
        borderRadius: 10, padding: '10px',
        transition: 'border-color 0.15s, background 0.15s',
        alignSelf: 'flex-start',
      }}
    >
      {/* Column header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 24 }}>
        {!isUnassigned && (
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: phase.color, flexShrink: 0 }} />
        )}

        {editing ? (
          <input
            ref={inputRef}
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setEditName(phase.name); setEditing(false) } }}
            style={{
              flex: 1, background: 'var(--bg)', border: '1px solid var(--accent)',
              borderRadius: 4, padding: '2px 6px', color: 'var(--text)',
              fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
              fontSize: 12, fontWeight: 600, outline: 'none',
            }}
          />
        ) : (
          <span
            onDoubleClick={() => !isUnassigned && setEditing(true)}
            title={isUnassigned ? undefined : 'Dvoklik za rename'}
            style={{
              flex: 1, fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
              fontSize: 12, fontWeight: 600, color: isUnassigned ? 'var(--textMuted)' : 'var(--text)',
              cursor: isUnassigned ? 'default' : 'text',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {phase.name}
          </span>
        )}

        <span style={{
          fontFamily: "'Hanken Grotesk'", fontSize: 10, color: 'var(--textMuted)',
          background: 'var(--surfaceAlt)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '1px 6px', flexShrink: 0,
        }}>
          {tasks.length}
        </span>

        {!isUnassigned && !editing && (
          <>
            <button
              onClick={() => setEditing(true)}
              title="Preimenuj"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--textSubtle)', padding: '1px 2px', lineHeight: 1, flexShrink: 0, transition: 'color 0.15s', display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--textSubtle)'}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"/>
              </svg>
            </button>
            <button
              onClick={() => setEditingDate(d => !d)}
              title={phase.due_date ? 'Izmeni rok' : 'Postavi rok'}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: phase.due_date ? 'var(--accent)' : 'var(--textSubtle)', padding: '1px 2px', lineHeight: 1, flexShrink: 0, transition: 'color 0.15s', display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
              onMouseLeave={e => e.currentTarget.style.color = phase.due_date ? 'var(--accent)' : 'var(--textSubtle)'}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="2" width="10" height="9" rx="1.5"/>
                <path d="M4 1v2M8 1v2M1 5h10"/>
              </svg>
            </button>
            <button
              onClick={async () => { if (await confirmDialog(`Obrisati fazu "${phase.name}"?\nTaskovi će biti prebačeni u Neraspoređeno.`)) onDelete?.() }}
              title="Obriši fazu"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--textSubtle)', padding: '1px 2px', lineHeight: 1, flexShrink: 0, transition: 'color 0.15s', display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--textSubtle)'}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h8M5 3V2h2v1M3 3l.6 7h4.8L9 3"/>
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Start + due date inline editor (phase window) */}
      {editingDate && !isUnassigned && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[
            { label: 'Start', value: phase.start_date, on: onUpdateStartDate, ref: dateRef },
            { label: 'Rok', value: phase.due_date, on: onUpdateDueDate },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 30, fontFamily: "'Hanken Grotesk'", fontSize: 10, color: 'var(--textMuted)' }}>{row.label}</span>
              <input
                ref={row.ref}
                type="date"
                defaultValue={row.value || ''}
                onBlur={e => row.on?.(e.target.value || null)}
                onKeyDown={e => { if (e.key === 'Enter') setEditingDate(false); if (e.key === 'Escape') setEditingDate(false) }}
                style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--accent)', borderRadius: 4, padding: '3px 6px', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 11, outline: 'none' }}
              />
              {row.value && (
                <button
                  onMouseDown={e => { e.preventDefault(); row.on?.(null) }}
                  title={`Ukloni ${row.label.toLowerCase()}`}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--textSubtle)', fontSize: 12, lineHeight: 1, padding: '1px 3px' }}
                >✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Progress bar + due date badge */}
      {!isUnassigned && tasks.length > 0 && (
        <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${donePct}%`, background: 'var(--green)', transition: 'width 0.4s' }} />
        </div>
      )}
      {!isUnassigned && phase.due_date && !editingDate && (
        <DueDateBadge dueDate={phase.due_date} isDone={donePct === 100} small />
      )}
      {!isUnassigned && phase.start_date && !editingDate && (
        <div style={{ fontFamily: "'Hanken Grotesk'", fontSize: 10, color: 'var(--textMuted)' }}>
          od {new Date(phase.start_date).toLocaleDateString('sr-Latn-RS', { day: 'numeric', month: 'short' })}
        </div>
      )}

      {/* Task chips */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minHeight: 40 }}>
        {tasks.map(task => <DraggableChip key={task.key} task={task} jiraUrl={jiraUrl} />)}
        {tasks.length === 0 && isUnassigned && !activeTaskKey && (
          <div style={{
            padding: '14px 8px', textAlign: 'center',
            fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 11, color: 'var(--textSubtle)', fontStyle: 'italic',
          }}>
            ← prevuci u fazu
          </div>
        )}
      </div>
    </div>
  )
}

// ── Phase charts ──────────────────────────────────────────────────────────────

export function PhaseCharts({ phases, tasksByPhase }) {
  const withTasks = phases.filter(p => (tasksByPhase[p.id] || []).length > 0)
  if (withTasks.length === 0) return null

  const totalTasks = withTasks.reduce((s, p) => s + (tasksByPhase[p.id] || []).length, 0)
  const totalDone  = withTasks.reduce((s, p) => s + (tasksByPhase[p.id] || []).filter(t => t.statusCategory === 'done').length, 0)
  const overallPct = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0

  return (
    <div style={{ background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', marginTop: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 11, color: 'var(--textMuted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Napredak po fazama
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--textMuted)' }}>
            {totalDone}/{totalTasks} taskova
          </span>
          <span style={{
            fontFamily: "'Hanken Grotesk'", fontSize: 11, fontWeight: 600,
            padding: '2px 8px', borderRadius: 4,
            background: overallPct === 100 ? 'var(--greenTint)' : 'var(--surfaceAlt)',
            color: overallPct === 100 ? 'var(--green)' : 'var(--accent)',
            border: `1px solid ${overallPct === 100 ? 'rgba(34,197,94,0.3)' : 'rgba(79,142,247,0.25)'}`,
          }}>
            {overallPct}%
          </span>
        </div>
      </div>

      {/* Phase rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {withTasks.map(phase => {
          const pt     = tasksByPhase[phase.id] || []
          const total  = pt.length
          const done   = pt.filter(t => t.statusCategory === 'done').length
          const inprog = pt.filter(t => t.statusCategory === 'inprog' || t.statusCategory === 'testing').length
          const todo   = total - done - inprog
          const donePct   = total > 0 ? (done / total) * 100 : 0
          const inprogPct = total > 0 ? (inprog / total) * 100 : 0
          const todoPct   = total > 0 ? (todo / total) * 100 : 0

          // Due date status for row styling
          let rowStatus = 'ok'
          if (phase.due_date && donePct < 100) {
            const today = new Date(); today.setHours(0, 0, 0, 0)
            const due = new Date(phase.due_date); due.setHours(0, 0, 0, 0)
            const diff = Math.ceil((due - today) / 86400000)
            if (diff < 0) rowStatus = 'overdue'
            else if (diff <= 7) rowStatus = 'atrisk'
          }

          const rowStyle = rowStatus === 'overdue'
            ? { background: 'var(--redTint)',   borderLeft: '3px solid var(--red)',   borderRadius: 6, padding: '8px 10px 8px 12px' }
            : rowStatus === 'atrisk'
            ? { background: 'var(--amberTint)', borderLeft: '3px solid var(--amber)', borderRadius: 6, padding: '8px 10px 8px 12px' }
            : { padding: '8px 0' }

          return (
            <div key={phase.id} style={rowStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: rowStatus === 'overdue' ? 'var(--red)' : rowStatus === 'atrisk' ? 'var(--amber)' : phase.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {phase.name}
                </span>
                {phase.due_date && (
                  <DueDateBadge dueDate={phase.due_date} isDone={donePct === 100} />
                )}
                <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--textMuted)', flexShrink: 0 }}>
                  {done}/{total}
                </span>
                <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, fontWeight: 600, color: donePct === 100 ? 'var(--green)' : 'var(--textMuted)', flexShrink: 0, minWidth: 34, textAlign: 'right' }}>
                  {Math.round(donePct)}%
                </span>
              </div>
              {/* Task progress bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: phase.due_date ? 5 : 0 }}>
                <div style={{ flex: 1, height: 10, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                  {donePct > 0   && <div style={{ width: `${donePct}%`,   background: 'var(--green)',      transition: 'width 0.5s' }} />}
                  {inprogPct > 0 && <div style={{ width: `${inprogPct}%`, background: 'var(--amber)',      transition: 'width 0.5s' }} />}
                  {todoPct > 0   && <div style={{ width: `${todoPct}%`,   background: 'var(--textSubtle)', opacity: 0.35, transition: 'width 0.5s' }} />}
                </div>
              </div>

              {/* Time elapsed bar — only if due_date set */}
              {phase.due_date && (() => {
                const start    = new Date(phase.created_at)
                const due      = new Date(phase.due_date); due.setHours(23, 59, 59)
                const now      = new Date()
                const total_ms = due - start
                const elapsed  = Math.min(Math.max((now - start) / total_ms, 0), 1)
                const elapsedPct = elapsed * 100
                const isOver   = now > due && donePct < 100
                const elapsedColor = isOver ? 'var(--red)' : elapsed > (donePct / 100) ? 'var(--amber)' : 'var(--accent)'
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 9, color: 'var(--textSubtle)', flexShrink: 0, width: 34 }}>vreme</span>
                    <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${elapsedPct}%`, background: elapsedColor, transition: 'width 0.5s' }} />
                    </div>
                    <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 9, color: elapsedColor, flexShrink: 0, width: 28, textAlign: 'right' }}>
                      {Math.round(elapsedPct)}%
                    </span>
                  </div>
                )
              })()}

              {(inprog > 0 || todo > 0) && (
                <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                  {inprog > 0 && <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 10, color: 'var(--amber)' }}>● {inprog} u toku</span>}
                  {todo > 0   && <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 10, color: 'var(--textSubtle)' }}>● {todo} čeka</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 10, color: 'var(--green)',     display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--green)',    display: 'inline-block' }} /> Završeno
        </span>
        <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 10, color: 'var(--amber)',     display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--amber)',    display: 'inline-block' }} /> U toku
        </span>
        <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 10, color: 'var(--textMuted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--textSubtle)', opacity: 0.5, display: 'inline-block' }} /> Čeka
        </span>
      </div>
    </div>
  )
}

// ── AddPhasePanel ─────────────────────────────────────────────────────────────

function AddPhasePanel({ onAdd, onCancel }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(PHASE_COLORS[0])
  const [dueDate, setDueDate] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function submit() {
    if (name.trim()) onAdd(name.trim(), color, dueDate || null)
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      border: '1px solid var(--accent)', borderRadius: 10, padding: '10px 14px',
      background: 'var(--surface)',
    }}>
      <input
        ref={inputRef}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
        placeholder="Naziv faze"
        style={{
          width: 200, background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '5px 8px', color: 'var(--text)',
          fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
          fontSize: 12, outline: 'none', boxSizing: 'border-box', flexShrink: 0,
        }}
      />
      <input
        type="date"
        value={dueDate}
        onChange={e => setDueDate(e.target.value)}
        title="Rok (opciono)"
        style={{
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '5px 8px', color: dueDate ? 'var(--text)' : 'var(--textSubtle)',
          fontFamily: "'Hanken Grotesk'", fontSize: 11, outline: 'none', flexShrink: 0,
        }}
      />
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {PHASE_COLORS.map(c => (
          <div
            key={c}
            onClick={() => setColor(c)}
            style={{
              width: 18, height: 18, borderRadius: '50%', background: c,
              border: `2px solid ${color === c ? 'var(--text)' : 'transparent'}`,
              cursor: 'pointer', transition: 'border-color 0.15s', flexShrink: 0,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
        <button
          onClick={submit}
          style={{
            padding: '5px 16px', background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer',
            fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 12, fontWeight: 600,
          }}
        >
          Dodaj
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '5px 10px', background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--textMuted)', borderRadius: 6, cursor: 'pointer',
            fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12,
          }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// ── Main PhaseBuilder ─────────────────────────────────────────────────────────

export default function PhaseBuilder({ projectId, tasks, isClient, onPhasesChange, jiraUrl }) {
  const toast = useToast()
  const [phases, setPhases] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTask, setActiveTask] = useState(null)
  const [addingPhase, setAddingPhase] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  )

  useEffect(() => { loadPhases() }, [projectId])
  useEffect(() => { onPhasesChange?.(phases) }, [phases])

  async function loadPhases() {
    setLoading(true)
    try {
      const data = await api.getPhases(projectId)
      setPhases(data.phases || [])
    } catch { setPhases([]) }
    setLoading(false)
  }

  // Build taskKey → phaseId map
  const taskPhaseMap = {}
  for (const phase of phases) {
    for (const key of (phase.taskKeys || [])) taskPhaseMap[key] = phase.id
  }

  // Tasks grouped by column
  const tasksByPhase = {}
  for (const phase of phases) tasksByPhase[phase.id] = []
  tasksByPhase[UNASSIGNED_ID] = []
  for (const task of tasks) {
    const pid = taskPhaseMap[task.key]
    if (pid && tasksByPhase[pid]) tasksByPhase[pid].push(task)
    else tasksByPhase[UNASSIGNED_ID].push(task)
  }

  async function handleDragEnd({ active, over }) {
    setActiveTask(null)
    if (!over) return
    const taskKey = active.id
    const toId = over.id
    const fromPhaseId = taskPhaseMap[taskKey]
    const fromColId = fromPhaseId ? fromPhaseId.toString() : UNASSIGNED_ID
    if (toId === fromColId) return

    const newPhaseId = toId === UNASSIGNED_ID ? null : parseInt(toId)

    // Optimistic update
    setPhases(prev => {
      const next = prev.map(p => ({ ...p, taskKeys: p.taskKeys.filter(k => k !== taskKey) }))
      if (newPhaseId !== null) {
        return next.map(p => p.id === newPhaseId ? { ...p, taskKeys: [...p.taskKeys, taskKey] } : p)
      }
      return next
    })

    try {
      await api.assignTaskToPhase(projectId, { taskKey, phaseId: newPhaseId })
    } catch { loadPhases() }
  }

  async function addPhase(name, color, dueDate) {
    try {
      const data = await api.createPhase(projectId, { name, color, dueDate })
      setPhases(prev => [...prev, { ...data.phase, taskKeys: data.phase.taskKeys || [] }])
      setAddingPhase(false)
    } catch (e) {
      console.error('addPhase error:', e)
      toast.error('Greška pri kreiranju faze: ' + (e.message || e))
    }
  }

  async function renamePhase(phaseId, name) {
    const phase = phases.find(p => p.id === phaseId)
    if (!phase) return
    setPhases(prev => prev.map(p => p.id === phaseId ? { ...p, name } : p))
    try { await api.updatePhase(phaseId, { name, color: phase.color, position: phase.position }) }
    catch { loadPhases() }
  }

  async function updatePhaseDueDate(phaseId, dueDate) {
    const phase = phases.find(p => p.id === phaseId)
    if (!phase) return
    setPhases(prev => prev.map(p => p.id === phaseId ? { ...p, due_date: dueDate } : p))
    try { await api.updatePhase(phaseId, { dueDate }) }
    catch { loadPhases() }
  }

  async function updatePhaseStartDate(phaseId, startDate) {
    const phase = phases.find(p => p.id === phaseId)
    if (!phase) return
    setPhases(prev => prev.map(p => p.id === phaseId ? { ...p, start_date: startDate } : p))
    try { await api.updatePhase(phaseId, { startDate }) }
    catch { loadPhases() }
  }

  async function deletePhase(phaseId) {
    setPhases(prev => prev.filter(p => p.id !== phaseId))
    try { await api.deletePhase(phaseId) }
    catch { loadPhases() }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13 }}>
        Učitavam faze...
      </div>
    )
  }

  // Client view — PhaseProgress only
  if (isClient) {
    return <PhaseProgress phases={phases} tasksByPhase={tasksByPhase} />
  }

  // Empty state (no phases and not adding)
  if (phases.length === 0 && !addingPhase) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>
          Nema definisanih faza
        </div>
        <div style={{ fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, color: 'var(--textMuted)' }}>
          Svi taskovi su u Neraspoređeno. Kreiraj faze da organizuješ projekat.
        </div>
        <button
          onClick={() => setAddingPhase(true)}
          style={{
            marginTop: 4, padding: '8px 20px', background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: 8, cursor: 'pointer',
            fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
            fontWeight: 600, fontSize: 13, transition: 'opacity 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          + Kreiraj prvu fazu
        </button>
      </div>
    )
  }

  // Empty state but adding first phase
  if (phases.length === 0 && addingPhase) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <AddPhasePanel onAdd={addPhase} onCancel={() => setAddingPhase(false)} />
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar row — outside DndContext so buttons always work */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8 }}>
        {!addingPhase && (
          <button
            onClick={() => setAddingPhase(true)}
            style={{
              padding: '6px 14px', background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
              fontSize: 12, fontWeight: 600, transition: 'opacity 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            + Nova faza
          </button>
        )}
      </div>

      {/* Add phase panel — outside DndContext, no event interference */}
      {addingPhase && (
        <div style={{ marginBottom: 12 }}>
          <AddPhasePanel onAdd={addPhase} onCancel={() => setAddingPhase(false)} horizontal />
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={({ active }) => setActiveTask(tasks.find(t => t.key === active.id) || null)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveTask(null)}
      >
        {/* Kanban board */}
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '4px 0 12px', alignItems: 'flex-start' }}>
          {phases.map(phase => (
            <DroppablePhaseColumn
              key={phase.id}
              id={phase.id.toString()}
              phase={phase}
              tasks={tasksByPhase[phase.id] || []}
              onRename={name => renamePhase(phase.id, name)}
              onDelete={() => deletePhase(phase.id)}
              onUpdateDueDate={dueDate => updatePhaseDueDate(phase.id, dueDate)}
              onUpdateStartDate={startDate => updatePhaseStartDate(phase.id, startDate)}
              activeTaskKey={activeTask?.key}
              jiraUrl={jiraUrl}
            />
          ))}

          {/* Unassigned column */}
          <DroppablePhaseColumn
            id={UNASSIGNED_ID}
            phase={{ name: 'Neraspoređeno', color: 'var(--textSubtle)' }}
            tasks={tasksByPhase[UNASSIGNED_ID] || []}
            isUnassigned
            activeTaskKey={activeTask?.key}
            jiraUrl={jiraUrl}
          />
        </div>

        {/* Drag overlay */}
        <DragOverlay dropAnimation={null}>
          {activeTask && (
            <div style={{ width: 220, opacity: 0.9, transform: 'rotate(2deg)', pointerEvents: 'none' }}>
              <TaskChip task={activeTask} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

    </div>
  )
}
