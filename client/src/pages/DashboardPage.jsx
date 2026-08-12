import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import Topbar from '../components/Topbar.jsx'
import ProjectTabs from '../components/ProjectTabs.jsx'
import ProjectCard from '../components/ProjectCard.jsx'
import ArchiveModal from '../components/ArchiveModal.jsx'
import BrainAnimation from '../components/BrainAnimation.jsx'
import ClientNotificationModal from '../components/ClientNotificationModal.jsx'
import AddProjectPage from './AddProjectPage.jsx'
import { api } from '../api.js'
import { DEMO_PROJECTS } from '../utils.js'
import { useProjectsQuery, useProjectDataQueries, useNotificationsQuery, clearProjectCache } from '../queries.js'
import { useWindowSize } from '../hooks/useWindowSize.js'
import { useT } from '../lang.jsx'
import { isClientRole } from '../utils/roles.js'
import { toast } from '../ui/Toast.jsx'

export default function DashboardPage({ user: initialUser, theme, onSetTheme, onLogout, onOpenSettings, onOpenUsers }) {
  const [user, setUser] = useState(initialUser)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [editingProject, setEditingProject] = useState(null) // project being edited (filter criteria)
  const [clientModalOpen, setClientModalOpen] = useState(false)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()
  // /projects/new renderuje AddProjectPage; /projects/:projectId/:tab bira projekat i tab
  const addingProject = location.pathname === '/projects/new'

  const t = useT()
  const hasJira = !!(user.jiraUrl && user.jiraEmail) || !!user.sharedJira
  // Demo only when there is truly no Jira access (no own creds and no shared
  // super-admin connection) and no projects to show.
  const [demoMode, setDemoMode] = useState(false)
  const isClient = isClientRole(user.role)
  const { isMobile } = useWindowSize()

  const [autoRefreshTime, setAutoRefreshTime] = useState(() =>
    localStorage.getItem('jt_autorefresh') || ''
  )

  // ── Server state (React Query, A2) ─────────────────────────────────────────
  const projectsQuery = useProjectsQuery({ enabled: !demoMode })
  const serverProjects = projectsQuery.data
  const projects = demoMode ? DEMO_PROJECTS : (serverProjects || [])

  const dataQueries = useProjectDataQueries(demoMode ? [] : projects, { isClient })
  const { projectData, loadingProjects, errorProjects, lastRefresh, prevProjectData } = useMemo(() => {
    const projectData = {}, loadingProjects = {}, errorProjects = {}, lastRefresh = {}, prevProjectData = {}
    if (demoMode) {
      const now = Date.now()
      DEMO_PROJECTS.forEach(p => { projectData[p.id] = p.data; lastRefresh[p.id] = now })
    } else {
      projects.forEach((p, i) => {
        const q = dataQueries[i]
        if (!q) return
        if (q.data) {
          projectData[p.id] = q.data.data
          lastRefresh[p.id] = q.data.fetchedAt
          if (q.data.prev) prevProjectData[p.id] = q.data.prev
        }
        loadingProjects[p.id] = q.isPending && q.isFetching
        errorProjects[p.id] = q.error ? q.error.message : null
      })
    }
    return { projectData, loadingProjects, errorProjects, lastRefresh, prevProjectData }
  }, [demoMode, projects, dataQueries])
  const refreshing = !demoMode && dataQueries.some(q => q.isFetching)

  // Prazna lista bez Jira pristupa → demo režim (samo interni korisnici)
  useEffect(() => {
    if (demoMode || !projectsQuery.isSuccess) return
    if (!isClient && (serverProjects || []).length === 0 && !hasJira) setDemoMode(true)
  }, [projectsQuery.isSuccess, serverProjects, demoMode, isClient, hasJira])
  useEffect(() => {
    if (projectsQuery.isError && !isClient && !hasJira) setDemoMode(true)
  }, [projectsQuery.isError, isClient, hasJira])

  // Aktivni projekat iz URL-a (/projects/:projectId); bez parametra — prvi iz liste
  const paramId = params.projectId
    ? (/^\d+$/.test(params.projectId) ? Number(params.projectId) : params.projectId)
    : null
  const activeId = (paramId != null && projects.some(p => p.id === paramId))
    ? paramId
    : (projects[0]?.id ?? null)
  const activeTab = params.tab || 'tasks'
  function setActiveId(id) {
    navigate(id != null ? `/projects/${id}` : '/')
  }
  function setActiveTab(tab) {
    if (activeId == null) return
    navigate(tab === 'tasks' ? `/projects/${activeId}` : `/projects/${activeId}/${tab}`)
  }
  useEffect(() => {
    if (serverProjects) localStorage.setItem('jt_project_count', serverProjects.length)
  }, [serverProjects])

  const initialized = demoMode || projectsQuery.isSuccess || projectsQuery.isError

  // Listen for setting changes from SettingsModal
  useEffect(() => {
    function onChanged() {
      setAutoRefreshTime(localStorage.getItem('jt_autorefresh') || '')
    }
    window.addEventListener('jt-autorefresh-changed', onChanged)
    return () => window.removeEventListener('jt-autorefresh-changed', onChanged)
  }, [])

  // Auto-refresh — fires once daily at the scheduled time
  useEffect(() => {
    if (!autoRefreshTime || demoMode) return
    let timeoutId
    function msUntilNext(timeStr) {
      const [h, m] = timeStr.split(':').map(Number)
      const now = new Date()
      const target = new Date(now)
      target.setHours(h, m, 0, 0)
      if (target <= now) target.setDate(target.getDate() + 1)
      return target - now
    }
    function scheduleNext() {
      timeoutId = setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ['projectData'] })
        scheduleNext()
      }, msUntilNext(autoRefreshTime))
    }
    scheduleNext()
    return () => clearTimeout(timeoutId)
  }, [autoRefreshTime, demoMode, queryClient])

  useEffect(() => { setUser(initialUser) }, [initialUser])

  function goToMessages(projectId) {
    navigate(`/messages${projectId ? `?project=${projectId}` : ''}`)
  }

  // Notifikacije: 60s polling, pauza u pozadini + refetch na fokus, backoff
  // na greške — sve kroz React Query (B4 ponašanje očuvano).
  const notificationsQuery = useNotificationsQuery({ enabled: !demoMode })
  const unreadCount = notificationsQuery.data?.count ?? 0
  const recentUnread = notificationsQuery.data?.messages ?? []

  // Client modal — show once per session
  useEffect(() => {
    if (isClient && unreadCount > 0 && !sessionStorage.getItem('notif_modal_shown')) {
      setClientModalOpen(true)
      sessionStorage.setItem('notif_modal_shown', '1')
    }
  }, [isClient, unreadCount])

  function setProjectsList(updater) {
    queryClient.setQueryData(['projects'], old => updater(old || []))
  }

  function handleRefreshClick() {
    if (activeProject) queryClient.refetchQueries({ queryKey: ['projectData', activeProject.id] })
  }

  async function handleAddProject(payload) {
    const { project } = await api.addProject({ ...payload })
    setProjectsList(list => [...list, project])
    setActiveId(project.id) // napušta /projects/new; novi projekat nema keš — query sam povlači podatke
  }

  async function handleUpdateProject(payload) {
    const { project } = await api.updateProject(editingProject.id, payload)
    setProjectsList(list => list.map(p => p.id === project.id ? project : p))
    setEditingProject(null)
    clearProjectCache(project.id) // uklonjen keš + query → remount → svež fetch
  }

  async function handleArchiveProject(id) {
    try {
      await api.archiveProject(id)
      setProjectsList(list => list.filter(p => p.id !== id))
      if (activeId === id) {
        const rest = projects.filter(p => p.id !== id)
        setActiveId(rest[0]?.id || null)
      }
      clearProjectCache(id)
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleRestoreProject(project) {
    try {
      const { project: restored } = await api.restoreProject(project.id)
      setProjectsList(list => [...list, restored])
      setActiveId(restored.id)
    } catch (err) {
      toast.error(err.message)
    }
  }

  function handleLogout() {
    localStorage.removeItem('jt_token')
    onLogout()
  }

  async function handleMarkAllRead() {
    try {
      await api.markAllRead()
      queryClient.setQueryData(['notifications'], { count: 0, messages: [] })
    } catch {}
  }

  function handleNotificationClick(n) {
    goToMessages(n.project_id || activeId || null)
  }

  const activeProject = projects.find(p => p.id === activeId)

  if (!initialized) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 16 }}>{t('app.loading')}</div>
      </div>
    )
  }

  if (addingProject) {
    return (
      <AddProjectPage
        onAdd={handleAddProject}
        onCancel={() => navigate('/')}
      />
    )
  }

  if (editingProject) {
    return (
      <AddProjectPage
        editProject={editingProject}
        onAdd={handleUpdateProject}
        onCancel={() => setEditingProject(null)}
      />
    )
  }

  return (
    <div className="page-in" style={{ minHeight: '100vh', background: 'var(--bg)', position: 'relative' }}>
      {/* Global background animation */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <BrainAnimation opacity={0.45} fullscreen />
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>
      <Topbar
        user={user}
        theme={theme}
        onOpenSettings={isClient ? undefined : onOpenSettings}
        onLogout={handleLogout}
        unreadCount={unreadCount}
        recentUnread={recentUnread}
        onMarkAllRead={handleMarkAllRead}
        onNotificationClick={handleNotificationClick}
        onOpenUsers={isClient ? undefined : onOpenUsers}
        unreadMessages={unreadCount}
        projects={projects}
        messagesProjectId={activeProject?.id || null}
      />

      {projects.length > 0 && (
        <ProjectTabs
          projects={projects}
          activeId={activeId}
          onSelect={setActiveId}
          onAdd={!isClient && !demoMode ? () => navigate('/projects/new') : undefined}
          onArchive={isClient ? undefined : handleArchiveProject}
          onOpenArchive={isClient ? undefined : () => setArchiveOpen(true)}
          projectData={projectData}
        />
      )}

      {projects.length > 0 ? (
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '16px' : '28px' }}>
          {demoMode && !isClient && (
            <div className="glass-card" style={{
              marginBottom: 20,
              padding: '12px 16px',
              background: 'var(--amberTint)',
              border: '1px solid var(--amber)',
              borderRadius: 10,
              fontSize: 14,
              fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
              color: 'var(--amber)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <span>⚙️</span>
              <span>
                {t('dash.demoNotice')}{' '}
                <button onClick={() => onOpenSettings?.()} style={{ color: 'var(--amber)', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}>
                  {t('dash.settings')}
                </button>{' '}
                {t('dash.demoNotice2')}
              </span>
            </div>
          )}

          {activeProject && (
            <ProjectCard
              key={activeProject.id}
              project={activeProject}
              data={projectData[activeProject.id]}
              loading={!!loadingProjects[activeProject.id]}
              error={errorProjects[activeProject.id]}
              onArchive={() => handleArchiveProject(activeProject.id)}
              hasJira={!demoMode}
              refreshing={refreshing}
              lastRefresh={lastRefresh[activeProject.id] || null}
              onRefresh={handleRefreshClick}
              previousData={prevProjectData[activeProject.id]?.data}
              previousTime={prevProjectData[activeProject.id]?.time}
              isClient={isClient}
              isSuperAdmin={user.role === 'super_admin'}
              jiraUrl={user.jiraUrl}
              autoRefreshTime={autoRefreshTime}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onOpenMessages={() => goToMessages(activeProject?.id || null)}
              onEditProject={!isClient && !demoMode ? () => setEditingProject(activeProject) : undefined}
            />
          )}
        </div>
      ) : isClient ? (
        <div style={{ maxWidth: 480, margin: '80px auto', padding: '0 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>📋</div>
          <h2 style={{ fontFamily: 'Hanken Grotesk', fontWeight: 800, fontSize: 22, color: 'var(--text)', marginBottom: 12 }}>
            {t('dash.noProjects')}
          </h2>
          <p style={{ color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 15, lineHeight: 1.6 }}>
            {t('dash.noProjectsSub')}
          </p>
        </div>
      ) : (
        <div style={{ maxWidth: 560, margin: '60px auto', padding: '0 16px' }}>
          {/* Welcome header */}
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <img
              src="/logo-white.png"
              alt="Intelisale"
              style={{ height: 36, marginBottom: 20, opacity: 0.9 }}
            />
            <h2 style={{ fontFamily: 'Hanken Grotesk', fontWeight: 800, fontSize: 26, color: 'var(--text)', marginBottom: 10 }}>
              {t('dash.welcome')}
            </h2>
            <p style={{ color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 15, lineHeight: 1.6 }}>
              {t('dash.welcomeSub')}
            </p>
          </div>

          {/* Steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
            {[
              // Admins inherit the org's (super-admin) Jira connection — they must
              // NOT be told to connect anything (jira-config is super-admin only).
              (!user.jiraUrl && user.sharedJira)
                ? {
                    step: '1',
                    done: true,
                    title: 'Jira konekcija — nasleđena',
                    desc: 'Koristiš zajedničku Jira konekciju organizacije. Ne moraš ništa da povezuješ — idi pravo na korak 2.',
                  }
                : {
                    step: '1',
                    done: hasJira,
                    title: t('dash.step1'),
                    desc: t('dash.step1Sub'),
                    action: { label: t('dash.openSettings'), onClick: () => onOpenSettings?.() },
                  },
              {
                step: '2',
                done: false,
                title: t('dash.step2'),
                desc: t('dash.step2Sub'),
                disabled: !hasJira,
                action: { label: 'Dodaj projekat', onClick: () => navigate('/projects/new') },
              },
              {
                step: '3',
                done: false,
                title: t('dash.step3'),
                desc: t('dash.step3Sub'),
                disabled: !hasJira,
              },
            ].map(s => (
              <div key={s.step} className="glass-card" style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 16,
                padding: '16px 20px',
                background: 'var(--surface)',
                border: `1px solid ${s.done ? 'var(--green)' : 'var(--border)'}`,
                borderRadius: 12,
                opacity: s.disabled ? 0.45 : 1,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: s.done ? 'var(--green)' : 'var(--accent)',
                  color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Hanken Grotesk', fontWeight: 800, fontSize: 14,
                }}>
                  {s.done ? '✓' : s.step}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 3 }}>
                    {s.title}
                  </div>
                  <div style={{ fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, color: 'var(--textMuted)', lineHeight: 1.5 }}>
                    {s.desc}
                  </div>
                  {s.action && !s.disabled && (
                    <button
                      onClick={s.action.onClick}
                      style={{
                        marginTop: 10,
                        background: 'var(--accent)', color: '#fff', border: 'none',
                        borderRadius: 7, padding: '7px 16px',
                        fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      {s.action.label} →
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => onOpenSettings?.()}
            style={{
              display: 'none',
              background: 'var(--accent)',
              color: '#fff',
              borderRadius: 8,
              padding: '11px 24px',
              fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
              fontWeight: 600,
              fontSize: 15,
              cursor: 'pointer',
              border: 'none',
            }}
          >
            {t('dash.openSettings')}
          </button>
        </div>
      )}

      {archiveOpen && (
        <ArchiveModal
          onClose={() => setArchiveOpen(false)}
          onRestore={handleRestoreProject}
        />
      )}

      {clientModalOpen && (
        <ClientNotificationModal
          notifications={recentUnread}
          onClose={() => setClientModalOpen(false)}
          onOpenChat={() => { setClientModalOpen(false); goToMessages(activeProject?.id || null) }}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes notif-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.15); }
        }
        .glass-card {
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
        }
      `}</style>
      </div>
    </div>
  )
}
