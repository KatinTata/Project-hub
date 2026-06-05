import { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'
import Topbar from '../components/Topbar.jsx'
import BrainAnimation from '../components/BrainAnimation.jsx'
import { useWindowSize } from '../hooks/useWindowSize.js'
import { useT } from '../lang.jsx'

function fmtTime(dateStr, t) {
  const d = new Date(dateStr)
  const diff = Math.floor((Date.now() - d) / 1000)
  if (diff < 60) return t('time.justNow')
  if (diff < 3600) return t('time.minutesAgo', { n: Math.floor(diff / 60) })
  if (diff < 86400) return t('time.hoursAgo', { n: Math.floor(diff / 3600) })
  return d.toLocaleDateString('sr-RS', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const TASK_KEY_RE = /^[A-Z][A-Z0-9]*-\d+$/
function looksLikeTaskKey(val) { return TASK_KEY_RE.test(val.trim().toUpperCase()) }
function threadId(m) { return m.subject || m.task_key || null }

export default function MessagesPage({
  user, theme, onLogout, onOpenSettings, onOpenUsers,
  onGoToDashboard, onGoToReleaseNotes, onGoToReleaseNotesEditor, onGoToDocuments, onGoToQA, onOpenChat,
  initialProjectId,
}) {
  const t = useT()
  const isAdmin = user.role !== 'client'
  const isClient = user.role === 'client'
  const { isMobile } = useWindowSize()

  // Projects
  const [projects, setProjects] = useState([])
  const [activeId, setActiveId] = useState(initialProjectId || null)
  const [loadingProjects, setLoadingProjects] = useState(true)

  // Messages for active project
  const [messages, setMessages] = useState([])
  const [clients, setClients] = useState([])
  const [taskInfoMap, setTaskInfoMap] = useState({})
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [threadFilter, setThreadFilter] = useState('all')

  // Compose
  const [text, setText] = useState('')
  const [topicInput, setTopicInput] = useState('')
  const [topicType, setTopicType] = useState(null)
  const [taskSummary, setTaskSummary] = useState(null)
  const [taskFetchLoading, setTaskFetchLoading] = useState(false)
  const [recipientId, setRecipientId] = useState('all')
  const [sending, setSending] = useState(false)

  const bottomRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    api.getProjects()
      .then(list => {
        setProjects(list)
        const pick = initialProjectId ? list.find(p => p.id === initialProjectId) : null
        setActiveId(pick ? pick.id : list[0]?.id || null)
      })
      .catch(() => {})
      .finally(() => setLoadingProjects(false))
  }, [])

  useEffect(() => {
    if (!activeId) return
    setMessages([])
    setThreadFilter('all')
    setTopicInput('')
    setTopicType(null)
    setTaskSummary(null)
    loadMessages(activeId)
    if (!isClient) loadClients(activeId)
  }, [activeId])

  useEffect(() => {
    if (!loadingMsgs) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, threadFilter, loadingMsgs])

  async function loadMessages(projectId) {
    setLoadingMsgs(true)
    try {
      const msgs = await api.getMessages(projectId)
      setMessages(msgs)
      const fromDb = {}
      msgs.forEach(m => { if (m.task_key && m.task_summary) fromDb[m.task_key] = m.task_summary })
      setTaskInfoMap(fromDb)
      const missing = [...new Set(msgs.filter(m => m.task_key && !m.task_summary).map(m => m.task_key))]
      if (missing.length) {
        Promise.all(missing.map(k => api.getTaskInfo(k).catch(() => null))).then(results => {
          const extra = {}
          results.forEach(r => { if (r) extra[r.key] = r.summary })
          setTaskInfoMap(prev => ({ ...prev, ...extra }))
        })
      }
    } catch {}
    setLoadingMsgs(false)
  }

  async function loadClients(projectId) {
    try { setClients(await api.getProjectClients(projectId)) } catch {}
  }

  function handleTopicChange(e) {
    const val = e.target.value
    setTopicInput(val)
    setTaskSummary(null)
    const trimmed = val.trim()
    if (!trimmed) { setTopicType(null); return }
    if (looksLikeTaskKey(trimmed)) {
      setTopicType('task')
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        setTaskFetchLoading(true)
        try {
          const info = await api.getTaskInfo(trimmed.toUpperCase())
          setTaskSummary(info.summary || null)
          setTaskInfoMap(prev => ({ ...prev, [trimmed.toUpperCase()]: info.summary }))
        } catch {}
        setTaskFetchLoading(false)
      }, 500)
    } else {
      setTopicType('subject')
    }
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!text.trim() || sending || !activeId) return
    setSending(true)
    try {
      const trimmedTopic = topicInput.trim()
      const resolvedKey = topicType === 'task' ? trimmedTopic.toUpperCase() : undefined
      const body = {
        text: text.trim(),
        task_key: resolvedKey,
        task_summary: resolvedKey ? (taskSummary || taskInfoMap[resolvedKey] || undefined) : undefined,
        subject: topicType === 'subject' ? trimmedTopic : undefined,
        recipient_user_id: (!isClient && recipientId !== 'all') ? parseInt(recipientId) : undefined,
      }
      const { message } = await api.sendMessage(activeId, body)
      setMessages(prev => [...prev, message])
      setText('')
      const tid = message.subject || message.task_key
      if (tid) setThreadFilter(tid)
    } catch (err) { alert(err.message) }
    finally { setSending(false) }
  }

  function handleExport() {
    if (!activeId) return
    const project = projects.find(p => p.id === activeId)
    const token = localStorage.getItem('jt_token')
    const qs = threadFilter !== 'all' ? `?taskKey=${encodeURIComponent(threadFilter)}` : ''
    fetch(`/api/messages/${activeId}/export${qs}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const suffix = threadFilter !== 'all' ? `-${threadFilter}` : ''
        a.download = `poruke-${project?.epicKey || activeId}${suffix}-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
      })
      .catch(() => alert(t('msg.exportError')))
  }

  const threads = [...new Map(
    messages.filter(m => threadId(m)).map(m => {
      const id = threadId(m)
      return [id, { id, label: m.subject || m.task_key, taskKey: m.task_key, subject: m.subject }]
    })
  ).values()].map(th => ({ ...th, count: messages.filter(m => threadId(m) === th.id).length }))

  const filtered = threadFilter === 'all' ? messages : messages.filter(m => threadId(m) === threadFilter)
  const activeProject = projects.find(p => p.id === activeId) || null

  // ── Sidebar label style ─────────────────────────────────────────────────────
  const sideLabel = { padding: '0 16px 8px', fontFamily: "'DM Mono'", fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--textSubtle)' }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <BrainAnimation opacity={0.45} fullscreen />
      </div>
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Topbar
          user={user}
          theme={theme}
          onLogout={onLogout}
          onOpenSettings={onOpenSettings}
          onGoToDashboard={onGoToDashboard}
          onGoToReleaseNotes={onGoToReleaseNotes}
          onGoToReleaseNotesEditor={isAdmin ? onGoToReleaseNotesEditor : null}
          onGoToDocuments={onGoToDocuments}
          onGoToQA={onGoToQA}
          onOpenChat={null}
          onGoToMessages={null}
          onOpenUsers={onOpenUsers}
          currentPage="messages"
        />

        {/* Main content: sidebar + chat */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* ── Left sidebar ── */}
          {!isMobile && (
            <div style={{ width: 240, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflowY: 'auto', flexShrink: 0 }}>

              {/* Projects section */}
              <div style={{ paddingTop: 20 }}>
                <div style={sideLabel}>{t('msg.projects') || 'Projekti'}</div>
                {loadingProjects ? (
                  <div style={{ padding: '8px 16px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--textSubtle)' }}>{t('app.loading')}</div>
                ) : projects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setActiveId(p.id)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '9px 16px',
                      borderLeft: p.id === activeId ? '2px solid var(--accent)' : '2px solid transparent',
                      border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                      background: p.id === activeId ? 'rgba(79,142,247,0.08)' : 'transparent',
                    }}
                    onMouseEnter={e => { if (p.id !== activeId) e.currentTarget.style.background = 'var(--surfaceAlt)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = p.id === activeId ? 'rgba(79,142,247,0.08)' : 'transparent' }}
                  >
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, color: p.id === activeId ? 'var(--accent)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.displayName || p.epicKey}
                    </div>
                    {p.id === activeId && (
                      <div style={{ fontFamily: "'DM Mono'", fontSize: 10, color: 'var(--textMuted)', marginTop: 2 }}>
                        {messages.length} {t('msg.messagesCount') || 'poruka'}
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {/* Threads section — shown for active project */}
              {activeProject && (
                <>
                  <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }} />
                  <div>
                    <div style={sideLabel}>{t('msg.threads')}</div>
                    {[{ id: 'all', label: t('msg.all'), taskKey: null, subject: null, count: messages.length }, ...threads].map(th => (
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
                          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                          padding: '8px 16px', width: '100%',
                          borderLeft: threadFilter === th.id ? '2px solid var(--accent)' : '2px solid transparent',
                          border: 'none', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s',
                          background: threadFilter === th.id ? 'rgba(79,142,247,0.08)' : 'transparent',
                          gap: 6,
                        }}
                        onMouseEnter={e => { if (threadFilter !== th.id) e.currentTarget.style.background = 'var(--surfaceAlt)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = threadFilter === th.id ? 'rgba(79,142,247,0.08)' : 'transparent' }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: th.subject ? "'DM Sans', sans-serif" : (th.id === 'all' ? "'DM Sans', sans-serif" : "'DM Mono'"), fontSize: 12, color: threadFilter === th.id ? 'var(--accent)' : 'var(--textMuted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {th.subject && <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:3,opacity:0.6,flexShrink:0}}><path d="M1 2.5A1 1 0 012 1.5h8a1 1 0 011 1v5a1 1 0 01-1 1H7L5.5 10 4 8.5H2a1 1 0 01-1-1z"/></svg>}
                            {th.taskKey && !th.subject && <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:3,opacity:0.6,flexShrink:0}}><path d="M5 6.5a2.5 2.5 0 003.5.3l2-2a2.5 2.5 0 00-3.5-3.5l-1 1"/><path d="M7 5.5a2.5 2.5 0 00-3.5-.3l-2 2a2.5 2.5 0 003.5 3.5l1-1"/></svg>}
                            {th.label}
                          </div>
                          {th.taskKey && !th.subject && taskInfoMap[th.taskKey] && (
                            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: 'var(--textSubtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                              {taskInfoMap[th.taskKey]}
                            </div>
                          )}
                        </div>
                        <span style={{ fontFamily: "'DM Mono'", fontSize: 10, color: 'var(--textSubtle)', flexShrink: 0, marginTop: 2 }}>{th.count}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Right: messages + compose ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

            {/* Mobile: project pills + thread pills */}
            {isMobile && (
              <div style={{ borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ padding: '8px 12px', display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
                  {projects.map(p => (
                    <button key={p.id} onClick={() => setActiveId(p.id)}
                      style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 12, border: p.id === activeId ? '1px solid var(--accent)' : '1px solid var(--border)', background: p.id === activeId ? 'rgba(79,142,247,0.1)' : 'transparent', color: p.id === activeId ? 'var(--accent)' : 'var(--textMuted)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                    >{p.displayName || p.epicKey}</button>
                  ))}
                </div>
                {activeProject && (
                  <div style={{ padding: '0 12px 8px', display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
                    {[{ id: 'all', label: `${t('msg.all')} (${messages.length})` }, ...threads.map(th => ({ id: th.id, label: th.subject || th.taskKey }))].map(th => (
                      <button key={th.id} onClick={() => setThreadFilter(th.id)}
                        style={{ fontFamily: "'DM Mono'", fontSize: 11, padding: '3px 10px', borderRadius: 12, border: threadFilter === th.id ? '1px solid var(--accent)' : '1px solid var(--border)', background: threadFilter === th.id ? 'rgba(79,142,247,0.1)' : 'transparent', color: threadFilter === th.id ? 'var(--accent)' : 'var(--textMuted)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                      >{th.label}</button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Subheader: project name + export */}
            {activeProject && (
              <div style={{ height: 44, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0, background: 'var(--surface)' }}>
                <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                  {activeProject.displayName || activeProject.epicKey}
                </span>
                {!isClient && (
                  <button
                    onClick={handleExport}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 12px', color: 'var(--textMuted)', fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--textMuted)' }}
                  >
                    ⬇ {threadFilter !== 'all' ? `Export: ${threadFilter}` : t('msg.exportCsv')}
                  </button>
                )}
              </div>
            )}

            {/* Messages list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '24px 32px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {loadingProjects || loadingMsgs ? (
                <div style={{ textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'DM Sans', sans-serif", fontSize: 14, padding: 48 }}>{t('app.loading')}</div>
              ) : !activeProject ? (
                <div style={{ textAlign: 'center', color: 'var(--textSubtle)', fontFamily: "'DM Sans', sans-serif", fontSize: 14, padding: 64 }}>{t('msg.noMessages')}</div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--textSubtle)', fontFamily: "'DM Sans', sans-serif", fontSize: 14, padding: 64 }}>
                  {threadFilter === 'all' ? t('msg.noMessages') : t('msg.noThreadMessages')}
                </div>
              ) : (
                filtered.map((m, i) => {
                  const isMe = m.sender_id === user.id
                  const prevMsg = filtered[i - 1]
                  const showHeader = !prevMsg || prevMsg.sender_id !== m.sender_id ||
                    (new Date(m.created_at) - new Date(prevMsg.created_at)) > 5 * 60 * 1000
                  return (
                    <div key={m.id} style={{ marginTop: showHeader && i > 0 ? 20 : 3, display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '72%', alignSelf: isMe ? 'flex-end' : 'flex-start' }}>
                      {showHeader && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexDirection: isMe ? 'row-reverse' : 'row' }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: isMe ? 'var(--accent)' : 'var(--surfaceAlt)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne', fontWeight: 700, fontSize: 11, color: isMe ? '#fff' : 'var(--text)', flexShrink: 0 }}>
                            {(isMe ? user.name : m.sender_name)?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', gap: 2 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexDirection: isMe ? 'row-reverse' : 'row' }}>
                              <span style={{ fontFamily: 'Syne', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                                {isMe ? t('msg.me') : m.sender_name}
                              </span>
                              {!isClient && !isMe && m.recipient_name && (
                                <span style={{ fontFamily: "'DM Mono'", fontSize: 10, color: 'var(--textMuted)', background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px' }}>→ {m.recipient_name}</span>
                              )}
                              {!isClient && !isMe && !m.recipient_name && (
                                <span style={{ fontFamily: "'DM Mono'", fontSize: 10, color: 'var(--textSubtle)', background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px' }}>→ {t('msg.toAllClients')}</span>
                              )}
                            </div>
                            <span style={{ fontFamily: "'DM Mono'", fontSize: 10, color: 'var(--textSubtle)' }}>{fmtTime(m.created_at, t)}</span>
                          </div>
                        </div>
                      )}
                      {(m.subject || m.task_key) && (showHeader || threadId(filtered[i - 1]) !== threadId(m)) && (
                        <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, marginBottom: 4 }}>
                          {m.subject && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 10px' }}>
                              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M1 2.5A1 1 0 012 1.5h8a1 1 0 011 1v5a1 1 0 01-1 1H7L5.5 10 4 8.5H2a1 1 0 01-1-1z"/></svg>
                                {m.subject}
                              </span>
                            </div>
                          )}
                          {m.task_key && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(79,142,247,0.08)', border: '1px solid rgba(79,142,247,0.2)', borderRadius: 6, padding: '3px 10px' }}>
                              <span style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--accent)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M5 6.5a2.5 2.5 0 003.5.3l2-2a2.5 2.5 0 00-3.5-3.5l-1 1"/><path d="M7 5.5a2.5 2.5 0 00-3.5-.3l-2 2a2.5 2.5 0 003.5 3.5l1-1"/></svg>
                                {m.task_key}
                              </span>
                              {(m.task_summary || taskInfoMap[m.task_key]) && (
                                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--textMuted)', borderLeft: '1px solid rgba(79,142,247,0.2)', paddingLeft: 6 }}>
                                  {(m.task_summary || taskInfoMap[m.task_key]).slice(0, 50)}{(m.task_summary || taskInfoMap[m.task_key]).length > 50 ? '...' : ''}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      <div style={{ padding: '9px 14px', borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px', background: isMe ? 'var(--accent)' : 'var(--surface)', border: isMe ? 'none' : '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: isMe ? '#fff' : 'var(--text)', lineHeight: 1.55, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                        {m.text}
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Compose */}
            {activeProject && (
              <form onSubmit={handleSend} style={{ borderTop: '2px solid var(--border)', padding: isMobile ? '12px' : '16px 32px', background: 'var(--surface)', flexShrink: 0 }}>
                <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Topic */}
                  <div>
                    <input
                      value={topicInput}
                      onChange={handleTopicChange}
                      placeholder={t('msg.topicPlaceholder')}
                      style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, fontFamily: topicType === 'task' ? "'DM Mono'" : "'DM Sans', sans-serif", outline: 'none', transition: 'border-color 0.15s' }}
                      onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                      onBlur={e => e.target.style.borderColor = 'var(--border)'}
                    />
                    {topicInput.trim() && topicType && (
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {topicType === 'task' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--accent)', background: 'rgba(79,142,247,0.1)', border: '1px solid rgba(79,142,247,0.3)', borderRadius: 6, padding: '3px 10px' }}>
                            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M5 6.5a2.5 2.5 0 003.5.3l2-2a2.5 2.5 0 00-3.5-3.5l-1 1"/><path d="M7 5.5a2.5 2.5 0 00-3.5-.3l-2 2a2.5 2.5 0 003.5 3.5l1-1"/></svg>
                            {topicInput.trim().toUpperCase()}
                            {taskFetchLoading && <span style={{ opacity: 0.6 }}>…</span>}
                            {!taskFetchLoading && taskSummary && <span style={{ color: 'var(--textMuted)', fontSize: 10, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>— {taskSummary}</span>}
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 11, color: 'var(--text)', background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 10px' }}>
                            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M1 2.5A1 1 0 012 1.5h8a1 1 0 011 1v5a1 1 0 01-1 1H7L5.5 10 4 8.5H2a1 1 0 01-1-1z"/></svg>
                            {topicInput.trim()}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Recipients */}
                  {!isClient && clients.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {[{ id: 'all', name: t('msg.allClients'), email: '' }, ...clients].map(c => {
                        const sel = recipientId === String(c.id)
                        return (
                          <button key={c.id} type="button" onClick={() => setRecipientId(String(c.id))} title={c.email}
                            style={{ padding: '5px 14px', borderRadius: 20, border: sel ? '1.5px solid var(--accent)' : '1px solid var(--border)', background: sel ? 'rgba(79,142,247,0.1)' : 'transparent', cursor: 'pointer', transition: 'all 0.15s', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: sel ? 'var(--accent)' : 'var(--text)', fontWeight: sel ? 600 : 400 }}
                            onMouseEnter={e => { if (!sel) e.currentTarget.style.borderColor = 'var(--borderHover)' }}
                            onMouseLeave={e => { if (!sel) e.currentTarget.style.borderColor = 'var(--border)' }}
                          >{c.name}</button>
                        )
                      })}
                    </div>
                  )}
                  {/* Textarea */}
                  <div style={{ position: 'relative' }}>
                    <textarea
                      value={text}
                      onChange={e => setText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e) } }}
                      placeholder={t('msg.messagePlaceholder')}
                      style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', paddingBottom: 28, color: 'var(--text)', fontSize: 14, fontFamily: "'DM Sans', sans-serif", resize: 'none', lineHeight: 1.5, outline: 'none', minHeight: 80, transition: 'border-color 0.15s' }}
                      onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                      onBlur={e => e.target.style.borderColor = 'var(--border)'}
                    />
                    {text.length > 0 && <span style={{ position: 'absolute', bottom: 8, right: 12, fontFamily: "'DM Mono'", fontSize: 10, color: 'var(--textSubtle)', pointerEvents: 'none' }}>{text.length}</span>}
                  </div>
                  {/* Hint + Send */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: "'DM Mono'", fontSize: 10, color: 'var(--textSubtle)' }}>{t('msg.hint')}</span>
                    <button type="submit" disabled={!text.trim() || sending}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: !text.trim() || sending ? 'var(--surfaceAlt)' : 'var(--accent)', color: !text.trim() || sending ? 'var(--textMuted)' : '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: !text.trim() || sending ? 'not-allowed' : 'pointer', transition: 'all 0.2s ease' }}
                    >{sending ? t('msg.sending') : t('msg.send')}</button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
