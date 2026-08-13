import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useWindowSize } from '../hooks/useWindowSize.js'
import NotificationBell from './NotificationBell.jsx'
import { useT } from '../lang.jsx'
import { isClientRole } from '../utils/roles.js'
import { getEffectiveTheme } from '../theme.js'
import { IconCog, IconGrid, IconDoc, IconClipboard, IconFolder, IconChat, IconUsers, IconAi, IconQA, IconLogout } from '../ui/icons.jsx'

// URL → aktivna kartica u navigaciji (A3: jedini izvor istine je ruta)
function pageFromPath(pathname) {
  if (pathname.startsWith('/release-notes/editor')) return 'releaseNotesEditor'
  if (pathname.startsWith('/release-notes')) return 'releaseNotes'
  if (pathname.startsWith('/documents')) return 'documents'
  if (pathname.startsWith('/messages')) return 'messages'
  if (pathname.startsWith('/qa')) return 'qa'
  if (pathname.startsWith('/ai-usage')) return 'aiUsage'
  return 'dashboard'
}

// ── Icon Button ───────────────────────────────────────────────────────────────

function IconBtn({ onClick, title, children }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
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
          fontFamily: "'Hanken Grotesk', -apple-system, sans-serif",
          fontSize: 12, fontWeight: 600,
          color: active ? 'var(--accent)' : 'var(--text)',
          lineHeight: 1.3, whiteSpace: 'nowrap',
        }}>{label}</span>
        {!hideSubtitle && (
          <span style={{
            fontFamily: "'Hanken Grotesk', sans-serif",
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
          fontSize: 9, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 700,
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
  projects = [],
  unreadMessages = 0,
  messagesProjectId, // opcioni preselect projekta za chat (dashboard)
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const { isMobile } = useWindowSize()
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const currentPage = pageFromPath(location.pathname)
  const isClient = isClientRole(user?.role)
  // Logo mora da prati STVARNO prikazanu temu: `theme` može biti 'system'
  // (tada odlučuje OS), a neke stranice ga uopšte ne proslede — zato fallback
  // na sačuvani izbor umesto poređenja theme === 'dark'.
  const effectiveTheme = getEffectiveTheme(theme || localStorage.getItem('jt_theme') || 'dark')

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
            src={effectiveTheme === 'dark' ? '/logo-white.png' : '/logo-dark.png'}
            alt="Intelisale"
            style={{ height: 28, flexShrink: 0 }}
          />
          {!isMobile && (
            <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 16, color: 'var(--text)', flexShrink: 0 }}>
              {/* P3-1: klijent vidi naziv svoje organizacije umesto naziva alata */}
              {isClient && user?.organizationName ? user.organizationName : 'Project Insight Hub'}
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
                fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 13,
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
                  <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{user?.name}</div>
                  <div style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, color: 'var(--textMuted)', marginTop: 2 }}>{user?.email}</div>
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
            onClick={() => navigate('/')}
            hideSubtitle={isMobile}
          />

          <ModuleCard
            icon={<IconDoc />}
            iconBg="rgba(34,197,94,0.12)" iconColor="var(--green)"
            label={t('topbar.nav.releaseNotes')}
            subtitle={t('topbar.nav.releaseNotesSub')}
            active={currentPage === 'releaseNotes'}
            onClick={() => navigate('/release-notes')}
            hideSubtitle={isMobile}
          />

          {!isClient && (
            <ModuleCard
              icon={<IconClipboard />}
              iconBg="rgba(20,184,166,0.12)" iconColor="#14B8A6"
              label={t('topbar.nav.releaseNotesEditor')}
              subtitle={t('topbar.nav.releaseNotesEditorSub')}
              active={currentPage === 'releaseNotesEditor'}
              onClick={() => navigate('/release-notes/editor')}
              hideSubtitle={isMobile}
            />
          )}

          <ModuleCard
            icon={<IconFolder />}
            iconBg="rgba(245,158,11,0.12)" iconColor="var(--amber)"
            label={t('topbar.nav.documents')}
            subtitle={t('topbar.nav.documentsSub')}
            active={currentPage === 'documents'}
            onClick={() => navigate('/documents')}
            hideSubtitle={isMobile}
          />

          <ModuleCard
            icon={<IconChat />}
            iconBg="rgba(168,85,247,0.12)" iconColor="#A855F7"
            label={t('topbar.nav.messages')}
            subtitle={unreadMessages > 0 ? `${unreadMessages} ${t('topbar.nav.messagesSub')}` : t('topbar.nav.messagesSubEmpty')}
            active={currentPage === 'messages'}
            onClick={() => navigate(`/messages${messagesProjectId ? `?project=${messagesProjectId}` : ''}`)}
            badge={unreadMessages}
            hideSubtitle={isMobile}
          />

          <ModuleCard
            icon={<IconQA />}
            iconBg="rgba(20,184,166,0.15)" iconColor="#14B8A6"
            label={t('topbar.nav.qa')}
            subtitle={t('topbar.nav.qaSub')}
            active={currentPage === 'qa'}
            onClick={() => navigate('/qa')}
            hideSubtitle={isMobile}
          />

          <ModuleCard
            icon={<IconAi />}
            iconBg="rgba(14,165,233,0.14)" iconColor="#0EA5E9"
            label={t('nav2.aiUsage')}
            subtitle={t('nav2.aiUsageSub')}
            active={currentPage === 'aiUsage'}
            onClick={() => navigate('/ai-usage')}
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
  fontFamily: "'Hanken Grotesk', -apple-system, sans-serif",
  fontSize: 14, color: 'var(--text)',
  border: 'none', background: 'transparent',
  cursor: 'pointer', transition: 'background 0.15s',
}
