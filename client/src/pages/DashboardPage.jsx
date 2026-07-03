import { useState, useEffect, useRef } from 'react'
import Topbar from '../components/Topbar.jsx'
import ProjectTabs from '../components/ProjectTabs.jsx'
import ProjectCard from '../components/ProjectCard.jsx'
import ArchiveModal from '../components/ArchiveModal.jsx'
import BrainAnimation from '../components/BrainAnimation.jsx'
import ClientNotificationModal from '../components/ClientNotificationModal.jsx'
import AddProjectPage from './AddProjectPage.jsx'
import { api } from '../api.js'
import { processEpicData, DEMO_PROJECTS } from '../utils.js'
import { buildStackMatrix } from '../utils/stacks.js'
import { useWindowSize } from '../hooks/useWindowSize.js'
import { useT } from '../lang.jsx'

export default function DashboardPage({ user: initialUser, theme, onSetTheme, onLogout, onOpenSettings, onOpenUsers, onGoToReleaseNotes, onGoToReleaseNotesEditor, onGoToDocuments, onGoToMessages, onGoToQA, openChatOnMount, onChatMountConsumed }) {
  const [user, setUser] = useState(initialUser)
  const [projects, setProjects] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [projectData, setProjectData] = useState({})
  const [loadingProjects, setLoadingProjects] = useState({})
  const [errorProjects, setErrorProjects] = useState({})
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [addingProject, setAddingProject] = useState(false)
  const [editingProject, setEditingProject] = useState(null) // project being edited (filter criteria)
  const [initialized, setInitialized] = useState(false)
  const [lastRefresh, setLastRefresh] = useState({})
  const [refreshing, setRefreshing] = useState(false)
  const [prevProjectData, setPrevProjectData] = useState({})
  const [unreadCount, setUnreadCount] = useState(0)
  const [recentUnread, setRecentUnread] = useState([])
  const [clientModalOpen, setClientModalOpen] = useState(false)
  const projectsRef = useRef([])

  const t = useT()
  const hasJira = !!(user.jiraUrl && user.jiraEmail)
  const isClient = user.role === 'client'
  const { isMobile } = useWindowSize()

  const [autoRefreshTime, setAutoRefreshTime] = useState(() =>
    localStorage.getItem('jt_autorefresh') || ''
  )

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
    if (!autoRefreshTime) return
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
        if (projectsRef.current.length > 0) refreshAll(projectsRef.current)
        scheduleNext()
      }, msUntilNext(autoRefreshTime))
    }
    scheduleNext()
    return () => clearTimeout(timeoutId)
  }, [autoRefreshTime])

  useEffect(() => { setUser(initialUser) }, [initialUser])

  useEffect(() => {
    if (openChatOnMount) {
      onGoToMessages?.(activeId || null)
      onChatMountConsumed?.()
    }
  }, [openChatOnMount])

  useEffect(() => {
    loadProjects()
  }, [])

  // Notification polling — every 60s
  useEffect(() => {
    if (!hasJira && !isClient) return
    async function loadNotifications() {
      try {
        const [{ count }, messages] = await Promise.all([
          api.getUnreadCount(),
          api.getRecentUnread(),
        ])
        setUnreadCount(count)
        setRecentUnread(messages)
        // Client modal — show once per session
        if (isClient && count > 0 && !sessionStorage.getItem('notif_modal_shown')) {
          setClientModalOpen(true)
          sessionStorage.setItem('notif_modal_shown', '1')
        }
      } catch {}
    }
    loadNotifications()
    const interval = setInterval(loadNotifications, 60000)
    return () => clearInterval(interval)
  }, [hasJira, isClient])

  function saveProjectCache(projectId, data) {
    try {
      localStorage.setItem(`jt_cache_${projectId}`, JSON.stringify({ data, ts: Date.now() }))
    } catch {}
  }

  function loadProjectCache(projectId) {
    try {
      const raw = localStorage.getItem(`jt_cache_${projectId}`)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }

  async function loadProjects() {
    if (!hasJira && !isClient) {
      setProjects(DEMO_PROJECTS)
      projectsRef.current = DEMO_PROJECTS
      setActiveId(DEMO_PROJECTS[0].id)
      const demoData = {}
      const demoTs = {}
      const now = Date.now()
      DEMO_PROJECTS.forEach(p => { demoData[p.id] = p.data; demoTs[p.id] = now })
      setProjectData(demoData)
      setLastRefresh(demoTs)
      setInitialized(true)
      return
    }

    try {
      const list = await api.getProjects()
      setProjects(list)
      projectsRef.current = list
      localStorage.setItem('jt_project_count', list.length)
      if (list.length > 0) {
        setActiveId(list[0].id)

        // Load cached data — no Jira API call on every page visit
        const cachedData = {}
        let latestTs = null
        for (const p of list) {
          const cached = loadProjectCache(p.id)
          if (cached) {
            cachedData[p.id] = cached.data
            if (!latestTs || cached.ts > latestTs) latestTs = cached.ts
          }
        }
        if (Object.keys(cachedData).length > 0) {
          setProjectData(cachedData)
          if (latestTs) {
            const tsMap = {}
            for (const p of list) {
              const cached = loadProjectCache(p.id)
              if (cached?.ts) tsMap[p.id] = cached.ts
            }
            setLastRefresh(tsMap)
          }
        }

        // Only fetch from Jira for projects with no cache yet (first use)
        const uncached = list.filter(p => !cachedData[p.id])
        if (uncached.length > 0) {
          await refreshAll(uncached)
        }
      }
    } catch (err) {
      console.error('Failed to load projects', err)
    } finally {
      setInitialized(true)
    }
  }

  async function fetchProjectData(project) {
    setLoadingProjects(prev => ({ ...prev, [project.id]: true }))
    setErrorProjects(prev => ({ ...prev, [project.id]: null }))
    try {
      const { parents, subtasks, hasBillableField } = await api.getTasks(project)
      const data = processEpicData(parents, subtasks)
      data.hasBillableField = !!hasBillableField
      const fetchedAt = Date.now()
      saveProjectCache(project.id, data)

      // Daily snapshot (history) — fire and forget; server keeps one per day
      if (!isClient && typeof project.id === 'number') {
        try {
          const sm = buildStackMatrix(data.tasks, [])
          const stacks = {}
          for (const s of sm.stacks) stacks[s] = { plan: sm.colTotals[s].plan, spent: sm.colTotals[s].spent, remaining: sm.colTotals[s].remaining }
          const billableSpent = (data.tasks || []).filter(t => t.billable).reduce((acc, t) => acc + (t.spent || 0), 0)
          api.saveSnapshot(project.id, {
            total: data.total, done: data.done, inprog: data.inprog, testing: data.testing, todo: data.todo,
            totalEst: data.totalEst, totalSpent: data.totalSpent, remainingEst: sm.grand.remaining, billableSpent, stacks,
          }).catch(() => {})
        } catch {}
      }
      setLastRefresh(prev => ({ ...prev, [project.id]: fetchedAt }))
      setProjectData(prev => {
        const current = prev[project.id]
        if (current) {
          setPrevProjectData(p => ({ ...p, [project.id]: { data: current, time: fetchedAt } }))
        }
        return { ...prev, [project.id]: data }
      })
    } catch (err) {
      setErrorProjects(prev => ({ ...prev, [project.id]: err.message }))
    } finally {
      setLoadingProjects(prev => ({ ...prev, [project.id]: false }))
    }
  }

  async function refreshAll(list) {
    if (!hasJira && !isClient) return
    setRefreshing(true)
    await Promise.all(list.map(p => fetchProjectData(p)))
    setRefreshing(false)
  }

  function handleRefreshClick() {
    if (activeProject) fetchProjectData(activeProject)
  }

  async function handleAddProject(payload) {
    const { project } = await api.addProject({ ...payload })
    const next = [...projectsRef.current, project]
    setProjects(next)
    projectsRef.current = next
    setActiveId(project.id)
    setAddingProject(false)
    fetchProjectData(project)
  }

  async function handleUpdateProject(payload) {
    const { project } = await api.updateProject(editingProject.id, payload)
    const next = projectsRef.current.map(p => p.id === project.id ? project : p)
    setProjects(next)
    projectsRef.current = next
    setEditingProject(null)
    localStorage.removeItem(`jt_cache_${project.id}`)
    fetchProjectData(project)
  }

  async function handleArchiveProject(id) {
    try {
      await api.archiveProject(id)
      const next = projectsRef.current.filter(p => p.id !== id)
      setProjects(next)
      projectsRef.current = next
      if (activeId === id) setActiveId(next[0]?.id || null)
      setProjectData(prev => { const n = { ...prev }; delete n[id]; return n })
      localStorage.removeItem(`jt_cache_${id}`)
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleRestoreProject(project) {
    try {
      const { project: restored } = await api.restoreProject(project.id)
      const next = [...projectsRef.current, restored]
      setProjects(next)
      projectsRef.current = next
      setActiveId(restored.id)
      fetchProjectData(restored)
    } catch (err) {
      alert(err.message)
    }
  }

  function handleLogout() {
    localStorage.removeItem('jt_token')
    onLogout()
  }

  async function handleMarkAllRead() {
    try {
      await api.markAllRead()
      setUnreadCount(0)
      setRecentUnread([])
    } catch {}
  }

  function handleNotificationClick(n) {
    onGoToMessages?.(n.project_id || activeId || null)
  }

  const activeProject = projects.find(p => p.id === activeId)

  if (!initialized) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--textMuted)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 16 }}>{t('app.loading')}</div>
      </div>
    )
  }

  if (addingProject) {
    return (
      <AddProjectPage
        onAdd={handleAddProject}
        onCancel={() => setAddingProject(false)}
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
        currentPage="dashboard"
        onOpenSettings={isClient ? undefined : onOpenSettings}
        onLogout={handleLogout}
        unreadCount={unreadCount}
        recentUnread={recentUnread}
        onMarkAllRead={handleMarkAllRead}
        onNotificationClick={handleNotificationClick}
        onGoToMessages={onGoToMessages ? () => onGoToMessages(activeProject?.id || null) : undefined}
        onOpenUsers={isClient ? undefined : onOpenUsers}
        onOpenChat={undefined}

        onGoToDashboard={undefined}
        onGoToReleaseNotes={onGoToReleaseNotes}
        onGoToReleaseNotesEditor={isClient ? undefined : onGoToReleaseNotesEditor}
        onGoToDocuments={onGoToDocuments}
        onGoToQA={onGoToQA}
        unreadMessages={unreadCount}
        projects={projects}
        activeId={activeId}
        onSelectProject={setActiveId}
        onArchiveProject={isClient ? undefined : handleArchiveProject}
        onOpenArchive={isClient ? undefined : () => setArchiveOpen(true)}
        projectData={projectData}
        onAddProject={hasJira && !isClient ? () => setAddingProject(true) : undefined}
      />

      {projects.length > 0 && (
        <ProjectTabs
          projects={projects}
          activeId={activeId}
          onSelect={setActiveId}
          onAdd={hasJira && !isClient ? () => setAddingProject(true) : undefined}
          onArchive={isClient ? undefined : handleArchiveProject}
          onOpenArchive={isClient ? undefined : () => setArchiveOpen(true)}
          projectData={projectData}
        />
      )}

      {projects.length > 0 ? (
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '16px' : '28px' }}>
          {!hasJira && !isClient && (
            <div className="glass-card" style={{
              marginBottom: 20,
              padding: '12px 16px',
              background: 'var(--amberTint)',
              border: '1px solid var(--amber)',
              borderRadius: 10,
              fontSize: 14,
              fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
              color: 'var(--amber)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <span>⚙️</span>
              <span>
                {t('dash.demoNotice')}{' '}
                <button onClick={() => setSettingsOpen(true)} style={{ color: 'var(--amber)', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}>
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
              hasJira={hasJira || isClient}
              refreshing={refreshing}
              lastRefresh={lastRefresh[activeProject.id] || null}
              onRefresh={handleRefreshClick}
              previousData={prevProjectData[activeProject.id]?.data}
              previousTime={prevProjectData[activeProject.id]?.time}
              isClient={isClient}
              isSuperAdmin={user.role === 'super_admin'}
              jiraUrl={user.jiraUrl}
              autoRefreshTime={autoRefreshTime}
              onOpenMessages={() => onGoToMessages?.(activeProject?.id || null)}
              onEditProject={hasJira && !isClient ? () => setEditingProject(activeProject) : undefined}
            />
          )}
        </div>
      ) : isClient ? (
        <div style={{ maxWidth: 480, margin: '80px auto', padding: '0 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>📋</div>
          <h2 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 22, color: 'var(--text)', marginBottom: 12 }}>
            {t('dash.noProjects')}
          </h2>
          <p style={{ color: 'var(--textMuted)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 15, lineHeight: 1.6 }}>
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
            <h2 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 26, color: 'var(--text)', marginBottom: 10 }}>
              {t('dash.welcome')}
            </h2>
            <p style={{ color: 'var(--textMuted)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 15, lineHeight: 1.6 }}>
              {t('dash.welcomeSub')}
            </p>
          </div>

          {/* Steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
            {[
              {
                step: '1',
                done: hasJira,
                title: t('dash.step1'),
                desc: t('dash.step1Sub'),
                action: { label: t('dash.openSettings'), onClick: () => setSettingsOpen(true) },
              },
              {
                step: '2',
                done: false,
                title: t('dash.step2'),
                desc: t('dash.step2Sub'),
                disabled: !hasJira,
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
                  fontFamily: 'Syne', fontWeight: 800, fontSize: 14,
                }}>
                  {s.done ? '✓' : s.step}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 3 }}>
                    {s.title}
                  </div>
                  <div style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, color: 'var(--textMuted)', lineHeight: 1.5 }}>
                    {s.desc}
                  </div>
                  {s.action && (
                    <button
                      onClick={s.action.onClick}
                      style={{
                        marginTop: 10,
                        background: 'var(--accent)', color: '#fff', border: 'none',
                        borderRadius: 7, padding: '7px 16px',
                        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, fontSize: 13,
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
            onClick={() => setSettingsOpen(true)}
            style={{
              display: 'none',
              background: 'var(--accent)',
              color: '#fff',
              borderRadius: 8,
              padding: '11px 24px',
              fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
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
          onOpenChat={() => { setClientModalOpen(false); onGoToMessages?.(activeProject?.id || null) }}
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
