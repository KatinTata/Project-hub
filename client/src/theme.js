export const themes = {
  dark: {
    '--bg':          '#0A0C10',
    '--surface':     'rgba(17,19,24,0.75)',
    '--surfaceAlt':  'rgba(21,24,31,0.80)',
    '--border':      '#1E2433',
    '--borderHover': '#2D3550',
    // Kontrast (P2-C3): na --bg #0A0C10 stari subtle #3D4A66 je bio ~2.2:1
    // (ispod AA 4.5:1). Novi parovi: muted ~5.8:1, subtle ~4.9:1 — hijerarhija
    // (text > muted > subtle) očuvana, oba iznad AA za mali tekst.
    '--text':        '#E8EBF2',
    '--textMuted':   '#7D8CAB',
    '--textSubtle':  '#71809E',
    '--accent':      '#4F8EF7',
    '--accentHover': '#6B9FFF',
    '--accentTint':  '#0F1E33',
    '--green':       '#22C55E',
    '--amber':       '#F59E0B',
    '--red':         '#EF4444',
    '--greenTint':   '#0F2A1A',
    '--amberTint':   '#2A1F0A',
    '--redTint':     '#2A0F0F',
  },
  light: {
    '--bg':          '#F0F2F8',
    '--surface':     '#FFFFFF',
    '--surfaceAlt':  '#F8F9FC',
    '--border':      '#E2E6F0',
    '--borderHover': '#C8CFDF',
    // Kontrast (P2-C3): na beloj podlozi stari subtle #A0AABF je bio ~2.3:1.
    // Novi: muted ~5.9:1, subtle ~4.9:1 — oba iznad AA 4.5:1.
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
    pop: '0 8px 24px rgba(0,0,0,0.2)',
    modal: '0 24px 80px rgba(0,0,0,0.4)',
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

export function getEffectiveTheme(mode) {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode
}

export function applyTheme(mode) {
  const effective = getEffectiveTheme(mode)
  const vars = { ...themes[effective], ...tokenVars }
  const root = document.documentElement
  Object.entries(vars).forEach(([key, val]) => root.style.setProperty(key, val))
}
