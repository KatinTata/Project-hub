import { useState, useRef, useEffect } from 'react'
import { api } from '../../api.js'
import { useT, useLang } from '../../lang.jsx'
import { isClientRole } from '../../utils/roles.js'
import {
  IconDoc, IconClipboard, IconFolder, IconChat, IconUsers, IconAi, IconCog, IconLogout,
  IconPlus, IconArchive, IconChevronUpDown, IconClose, IconUser, IconGlobe,
} from '../../ui/icons.jsx'

// Jedinstveni bočni meni (odluka 08.09.2026): Projekti / Portal / Administracija
// + korisnik na dnu. Isti sadržaj se renderuje kao stalna kolona na desktopu i
// kao fioka na mobilnom (AppShell odlučuje). Aktivna stavka se izvodi iz rute.

function roleLabel(t, role) {
  if (role === 'super_admin') return t('um.roleSuperAdmin')
  if (role === 'admin') return t('um.roleAdmin')
  return t('um.roleUser')
}

function initialsOf(name) {
  if (!name) return '??'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function NavItem({ active, icon, label, badge = 0, sub, onClick }) {
  return (
    <button
      type="button"
      className={`nav-item${active ? ' nav-item--active' : ''}${sub ? ' nav-item--sub' : ''}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      {icon}
      <span className="nav-item__label">{label}</span>
      {badge > 0 && <span className="nav-item__badge">{badge > 99 ? '99+' : badge}</span>}
    </button>
  )
}

export default function Sidebar({
  user, projects = [], statusById = {}, activeProjectId = null,
  page, unreadMessages = 0, onNavigate, onOpenArchive, onLogout, onClose,
}) {
  const t = useT()
  const { lang, setLang: setLangLocal } = useLang()
  const isClient = isClientRole(user?.role)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    function h(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    function k(e) { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', h)
    document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [menuOpen])

  // Izbor jezika važi odmah (localStorage) i pamti se na nalogu (users.lang)
  function changeLang(l) {
    setLangLocal(l)
    api.setMyLang(l).catch(() => {})
  }

  function go(path) {
    setMenuOpen(false)
    onNavigate(path)
  }

  const isProjectsPage = page === 'dashboard'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px 12px 12px', boxSizing: 'border-box' }}>

      {/* Logo + (klijent) naziv organizacije */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '4px 10px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <img src="/logo-dark.png" alt="Intelisale" style={{ height: 26, width: 'auto', flexShrink: 0 }} />
          {isClient && user?.organizationName && (
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user.organizationName}
            </span>
          )}
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label={t('nav.closeMenu')} className="nav-item" style={{ width: 44, minHeight: 44, padding: 0, justifyContent: 'center', marginRight: -10 }}>
            <IconClose />
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {/* ── Projekti ── */}
        <span className="nav-label" style={{ marginTop: 16 }}>{t('nav.projects')}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {projects.length === 0 && (
            <span style={{ padding: '6px 10px', fontSize: 12, color: 'var(--textSubtle)' }}>{t('nav.noProjects')}</span>
          )}
          {projects.map(p => (
            <button
              key={p.id}
              type="button"
              className={`nav-item nav-item--project${isProjectsPage && p.id === activeProjectId ? ' nav-item--active' : ''}`}
              onClick={() => go(`/projects/${p.id}`)}
              aria-current={isProjectsPage && p.id === activeProjectId ? 'page' : undefined}
              title={p.displayName || p.epicKey}
            >
              <span className="nav-dot" style={{ background: statusById[p.id] || 'var(--border)' }} />
              <span className="nav-item__label">{p.displayName || p.epicKey}</span>
            </button>
          ))}
          {!isClient && (
            <>
              <NavItem sub icon={<IconPlus />} label={t('nav.newProject')} active={page === 'newProject'} onClick={() => go('/projects/new')} />
              <NavItem sub icon={<IconArchive />} label={t('nav.archive')} onClick={() => { setMenuOpen(false); onOpenArchive?.() }} />
            </>
          )}
        </div>

        {/* ── Portal ── */}
        <span className="nav-label">{t('nav.portal')}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <NavItem icon={<IconDoc />} label={t('nav.releaseNotes')} active={page === 'releaseNotes'} onClick={() => go('/release-notes')} />
          <NavItem icon={<IconFolder />} label={t('nav.documents')} active={page === 'documents'} onClick={() => go('/documents')} />
          <NavItem icon={<IconChat />} label={t('nav.messages')} badge={unreadMessages} active={page === 'messages'}
            onClick={() => go(`/messages${activeProjectId ? `?project=${activeProjectId}` : ''}`)} />
          <NavItem icon={<IconAi />} label={t('nav.aiUsage')} active={page === 'aiUsage'} onClick={() => go('/ai-usage')} />
        </div>

        {/* ── Administracija (samo interni tim) ── */}
        {!isClient && (
          <>
            <span className="nav-label">{t('nav.admin')}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <NavItem icon={<IconClipboard />} label={t('nav.rnEditor')} active={page === 'releaseNotesEditor'} onClick={() => go('/release-notes/editor')} />
              <NavItem icon={<IconUsers size={18} />} label={t('nav.users')} active={page === 'users'} onClick={() => go('/users')} />
              <NavItem icon={<IconCog />} label={t('nav.settings')} active={page === 'settings'} onClick={() => go('/settings')} />
            </div>
          </>
        )}
      </div>

      {/* ── Korisnik na dnu: Profil / Jezik / Odjava ── */}
      <div ref={menuRef} style={{ position: 'relative', marginTop: 12 }}>
        {menuOpen && (
          <div role="menu" aria-label={t('nav.userMenu')} style={{
            position: 'absolute', left: 0, right: 0, bottom: 'calc(100% + 6px)',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
            boxShadow: 'var(--shadow-pop)', overflow: 'hidden', zIndex: 20,
          }}>
            <button type="button" role="menuitem" className="nav-menu-item" onClick={() => go('/settings/profile')}>
              <IconUser />{t('nav.profile')}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', fontSize: 13, color: 'var(--text)' }}>
              <IconGlobe />
              <span style={{ flex: 1 }}>{t('nav.language')}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {['sr', 'en'].map(l => (
                  <button key={l} type="button" role="menuitemradio" aria-checked={lang === l} onClick={() => changeLang(l)}
                    className="ui-btn ui-btn--pill" style={{ padding: '3px 9px', fontSize: 11, textTransform: 'uppercase', borderColor: lang === l ? 'var(--accent)' : undefined, color: lang === l ? 'var(--accent)' : undefined }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" role="menuitem" className="nav-menu-item" style={{ color: 'var(--red)', borderTop: '1px solid var(--border)' }} onClick={() => { setMenuOpen(false); onLogout() }}>
              <IconLogout size={16} />{t('nav.logout')}
            </button>
          </div>
        )}
        <button type="button" className="nav-user" onClick={() => setMenuOpen(o => !o)} aria-haspopup="menu" aria-expanded={menuOpen}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {initialsOf(user?.name)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</span>
            <span style={{ fontSize: 11, color: 'var(--textMuted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {isClient && user?.organizationName ? user.organizationName : roleLabel(t, user?.role)}
            </span>
          </div>
          <span style={{ color: 'var(--textMuted)', display: 'flex' }}><IconChevronUpDown /></span>
        </button>
      </div>
    </div>
  )
}
