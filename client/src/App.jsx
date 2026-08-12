import { useState, useEffect, lazy } from 'react'
import { applyTheme, getEffectiveTheme } from './theme.js'
import { api } from './api.js'
import LoginPage from './pages/LoginPage.jsx'
import BrainAnimation from './components/BrainAnimation.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import UserManagementModal from './components/UserManagementModal.jsx'
import { setCalcConfig } from './utils/calcConfig.js'

// Pages are code-split: each loads its own chunk on first navigation, so the
// login/initial load no longer ships the whole app (pdfjs, tiptap, dnd-kit).
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'))
const ReleaseNotesPage = lazy(() => import('./pages/ReleaseNotesPage.jsx'))
const ReleaseNotesEditorPage = lazy(() => import('./pages/releaseNotesEditor/ReleaseNotesEditorPage.jsx'))
const DocumentsPage = lazy(() => import('./pages/DocumentsPage.jsx'))
const MessagesPage = lazy(() => import('./pages/MessagesPage.jsx'))
const QAPage = lazy(() => import('./pages/QAPage.jsx'))
const AiUsagePage = lazy(() => import('./pages/AiUsagePage.jsx'))

// Single source of truth for URL <-> page mapping, so the initial load, login
// and browser Back/Forward all resolve the same way.
function pageFromPath(pathname) {
  if (pathname === '/release-notes/editor') return 'releaseNotesEditor'
  if (pathname.startsWith('/release-notes')) return 'releaseNotes'
  if (pathname.startsWith('/documents')) return 'documents'
  if (pathname.startsWith('/messages')) return 'messages'
  if (pathname.startsWith('/qa')) return 'qa'
  if (pathname.startsWith('/ai-usage')) return 'aiUsage'
  return 'dashboard'
}

const PATH_FOR_PAGE = {
  dashboard: '/',
  releaseNotes: '/release-notes',
  releaseNotesEditor: '/release-notes/editor',
  documents: '/documents',
  messages: '/messages',
  qa: '/qa',
  aiUsage: '/ai-usage',
}

export default function App() {
  const [page, setPage] = useState('login') // 'login' | 'dashboard' | 'releaseNotes' | 'releaseNotesEditor' | 'documents' | 'messages' | 'qa' | 'aiUsage'
  const [user, setUser] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [messagesProjectId, setMessagesProjectId] = useState(null)
  const [openChatOnDashboard, setOpenChatOnDashboard] = useState(false)
  const [usersOpen, setUsersOpen] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('jt_theme') || 'dark')
  const [checking, setChecking] = useState(true)

  // Apply theme and listen for system changes when theme === 'system'
  useEffect(() => {
    applyTheme(theme)
    document.body.style.background = 'var(--bg)'
    document.body.style.color = 'var(--text)'

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => {
        applyTheme('system')
        document.body.style.background = 'var(--bg)'
        document.body.style.color = 'var(--text)'
      }
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme])

  useEffect(() => {
    const token = localStorage.getItem('jt_token')
    if (!token) { setChecking(false); return }
    api.me()
      .then(res => {
        setUser(res.user)
        setPage(pageFromPath(window.location.pathname))
      })
      .catch(() => localStorage.removeItem('jt_token'))
      .finally(() => setChecking(false))
  }, [])

  // Pragovi obračuna iz podešavanja (P2-E2) — jednom po sesiji, defaulti
  // identični hardkodovanim vrednostima pa je pad poziva bezopasan.
  useEffect(() => {
    if (!user) return
    api.getAppSettings().then(setCalcConfig).catch(() => {})
  }, [user])

  // Browser Back/Forward: re-resolve the page from the URL.
  useEffect(() => {
    function onPop() {
      if (localStorage.getItem('jt_token')) setPage(pageFromPath(window.location.pathname))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function handleLogin(userData) {
    setUser(userData)
    setPage(pageFromPath(window.location.pathname))
  }

  function handleLogout() {
    setUser(null)
    setPage('login')
  }

  function handleUserUpdate(updated) {
    const prevHasJira = !!(user?.jiraUrl && user?.jiraEmail)
    setUser(updated)
    setSettingsOpen(false)
    if (!prevHasJira && updated.jiraUrl) {
      window.location.reload()
    }
  }

  function handleSetTheme(mode) {
    localStorage.setItem('jt_theme', mode)
    setTheme(mode)
  }

  const effectiveTheme = getEffectiveTheme(theme)

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
        <BrainAnimation opacity={0.35} fullscreen />
        <div style={{ color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", position: 'relative', zIndex: 1 }}>Učitavam...</div>
      </div>
    )
  }

  const openSettings = () => setSettingsOpen(true)
  const openUsers = () => setUsersOpen(true)
  const isSuperAdmin = user?.role === 'super_admin'
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'

  function navigate(page, pathOverride) {
    const path = pathOverride || PATH_FOR_PAGE[page] || '/'
    if (window.location.pathname !== path) window.history.pushState({}, '', path)
    setPage(page)
  }

  function goToMessages(projectId) {
    setMessagesProjectId(projectId || null)
    navigate('messages')
  }

  const modals = (
    <>
      {settingsOpen && <SettingsModal user={user} theme={theme} onSetTheme={handleSetTheme} onClose={() => setSettingsOpen(false)} onUserUpdate={handleUserUpdate} isSuperAdmin={isSuperAdmin} />}
      {usersOpen && <UserManagementModal onClose={() => setUsersOpen(false)} isSuperAdmin={isSuperAdmin} />}
    </>
  )

  const goToDashboard = () => navigate('dashboard')
  const goToReleaseNotes = () => navigate('releaseNotes')
  const goToReleaseNotesEditor = () => navigate('releaseNotesEditor')
  const goToDocuments = () => navigate('documents')
  const goToQA = () => navigate('qa')
  const goToAiUsage = () => navigate('aiUsage')

  if (page === 'releaseNotes' && user) {
    return (
      <>
        <ReleaseNotesPage
          user={user}
          theme={theme}
          onLogout={handleLogout}
          onGoToDashboard={goToDashboard}
          onGoToEditor={goToReleaseNotesEditor}
          onGoToDocuments={goToDocuments}
          onGoToQA={goToQA}
          onGoToAiUsage={goToAiUsage}
          onOpenSettings={openSettings}
          onOpenUsers={isAdmin ? openUsers : undefined}
          onOpenChat={goToMessages}
        />
        {modals}
      </>
    )
  }

  if (page === 'releaseNotesEditor' && user) {
    return (
      <>
        <ReleaseNotesEditorPage
          user={user}
          theme={theme}
          onLogout={handleLogout}
          onGoToDashboard={goToDashboard}
          onGoToReleaseNotes={goToReleaseNotes}
          onGoToReleaseNotesEditor={goToReleaseNotesEditor}
          onGoToDocuments={goToDocuments}
          onGoToQA={goToQA}
          onGoToAiUsage={goToAiUsage}
          onOpenSettings={openSettings}
          onOpenUsers={isAdmin ? openUsers : undefined}
          onOpenChat={goToMessages}
        />
        {modals}
      </>
    )
  }

  if (page === 'documents' && user) {
    return (
      <>
        <DocumentsPage
          user={user}
          theme={theme}
          onLogout={handleLogout}
          onGoToDashboard={goToDashboard}
          onGoToReleaseNotes={goToReleaseNotes}
          onGoToReleaseNotesEditor={goToReleaseNotesEditor}
          onGoToDocuments={goToDocuments}
          onGoToQA={goToQA}
          onGoToAiUsage={goToAiUsage}
          onOpenSettings={openSettings}
          onOpenUsers={isAdmin ? openUsers : undefined}
          onOpenChat={goToMessages}
        />
        {modals}
      </>
    )
  }

  if (page === 'messages' && user) {
    return (
      <>
        <MessagesPage
          user={user}
          theme={theme}
          onLogout={handleLogout}
          onOpenSettings={openSettings}
          onOpenUsers={isAdmin ? openUsers : undefined}
          onGoToDashboard={goToDashboard}
          onGoToReleaseNotes={goToReleaseNotes}
          onGoToReleaseNotesEditor={goToReleaseNotesEditor}
          onGoToDocuments={goToDocuments}
          onGoToQA={goToQA}
          onGoToAiUsage={goToAiUsage}
          onOpenChat={null}
          initialProjectId={messagesProjectId}
        />
        {modals}
      </>
    )
  }

  if (page === 'aiUsage' && user) {
    return (
      <>
        <AiUsagePage
          user={user}
          onLogout={handleLogout}
          onOpenSettings={openSettings}
          onOpenUsers={isAdmin ? openUsers : undefined}
          onGoToDashboard={goToDashboard}
          onGoToReleaseNotes={goToReleaseNotes}
          onGoToReleaseNotesEditor={goToReleaseNotesEditor}
          onGoToDocuments={goToDocuments}
          onGoToMessages={goToMessages}
          onGoToQA={goToQA}
          onGoToAiUsage={goToAiUsage}
        />
        {modals}
      </>
    )
  }

  if (page === 'qa' && user) {
    return (
      <>
        <QAPage
          user={user}
          theme={theme}
          onLogout={handleLogout}
          onGoToDashboard={goToDashboard}
          onGoToReleaseNotes={goToReleaseNotes}
          onGoToReleaseNotesEditor={goToReleaseNotesEditor}
          onGoToDocuments={goToDocuments}
          onGoToMessages={goToMessages}
          onGoToQA={goToQA}
          onGoToAiUsage={goToAiUsage}
          onOpenSettings={openSettings}
          onOpenUsers={isAdmin ? openUsers : undefined}
        />
        {modals}
      </>
    )
  }

  if (page === 'dashboard' && user) {
    return (
      <>
        <DashboardPage
          user={user}
          theme={theme}
          onSetTheme={handleSetTheme}
          onLogout={handleLogout}
          onOpenSettings={openSettings}
          onOpenUsers={isAdmin ? openUsers : undefined}
          onGoToReleaseNotes={goToReleaseNotes}
          onGoToReleaseNotesEditor={goToReleaseNotesEditor}
          onGoToDocuments={goToDocuments}
          onGoToMessages={goToMessages}
          onGoToQA={goToQA}
          onGoToAiUsage={goToAiUsage}
          openChatOnMount={openChatOnDashboard}
          onChatMountConsumed={() => setOpenChatOnDashboard(false)}
        />
        {modals}
      </>
    )
  }

  return (
    <LoginPage
      effectiveTheme={effectiveTheme}
      onLogin={handleLogin}
    />
  )
}
