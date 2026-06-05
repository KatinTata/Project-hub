import { useState, useRef, useEffect } from 'react'
import { useT } from '../lang.jsx'

function fmtTime(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60) return 'upravo'
  if (diff < 3600) return `pre ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `pre ${Math.floor(diff / 3600)}h`
  return `pre ${Math.floor(diff / 86400)}d`
}

export default function NotificationBell({ unreadCount = 0, notifications = [], onMarkAllRead, onNotificationClick }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const t = useT()

  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Notifikacije"
        style={{
          position: 'relative',
          width: 34, height: 34, borderRadius: 8,
          background: open ? 'var(--surfaceAlt)' : 'transparent',
          border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'all 0.15s',
          color: open ? 'var(--text)' : 'var(--textMuted)',
          flexShrink: 0,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--surfaceAlt)'; e.currentTarget.style.color = 'var(--text)' }}
        onMouseLeave={e => { e.currentTarget.style.background = open ? 'var(--surfaceAlt)' : 'transparent'; e.currentTarget.style.color = open ? 'var(--text)' : 'var(--textMuted)' }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 18, height: 18 }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 4, right: 4,
            minWidth: 15, height: 15, borderRadius: 8,
            background: 'var(--red)', color: '#fff',
            fontSize: 9, fontFamily: "'DM Mono'", fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px', lineHeight: 1, pointerEvents: 'none',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: 44,
          maxWidth: 320,
          width: 'calc(100vw - 16px)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          zIndex: 200,
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
              {t('notif.title')}
            </span>
            {unreadCount > 0 && (
              <span style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--accent)', background: 'rgba(79,142,247,0.1)', borderRadius: 10, padding: '2px 8px' }}>
                {t('notif.new', { n: unreadCount })}
              </span>
            )}
          </div>

          {/* List */}
          {notifications.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--textMuted)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13 }}>
              {t('notif.empty')}
            </div>
          ) : (
            notifications.map(n => (
              <button
                key={n.id}
                onClick={() => { onNotificationClick(n); setOpen(false) }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', background: 'transparent', cursor: 'pointer', transition: 'background 0.15s', border: 'none', borderBottom: '1px solid var(--border)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surfaceAlt)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'Syne', fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                    {n.project_name || n.epic_key}
                  </span>
                  <span style={{ fontFamily: "'DM Mono'", fontSize: 10, color: 'var(--textSubtle)' }}>
                    {fmtTime(n.created_at)}
                  </span>
                </div>
                {n.task_key && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: "'DM Mono'", fontSize: 10, color: 'var(--accent)', background: 'rgba(79,142,247,0.1)', border: '1px solid rgba(79,142,247,0.2)', borderRadius: 4, padding: '1px 6px', marginBottom: 4 }}>
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M5 6.5a2.5 2.5 0 003.5.3l2-2a2.5 2.5 0 00-3.5-3.5l-1 1"/><path d="M7 5.5a2.5 2.5 0 00-3.5-.3l-2 2a2.5 2.5 0 003.5 3.5l1-1"/></svg>
                    {n.task_key}
                  </span>
                )}
                <div style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, color: 'var(--textMuted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ color: 'var(--text)', fontWeight: 600 }}>{n.sender_name}: </span>
                  {n.text.length > 60 ? n.text.slice(0, 60) + '...' : n.text}
                </div>
              </button>
            ))
          )}

          {/* Footer */}
          <div style={{ padding: '10px 16px' }}>
            <button
              onClick={() => { onMarkAllRead(); setOpen(false) }}
              style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, color: 'var(--textMuted)', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}
            >
              {t('notif.markAllRead')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
