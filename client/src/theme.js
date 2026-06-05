export const themes = {
  dark: {
    '--bg':          '#0A0C10',
    '--surface':     'rgba(17,19,24,0.75)',
    '--surfaceAlt':  'rgba(21,24,31,0.80)',
    '--border':      '#1E2433',
    '--borderHover': '#2D3550',
    '--text':        '#E8EBF2',
    '--textMuted':   '#6B7A99',
    '--textSubtle':  '#3D4A66',
    '--accent':      '#4F8EF7',
    '--accentHover': '#6B9FFF',
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
    '--text':        '#0F1523',
    '--textMuted':   '#5A6480',
    '--textSubtle':  '#A0AABF',
    '--accent':      '#2563EB',
    '--accentHover': '#1D4ED8',
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
