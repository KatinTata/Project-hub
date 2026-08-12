// Zajedničko dugme (P2-A4). Varijante: subtle (default), primary, ghost,
// danger, pill. Hover/focus stanja su u ui.css; `style` služi za retke
// jednokratne korekcije (širina, veličina fonta) bez menjanja varijante.
export default function Button({ variant = 'subtle', className = '', type = 'button', ...rest }) {
  return <button type={type} className={`ui-btn ui-btn--${variant} ${className}`.trim()} {...rest} />
}
