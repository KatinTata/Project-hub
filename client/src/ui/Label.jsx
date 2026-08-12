// Zajednička labela forme (P2-A4) — uppercase caption iznad polja.
export default function Label({ className = '', ...rest }) {
  return <label className={`ui-label ${className}`.trim()} {...rest} />
}
