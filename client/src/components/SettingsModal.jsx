import { useState } from 'react'
import { api } from '../api.js'
import { useWindowSize } from '../hooks/useWindowSize.js'
import { useT, useLang } from '../lang.jsx'
import { toast } from '../ui/Toast.jsx'

function IconUser() {
  return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 15, height: 15, flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>
}
function IconLink() {
  return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 15, height: 15, flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>
}
function IconSparkle() {
  return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 15, height: 15, flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" /></svg>
}
function IconClock() {
  return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 15, height: 15, flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
}
function IconPalette() {
  return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 15, height: 15, flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 0 0 5.304 0l6.401-6.402M6.75 21A3.75 3.75 0 0 1 3 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 0 0 3.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008Z" /></svg>
}

export default function SettingsModal({ user, theme, onSetTheme, onClose, onUserUpdate, isSuperAdmin }) {
  const t = useT()
  const { lang, setLang } = useLang()
  const [tab, setTab] = useState('profile')
  const [jiraUrl, setJiraUrl] = useState(user.jiraUrl || '')
  const [jiraEmail, setJiraEmail] = useState(user.jiraEmail || '')
  const [jiraToken, setJiraToken] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [aiSaving, setAiSaving] = useState(false)
  const [aiSaveMsg, setAiSaveMsg] = useState(null)
  const [testStatus, setTestStatus] = useState(null)
  const [testLoading, setTestLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [pwMsg, setPwMsg] = useState(null)
  const [pwLoading, setPwLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const { isMobile } = useWindowSize()

  async function handleTestJira() {
    if (!jiraUrl || !jiraEmail || !jiraToken) {
      setTestStatus({ ok: false, msg: t('settings.jira.missingFields') })
      return
    }
    setTestLoading(true)
    setTestStatus(null)
    try {
      const res = await api.testJiraConnection({ jiraUrl, jiraEmail, jiraToken })
      setTestStatus({ ok: true, msg: t('set2.jira.testSuccess', { name: res.displayName }) })
    } catch (err) {
      setTestStatus({ ok: false, msg: `❌ ${err.message}` })
    } finally {
      setTestLoading(false)
    }
  }

  async function handleSaveJira() {
    setSaving(true)
    setSaveMsg(null)
    try {
      await api.updateJiraConfig({ jiraUrl, jiraEmail, jiraToken: jiraToken || undefined })
      onUserUpdate({ ...user, jiraUrl, jiraEmail })
      setSaveMsg({ ok: true, msg: t('settings.jira.saved') })
    } catch (err) {
      setSaveMsg({ ok: false, msg: err.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    if (!oldPassword || !newPassword) return
    setPwLoading(true)
    setPwMsg(null)
    try {
      const resp = await api.changePassword({ oldPassword, newPassword })
      // Server posle promene lozinke poništava stare tokene i vraća nov (P1-11)
      if (resp?.token) localStorage.setItem('jt_token', resp.token)
      setPwMsg({ ok: true, msg: t('settings.password.changed') })
      setOldPassword('')
      setNewPassword('')
    } catch (err) {
      setPwMsg({ ok: false, msg: err.message })
    } finally {
      setPwLoading(false)
    }
  }

  async function handleDeleteAccount() {
    try {
      await api.deleteAccount()
      localStorage.removeItem('jt_token')
      window.location.href = '/login'
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleSaveAi() {
    setAiSaving(true)
    setAiSaveMsg(null)
    try {
      await api.updateAiConfig({ anthropicKey: anthropicKey || undefined })
      setAnthropicKey('')
      setAiSaveMsg({ ok: true, msg: t('settings.ai.saved') })
    } catch (err) {
      setAiSaveMsg({ ok: false, msg: err.message })
    } finally {
      setAiSaving(false)
    }
  }

  const [autoRefreshTime, setAutoRefreshTime] = useState(() =>
    localStorage.getItem('jt_autorefresh') || ''
  )

  function handleAutoRefreshChange(time) {
    localStorage.setItem('jt_autorefresh', time)
    setAutoRefreshTime(time)
    window.dispatchEvent(new Event('jt-autorefresh-changed'))
  }

  const isUser = user?.role === 'user'

  const tabs = isSuperAdmin
    ? [
        { key: 'profile',    label: t('settings.tab.profile'),    icon: <IconUser /> },
        { key: 'jira',       label: t('settings.tab.jira'),       icon: <IconLink /> },
        { key: 'appearance', label: t('settings.tab.appearance'), icon: <IconPalette /> },
        { key: 'ai',         label: t('settings.tab.ai'),         icon: <IconSparkle /> },
        { key: 'refresh',    label: t('set2.tab.refresh'),        icon: <IconClock /> },
      ]
    : isUser
    ? [
        { key: 'profile',    label: t('settings.tab.profile'),    icon: <IconUser /> },
        { key: 'appearance', label: t('settings.tab.appearance'), icon: <IconPalette /> },
      ]
    : [
        { key: 'profile',    label: t('settings.tab.profile'),    icon: <IconUser /> },
        { key: 'appearance', label: t('settings.tab.appearance'), icon: <IconPalette /> },
        { key: 'refresh',    label: t('set2.tab.refresh'),        icon: <IconClock /> },
      ]

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
      display: 'flex',
      alignItems: isMobile ? 'flex-end' : 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }} onClick={isMobile ? undefined : onClose}>
      <div style={{
        background: 'var(--surface)',
        border: isMobile ? 'none' : '1px solid var(--border)',
        borderRadius: isMobile ? '16px 16px 0 0' : 16,
        width: isMobile ? '100%' : 560,
        maxHeight: isMobile ? '92vh' : '85vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding: isMobile ? '16px' : '20px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}>
          <h2 style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: isMobile ? 18 : 20, color: 'var(--text)' }}>{t('settings.title')}</h2>
          <button onClick={onClose} style={{ fontSize: 18, color: 'var(--textMuted)', padding: 8, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {isMobile ? (
          /* Mobile: horizontal tab bar at top */
          <>
            <div style={{
              display: 'flex',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
              overflowX: 'auto',
              scrollbarWidth: 'none',
            }}>
              {tabs.map(tb => (
                <button
                  key={tb.key}
                  onClick={() => setTab(tb.key)}
                  style={{
                    flex: 1,
                    padding: '12px 8px',
                    fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
                    fontSize: 13,
                    color: tab === tb.key ? 'var(--accent)' : 'var(--textMuted)',
                    borderBottom: tab === tb.key ? '2px solid var(--accent)' : '2px solid transparent',
                    background: 'transparent',
                    whiteSpace: 'nowrap',
                    minHeight: 44,
                    transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  }}
                >{tb.icon}{tb.label}</button>
              ))}
            </div>
            <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
              <SettingsContent
                tab={tab}
                isMobile={isMobile}
                user={user}
                theme={theme} onSetTheme={onSetTheme}
                lang={lang} setLang={setLang}
                jiraUrl={jiraUrl} setJiraUrl={setJiraUrl}
                jiraEmail={jiraEmail} setJiraEmail={setJiraEmail}
                jiraToken={jiraToken} setJiraToken={setJiraToken}
                testStatus={testStatus} testLoading={testLoading} onTestJira={handleTestJira}
                saving={saving} saveMsg={saveMsg} onSaveJira={handleSaveJira}
                anthropicKey={anthropicKey} setAnthropicKey={setAnthropicKey}
                aiSaving={aiSaving} aiSaveMsg={aiSaveMsg} onSaveAi={handleSaveAi}
                hasAnthropicKey={user.hasAnthropicKey}
                oldPassword={oldPassword} setOldPassword={setOldPassword}
                newPassword={newPassword} setNewPassword={setNewPassword}
                pwMsg={pwMsg} pwLoading={pwLoading} onChangePassword={handleChangePassword}
                deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm}
                onDeleteAccount={handleDeleteAccount}
                autoRefreshTime={autoRefreshTime} onAutoRefreshChange={handleAutoRefreshChange}
              />
            </div>
          </>
        ) : (
          /* Desktop: sidebar + content */
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <div style={{ width: 180, borderRight: '1px solid var(--border)', padding: '12px 8px', flexShrink: 0 }}>
              {tabs.map(tb => (
                <button
                  key={tb.key}
                  onClick={() => setTab(tb.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9,
                    width: '100%',
                    textAlign: 'left',
                    padding: '9px 12px',
                    borderRadius: 8,
                    borderTop: 'none', borderRight: 'none', borderBottom: 'none',
                    borderLeft: `3px solid ${tab === tb.key ? 'var(--accent)' : 'transparent'}`,
                    fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
                    fontSize: 14,
                    color: tab === tb.key ? 'var(--accent)' : 'var(--textMuted)',
                    background: tab === tb.key ? 'rgba(79,142,247,0.08)' : 'transparent',
                    marginBottom: 2,
                    transition: 'all 0.15s',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => { if (tab !== tb.key) e.currentTarget.style.background = 'var(--surfaceAlt)' }}
                  onMouseLeave={e => { if (tab !== tb.key) e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{ color: tab === tb.key ? 'var(--accent)' : 'var(--textMuted)', display: 'flex', flexShrink: 0 }}>{tb.icon}</span>
                  {tb.label}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto' }}>
              <SettingsContent
                tab={tab}
                isMobile={isMobile}
                user={user}
                theme={theme} onSetTheme={onSetTheme}
                lang={lang} setLang={setLang}
                jiraUrl={jiraUrl} setJiraUrl={setJiraUrl}
                jiraEmail={jiraEmail} setJiraEmail={setJiraEmail}
                jiraToken={jiraToken} setJiraToken={setJiraToken}
                testStatus={testStatus} testLoading={testLoading} onTestJira={handleTestJira}
                saving={saving} saveMsg={saveMsg} onSaveJira={handleSaveJira}
                anthropicKey={anthropicKey} setAnthropicKey={setAnthropicKey}
                aiSaving={aiSaving} aiSaveMsg={aiSaveMsg} onSaveAi={handleSaveAi}
                hasAnthropicKey={user.hasAnthropicKey}
                oldPassword={oldPassword} setOldPassword={setOldPassword}
                newPassword={newPassword} setNewPassword={setNewPassword}
                pwMsg={pwMsg} pwLoading={pwLoading} onChangePassword={handleChangePassword}
                deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm}
                onDeleteAccount={handleDeleteAccount}
                autoRefreshTime={autoRefreshTime} onAutoRefreshChange={handleAutoRefreshChange}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const REFRESH_TIMES = [
  '', '00:00', '02:00', '04:00', '06:00', '08:00', '09:00',
  '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00',
]

function SettingsContent({
  tab, isMobile, user, theme, onSetTheme, lang, setLang,
  jiraUrl, setJiraUrl, jiraEmail, setJiraEmail, jiraToken, setJiraToken,
  testStatus, testLoading, onTestJira,
  saving, saveMsg, onSaveJira,
  anthropicKey, setAnthropicKey, aiSaving, aiSaveMsg, onSaveAi, hasAnthropicKey,
  oldPassword, setOldPassword, newPassword, setNewPassword,
  pwMsg, pwLoading, onChangePassword,
  deleteConfirm, setDeleteConfirm, onDeleteAccount,
  autoRefreshTime, onAutoRefreshChange,
}) {
  const t = useT()

  if (tab === 'profile') return (
    <div>
      <h3 style={sectionTitle}>{t('settings.tab.profile')}</h3>
      <div style={fieldGroup}>
        <label style={fieldLabel}>{t('settings.profile.name')}</label>
        <div style={fieldValue}>{user.name}</div>
      </div>
      <div style={fieldGroup}>
        <label style={fieldLabel}>{t('settings.profile.email')}</label>
        <div style={fieldValue}>{user.email}</div>
      </div>

      <h3 style={{ ...sectionTitle, marginTop: 24 }}>{t('settings.profile.changePassword')}</h3>
      <form onSubmit={onChangePassword}>
        <div style={{ marginBottom: 12 }}>
          <label style={fieldLabel}>{t('settings.profile.oldPassword')}</label>
          <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>{t('settings.profile.newPassword')}</label>
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={inputStyle} />
        </div>
        {pwMsg && <div style={{ ...msgStyle, color: pwMsg.ok ? 'var(--green)' : 'var(--red)', background: pwMsg.ok ? 'var(--greenTint)' : 'var(--redTint)' }}>{pwMsg.msg}</div>}
        <button type="submit" disabled={pwLoading} style={{ ...btnPrimary, opacity: pwLoading ? 0.7 : 1, width: isMobile ? '100%' : 'auto' }}>
          {pwLoading ? t('settings.profile.saving') : t('settings.profile.savePassword')}
        </button>
      </form>

      <h3 style={{ ...sectionTitle, marginTop: 28, color: 'var(--red)' }}>{t('settings.profile.dangerZone')}</h3>
      <div style={{ background: 'var(--redTint)', border: '1px solid #EF444430', borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{t('settings.profile.deleteAccount')}</div>
        <div style={{ fontSize: 13, color: 'var(--textMuted)', marginBottom: 16, fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif" }}>
          {t('settings.profile.deleteConfirm')}
        </div>
        {!deleteConfirm ? (
          <button onClick={() => setDeleteConfirm(true)} style={btnDanger}>
            {t('settings.profile.deleteAccount')}
          </button>
        ) : (
          <div>
            <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12, fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif" }}>
              {t('settings.profile.deleteConfirm')}
            </div>
            <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
              <button onClick={() => setDeleteConfirm(false)} style={btnSecondary}>{t('settings.close')}</button>
              <button onClick={onDeleteAccount} style={btnDanger}>{t('settings.profile.deleteConfirmBtn')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  if (tab === 'jira') return (
    <div>
      <h3 style={sectionTitle}>{t('settings.tab.jira')}</h3>
      <div style={{ marginBottom: 12 }}>
        <label style={fieldLabel}>{t('settings.jira.url')}</label>
        <input value={jiraUrl} onChange={e => setJiraUrl(e.target.value)} placeholder={t('settings.jira.urlPlaceholder')} style={inputStyle} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={fieldLabel}>{t('settings.jira.email')}</label>
        <input value={jiraEmail} onChange={e => setJiraEmail(e.target.value)} placeholder="vas@email.com" style={inputStyle} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={fieldLabel}>{t('settings.jira.token')}</label>
        <input type="password" value={jiraToken} onChange={e => setJiraToken(e.target.value)} placeholder={t('settings.jira.tokenPlaceholder')} style={inputStyle} />
        <div style={{ fontSize: 11, color: 'var(--textMuted)', marginTop: 4, fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif" }}>
          {t('set2.jira.tokenHint')}
        </div>
      </div>
      {testStatus && (
        <div style={{ ...msgStyle, color: testStatus.ok ? 'var(--green)' : 'var(--red)', background: testStatus.ok ? 'var(--greenTint)' : 'var(--redTint)', marginBottom: 12 }}>
          {testStatus.msg}
        </div>
      )}
      {saveMsg && (
        <div style={{ ...msgStyle, color: saveMsg.ok ? 'var(--green)' : 'var(--red)', background: saveMsg.ok ? 'var(--greenTint)' : 'var(--redTint)', marginBottom: 12 }}>
          {saveMsg.msg}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
        <button onClick={onTestJira} disabled={testLoading} style={{ ...btnSecondary, opacity: testLoading ? 0.7 : 1 }}>
          {testLoading ? t('settings.jira.testing') : `🔌 ${t('settings.jira.test')}`}
        </button>
        <button onClick={onSaveJira} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>
          {saving ? t('settings.jira.saving') : t('settings.jira.save')}
        </button>
      </div>
    </div>
  )

  if (tab === 'appearance') return (
    <div>
      <h3 style={sectionTitle}>{t('settings.tab.appearance')}</h3>

      {/* Theme selector */}
      <div style={{
        padding: '12px 14px',
        background: 'var(--surfaceAlt)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        marginBottom: 20,
      }}>
        <div style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--textMuted)', marginBottom: 10 }}>
          {t('settings.appearance.theme')}
        </div>
        <div style={{
          display: 'flex',
          gap: 6,
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 4,
        }}>
          {[
            { value: 'dark',  label: t('settings.appearance.dark') },
            { value: 'light', label: t('settings.appearance.light') },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => onSetTheme(opt.value)}
              style={{
                flex: 1,
                padding: '7px 8px',
                borderRadius: 7,
                border: 'none',
                background: theme === opt.value ? 'var(--accent)' : 'transparent',
                color: theme === opt.value ? '#fff' : 'var(--textMuted)',
                fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
                fontSize: 13,
                fontWeight: theme === opt.value ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Language selector */}
      <div style={{
        padding: '12px 14px',
        background: 'var(--surfaceAlt)',
        border: '1px solid var(--border)',
        borderRadius: 10,
      }}>
        <div style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--textMuted)', marginBottom: 10 }}>
          {t('settings.appearance.language')}
        </div>
        <div style={{
          display: 'flex',
          gap: 6,
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 4,
        }}>
          {[
            { value: 'sr', label: t('settings.appearance.lang.sr') },
            { value: 'en', label: t('settings.appearance.lang.en') },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setLang(opt.value)}
              style={{
                flex: 1,
                padding: '7px 8px',
                borderRadius: 7,
                border: 'none',
                background: lang === opt.value ? 'var(--accent)' : 'transparent',
                color: lang === opt.value ? '#fff' : 'var(--textMuted)',
                fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
                fontSize: 13,
                fontWeight: lang === opt.value ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  if (tab === 'ai') return (
    <div>
      <h3 style={sectionTitle}>{t('settings.tab.ai')}</h3>
      <div style={{ fontSize: 13, color: 'var(--textMuted)', marginBottom: 16, fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", lineHeight: 1.6 }}>
        {t('set2.ai.desc')}
      </div>
      {hasAnthropicKey && (
        <div style={{ ...msgStyle, color: 'var(--green)', background: 'var(--greenTint)', marginBottom: 16 }}>
          {t('set2.ai.keySet')}
        </div>
      )}
      <div style={{ marginBottom: 16 }}>
        <label style={fieldLabel}>{t('settings.ai.key')}</label>
        <input
          type="password"
          value={anthropicKey}
          onChange={e => setAnthropicKey(e.target.value)}
          placeholder={hasAnthropicKey ? t('set2.ai.keyPlaceholderSet') : 'sk-ant-api03-...'}
          style={inputStyle}
        />
        <div style={{ fontSize: 11, color: 'var(--textMuted)', marginTop: 4, fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif" }}>
          {t('set2.ai.keyCreateHint')}
        </div>
      </div>
      {aiSaveMsg && (
        <div style={{ ...msgStyle, color: aiSaveMsg.ok ? 'var(--green)' : 'var(--red)', background: aiSaveMsg.ok ? 'var(--greenTint)' : 'var(--redTint)', marginBottom: 12 }}>
          {aiSaveMsg.msg}
        </div>
      )}
      <button onClick={onSaveAi} disabled={aiSaving} style={{ ...btnPrimary, opacity: aiSaving ? 0.7 : 1 }}>
        {aiSaving ? t('settings.ai.saving') : t('settings.ai.save')}
      </button>
    </div>
  )

  if (tab === 'refresh') return (
    <div>
      <h3 style={sectionTitle}>{t('set2.refresh.title')}</h3>
      <div style={{ fontSize: 13, color: 'var(--textMuted)', marginBottom: 20, fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", lineHeight: 1.6 }}>
        {t('set2.refresh.desc')}
      </div>

      <label style={fieldLabel}>{t('set2.refresh.timeLabel')}</label>
      <select
        value={autoRefreshTime}
        onChange={e => onAutoRefreshChange(e.target.value)}
        style={{
          display: 'block',
          width: '100%',
          padding: '9px 12px',
          marginBottom: 20,
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          color: 'var(--text)',
          fontFamily: "'Hanken Grotesk', sans-serif",
          fontSize: 14,
          cursor: 'pointer',
          outline: 'none',
          appearance: 'auto',
        }}
      >
        {REFRESH_TIMES.map(v => (
          <option key={v} value={v}>{v === '' ? t('set2.refresh.off') : v}</option>
        ))}
      </select>

      <div style={{
        padding: '12px 16px',
        background: autoRefreshTime ? 'var(--greenTint)' : 'var(--surfaceAlt)',
        border: `1px solid ${autoRefreshTime ? 'rgba(34,197,94,0.25)' : 'var(--border)'}`,
        borderRadius: 10,
        fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: 13,
        color: autoRefreshTime ? 'var(--green)' : 'var(--textMuted)',
        lineHeight: 1.5,
      }}>
        {autoRefreshTime
          ? t('set2.refresh.active', { time: autoRefreshTime })
          : t('set2.refresh.inactive')}
      </div>
    </div>
  )

  return null
}

const sectionTitle = {
  fontFamily: 'Hanken Grotesk',
  fontWeight: 700,
  fontSize: 16,
  color: 'var(--text)',
  marginBottom: 16,
}

const fieldGroup = { marginBottom: 12 }

const fieldLabel = {
  display: 'block',
  fontSize: 11,
  fontFamily: "'Hanken Grotesk'",
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--textMuted)',
  marginBottom: 4,
}

const fieldValue = {
  fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
  fontSize: 14,
  color: 'var(--text)',
  padding: '8px 12px',
  background: 'var(--surfaceAlt)',
  border: '1px solid var(--border)',
  borderRadius: 8,
}

const inputStyle = {
  width: '100%',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '9px 12px',
  color: 'var(--text)',
  fontSize: 14,
  fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
}

const msgStyle = {
  padding: '8px 12px',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
  border: '1px solid transparent',
  marginBottom: 8,
}

const btnPrimary = {
  background: 'var(--accent)',
  color: '#fff',
  borderRadius: 8,
  padding: '10px 18px',
  fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
  border: 'none',
  minHeight: 44,
}

const btnSecondary = {
  background: 'transparent',
  color: 'var(--text)',
  borderRadius: 8,
  padding: '10px 18px',
  fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
  fontSize: 14,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  minHeight: 44,
}

const btnDanger = {
  background: 'var(--red)',
  color: '#fff',
  borderRadius: 8,
  padding: '10px 18px',
  fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
  border: 'none',
  minHeight: 44,
}
