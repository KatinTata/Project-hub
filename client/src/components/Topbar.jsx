import { useState, useRef, useEffect } from 'react'
import { useWindowSize } from '../hooks/useWindowSize.js'
import NotificationBell from './NotificationBell.jsx'
import { useT } from '../lang.jsx'

// ── SVG Icons ─────────────────────────────────────────────────────────────────

function IconCog() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 18, height: 18 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  )
}

function IconGrid() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 18, height: 18 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
    </svg>
  )
}

function IconDoc() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 18, height: 18 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  )
}

function IconClipboard() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 18, height: 18 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  )
}

function IconFolder() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 18, height: 18 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
    </svg>
  )
}

function IconChat() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 18, height: 18 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V20.25a.75.75 0 0 0 1.28.53l3.58-3.58A48.458 48.458 0 0 0 11.25 17c2.115 0 4.198-.137 6.24-.402 1.608-.209 2.76-1.614 2.76-3.235V9.75Z" />
    </svg>
  )
}

function IconUsers() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 15, height: 15, flexShrink: 0 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  )
}

function IconQA() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 16, height: 16 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
    </svg>
  )
}

function IconLogout() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 15, height: 15, flexShrink: 0 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15" />
    </svg>
  )
}

// ── Icon Button ───────────────────────────────────────────────────────────────

function IconBtn({ onClick, title, children }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 34, height: 34, borderRadius: 8,
        background: hover ? 'var(--surfaceAlt)' : 'transparent',
        border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 0.15s',
        color: hover ? 'var(--text)' : 'var(--textMuted)',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

// ── Module Card ───────────────────────────────────────────────────────────────

function ModuleCard({ icon, iconBg, iconColor, label, subtitle, active, onClick, badge = 0, hideSubtitle }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px', borderRadius: 10,
        background: active ? 'rgba(79,142,247,0.08)' : hover ? 'var(--surface)' : 'var(--surface)',
        border: `1px solid ${active ? 'var(--accent)' : hover ? 'var(--borderHover)' : 'var(--border)'}`,
        cursor: 'pointer', transition: 'all 0.15s',
        flexShrink: 0, textAlign: 'left', position: 'relative',
      }}
    >
      {/* Icon square */}
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: active ? 'rgba(79,142,247,0.15)' : iconBg,
        color: active ? 'var(--accent)' : iconColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
      }}>
        {icon}
      </div>
      {/* Text */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{
          fontFamily: "'DM Sans', -apple-system, sans-serif",
          fontSize: 12, fontWeight: 600,
          color: active ? 'var(--accent)' : 'var(--text)',
          lineHeight: 1.3, whiteSpace: 'nowrap',
        }}>{label}</span>
        {!hideSubtitle && (
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 10, color: 'var(--textMuted)', whiteSpace: 'nowrap',
          }}>{subtitle}</span>
        )}
      </div>
      {/* Badge */}
      {badge > 0 && (
        <span style={{
          position: 'absolute', top: 6, right: 6,
          minWidth: 16, height: 16, borderRadius: 8,
          background: 'var(--red)', color: '#fff',
          fontSize: 9, fontFamily: "'DM Mono'", fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 4px', lineHeight: 1,
        }}>{badge > 99 ? '99+' : badge}</span>
      )}
    </button>
  )
}

// ── Main Topbar ───────────────────────────────────────────────────────────────

export default function Topbar({
  user, theme, onLogout,
  onOpenSettings, onOpenUsers,
  unreadCount = 0, recentUnread = [], onMarkAllRead, onNotificationClick,
  onOpenChat, onGoToReleaseNotes, onGoToReleaseNotesEditor, onGoToDashboard, onGoToDocuments, onGoToMessages, onGoToQA,
  currentPage,
  projects = [], onAddProject,
  unreadMessages = 0,
  // Legacy project dropdown props — kept for compatibility but unused in nav
  activeId, onSelectProject, onArchiveProject, onOpenArchive, projectData,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const { isMobile } = useWindowSize()
  const t = useT()

  useEffect(() => {
    function h(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const projectCount = projects.length > 0
    ? projects.length
    : parseInt(localStorage.getItem('jt_project_count') || '0')

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '??'

  const messagesAction = onGoToMessages || onOpenChat

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>

      {/* ── Row 1: Logo + Actions ── */}
      <div style={{
        height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isMobile ? '0 12px' : '0 20px',
        gap: 12,
      }}>
        {/* Left: Logo + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src={theme === 'dark' ? '/logo-white.png' : '/logo-dark.png'}
            alt="Intelisale"
            style={{ height: 28, flexShrink: 0 }}
          />
          {!isMobile && (
            <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 16, color: 'var(--text)', flexShrink: 0 }}>
              Project Insight Hub
            </span>
          )}
        </div>

        {/* Right: Bell + Sep + Gear + Sep + Avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>

          <NotificationBell
            unreadCount={unreadCount}
            notifications={recentUnread}
            onMarkAllRead={onMarkAllRead}
            onNotificationClick={onNotificationClick}
          />

          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

          <IconBtn onClick={onOpenSettings} title={t('topbar.settings')}>
            <IconCog />
          </IconBtn>

          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

          {/* Avatar dropdown */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setMenuOpen(o => !o)}
              title={user?.name}
              style={{
                width: isMobile ? 40 : 36, height: isMobile ? 40 : 36, borderRadius: '50%',
                background: 'var(--accent)', color: '#fff',
                fontFamily: 'Syne', fontWeight: 700, fontSize: 13,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', cursor: 'pointer', transition: 'background 0.15s', flexShrink: 0,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accentHover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--accent)'}
            >
              {initials}
            </button>

            {menuOpen && (
              <div style={{
                position: 'absolute', right: 0, top: 42,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, minWidth: 200,
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)', overflow: 'hidden', zIndex: 200,
              }}>
                {/* User info header */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{user?.name}</div>
                  <div style={{ fontFamily: "'DM Mono'", fontSize: 11, color: 'var(--textMuted)', marginTop: 2 }}>{user?.email}</div>
                </div>
                {/* Users (admin only) */}
                {onOpenUsers && (
                  <button
                    onClick={() => { onOpenUsers(); setMenuOpen(false) }}
                    style={dropItemStyle}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surfaceAlt)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <IconUsers />
                    {t('topbar.users')}
                  </button>
                )}
                {/* Logout */}
                <button
                  onClick={() => { onLogout(); setMenuOpen(false) }}
                  style={{ ...dropItemStyle, color: 'var(--red)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surfaceAlt)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <IconLogout />
                  {t('topbar.logout')}
                </button>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Row 2: Module Nav ── */}
      <div style={{
        borderTop: '1px solid var(--border)',
        background: 'var(--bg)',
        padding: isMobile ? '8px 12px' : '10px 20px',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        WebkitOverflowScrolling: 'touch',
      }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 'max-content' }}>

          <ModuleCard
            icon={<IconGrid />}
            iconBg="rgba(79,142,247,0.12)" iconColor="var(--accent)"
            label={t('topbar.nav.dashboard')}
            subtitle={`${projectCount} ${t('topbar.nav.dashboardSub')}`}
            active={currentPage === 'dashboard'}
            onClick={onGoToDashboard}
            hideSubtitle={isMobile}
          />

          <ModuleCard
            icon={<IconDoc />}
            iconBg="rgba(34,197,94,0.12)" iconColor="var(--green)"
            label={t('topbar.nav.releaseNotes')}
            subtitle={t('topbar.nav.releaseNotesSub')}
            active={currentPage === 'releaseNotes'}
            onClick={onGoToReleaseNotes}
            hideSubtitle={isMobile}
          />

          {onGoToReleaseNotesEditor && (
            <ModuleCard
              icon={<IconClipboard />}
              iconBg="rgba(20,184,166,0.12)" iconColor="#14B8A6"
              label={t('topbar.nav.releaseNotesEditor')}
              subtitle={t('topbar.nav.releaseNotesEditorSub')}
              active={currentPage === 'releaseNotesEditor'}
              onClick={onGoToReleaseNotesEditor}
              hideSubtitle={isMobile}
            />
          )}

          <ModuleCard
            icon={<IconFolder />}
            iconBg="rgba(245,158,11,0.12)" iconColor="var(--amber)"
            label={t('topbar.nav.documents')}
            subtitle={t('topbar.nav.documentsSub')}
            active={currentPage === 'documents'}
            onClick={onGoToDocuments}
            hideSubtitle={isMobile}
          />

          <ModuleCard
            icon={<IconChat />}
            iconBg="rgba(168,85,247,0.12)" iconColor="#A855F7"
            label={t('topbar.nav.messages')}
            subtitle={unreadMessages > 0 ? `${unreadMessages} ${t('topbar.nav.messagesSub')}` : t('topbar.nav.messagesSubEmpty')}
            active={currentPage === 'messages'}
            onClick={messagesAction}
            badge={unreadMessages}
            hideSubtitle={isMobile}
          />

          <ModuleCard
            icon={<IconQA />}
            iconBg="rgba(20,184,166,0.15)" iconColor="#14B8A6"
            label={t('topbar.nav.qa')}
            subtitle={t('topbar.nav.qaSub')}
            active={currentPage === 'qa'}
            onClick={onGoToQA}
            hideSubtitle={isMobile}
          />

        </div>
      </div>

    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const dropItemStyle = {
  display: 'flex', alignItems: 'center', gap: 10,
  width: '100%', textAlign: 'left', padding: '10px 16px',
  fontFamily: "'DM Sans', -apple-system, sans-serif",
  fontSize: 14, color: 'var(--text)',
  border: 'none', background: 'transparent',
  cursor: 'pointer', transition: 'background 0.15s',
}
