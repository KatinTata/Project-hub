import { useState } from 'react'
import { api } from '../api.js'
import BrainAnimation from '../components/BrainAnimation.jsx'
import { useT } from '../lang.jsx'
import { useWindowSize } from '../hooks/useWindowSize.js'

export default function LoginPage({ onLogin, effectiveTheme = 'dark' }) {
  const t = useT()
  const { isMobile } = useWindowSize()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.login({ email, password })
      localStorage.setItem('jt_token', res.token)
      onLogin(res.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'relative',
      minHeight: '100vh',
      background: 'var(--bg)',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <BrainAnimation />
      <div style={{
        position: 'relative',
        zIndex: 1,
        width: '100%',
        maxWidth: 420,
        background: 'var(--surface)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: isMobile ? '24px 20px' : '36px 40px',
        boxShadow: '0 16px 48px rgba(0,0,0,0.15)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src={effectiveTheme === 'dark' ? '/logo-white.png' : '/logo-dark.png'}
            alt="Intelisale"
            style={{ height: 40, marginBottom: 12, objectFit: 'contain' }}
          />
          <h1 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 24, color: 'var(--text)', marginBottom: 4 }}>
            Project Hub
          </h1>
          <p style={{ color: 'var(--textMuted)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 14 }}>
            {t('login.subtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>{t('login.email')}</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="vas@email.com"
              required
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>{t('login.password')}</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>

          {error && (
            <div style={{
              marginBottom: 16,
              padding: '10px 14px',
              background: 'var(--redTint)',
              border: '1px solid #EF444430',
              borderRadius: 8,
              color: 'var(--red)',
              fontSize: 13,
              fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
            }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: 'var(--accent)',
              color: '#fff',
              borderRadius: 8,
              padding: '11px',
              fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
              fontWeight: 600,
              fontSize: 15,
              cursor: loading ? 'not-allowed' : 'pointer',
              border: 'none',
              opacity: loading ? 0.7 : 1,
              transition: 'all 0.2s ease',
            }}
          >
            {loading ? t('login.submitting') : t('login.submit')}
          </button>
        </form>

      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontFamily: "'DM Mono'",
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--textMuted)',
  marginBottom: 6,
}

const inputStyle = {
  width: '100%',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '10px 14px',
  color: 'var(--text)',
  fontSize: 14,
  fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  transition: 'border-color 0.2s',
}
