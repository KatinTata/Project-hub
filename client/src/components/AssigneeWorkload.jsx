import { useState } from 'react'
import { fmtHours, getStatusCategory } from '../utils.js'
import { useT } from '../lang.jsx'

const STATUS_COLORS = {
  done:    { bg: 'var(--greenTint)',   color: 'var(--green)' },
  testing: { bg: 'var(--amberTint)',   color: 'var(--amber)' },
  inprog:  { bg: 'rgba(79,142,247,0.1)', color: 'var(--accent)' },
  todo:    { bg: 'var(--surfaceAlt)',  color: 'var(--textMuted)' },
}

export default function AssigneeWorkload({ data = [], tasks = [], jiraUrl }) {
  const [tooltip, setTooltip]   = useState(null)
  const [expanded, setExpanded] = useState(null)
  const t = useT()

  if (data.length === 0) {
    return (
      <div style={{ color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
        {t('chart.noAssignees')}
      </div>
    )
  }

  const maxSpent = Math.max(...data.map(d => d.totalSpent)) || 1

  function getTasksFor(name) {
    return tasks.filter(task => {
      // worklog authors (real hour owners) match first
      if ((task.worklogs || []).some(w => (w.author || task.assignee || 'Neraspoređeno') === name)) return true
      if ((task.subtasks || []).some(sub => (sub.worklogs || []).some(w => (w.author || sub.assignee || task.assignee || 'Neraspoređeno') === name))) return true
      // fallback: assignee-based (tasks without any logged hours)
      if ((task.assignee || 'Neraspoređeno') === name) return true
      return (task.subtasks || []).some(sub => (sub.assignee || task.assignee || 'Neraspoređeno') === name)
    })
  }

  function toggleExpand(name) {
    setExpanded(prev => prev === name ? null : name)
    setTooltip(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'relative' }}>
      {data.map((d, i) => {
        const fillPct   = (d.totalSpent / maxSpent) * 100
        const donePct   = d.totalTasks > 0 ? (d.doneTasks   / d.totalTasks) * 100 : 0
        const inprogPct = d.totalTasks > 0 ? (d.inprogTasks / d.totalTasks) * 100 : 0
        const isOpen    = expanded === d.name
        const rowTasks  = isOpen ? getTasksFor(d.name) : []

        return (
          <div key={d.name}>
            {/* Row */}
            <div
              onClick={() => toggleExpand(d.name)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderRadius: 6, padding: '4px 0', transition: 'background 0.15s' }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--surfaceAlt)'
                const rect = e.currentTarget.getBoundingClientRect()
                setTooltip({ i, name: d.name, done: d.doneTasks, inprog: d.inprogTasks, todo: d.todoTasks, top: rect.top })
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
                setTooltip(null)
              }}
            >
              {/* Expand chevron */}
              <span style={{ fontSize: 10, color: 'var(--textSubtle)', flexShrink: 0, width: 10, transition: 'transform 0.2s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>

              {/* Name */}
              <div style={{ width: 120, flexShrink: 0, fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, color: d.name === 'Neraspoređeno' ? 'var(--amber)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.name}
              </div>

              {/* Stacked bar */}
              <div style={{ flex: 1, height: 20, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${fillPct}%`, display: 'flex', transition: 'width 0.5s ease' }}>
                  {donePct > 0   && <div style={{ height: '100%', width: `${donePct}%`,   background: 'var(--green)',    flexShrink: 0 }} />}
                  {inprogPct > 0 && <div style={{ height: '100%', width: `${inprogPct}%`, background: 'var(--amber)',    flexShrink: 0 }} />}
                  <div style={{ height: '100%', flex: 1, background: 'var(--textSubtle)', opacity: 0.5 }} />
                </div>
              </div>

              {/* Hours */}
              <div style={{ width: 44, flexShrink: 0, fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--textMuted)', textAlign: 'right' }}>
                {fmtHours(d.totalSpent)}
              </div>

              {/* Task count */}
              <div style={{ width: 40, flexShrink: 0, fontFamily: "'Hanken Grotesk'", fontSize: 11, color: 'var(--textSubtle)', textAlign: 'right' }}>
                {d.totalTasks}t
              </div>
            </div>

            {/* Expanded task list */}
            {isOpen && (
              <div style={{ marginLeft: 20, marginBottom: 6, borderLeft: `2px solid ${d.name === 'Neraspoređeno' ? 'var(--amber)' : 'var(--border)'}`, paddingLeft: 10 }}>
                {rowTasks.length === 0 ? (
                  <div style={{ fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, color: 'var(--textMuted)', padding: '6px 0' }}>
                    Nema taskova
                  </div>
                ) : (
                  rowTasks.map(task => {
                    const cat = getStatusCategory(task.status)
                    const sc  = STATUS_COLORS[cat] || STATUS_COLORS.todo
                    return (
                      <div key={task.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                        {jiraUrl ? (
                          <a href={`https://${jiraUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}/browse/${task.key}`} target="_blank" rel="noopener noreferrer"
                            style={{ fontFamily: "'Hanken Grotesk'", fontSize: 10, fontWeight: 600, color: 'var(--accent)', flexShrink: 0, textDecoration: 'none' }}
                            onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                            onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                          >{task.key}</a>
                        ) : (
                          <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 10, fontWeight: 600, color: 'var(--accent)', flexShrink: 0 }}>
                            {task.key}
                          </span>
                        )}
                        <span style={{ flex: 1, fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {task.summary}
                        </span>
                        <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 10, padding: '2px 7px', borderRadius: 4, background: sc.bg, color: sc.color, flexShrink: 0, whiteSpace: 'nowrap' }}>
                          {task.status}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Tooltip */}
      {tooltip !== null && (
        <div style={{
          position: 'fixed', top: tooltip.top - 8, left: 0,
          transform: 'translate(calc(50vw - 50%), -100%)',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '7px 12px', fontSize: 12,
          fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
          color: 'var(--text)', pointerEvents: 'none', whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)', zIndex: 100,
        }}>
          <span style={{ color: 'var(--green)' }}>Završeno: {tooltip.done}</span>
          <span style={{ color: 'var(--textSubtle)', margin: '0 6px' }}>·</span>
          <span style={{ color: 'var(--amber)' }}>In Progress: {tooltip.inprog}</span>
          <span style={{ color: 'var(--textSubtle)', margin: '0 6px' }}>·</span>
          <span style={{ color: 'var(--textMuted)' }}>Grooming: {tooltip.todo}</span>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginTop: 4 }}>
        {[
          { color: 'var(--green)',      label: 'Završeno' },
          { color: 'var(--amber)',      label: 'In Progress' },
          { color: 'var(--textSubtle)', label: 'To Do' },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0, opacity: s.color === 'var(--textSubtle)' ? 0.5 : 1 }} />
            <span style={{ fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 11, color: 'var(--textMuted)' }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
