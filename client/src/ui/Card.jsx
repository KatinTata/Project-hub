// Zajednička kartica (P2-A4) — surface + border + radius iz tokena.
export default function Card({ className = '', ...rest }) {
  return <div className={`ui-card ${className}`.trim()} {...rest} />
}
