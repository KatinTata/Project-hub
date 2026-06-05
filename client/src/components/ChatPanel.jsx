import { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'
import { useT } from '../lang.jsx'
import { useWindowSize } from '../hooks/useWindowSize.js'

function fmtTime(dateStr, t) {
  const d = new Date(dateStr)
  const diff = Math.floor((Date.now() - d) / 1000)
  if (diff < 60) return t('time.justNow')
  if (diff < 3600) return t('time.minutesAgo', { n: Math.floor(diff / 60) })
  if (diff < 86400) return t('time.hoursAgo', { n: Math.floor(diff / 3600) })
  return d.toLocaleDateString('sr-RS', { day: '2-digit', month: '2-digit' })
}

export default function ChatPanel({ project, currentUser, jiraUrl, onClose, onMessagesRead }) {
  const t = useT()
  const { isMobile } = useWindowSize()
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [taskKey, setTaskKey] = useState('')
  const [taskInfo, setTaskInfo] = useState(null)
  const [taskLoading, setTaskLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    loadMessages()
  }, [project.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Debounced task key lookup
  useEffect(() => {
    setTaskInfo(null)
    const key = taskKey.trim().toUpperCase()
    if (!key || !/^[A-Z]+-\d+$/.test(key)) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setTaskLoading(true)
      try {
        const info = await api.getTaskInfo(key)
        setTaskInfo(info)
      } catch {
        setTaskInfo(null)
      } finally {
        setTaskLoading(false)
      }
    }, 600)
    return () => clearTimeout(debounceRef.current)
  }, [taskKey])

  async function loadMessages() {
    try {
      const msgs = await api.getMessages(project.id)
      setMessages(msgs)
      onMessagesRead?.()
    } catch {}
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    try {
      const { message } = await api.sendMessage(project.id, {
        text: text.trim(),
        task_key: taskInfo ? taskKey.trim().toUpperCase() : undefined,
      })
      setMessages(prev => [...prev, message])
      setText('')
      setTaskKey('')
      setTaskInfo(null)
    } catch (err) {
      alert(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      right: 0,
      top: 0,
      bottom: 0,
      width: isMobile ? '100%' : 380,
      background: 'var(--surface)',
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 300,
      boxShadow: '-8px 0 32px rgba(0,0,0,0.2)',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, minHeight: 57 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{t('chat.title')}</div>
          <div style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textMuted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {project.displayName || project.epicKey}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--border)', background: 'transparent', color: 'var(--textMuted)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >×</button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--textSubtle)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, marginTop: 40 }}>
            {t('chat.noMessages')}
          </div>
        )}
        {messages.map(m => {
          const isMe = m.sender_id === currentUser.id
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
              <div style={{ fontSize: 11, color: 'var(--textSubtle)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", marginBottom: 4 }}>
                {isMe ? t('msg.me') : m.sender_name} · {fmtTime(m.created_at, t)}
              </div>
              {m.task_key && (
                <TaskChip taskKey={m.task_key} jiraUrl={jiraUrl} />
              )}
              <div style={{
                maxWidth: '80%',
                padding: '8px 12px',
                borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
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
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
        {/* Task key */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              value={taskKey}
              onChange={e => setTaskKey(e.target.value)}
              placeholder={t('chat.taskPlaceholder')}
              style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Mono'", outline: 'none' }}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            {taskLoading && <span style={{ fontSize: 11, color: 'var(--textMuted)', flexShrink: 0 }}>⏳</span>}
          </div>
          {taskInfo && (
            <div style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(79,142,247,0.1)', border: '1px solid rgba(79,142,247,0.25)', borderRadius: 6, padding: '3px 8px' }}>
              <span style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M5 6.5a2.5 2.5 0 003.5.3l2-2a2.5 2.5 0 00-3.5-3.5l-1 1"/><path d="M7 5.5a2.5 2.5 0 00-3.5-.3l-2 2a2.5 2.5 0 003.5 3.5l1-1"/></svg>
                {taskInfo.key}
              </span>
              <span style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 11, color: 'var(--textMuted)' }}>
                {taskInfo.summary.length > 40 ? taskInfo.summary.slice(0, 40) + '...' : taskInfo.summary}
              </span>
              <button onClick={() => { setTaskKey(''); setTaskInfo(null) }} style={{ background: 'transparent', border: 'none', color: 'var(--textMuted)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
            </div>
          )}
        </div>

        {/* Message form */}
        <form onSubmit={handleSend} style={{ display: 'flex', gap: 8 }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e) } }}
            placeholder={t('chat.messagePlaceholder')}
            rows={2}
            style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", resize: 'none', lineHeight: 1.4, outline: 'none' }}
            onFocus={e => e.target.style.borderColor = 'var(--accent)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '0 14px', cursor: !text.trim() || sending ? 'not-allowed' : 'pointer', opacity: !text.trim() || sending ? 0.6 : 1, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease', flexShrink: 0 }}
          >→</button>
        </form>
      </div>
    </div>
  )
}

function TaskChip({ taskKey, jiraUrl }) {
  const href = jiraUrl ? `https://${jiraUrl.replace(/^https?:\/\//, '')}/browse/${taskKey}` : null
  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontFamily: "'DM Mono'",
    fontSize: 11,
    color: 'var(--accent)',
    background: 'rgba(79,142,247,0.1)',
    border: '1px solid rgba(79,142,247,0.25)',
    borderRadius: 4,
    padding: '2px 8px',
    marginBottom: 4,
    textDecoration: 'none',
  }

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={{ ...style, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M5 6.5a2.5 2.5 0 003.5.3l2-2a2.5 2.5 0 00-3.5-3.5l-1 1"/><path d="M7 5.5a2.5 2.5 0 00-3.5-.3l-2 2a2.5 2.5 0 003.5 3.5l1-1"/></svg>
        {taskKey}
      </a>
    )
  }
  return (
    <span style={{ ...style, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M5 6.5a2.5 2.5 0 003.5.3l2-2a2.5 2.5 0 00-3.5-3.5l-1 1"/><path d="M7 5.5a2.5 2.5 0 00-3.5-.3l-2 2a2.5 2.5 0 003.5 3.5l1-1"/></svg>
      {taskKey}
    </span>
  )
}
