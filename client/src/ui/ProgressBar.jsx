export default function ProgressBar({ value = 0, color = 'var(--accent)', height = 6, secondary, secondaryValue = 0, secondaryColor }) {
  const pct = Math.min(Math.max(value, 0), 1) * 100
  const sPct = Math.min(Math.max(secondaryValue, 0), 1) * 100

  return (
    <div style={{
      width: '100%',
      height,
      background: 'var(--border)',
      borderRadius: height / 2,
      overflow: 'hidden',
      position: 'relative',
    }}>
      {secondary ? (
        <>
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${pct}%`,
            background: color,
            borderRadius: height / 2,
            transition: 'width 0.6s ease',
          }} />
          <div style={{
            position: 'absolute',
            left: `${pct}%`,
            top: 0,
            height: '100%',
            width: `${sPct}%`,
            background: secondaryColor || 'var(--amber)',
            transition: 'width 0.6s ease',
          }} />
        </>
      ) : (
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          borderRadius: height / 2,
          transition: 'width 0.6s ease',
        }} />
      )}
    </div>
  )
}
