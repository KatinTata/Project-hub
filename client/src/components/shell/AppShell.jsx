import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation, matchPath } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../api.js'
import { useT } from '../../lang.jsx'
import { useWindowSize } from '../../hooks/useWindowSize.js'
import { isClientRole } from '../../utils/roles.js'
import { useProjectsQuery, useProjectDataQueries, useNotificationsQuery } from '../../queries.js'
import NotificationBell from '../NotificationBell.jsx'
import ArchiveModal from '../ArchiveModal.jsx'
import Sidebar from './Sidebar.jsx'
import { IconMenu } from '../../ui/icons.jsx'

// AppShell: okvir svake ulogovane strane — bočni meni (desktop) ili fioka
// (mobilni), tanko zaglavlje (naziv strane + zvonce) i sadržaj koji skroluje.
// Stranice više ne renderuju sopstveni Topbar — App.jsx ih umotava ovde.

const SIDEBAR_W = 240

// URL → aktivna stavka menija (ruta je jedini izvor istine, A3)
export function pageFromPath(pathname) {
  if (pathname.startsWith('/release-notes/editor')) return 'releaseNotesEditor'
  if (pathname.startsWith('/release-notes')) return 'releaseNotes'
  if (pathname.startsWith('/documents')) return 'documents'
  if (pathname.startsWith('/messages')) return 'messages'
  if (pathname.startsWith('/ai-usage')) return 'aiUsage'
  if (pathname.startsWith('/users')) return 'users'
  if (pathname.startsWith('/settings')) return 'settings'
  if (pathname === '/projects/new') return 'newProject'
  return 'dashboard'
}

// Boja tačke uz projekat — ista logika kao nekadašnji ProjectTabs.statusDot
function statusColor(data) {
  if (!data) return null
  const pct = data.total > 0 ? data.done / data.total : 0
  if (pct >= 0.8) return 'var(--green)'
  if (pct >= 0.4) return 'var(--amber)'
  return 'var(--red)'
}

export default function AppShell({ user, onLogout, children }) {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { isMobile } = useWindowSize()
  const isClient = isClientRole(user?.role)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)

  // Server state — deljeni keš sa DashboardPage (isti query ključevi)
  const projectsQuery = useProjectsQuery()
  const projects = useMemo(() => projectsQuery.data || [], [projectsQuery.data])
  // enabled:false — samo čita keš/localStorage, fetch pokreće Dashboard
  const dataQueries = useProjectDataQueries(projects, { isClient, enabled: false })
  const statusById = useMemo(() => {
    const out = {}
    projects.forEach((p, i) => { out[p.id] = statusColor(dataQueries[i]?.data?.data) })
    return out
  }, [projects, dataQueries])

  const notificationsQuery = useNotificationsQuery()
  const unreadCount = notificationsQuery.data?.count ?? 0
  const recentUnread = notificationsQuery.data?.messages ?? []

  // Aktivni projekat i tab iz rute; na "/" — prvi projekat (kao Dashboard)
  const page = pageFromPath(location.pathname)
  const projMatch = matchPath({ path: '/projects/:projectId/:tab?' }, location.pathname)
  const rawId = projMatch?.params?.projectId
  const paramId = rawId && rawId !== 'new' ? (/^\d+$/.test(rawId) ? Number(rawId) : rawId) : null
  const activeProjectId = (paramId != null && projects.some(p => p.id === paramId))
    ? paramId
    : (page === 'dashboard' ? (projects[0]?.id ?? null) : (paramId ?? projects[0]?.id ?? null))
  const activeTab = projMatch?.params?.tab || 'tasks'
  const activeProject = projects.find(p => p.id === activeProjectId)

  // Fioka se zatvara pri svakoj navigaciji iz menija i na Escape
  function navigateFromMenu(path) {
    setDrawerOpen(false)
    navigate(path)
  }
  useEffect(() => {
    if (!drawerOpen) return
    function k(e) { if (e.key === 'Escape') setDrawerOpen(false) }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [drawerOpen])

  async function handleMarkAllRead() {
    try {
      await Promise.all([api.markAllRead(), api.markAlertsRead().catch(() => {})])
      queryClient.setQueryData(['notifications'], { count: 0, messages: [] })
    } catch { /* best-effort */ }
  }

  function handleNotificationClick(n) {
    // Upozorenja (P3-3) vode na relevantan ekran, poruke u chat
    if (n.kind === 'alert') {
      if (n.type === 'new_release') navigate('/release-notes')
      else navigate(n.project_id ? `/projects/${n.project_id}` : '/')
      return
    }
    const pid = n.project_id || activeProjectId
    navigate(`/messages${pid ? `?project=${pid}` : ''}`)
  }

  async function handleRestoreProject(project) {
    const { project: restored } = await api.restoreProject(project.id)
    queryClient.setQueryData(['projects'], old => [...(old || []), restored])
    navigate(`/projects/${restored.id}`)
  }

  // Zaglavlje: nadnaslov (grupa) + naslov strane
  const header = (() => {
    switch (page) {
      case 'newProject': return { kicker: t('nav.kicker.project'), title: t('nav.title.newProject') }
      case 'releaseNotes': return { kicker: t('nav.kicker.portal'), title: t('nav.releaseNotes') }
      case 'releaseNotesEditor': return { kicker: t('nav.kicker.admin'), title: t('nav.rnEditor') }
      case 'documents': return { kicker: t('nav.kicker.portal'), title: t('nav.documents') }
      case 'messages': return { kicker: t('nav.kicker.portal'), title: t('nav.messages') }
      case 'aiUsage': return { kicker: t('nav.kicker.portal'), title: t('nav.aiUsage') }
      case 'users': return { kicker: t('nav.kicker.admin'), title: t('nav.users') }
      case 'settings': return { kicker: isClient ? t('nav.kicker.account') : t('nav.kicker.admin'), title: t('nav.settings') }
      default: return { kicker: t('nav.kicker.project'), title: activeProject?.display_name || activeProject?.epic_key || t('nav.title.projects') }
    }
  })()

  const sidebar = (
    <Sidebar
      user={user}
      projects={projects}
      statusById={statusById}
      activeProjectId={activeProjectId}
      activeTab={activeTab}
      page={page}
      unreadMessages={unreadCount}
      onNavigate={navigateFromMenu}
      onOpenArchive={() => { setDrawerOpen(false); setArchiveOpen(true) }}
      onLogout={onLogout}
      onClose={isMobile ? () => setDrawerOpen(false) : undefined}
    />
  )

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', color: 'var(--text)', overflow: 'hidden' }}>

      {!isMobile && (
        <aside aria-label={t('nav.userMenu')} style={{ width: SIDEBAR_W, flexShrink: 0, background: 'var(--surface)', borderRight: '1px solid var(--border)', height: '100%' }}>
          {sidebar}
        </aside>
      )}

      {isMobile && drawerOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400 }}>
          <div onClick={() => setDrawerOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,21,35,0.45)' }} />
          <aside role="dialog" aria-modal="true" aria-label={t('nav.openMenu')} style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 'min(300px, 85vw)', background: 'var(--surface)', boxShadow: 'var(--shadow-modal)' }}>
            {sidebar}
          </aside>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          height: isMobile ? 56 : 60, padding: isMobile ? '0 8px 0 4px' : '0 32px', flexShrink: 0,
          background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            {isMobile && (
              <button type="button" onClick={() => setDrawerOpen(true)} aria-label={t('nav.openMenu')} aria-expanded={drawerOpen}
                style={{ width: 44, height: 44, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }}>
                <IconMenu />
              </button>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              {!isMobile && (
                <span style={{ fontSize: 11, color: 'var(--textSubtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{header.kicker}</span>
              )}
              <span style={{ fontSize: isMobile ? 16 : 17, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{header.title}</span>
            </div>
          </div>
          <NotificationBell
            unreadCount={unreadCount}
            notifications={recentUnread}
            onMarkAllRead={handleMarkAllRead}
            onNotificationClick={handleNotificationClick}
          />
        </header>

        <main id="app-content" style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative' }}>
          {children}
        </main>
      </div>

      {archiveOpen && (
        <ArchiveModal onClose={() => setArchiveOpen(false)} onRestore={handleRestoreProject} />
      )}
    </div>
  )
}
