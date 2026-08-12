// Zajednički input (P2-A4) — fokus prsten kroz CSS (.ui-input:focus).
export default function Input({ className = '', ...rest }) {
  return <input className={`ui-input ${className}`.trim()} {...rest} />
}
