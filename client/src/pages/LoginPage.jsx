import { useState } from 'react'
import { api } from '../api.js'
import BrainAnimation from '../components/BrainAnimation.jsx'
import { useT } from '../lang.jsx'
import { useWindowSize } from '../hooks/useWindowSize.js'
import Button from '../ui/Button.jsx'
import Input from '../ui/Input.jsx'
import Label from '../ui/Label.jsx'
import Card from '../ui/Card.jsx'

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
      <Card style={{
        position: 'relative',
        zIndex: 1,
        width: '100%',
        maxWidth: 420,
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
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
          <h1 style={{ fontFamily: 'Hanken Grotesk', fontWeight: 800, fontSize: 24, color: 'var(--text)', marginBottom: 4 }}>
            Project Hub
          </h1>
          <p style={{ color: 'var(--textMuted)', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 14 }}>
            {t('login.subtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <Label htmlFor="login-email" style={{ letterSpacing: '0.08em' }}>{t('login.email')}</Label>
            <Input
              id="login-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="vas@email.com"
              required
              style={{ width: '100%', padding: '10px 14px' }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <Label htmlFor="login-password" style={{ letterSpacing: '0.08em' }}>{t('login.password')}</Label>
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{ width: '100%', padding: '10px 14px' }}
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
              fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
            }}>{error}</div>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={loading}
            style={{ width: '100%', padding: '11px', fontSize: 15 }}
          >
            {loading ? t('login.submitting') : t('login.submit')}
          </Button>
        </form>

      </Card>
    </div>
  )
}
