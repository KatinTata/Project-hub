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

export function getEffectiveTheme(mode) {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode
}

export function applyTheme(mode) {
  const effective = getEffectiveTheme(mode)
  const vars = themes[effective]
  const root = document.documentElement
  Object.entries(vars).forEach(([key, val]) => root.style.setProperty(key, val))
}
