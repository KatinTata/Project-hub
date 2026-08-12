// Editor-local error toast (red, bottom-centered above the fixed action bar).
export default function Toast({ message, onClose }) {
  return (
    <div style={{
      position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--surface)', border: '1px solid var(--red)', borderRadius: 8, zIndex: 2000,
      padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10,
      fontFamily: 'Hanken Grotesk', fontSize: 13, color: 'var(--red)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      whiteSpace: 'nowrap', maxWidth: 'calc(100vw - 40px)',
    }}>
      ⚠️ {message}
      <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 16, padding: 0, marginLeft: 4 }}>×</button>
    </div>
  )
}
