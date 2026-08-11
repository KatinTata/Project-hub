import { Component } from 'react'

// Catches render/runtime errors anywhere below it so a single broken component
// shows a recoverable message instead of a blank white screen.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary uhvatio grešku:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    const font = "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif"
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font, padding: 24 }}>
        <div style={{ maxWidth: 440, textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '32px 28px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Došlo je do greške</h2>
          <p style={{ color: 'var(--textMuted)', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
            Nešto je pošlo naopako pri prikazu ove stranice. Pokušaj ponovo — ako se greška ponavlja, osveži stranicu.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              onClick={() => this.setState({ error: null })}
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontFamily: font, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
            >
              Pokušaj ponovo
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{ background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 20px', fontFamily: font, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
            >
              Osveži
            </button>
          </div>
        </div>
      </div>
    )
  }
}
