import { useState, useEffect, lazy } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { applyTheme, getEffectiveTheme } from './theme.js'
import { api } from './api.js'
import LoginPage from './pages/LoginPage.jsx'
import BrainAnimation from './components/BrainAnimation.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import UserManagementModal from './components/UserManagementModal.jsx'
import { setCalcConfig } from './utils/calcConfig.js'
import { isClientRole } from './utils/roles.js'

// Pages are code-split: each loads its own chunk on first navigation, so the
// login/initial load no longer ships the whole app (pdfjs, tiptap, dnd-kit).
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'))
const ReleaseNotesPage = lazy(() => import('./pages/ReleaseNotesPage.jsx'))
const ReleaseNotesEditorPage = lazy(() => import('./pages/releaseNotesEditor/ReleaseNotesEditorPage.jsx'))
const DocumentsPage = lazy(() => import('./pages/DocumentsPage.jsx'))
const MessagesPage = lazy(() => import('./pages/MessagesPage.jsx'))
const QAPage = lazy(() => import('./pages/QAPage.jsx'))
const AiUsagePage = lazy(() => import('./pages/aiUsage/AiUsagePage.jsx'))

// A3: navigacija ide kroz react-router — rute su jedini izvor istine za
// aktivnu stranicu; deep-link parametri: /projects/:projectId/:tab,
// /release-notes/:noteId, /release-notes/editor?step=N, /messages?project=N.
export default function App() {
  const [user, setUser] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [usersOpen, setUsersOpen] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('jt_theme') || 'dark')
  const [checking, setChecking] = useState(true)
  const navigate = useNavigate()

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
      .then(res => setUser(res.user))
      .catch(() => localStorage.removeItem('jt_token'))
      .finally(() => setChecking(false))
  }, [])

  // Pragovi obračuna iz podešavanja (P2-E2) — jednom po sesiji, defaulti
  // identični hardkodovanim vrednostima pa je pad poziva bezopasan.
  useEffect(() => {
    if (!user) return
    api.getAppSettings().then(setCalcConfig).catch(() => {})
  }, [user])

  function handleLogin(userData) {
    setUser(userData)
    // ostajemo na traženoj ruti — Routes je renderuje čim user postoji
  }

  function handleLogout() {
    setUser(null)
    navigate('/')
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

  if (!user) {
    return <LoginPage effectiveTheme={effectiveTheme} onLogin={handleLogin} />
  }

  const openSettings = () => setSettingsOpen(true)
  const openUsers = () => setUsersOpen(true)
  const isSuperAdmin = user.role === 'super_admin'
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'

  // Zajednički propovi za sve stranice (modali žive ovde; navigacija kroz router)
  const shared = {
    user,
    theme,
    onLogout: handleLogout,
    onOpenSettings: openSettings,
    onOpenUsers: isAdmin ? openUsers : undefined,
  }

  const dashboard = <DashboardPage {...shared} onSetTheme={handleSetTheme} />

  // Klijent (rola user) nema pristup internim rutama ni direktnim URL-om —
  // server ionako odbija te API-je, ali ni ekran ne sme da se prikaže.
  const isClient = isClientRole(user.role)
  const internalOnly = element => (isClient ? <Navigate to="/" replace /> : element)

  return (
    <>
      <Routes>
        <Route path="/" element={dashboard} />
        <Route path="/projects/new" element={internalOnly(dashboard)} />
        <Route path="/projects/:projectId" element={dashboard} />
        <Route path="/projects/:projectId/:tab" element={dashboard} />
        <Route path="/release-notes" element={<ReleaseNotesPage {...shared} />} />
        <Route path="/release-notes/editor" element={internalOnly(<ReleaseNotesEditorPage {...shared} />)} />
        <Route path="/release-notes/:noteId" element={<ReleaseNotesPage {...shared} />} />
        <Route path="/documents" element={<DocumentsPage {...shared} />} />
        <Route path="/messages" element={<MessagesPage {...shared} />} />
        <Route path="/qa" element={<QAPage {...shared} />} />
        <Route path="/ai-usage" element={<AiUsagePage user={user} onLogout={handleLogout} onOpenSettings={openSettings} onOpenUsers={isAdmin ? openUsers : undefined} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {settingsOpen && <SettingsModal user={user} theme={theme} onSetTheme={handleSetTheme} onClose={() => setSettingsOpen(false)} onUserUpdate={handleUserUpdate} isSuperAdmin={isSuperAdmin} />}
      {usersOpen && <UserManagementModal onClose={() => setUsersOpen(false)} isSuperAdmin={isSuperAdmin} />}
    </>
  )
}
