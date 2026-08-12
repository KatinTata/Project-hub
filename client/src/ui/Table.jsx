// Zajednička tabela (P2-A4) — th/td tipografija kroz .ui-table u ui.css.
export default function Table({ className = '', ...rest }) {
  return <table className={`ui-table ${className}`.trim()} {...rest} />
}
