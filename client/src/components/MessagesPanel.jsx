import { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'
import { useT } from '../lang.jsx'

function fmtTime(dateStr, t) {
  const d = new Date(dateStr)
  const diff = Math.floor((Date.now() - d) / 1000)
  if (diff < 60) return t('time.justNow')
  if (diff < 3600) return t('time.minutesAgo', { n: Math.floor(diff / 60) })
  if (diff < 86400) return t('time.hoursAgo', { n: Math.floor(diff / 3600) })
  return d.toLocaleDateString('sr-RS', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// Returns the thread identifier for a message: subject takes priority, then task_key
function threadId(m) { return m.subject || m.task_key || null }

const TASK_KEY_RE = /^[A-Z][A-Z0-9]*-\d+$/
function looksLikeTaskKey(val) { return TASK_KEY_RE.test(val.trim().toUpperCase()) }

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export default function MessagesPanel({ project, currentUser, isClient, initialTaskKey, onClose, onMessagesRead }) {
  const t = useT()
  const [messages, setMessages] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [threadFilter, setThreadFilter] = useState(initialTaskKey || 'all')
  const [text, setText] = useState('')
  const [topicInput, setTopicInput] = useState(initialTaskKey || '')
  const [topicType, setTopicType] = useState(initialTaskKey ? 'task' : null) // 'task' | 'subject' | null
  const [taskSummary, setTaskSummary] = useState(null)
  const [taskFetchLoading, setTaskFetchLoading] = useState(false)
  const [recipientId, setRecipientId] = useState('all')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)
  const taskFetchRef = useRef(null)

  useEffect(() => {
    loadMessages()
    if (!isClient) loadClients()
  }, [project.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, threadFilter])

  async function loadMessages() {
    setLoading(true)
    try {
      const msgs = await api.getMessages(project.id)
      setMessages(msgs)
      onMessagesRead?.()
    } catch {}
    setLoading(false)
  }

  async function loadClients() {
    try {
      const list = await api.getProjectClients(project.id)
      setClients(list)
    } catch {}
  }

  function handleTopicChange(e) {
    const val = e.target.value
    setTopicInput(val)
    setTaskSummary(null)
    const trimmed = val.trim()
    if (!trimmed) { setTopicType(null); return }
    if (looksLikeTaskKey(trimmed)) {
      setTopicType('task')
      clearTimeout(taskFetchRef.current)
      taskFetchRef.current = setTimeout(async () => {
        setTaskFetchLoading(true)
        try {
          const info = await api.getTaskInfo(trimmed.toUpperCase())
          setTaskSummary(info.summary || null)
        } catch {}
        setTaskFetchLoading(false)
      }, 600)
    } else {
      setTopicType('subject')
    }
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    try {
      const trimmedTopic = topicInput.trim()
      const body = {
        text: text.trim(),
        task_key: topicType === 'task' ? trimmedTopic.toUpperCase() : undefined,
        subject: topicType === 'subject' ? trimmedTopic : undefined,
        recipient_user_id: (!isClient && recipientId !== 'all') ? parseInt(recipientId) : undefined,
      }
      const { message } = await api.sendMessage(project.id, body)
      setMessages(prev => [...prev, message])
      setText('')
      const tid = message.subject || message.task_key
      if (tid) setThreadFilter(tid)
    } catch (err) {
      alert(err.message)
    } finally {
      setSending(false)
    }
  }

  function handleExport() {
    const token = localStorage.getItem('jt_token')
    fetch(`/api/messages/${project.id}/export`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `poruke-${project.epicKey}-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
      })
      .catch(() => alert(t('msg.exportError')))
  }

  // Unique threads — keyed by subject (if set) or task_key
  const threads = [...new Map(
    messages.filter(m => threadId(m)).map(m => {
      const id = threadId(m)
      return [id, { id, label: m.subject || m.task_key, taskKey: m.task_key, subject: m.subject }]
    })
  ).values()]

  const filtered = threadFilter === 'all' ? messages : messages.filter(m => threadId(m) === threadFilter)

  const inputStyle = {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 12px',
    color: 'var(--text)',
    fontSize: 13,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  }

  return (
    <div style={{
      position: 'fixed',
      right: 0,
      top: 0,
      bottom: 0,
      width: 420,
      background: 'var(--surface)',
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 300,
      boxShadow: '-8px 0 32px rgba(0,0,0,0.2)',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, minHeight: 57 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{t('msgsPanel.title')}</div>
          <div style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textMuted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {project.displayName || project.epicKey}
          </div>
        </div>
        {!isClient && (
          <button
            onClick={handleExport}
            title={t('msgsPanel.export')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, color: 'var(--textMuted)', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--textMuted)' }}
          >
            {t('msgsPanel.export')}
          </button>
        )}
        <button
          onClick={onClose}
          title={t('msgsPanel.close')}
          style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--border)', background: 'transparent', color: 'var(--textMuted)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >×</button>
      </div>

      {/* Thread filter pills */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0 }}>
        {[{ id: 'all', label: t('msgsPanel.all', { count: messages.length }) }, ...threads].map(th => (
          <button
            key={th.id}
            onClick={() => {
              setThreadFilter(th.id)
              if (th.id !== 'all') {
                if (th.subject) { setTopicInput(th.subject); setTopicType('subject') }
                else if (th.taskKey) { setTopicInput(th.taskKey); setTopicType('task') }
              }
            }}
            style={{
              fontFamily: th.id === 'all' ? "'DM Mono'" : "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 12,
              border: threadFilter === th.id ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: threadFilter === th.id ? 'rgba(79,142,247,0.1)' : 'transparent',
              color: threadFilter === th.id ? 'var(--accent)' : 'var(--textMuted)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'all 0.15s',
              maxWidth: 160,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={th.label}
          >{th.label}</button>
        ))}
      </div>

      {/* Message list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {loading && (
          <div style={{ textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, padding: 32 }}>{t('msgsPanel.loading')}</div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--textSubtle)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, padding: 40 }}>
            {threadFilter === 'all' ? t('msgsPanel.noMessages') : t('msgsPanel.noThreadMessages')}
          </div>
        )}
        {filtered.map((m, i) => {
          const isMe = m.sender_id === currentUser.id
          const prevMsg = filtered[i - 1]
          const showSender = !prevMsg || prevMsg.sender_id !== m.sender_id
          return (
            <div key={m.id} style={{ marginTop: showSender && i > 0 ? 10 : 2 }}>
              {showSender && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontFamily: 'Syne', fontSize: 12, fontWeight: 700, color: isMe ? 'var(--accent)' : 'var(--text)' }}>
                    {isMe ? t('msg.me') : m.sender_name}
                  </span>
                  {!isMe && m.recipient_name && (
                    <span style={{ fontFamily: "'DM Mono'", fontSize: 10, color: 'var(--textSubtle)' }}>→ {m.recipient_name}</span>
                  )}
                  {!isMe && !m.recipient_name && !isClient && (
                    <span style={{ fontFamily: "'DM Mono'", fontSize: 10, color: 'var(--textSubtle)' }}>{t('msg.toAllClients')}</span>
                  )}
                  <span style={{ fontFamily: "'DM Mono'", fontSize: 10, color: 'var(--textSubtle)', marginLeft: 'auto' }}>{fmtTime(m.created_at, t)}</span>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                {showSender && (m.subject || m.task_key) && (
                  <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, marginBottom: 3, alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                    {m.subject && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, fontSize: 11, color: 'var(--text)', background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px' }}>
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M1 2.5A1 1 0 012 1.5h8a1 1 0 011 1v5a1 1 0 01-1 1H7L5.5 10 4 8.5H2a1 1 0 01-1-1z"/></svg>
                        {m.subject}
                      </span>
                    )}
                    {m.task_key && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: "'DM Mono'", fontSize: 10, color: 'var(--accent)', background: 'rgba(79,142,247,0.08)', border: '1px solid rgba(79,142,247,0.2)', borderRadius: 4, padding: '1px 6px' }}>
                        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M5 6.5a2.5 2.5 0 003.5.3l2-2a2.5 2.5 0 00-3.5-3.5l-1 1"/><path d="M7 5.5a2.5 2.5 0 00-3.5-.3l-2 2a2.5 2.5 0 003.5 3.5l1-1"/></svg>
                        {m.task_key}
                      </span>
                    )}
                  </div>
                )}
                <div style={{
                  maxWidth: '85%',
                  padding: '7px 11px',
                  borderRadius: isMe ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                  background: isMe ? 'var(--accent)' : 'var(--surfaceAlt)',
                  border: isMe ? 'none' : '1px solid var(--border)',
                  fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
                  fontSize: 13,
                  color: isMe ? '#fff' : 'var(--text)',
                  lineHeight: 1.5,
                  wordBreak: 'break-word',
                }}>
                  {m.text}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── Compose area ── */}
      <form onSubmit={handleSend} style={{
        padding: '14px 16px',
        borderTop: '2px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        background: 'var(--surface)',
      }}>

        {/* Row 1: Tema / Task field */}
        <div>
          <input
            value={topicInput}
            onChange={handleTopicChange}
            placeholder={t('msg.topicPlaceholder')}
            style={{ ...inputStyle, fontFamily: topicType === 'task' ? "'DM Mono'" : "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}
            onFocus={e => e.target.style.borderColor = 'var(--accent)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          {/* Preview chip */}
          {topicInput.trim() && topicType && (
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              {topicType === 'task' ? (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontFamily: "'DM Mono'", fontSize: 11,
                  color: 'var(--accent)', background: 'rgba(79,142,247,0.1)',
                  border: '1px solid rgba(79,142,247,0.3)', borderRadius: 6, padding: '3px 10px',
                }}>
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M5 6.5a2.5 2.5 0 003.5.3l2-2a2.5 2.5 0 00-3.5-3.5l-1 1"/><path d="M7 5.5a2.5 2.5 0 00-3.5-.3l-2 2a2.5 2.5 0 003.5 3.5l1-1"/></svg>
                  {topicInput.trim().toUpperCase()}
                  {taskFetchLoading && <span style={{ opacity: 0.6 }}>…</span>}
                  {!taskFetchLoading && taskSummary && (
                    <span style={{ color: 'var(--textMuted)', fontSize: 10, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>— {taskSummary}</span>
                  )}
                </span>
              ) : (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, fontSize: 11,
                  color: 'var(--text)', background: 'var(--surfaceAlt)',
                  border: '1px solid var(--border)', borderRadius: 6, padding: '3px 10px',
                }}>
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M1 2.5A1 1 0 012 1.5h8a1 1 0 011 1v5a1 1 0 01-1 1H7L5.5 10 4 8.5H2a1 1 0 01-1-1z"/></svg>
                  {topicInput.trim()}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Row 2: Recipient chips (admin only) */}
        {!isClient && clients.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[{ id: 'all', name: t('msg.allClients'), email: t('msg.allClientsOnProject') }, ...clients].map(c => {
              const selected = recipientId === String(c.id)
              const isAll = c.id === 'all'
              const avatar = isAll ? '👥' : initials(c.name)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setRecipientId(String(c.id))}
                  title={c.email}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px 5px 6px', borderRadius: 20,
                    border: selected ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                    background: selected ? 'rgba(79,142,247,0.1)' : 'transparent',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--borderHover)' }}
                  onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--border)' }}
                >
                  {/* Avatar circle */}
                  <span style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background: selected ? 'var(--accent)' : 'var(--surfaceAlt)',
                    color: selected ? '#fff' : 'var(--textMuted)',
                    fontSize: isAll ? 13 : 9, fontWeight: 700,
                    fontFamily: isAll ? 'inherit' : 'Syne',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: selected ? 'none' : '1px solid var(--border)',
                  }}>{avatar}</span>
                  {/* Name */}
                  <span style={{
                    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
                    fontSize: 12, color: selected ? 'var(--accent)' : 'var(--text)', fontWeight: selected ? 600 : 400,
                  }}>{c.name}</span>
                  {/* Role badge */}
                  {!isAll && (
                    <span style={{
                      fontFamily: "'DM Mono'", fontSize: 9, fontWeight: 700,
                      background: selected ? 'var(--accent)' : 'var(--surfaceAlt)',
                      color: selected ? '#fff' : 'var(--textMuted)',
                      border: selected ? 'none' : '1px solid var(--border)',
                      borderRadius: 4, padding: '1px 4px',
                    }}>{t('msg.clientBadge')}</span>
                  )}
                  {selected && <span style={{ fontSize: 11, color: 'var(--accent)' }}>✓</span>}
                </button>
              )
            })}
          </div>
        )}

        {/* Row 3: Textarea with char counter */}
        <div style={{ position: 'relative' }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e) } }}
            placeholder={t('msg.messagePlaceholder')}
            style={{
              ...inputStyle,
              fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
              minHeight: 80,
              resize: 'none',
              lineHeight: 1.5,
              paddingBottom: 22,
            }}
            onFocus={e => e.target.style.borderColor = 'var(--accent)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          {text.length > 0 && (
            <span style={{
              position: 'absolute', bottom: 7, right: 10,
              fontFamily: "'DM Mono'", fontSize: 10, color: 'var(--textSubtle)',
              pointerEvents: 'none',
            }}>{text.length}</span>
          )}
        </div>

        {/* Row 4: Hint + Send button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: "'DM Mono'", fontSize: 10, color: 'var(--textSubtle)' }}>
            {t('msg.hint')}
          </span>
          <button
            type="submit"
            disabled={!text.trim() || sending}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: !text.trim() || sending ? 'var(--surfaceAlt)' : 'var(--accent)',
              color: !text.trim() || sending ? 'var(--textMuted)' : '#fff',
              border: 'none', borderRadius: 8,
              padding: '8px 16px',
              fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
              fontWeight: 600, fontSize: 13,
              cursor: !text.trim() || sending ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {sending ? t('msg.sending') : t('msg.send')}
          </button>
        </div>
      </form>
    </div>
  )
}
