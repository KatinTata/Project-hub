import { useState, useEffect, lazy } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { api } from './api.js'
import LoginPage from './pages/LoginPage.jsx'
import BrainAnimation from './components/BrainAnimation.jsx'
import AppShell from './components/shell/AppShell.jsx'
import { useLang } from './lang.jsx'
import { setCalcConfig } from './utils/calcConfig.js'
import { isClientRole } from './utils/roles.js'

// Pages are code-split: each loads its own chunk on first navigation, so the
// login/initial load no longer ships the whole app (pdfjs, tiptap, dnd-kit).
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'))
const ReleaseNotesPage = lazy(() => import('./pages/ReleaseNotesPage.jsx'))
const ReleaseNotesEditorPage = lazy(() => import('./pages/releaseNotesEditor/ReleaseNotesEditorPage.jsx'))
const DocumentsPage = lazy(() => import('./pages/DocumentsPage.jsx'))
const MessagesPage = lazy(() => import('./pages/MessagesPage.jsx'))
// QAPage (Pitanja i odgovori) privremeno uklonjena iz navigacije i ruta (04.09.2026) — fajl ostaje.
const AiUsagePage = lazy(() => import('./pages/aiUsage/AiUsagePage.jsx'))
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'))
const UsersPage = lazy(() => import('./pages/UsersPage.jsx'))

// A3: navigacija ide kroz react-router — rute su jedini izvor istine za
// aktivnu stranicu; deep-link parametri: /projects/:projectId/:tab,
// /release-notes/:noteId, /release-notes/editor?step=N, /messages?project=N,
// /settings/:section. Sve ulogovane rute su umotane u AppShell (bočni meni).
export default function App() {
  const [user, setUser] = useState(null)
  const { setLang } = useLang() // jezik iz profila korisnika (users.lang) preuzima prednost pri prijavi
  const [checking, setChecking] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const token = localStorage.getItem('jt_token')
    if (!token) { setChecking(false); return }
    api.me()
      .then(res => { setUser(res.user); if (res.user?.lang) setLang(res.user.lang) })
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
    if (userData?.lang) setLang(userData.lang)
    // ostajemo na traženoj ruti — Routes je renderuje čim user postoji
  }

  function handleLogout() {
    localStorage.removeItem('jt_token')
    setUser(null)
    navigate('/')
  }

  function handleUserUpdate(updated) {
    const prevHasJira = !!(user?.jiraUrl && user?.jiraEmail)
    setUser(updated)
    if (!prevHasJira && updated.jiraUrl) {
      window.location.reload()
    }
  }

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
        <BrainAnimation opacity={0.35} fullscreen />
        <div style={{ color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", position: 'relative', zIndex: 1 }}>Učitavam...</div>
      </div>
    )
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />
  }

  const isSuperAdmin = user.role === 'super_admin'

  // Klijent (rola user) nema pristup internim rutama ni direktnim URL-om —
  // server ionako odbija te API-je, ali ni ekran ne sme da se prikaže.
  const isClient = isClientRole(user.role)
  const internalOnly = element => (isClient ? <Navigate to="/" replace /> : element)

  const dashboard = <DashboardPage user={user} />

  return (
    <AppShell user={user} onLogout={handleLogout}>
      <Routes>
        <Route path="/" element={dashboard} />
        <Route path="/projects/new" element={internalOnly(dashboard)} />
        <Route path="/projects/:projectId" element={dashboard} />
        <Route path="/projects/:projectId/:tab" element={dashboard} />
        <Route path="/release-notes" element={<ReleaseNotesPage user={user} />} />
        <Route path="/release-notes/editor" element={internalOnly(<ReleaseNotesEditorPage user={user} />)} />
        <Route path="/release-notes/:noteId" element={<ReleaseNotesPage user={user} />} />
        <Route path="/documents" element={<DocumentsPage user={user} />} />
        <Route path="/messages" element={<MessagesPage user={user} />} />
        <Route path="/ai-usage" element={<AiUsagePage user={user} />} />
        <Route path="/settings" element={<Navigate to="/settings/profile" replace />} />
        <Route path="/settings/:section" element={<SettingsPage user={user} onUserUpdate={handleUserUpdate} isSuperAdmin={isSuperAdmin} />} />
        <Route path="/users" element={internalOnly(<UsersPage isSuperAdmin={isSuperAdmin} />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}
