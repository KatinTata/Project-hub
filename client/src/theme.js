// Tema aplikacije — SAMO svetla (odluka 08.09.2026, docs/ODLUKE.md).
// Izbor teme je uklonjen iz UI-ja; paleta ispod je jedini izvor boja, a
// komponente je čitaju kroz CSS varijable (var(--bg), var(--accent) ...).
export const themes = {
  light: {
    '--bg':          '#F0F2F8',
    '--surface':     '#FFFFFF',
    '--surfaceAlt':  '#F8F9FC',
    '--border':      '#E2E6F0',
    '--borderHover': '#C8CFDF',
    // Kontrast (P2-C3): muted ~5.9:1, subtle ~4.9:1 — oba iznad AA 4.5:1.
    '--text':        '#0F1523',
    '--textMuted':   '#5A6480',
    '--textSubtle':  '#68718A',
    '--accent':      '#2563EB',
    '--accentHover': '#1D4ED8',
    '--accentTint':  '#EFF4FE',
    '--green':       '#16A34A',
    '--amber':       '#D97706',
    '--red':         '#DC2626',
    '--greenTint':   '#F0FDF4',
    '--amberTint':   '#FFFBEB',
    '--redTint':     '#FEF2F2',
  },
}

// ── Dizajn tokeni (P2-A4) ─────────────────────────────────────────────────────
// Skale razmaka/radijusa/senki/tipografije — koriste se i kao CSS varijable
// (--space-*, --radius-*, --shadow-*, --font) i kao JS vrednosti za inline stil.
export const tokens = {
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  radius: { sm: 6, md: 8, lg: 12 },
  shadow: {
    pop: '0 8px 24px rgba(15,21,35,0.12)',
    modal: '0 24px 80px rgba(15,21,35,0.25)',
  },
  font: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
}

const tokenVars = {
  '--space-xs': `${tokens.space.xs}px`,
  '--space-sm': `${tokens.space.sm}px`,
  '--space-md': `${tokens.space.md}px`,
  '--space-lg': `${tokens.space.lg}px`,
  '--space-xl': `${tokens.space.xl}px`,
  '--radius-sm': `${tokens.radius.sm}px`,
  '--radius-md': `${tokens.radius.md}px`,
  '--radius-lg': `${tokens.radius.lg}px`,
  '--shadow-pop': tokens.shadow.pop,
  '--shadow-modal': tokens.shadow.modal,
  '--font': tokens.font,
}

export function applyTheme() {
  const vars = { ...themes.light, ...tokenVars }
  const root = document.documentElement
  Object.entries(vars).forEach(([key, val]) => root.style.setProperty(key, val))
  root.style.colorScheme = 'light'
}
