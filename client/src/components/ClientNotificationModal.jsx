import { useT } from '../lang.jsx'

export default function ClientNotificationModal({ notifications, onClose, onOpenChat }) {
  const t = useT()
  if (!notifications.length) return null

  const count = notifications.length

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.82)',
      zIndex: 500,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        width: '100%',
        maxWidth: 440,
        overflow: 'hidden',
        boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 24 }}>🔔</span>
            <h2 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18, color: 'var(--text)' }}>
              {count === 1 ? t('clientNotif.message1') : count < 5 ? t('clientNotif.message2') : t('clientNotif.message5')}
            </h2>
          </div>
          <p style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, color: 'var(--textMuted)', marginLeft: 34 }}>
            {t('clientNotif.subtitle')}
          </p>
        </div>

        {/* Message list */}
        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
          {notifications.map(n => (
            <div key={n.id} style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'Syne', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
                  {n.project_name || n.epic_key}
                </span>
                {n.task_key && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: "'DM Mono'", fontSize: 10, color: 'var(--accent)', background: 'rgba(79,142,247,0.1)', border: '1px solid rgba(79,142,247,0.2)', borderRadius: 4, padding: '1px 6px' }}>
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M5 6.5a2.5 2.5 0 003.5.3l2-2a2.5 2.5 0 00-3.5-3.5l-1 1"/><path d="M7 5.5a2.5 2.5 0 00-3.5-.3l-2 2a2.5 2.5 0 003.5 3.5l1-1"/></svg>
                    {n.task_key}
                  </span>
                )}
              </div>
              <p style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, color: 'var(--textMuted)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{n.sender_name}: </span>
                {n.text.length > 100 ? n.text.slice(0, 100) + '...' : n.text}
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', display: 'flex', gap: 10 }}>
          <button
            onClick={onOpenChat}
            style={{ flex: 1, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
          >
            {t('clientNotif.viewAll')} →
          </button>
          <button
            onClick={onClose}
            style={{ background: 'transparent', color: 'var(--textMuted)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 14, cursor: 'pointer' }}
          >
            {t('clientNotif.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
