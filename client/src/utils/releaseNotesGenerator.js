// ── Helpers ───────────────────────────────────────────────────────────────────

export function categorizeIssue(issue) {
  const type = issue.fields?.issuetype?.name?.toLowerCase() || ''
  const summary = issue.fields?.summary?.toLowerCase() || ''
  if (type.includes('bug') || summary.includes('fix')) return 'bug'
  if (type.includes('feature') || type.includes('story') ||
      summary.includes('add') || summary.includes('new')) return 'feature'
  if (type.includes('improvement') || summary.includes('improve') ||
      summary.includes('enhance')) return 'improvement'
  if (type.includes('task') || type.includes('technical')) return 'technical'
  return 'other'
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── Markdown generation (for editor display) ──────────────────────────────────

const LABELS = {
  sr: { feature: 'Nove funkcionalnosti', bug: 'Ispravke grešaka', improvement: 'Poboljšanja', technical: 'Tehničke izmene', other: 'Ostalo' },
  en: { feature: 'New Features', bug: 'Bug Fixes', improvement: 'Improvements', technical: 'Technical Changes', other: 'Other' },
}
const CATEGORY_ORDER = ['feature', 'bug', 'improvement', 'technical', 'other']

export function generateMarkdown(tasks, config) {
  if (!tasks || tasks.length === 0) return ''
  const lang = config.language === 'en' ? 'en' : 'sr'
  const labels = LABELS[lang]
  const date = new Date().toLocaleDateString(lang === 'sr' ? 'sr-Latn-RS' : 'en-US')
  const grouped = {}
  for (const task of tasks) {
    const cat = categorizeIssue(task)
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(task)
  }
  const sections = []
  for (const cat of CATEGORY_ORDER) {
    if (!grouped[cat]?.length) continue
    const lines = [`### ${labels[cat]}`]
    for (const task of grouped[cat]) {
      const summary = task.fields?.summary || task.summary || ''
      lines.push(config.showKeys ? `- **${task.key}**: ${summary}` : `- ${summary}`)
      if (task.description) lines.push(`  *${task.description}*`)
    }
    sections.push(lines.join('\n'))
  }
  if (sections.length === 0) return ''
  const header = `# Release Notes - ${config.clientName || 'Klijent'}\n## ${config.version || 'v1.0'} — ${date}`
  return [header, ...sections].join('\n\n')
}

// ── Styled HTML generation (for publish + preview) ────────────────────────────

const PREFIX_ORDER = ['ECOM', 'DB', 'DEVOPS', 'SRC']

const GROUP_CONFIG = {
  ECOM:   { label: 'Funkcionalnosti i UI',    icon: '🎨', color: '#4F8EF7' },
  DB:     { label: 'Backend & Baza',           icon: '🗄️', color: '#A855F7' },
  DEVOPS: { label: 'DevOps & Infrastruktura',  icon: '⚙️', color: '#F59E0B' },
  SRC:    { label: 'Support & Ostalo',         icon: '🛠️', color: '#22C55E' },
}

const KEY_COLORS = {
  ECOM:   { bg: 'rgba(79,142,247,0.15)',  color: '#4F8EF7', border: 'rgba(79,142,247,0.35)'  },
  DB:     { bg: 'rgba(168,85,247,0.15)', color: '#A855F7',  border: 'rgba(168,85,247,0.35)' },
  DEVOPS: { bg: 'rgba(245,158,11,0.15)', color: '#F59E0B',  border: 'rgba(245,158,11,0.35)' },
  SRC:    { bg: 'rgba(34,197,94,0.15)',  color: '#22C55E',  border: 'rgba(34,197,94,0.35)'  },
  OTHER:  { bg: 'rgba(107,122,153,0.15)',color: '#8B99B5',  border: 'rgba(107,122,153,0.35)'},
}

export function generateStyledHtml(tasks, config, meta) {
  const date = new Date().toLocaleDateString('sr-Latn-RS', { day: 'numeric', month: 'long', year: 'numeric' })
  const title = escapeHtml(`${meta.clientName || 'Release Notes'} ${config.version || ''}`.trim())

  // Build Jira browse base URL
  const jiraBase = meta.jiraUrl
    ? 'https://' + meta.jiraUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
    : null

  // Group by key prefix
  const groups = {}
  for (const task of (tasks || [])) {
    const prefix = (task.key || '').split('-')[0].toUpperCase()
    if (!groups[prefix]) groups[prefix] = []
    groups[prefix].push(task)
  }
  const groupOrder = [
    ...PREFIX_ORDER.filter(p => groups[p]?.length),
    ...Object.keys(groups).filter(p => !PREFIX_ORDER.includes(p) && groups[p]?.length),
  ]

  const sectionsHtml = groupOrder.map(prefix => {
    const cfg  = GROUP_CONFIG[prefix] || { label: prefix, icon: '📋', color: '#8B99B5' }
    const keyC = KEY_COLORS[prefix] || KEY_COLORS.OTHER
    const grpTasks = groups[prefix]

    const cardsHtml = grpTasks.map((task, idx) => {
      const key     = escapeHtml(task.key || '')
      const summary = escapeHtml(task.fields?.summary || task.summary || '')
      const desc    = (task.description || '').trim()
      const hasDesc = desc.length > 0
      const cardId  = `c-${prefix}-${idx}`

      const helpLinks = (task.fields?.issuelinks || []).filter(l => l.key?.startsWith('HELP'))
      const helpHtml = helpLinks.map(link => {
        const url = jiraBase ? `${jiraBase}/browse/${escapeHtml(link.key)}` : null
        const isDone = ['Done', 'Closed', 'Resolved'].includes(link.status)
        const stBg  = isDone ? 'rgba(34,197,94,0.12)'  : 'rgba(79,142,247,0.12)'
        const stCol = isDone ? '#22C55E' : '#4F8EF7'
        const stBor = isDone ? 'rgba(34,197,94,0.3)'   : 'rgba(79,142,247,0.3)'
        return `
          <div class="help-link-row">
            <span class="help-rel">🔗</span>
            <span class="key-badge" style="background:rgba(245,158,11,0.15);color:#F59E0B;border:1px solid rgba(245,158,11,0.3)">${escapeHtml(link.key)}</span>
            <span class="help-summary">${escapeHtml(link.summary)}</span>
            ${link.status ? `<span class="status-badge" style="background:${stBg};color:${stCol};border:1px solid ${stBor}">${escapeHtml(link.status)}</span>` : ''}
            ${url ? `<a class="help-open" href="${url}" target="_blank" rel="noopener noreferrer">↗ Otvori</a>` : ''}
          </div>`
      }).join('')

      return `
        <div class="task-card" id="${cardId}">
          <div class="task-row">
            <span class="key-badge" style="background:${keyC.bg};color:${keyC.color};border:1px solid ${keyC.border}">${key}</span>
            <span class="task-summary">${summary}</span>
            ${hasDesc ? `<button class="expand-btn" onclick="toggle('${cardId}')" title="Prikaži/sakrij opis">▾</button>` : ''}
          </div>
          ${hasDesc ? `<div class="task-desc" id="${cardId}-d"><div class="task-desc-inner">${escapeHtml(desc).replace(/\n/g, '<br>')}</div></div>` : ''}
          ${helpHtml}
        </div>`
    }).join('')

    return `
      <section class="group">
        <div class="section-hdr" style="border-bottom-color:${cfg.color}28">
          <span class="sec-icon">${cfg.icon}</span>
          <span class="sec-label" style="color:${cfg.color}">${cfg.label}</span>
          <span class="sec-count" style="background:${cfg.color}18;color:${cfg.color};border:1px solid ${cfg.color}33">${grpTasks.length}</span>
        </div>
        <div class="task-list">${cardsHtml}</div>
      </section>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="sr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0A0C10; --surface: #111318; --surface2: #15181F;
      --border: #1E2433; --border2: #2D3550;
      --text: #E8EBF2; --muted: #6B7A99; --subtle: #3D4A66;
      --accent: #4F8EF7;
    }
    body {
      font-family: 'DM Sans', -apple-system, sans-serif;
      background: var(--bg); color: var(--text);
      min-height: 100vh; font-size: 15px; line-height: 1.6;
    }
    /* Print bar */
    .pbar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 100;
      background: var(--surface); border-bottom: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 28px; gap: 12px;
    }
    .pbar-left { font-family: 'DM Mono', monospace; font-size: 12px; color: var(--muted); }
    .pbtn {
      background: var(--accent); color: #fff; border: none; border-radius: 8px;
      padding: 7px 18px; font-family: 'DM Sans', sans-serif; font-weight: 600;
      font-size: 13px; cursor: pointer; transition: opacity 0.2s;
    }
    .pbtn:hover { opacity: 0.85; }
    /* Layout */
    .wrap { max-width: 860px; margin: 0 auto; padding: 84px 28px 80px; }
    /* Doc header */
    .doc-hdr { margin-bottom: 48px; }
    .doc-hdr-top { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
    .brand { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.14em; margin-bottom: 10px; }
    .doc-title { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 40px; color: var(--text); line-height: 1.1; letter-spacing: -0.02em; }
    .meta-col { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; padding-top: 4px; }
    .badge-accent { font-family: 'DM Mono', monospace; font-size: 13px; font-weight: 500; padding: 5px 12px; border-radius: 6px; background: rgba(79,142,247,0.1); color: var(--accent); border: 1px solid rgba(79,142,247,0.25); }
    .badge-green  { font-family: 'DM Mono', monospace; font-size: 13px; font-weight: 500; padding: 5px 12px; border-radius: 6px; background: rgba(34,197,94,0.1); color: #22C55E; border: 1px solid rgba(34,197,94,0.25); }
    .doc-date { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--muted); }
    .doc-client { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--muted); }
    .divider { height: 2px; margin-top: 24px; background: linear-gradient(90deg, var(--accent) 0%, transparent 70%); border-radius: 2px; opacity: 0.35; }
    /* Groups */
    .groups { display: flex; flex-direction: column; gap: 44px; }
    .section-hdr { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid; }
    .sec-icon { font-size: 20px; line-height: 1; }
    .sec-label { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 18px; }
    .sec-count { font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 500; padding: 2px 9px; border-radius: 20px; margin-left: 2px; }
    /* Task cards */
    .task-list { display: flex; flex-direction: column; gap: 8px; }
    .task-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 13px 16px; transition: border-color 0.2s; break-inside: avoid; }
    .task-card.open { border-color: var(--border2); }
    .task-row { display: flex; align-items: center; gap: 12px; }
    .key-badge { font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 500; padding: 3px 9px; border-radius: 6px; flex-shrink: 0; letter-spacing: 0.04em; white-space: nowrap; }
    .task-summary { font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 500; color: var(--text); flex: 1; line-height: 1.4; }
    .expand-btn { background: transparent; border: none; color: var(--muted); cursor: pointer; font-size: 17px; padding: 0 2px; flex-shrink: 0; transition: transform 0.25s ease, color 0.2s; display: flex; align-items: center; line-height: 1; }
    .expand-btn:hover { color: var(--text); }
    .expand-btn.open { transform: rotate(180deg); color: var(--accent); }
    .task-desc { max-height: 0; overflow: hidden; transition: max-height 0.32s cubic-bezier(0.4,0,0.2,1); }
    .task-desc.open { max-height: 1000px; }
    .task-desc-inner { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); font-family: 'DM Sans', sans-serif; font-size: 13px; color: var(--muted); line-height: 1.75; }
    /* Inline HELP links */
    .help-link-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); flex-wrap: wrap; }
    .help-rel { font-size: 13px; flex-shrink: 0; }
    .help-summary { font-family: 'DM Sans', sans-serif; font-size: 13px; color: var(--muted); flex: 1; min-width: 0; }
    .status-badge { font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 500; padding: 3px 9px; border-radius: 6px; white-space: nowrap; flex-shrink: 0; }
    .help-open { font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 600; color: var(--accent); text-decoration: none; padding: 3px 8px; border: 1px solid rgba(79,142,247,0.3); border-radius: 6px; white-space: nowrap; flex-shrink: 0; }
    .help-open:hover { background: rgba(79,142,247,0.1); }
    /* Footer */
    .footer { margin-top: 72px; padding-top: 22px; border-top: 1px solid var(--border); text-align: center; font-family: 'DM Mono', monospace; font-size: 10px; color: var(--subtle); letter-spacing: 0.1em; text-transform: uppercase; }
    /* Responsive */
    @media (max-width: 600px) {
      .wrap { padding: 72px 16px 60px; }
      .doc-title { font-size: 28px; }
      .pbar { padding: 10px 16px; }
    }
    /* Print */
    @media print {
      .pbar { display: none !important; }
      .wrap { padding: 0 28px 40px; }
      body { background: #fff; color: #111; }
      :root { --bg:#fff; --surface:#f8f9fc; --border:#e2e6f0; --border2:#c8cfdf; --text:#0F1523; --muted:#5A6480; --subtle:#A0AABF; --accent:#2563EB; }
      .task-desc { max-height: none !important; overflow: visible !important; }
      .expand-btn { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="pbar">
    <span class="pbar-left">${escapeHtml(meta.clientName || 'Intelisale')}${config.version ? ' · ' + escapeHtml(config.version) : ''} Release Notes</span>
    <button class="pbtn" onclick="window.print()">↓ Export PDF</button>
  </div>

  <div class="wrap">
    <div class="doc-hdr">
      <div class="doc-hdr-top">
        <div>
          <div class="brand">INTELISALE</div>
          <div class="doc-title">Release Notes</div>
        </div>
        <div class="meta-col">
          ${meta.productName ? `<span class="badge-accent">${escapeHtml(meta.productName)}</span>` : ''}
          ${config.version ? `<span class="badge-green">${escapeHtml(config.version)}</span>` : ''}
          <span class="doc-date">${date}</span>
          ${meta.clientName ? `<span class="doc-client">${escapeHtml(meta.clientName)}</span>` : ''}
        </div>
      </div>
      <div class="divider"></div>
    </div>

    <div class="groups">
      ${sectionsHtml || '<p style="color:var(--muted);font-family:DM Sans,sans-serif;text-align:center;padding:40px 0">Nema taskova.</p>'}
    </div>


    <div class="footer">INTELISALE · Empowering Sales Excellence · www.intelisale.com</div>
  </div>

  <script>
    function toggle(id) {
      var card = document.getElementById(id)
      var desc = document.getElementById(id + '-d')
      var btn  = card ? card.querySelector('.expand-btn') : null
      if (!desc) return
      var open = desc.classList.contains('open')
      desc.classList.toggle('open', !open)
      if (btn) btn.classList.toggle('open', !open)
      if (card) card.classList.toggle('open', !open)
    }
  </script>
</body>
</html>`
}

// Keep for backwards compatibility (not used for publish anymore)
export function markdownToHtml(markdown, meta) {
  return generateStyledHtml([], {
    clientName: meta.clientName,
    version: meta.version,
    showKeys: true,
    language: meta.language || 'sr',
  }, meta)
}
