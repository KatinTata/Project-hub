import { sanitizeBodyHtml, textToHtml } from '../components/RichBodyEditor.jsx'

// ── Pure helpers ───────────────────────────────────────────────────────────────

export function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function todayStr() {
  return new Date().toLocaleDateString('sr-Latn-RS', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Build the rich body HTML for a task: prefer stored bodyHtml, otherwise migrate
// from the legacy plain `description` + `images` block.
export function migrateBodyHtml(edit) {
  if (edit?.bodyHtml != null) return edit.bodyHtml
  let html = textToHtml(edit?.description || '')
  for (const img of (edit?.images || [])) {
    if (!img?.base64) continue
    const cap = img.desc ? `<figcaption>${esc(img.desc)}</figcaption>` : ''
    html += `<figure style="margin:10px 0"><img src="${img.base64}" alt="${esc(img.desc || '')}" style="width:60%;display:block;margin:0 auto;max-width:100%">${cap}</figure>`
  }
  return html
}

export function getHelpLinks(task) {
  return (task.fields?.issuelinks || []).filter(l =>
    (l.outwardIssue?.key || l.inwardIssue?.key || l.key || '').startsWith('HELP')
  ).map(l => ({
    key: l.outwardIssue?.key || l.inwardIssue?.key || l.key,
    summary: l.outwardIssue?.fields?.summary || l.inwardIssue?.fields?.summary || l.summary || '',
    status: l.outwardIssue?.fields?.status?.name || l.inwardIssue?.fields?.status?.name || l.status || '',
  }))
}

// Sections are grouped by Jira ISSUE TYPE (not key prefix). Order + colors below;
// unknown types fall back to a neutral default and keep their raw type name.
export const PREFIX_ORDER = ['New Feature', 'Story', 'Improvement', 'Task', 'Bug', 'Sub-task']
export const GROUP_CONFIG = {
  'New Feature': { label: 'New Feature', color: '#22C55E' },
  'Story':       { label: 'Story',       color: '#4F8EF7' },
  'Improvement': { label: 'Improvement', color: '#A855F7' },
  'Task':        { label: 'Task',        color: '#0EA5E9' },
  'Bug':         { label: 'Bug',         color: '#EF4444' },
  'Sub-task':    { label: 'Sub-task',    color: '#8B99B5' },
}
// Section/group key for a task = its issue type. Key-badge color stays by key prefix.
export const groupKeyOf = task => (task.fields?.issuetype?.name || 'Ostalo')
export const keyPrefixOf = task => (task.key || '').split('-')[0].toUpperCase()

// Order present groups: known order first, then unknown types, with Bug always last.
export function orderGroups(groups) {
  const present = Object.keys(groups).filter(p => groups[p]?.length)
  const known = PREFIX_ORDER.filter(p => p !== 'Bug' && present.includes(p))
  const unknown = present.filter(p => p !== 'Bug' && !PREFIX_ORDER.includes(p))
  const bug = present.includes('Bug') ? ['Bug'] : []
  return [...known, ...unknown, ...bug]
}
export const KEY_COLORS = {
  ECOM:   { bg: 'rgba(79,142,247,0.15)',  color: '#4F8EF7', border: 'rgba(79,142,247,0.35)'  },
  DB:     { bg: 'rgba(168,85,247,0.15)',  color: '#A855F7', border: 'rgba(168,85,247,0.35)'  },
  DEVOPS: { bg: 'rgba(245,158,11,0.15)',  color: '#F59E0B', border: 'rgba(245,158,11,0.35)'  },
  SRC:    { bg: 'rgba(34,197,94,0.15)',   color: '#22C55E', border: 'rgba(34,197,94,0.35)'   },
  OTHER:  { bg: 'rgba(107,122,153,0.15)', color: '#8B99B5', border: 'rgba(107,122,153,0.35)' },
}

// Project-hub background animation (Brain mesh) as a standalone, fixed full-page
// layer — repeats on every printed/PDF page. Pure SVG + CSS, tinted for light bg.
const BRAIN_BG_HTML = `<div class="bg-anim" aria-hidden="true">
  <svg viewBox="0 0 150 140" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;overflow:visible">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#4facfe"/><stop offset="50%" stop-color="#93c5fd"/><stop offset="100%" stop-color="#2563eb"/></linearGradient>
      <path id="bgMesh" d="M 5 60 L 25 30 L 45 15 L 75 10 L 105 15 L 130 35 L 145 60 L 140 90 L 120 110 L 95 125 L 85 105 L 55 95 L 35 100 L 15 85 Z M 5 60 L 25 60 L 25 30 M 25 60 L 45 40 L 45 15 M 45 40 L 75 45 L 75 10 M 75 45 L 105 50 L 105 15 M 105 50 L 130 35 M 105 50 L 120 70 L 145 60 M 120 70 L 140 90 M 120 70 L 95 80 L 120 110 M 95 80 L 95 125 M 95 80 L 85 105 M 95 80 L 75 80 L 75 45 M 75 80 L 85 105 M 75 80 L 50 70 L 45 40 M 50 70 L 75 45 M 50 70 L 55 95 M 50 70 L 35 80 L 25 60 M 35 80 L 35 100 M 35 80 L 15 85 M 25 30 L 45 40"/>
    </defs>
    <use href="#bgMesh" class="bg-lines" fill="none" stroke="url(#bgGrad)" stroke-width="1.2" stroke-linejoin="round"/>
    <g class="bg-nodes" fill="#3b82f6">
      <circle cx="25" cy="60" r="1"/><circle cx="45" cy="40" r="1"/><circle cx="75" cy="45" r="1"/><circle cx="105" cy="50" r="1"/><circle cx="120" cy="70" r="1"/><circle cx="95" cy="80" r="1"/><circle cx="75" cy="80" r="1"/><circle cx="50" cy="70" r="1"/><circle cx="35" cy="80" r="1"/>
      <circle cx="45" cy="15" r="0.8"/><circle cx="75" cy="10" r="0.8"/><circle cx="105" cy="15" r="0.8"/><circle cx="130" cy="35" r="0.8"/><circle cx="140" cy="90" r="0.8"/><circle cx="95" cy="125" r="0.8"/><circle cx="55" cy="95" r="0.8"/><circle cx="15" cy="85" r="0.8"/>
    </g>
  </svg>
</div>`

export function generatePublishHtml(selectedTasks, taskEdits, config, meta, { sectionOverrides = {}, sectionLabels = {}, expanded = false, hideBar = false } = {}) {
  const dateStr = esc(meta.date || todayStr())
  const title = esc(`${meta.clientName || 'Release Notes'} ${config.version || ''}`.trim())
  const jiraBase = meta.jiraUrl ? 'https://' + meta.jiraUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') : null

  const groups = {}
  for (const task of selectedTasks) {
    const prefix = sectionOverrides[task.id] || groupKeyOf(task)
    if (!groups[prefix]) groups[prefix] = []
    groups[prefix].push(task)
  }
  const groupOrder = orderGroups(groups)

  const sectionsHtml = groupOrder.map(prefix => {
    const baseCfg = GROUP_CONFIG[prefix] || { label: prefix, icon: '📋', color: '#8B99B5' }
    const cfg = { ...baseCfg, label: sectionLabels[prefix] || baseCfg.label }
    const cardsHtml = groups[prefix].map((task, idx) => {
      const edit = taskEdits[task.id] || {}
      const key = esc(task.key || '')
      const name = esc(edit.name || task.fields?.summary || task.summary || '')
      const cardId = `c-${prefix}-${idx}`
      const bodyHtml = sanitizeBodyHtml(migrateBodyHtml(edit))
      const helpLinks = getHelpLinks(task)
      const hasExpand = !!bodyHtml && (/<img/i.test(bodyHtml) || bodyHtml.replace(/<[^>]+>/g, '').trim().length > 0)

      const helpHtml = helpLinks.map(link => {
        const url = jiraBase ? `${jiraBase}/browse/${esc(link.key)}` : null
        // Keep the HELP key badge (important) + status removed; name is the link.
        const keyBadge = `<span class="key-badge" style="background:rgba(245,158,11,0.15);color:#F59E0B;border:1px solid rgba(245,158,11,0.3)">${esc(link.key)}</span>`
        const linkName = esc(link.summary || link.key)
        return `<div class="help-link-row">
          <span>🔗</span>
          ${keyBadge}
          ${url ? `<a class="help-key" href="${url}" target="_blank" rel="noopener noreferrer">${linkName}</a>` : `<span style="font-family:'Hanken Grotesk',sans-serif;font-size:13px;color:#6B7A99">${linkName}</span>`}
        </div>`
      }).join('')

      // No Jira link on the task title — the output goes to clients who can't
      // access our Jira. HELP-desk links below stay (clients can open those).
      const titleHtml = `<span class="task-summary">${name}</span>`
      const isSimple = !hasExpand
      return `<div class="task-card${isSimple ? ' task-card--simple' : ''}" id="${cardId}" data-key="${key}" style="border-left:4px solid ${cfg.color} !important">
        <div class="task-row">
          ${titleHtml}
          ${hasExpand ? `<button class="expand-btn${expanded ? ' open' : ''}" onclick="toggle('${cardId}')" title="Prikaži/sakrij detalje">▾</button>` : ''}
        </div>
        ${hasExpand ? `<div class="task-desc${expanded ? ' open' : ''}" id="${cardId}-d">
          <div class="task-desc-inner rn-body">${bodyHtml}</div>
        </div>` : ''}
        ${helpHtml}
      </div>`
    }).join('')

    return `<section class="group">
      <div class="section-hdr" style="border-bottom-color:${cfg.color}28">
        <span class="sec-label" style="color:${cfg.color}">${cfg.label}</span>
        <span class="sec-count" style="background:${cfg.color}18;color:${cfg.color};border:1px solid ${cfg.color}33">${groups[prefix].length}</span>
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
  <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{--bg:#F0F2F8;--surface:#FFFFFF;--border:#E2E6F0;--border2:#C8CFDF;--text:#0F1523;--muted:#5A6480;--subtle:#A0AABF;--accent:#2563EB}
    body{font-family:'Hanken Grotesk',-apple-system,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;font-size:15px;line-height:1.6}
    .bg-anim{position:fixed;inset:0;z-index:0;opacity:0.14;pointer-events:none;display:flex;align-items:center;justify-content:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .bg-anim .bg-lines{stroke-dasharray:1500;stroke-dashoffset:1500;animation:bgDraw 10s ease-in-out infinite alternate}
    .bg-anim .bg-nodes circle{animation:bgPulse 3s infinite alternate}
    @keyframes bgDraw{0%{stroke-dashoffset:1500;opacity:.2}50%{opacity:.9}100%{stroke-dashoffset:0;opacity:.7}}
    @keyframes bgPulse{0%{opacity:.3}100%{opacity:.8}}
    .pbar{position:fixed;top:0;left:0;right:0;z-index:100;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:10px 28px;gap:12px}
    .pbar-left{font-family:'Hanken Grotesk',sans-serif;font-size:12px;color:var(--muted)}
    .pbtn{background:var(--accent);color:#fff;border:none;border-radius:8px;padding:7px 18px;font-family:'Hanken Grotesk',sans-serif;font-weight:600;font-size:13px;cursor:pointer;transition:opacity 0.2s}
    .pbtn:hover{opacity:0.85}
    .pbtn--html{background:#EA580C}
    .pbtn--pdf{background:#7C3AED}
    .wrap{max-width:860px;margin:0 auto;padding:84px 28px 80px;position:relative;z-index:1}
    .hero{position:relative;overflow:hidden;border-radius:22px;padding:34px 38px;margin-bottom:44px;background:radial-gradient(55% 95% at 96% -18%, rgba(56,189,248,0.45) 0%, rgba(56,189,248,0) 52%), radial-gradient(50% 100% at 2% 118%, rgba(37,99,235,0.42) 0%, rgba(37,99,235,0) 56%), radial-gradient(42% 85% at 72% 125%, rgba(124,92,246,0.26) 0%, rgba(124,92,246,0) 60%), radial-gradient(38% 70% at 38% -25%, rgba(45,212,191,0.18) 0%, rgba(45,212,191,0) 60%), linear-gradient(120deg, #081325 0%, #0c2140 38%, #133459 68%, #0a1c34 100%);color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .hero::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 30%);pointer-events:none}
    .hero-top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:26px}
    .hero-logo-img{height:45px;width:auto;display:block;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .hero-kicker{font-family:'Hanken Grotesk',sans-serif;font-size:11px;letter-spacing:0.2em;color:#7dd3fc;white-space:nowrap}
    .hero-eyebrow{font-family:'Hanken Grotesk',sans-serif;font-size:12px;letter-spacing:0.16em;color:#38bdf8;text-transform:uppercase;display:flex;align-items:center;gap:9px;margin-bottom:12px}
    .hero-eyebrow .dot{width:7px;height:7px;border-radius:50%;background:#38bdf8;display:inline-block}
    .hero-title{font-family:'Hanken Grotesk',sans-serif;font-weight:800;font-size:30px;line-height:1.04;letter-spacing:-0.01em;margin-bottom:14px}
    .hero-sub{font-family:'Hanken Grotesk',sans-serif;font-size:15px;color:#9fb2c9;max-width:580px;line-height:1.55;margin-bottom:8px}
    .hero-divider{height:1px;background:rgba(255,255,255,0.13);margin:22px 0 18px}
    .hero-meta{display:flex;flex-wrap:wrap;gap:18px 40px}
    .hm-l{font-family:'Hanken Grotesk',sans-serif;font-size:10px;letter-spacing:0.14em;color:#38bdf8;text-transform:uppercase;margin-bottom:6px}
    .hm-v{font-family:'Hanken Grotesk',sans-serif;font-weight:600;font-size:15px;color:#fff}
    .groups{display:flex;flex-direction:column;gap:44px}
    .section-hdr{display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid}
    .sec-icon{font-size:20px;line-height:1}
    .sec-label{font-family:'Hanken Grotesk',sans-serif;font-weight:800;font-size:18px}
    .sec-count{font-family:'Hanken Grotesk',sans-serif;font-size:11px;font-weight:500;padding:2px 9px;border-radius:20px;margin-left:2px}
    .task-list{display:flex;flex-direction:column;gap:8px}
    .task-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:13px 16px;transition:border-color 0.2s;break-inside:avoid}
    .task-card.open{border-color:var(--border2)}
    .task-row{display:flex;align-items:center;gap:12px}
    .key-badge{font-family:'Hanken Grotesk',sans-serif;font-size:11px;font-weight:500;padding:3px 9px;border-radius:6px;flex-shrink:0;letter-spacing:0.04em;white-space:nowrap}
    .task-summary{font-family:'Hanken Grotesk',sans-serif;font-size:14px;font-weight:500;color:var(--text);flex:1;line-height:1.4}
    .expand-btn{background:transparent;border:none;color:var(--muted);cursor:pointer;font-size:17px;padding:0 2px;flex-shrink:0;transition:transform 0.25s ease,color 0.2s;display:flex;align-items:center;line-height:1}
    .expand-btn:hover{color:var(--text)}
    .expand-btn.open{transform:rotate(180deg);color:var(--accent)}
    .task-desc{max-height:0;overflow:hidden;transition:max-height 0.32s cubic-bezier(0.4,0,0.2,1)}
    .task-desc.open{max-height:3000px}
    .task-desc-inner{margin-top:12px;padding-top:12px;border-top:1px solid var(--border);font-family:'Hanken Grotesk',sans-serif;font-size:13px;color:var(--muted);line-height:1.75}
    .rn-body{color:#0F1523}
    .rn-body::after{content:"";display:block;clear:both}
    .rn-body p{margin:0 0 8px}
    .rn-body h2,.rn-body h3{font-family:'Hanken Grotesk',sans-serif;color:#0F1523;margin:10px 0 4px;line-height:1.3}
    .rn-body h3{font-size:15px}.rn-body h2{font-size:17px}
    .rn-body ul,.rn-body ol{margin:6px 0;padding-left:22px}
    .rn-body li{margin:2px 0}
    .rn-body a{color:#2563EB}
    .rn-body img{max-width:100%;border-radius:5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .rn-body figure{margin:10px 0}
    .rn-body figcaption{font-size:12px;color:#6B7A99;margin-top:4px;text-align:center}
    .img-wrap{margin-top:12px}
    .img-print-label{display:none}
    .images-block{margin-top:12px}
    .images-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .img-pair{break-inside:avoid-page;page-break-inside:avoid}
    .img-pair--full{grid-column:span 2}
    .img-screen-desc{font-family:'Hanken Grotesk',sans-serif;font-size:11px;color:var(--muted);margin-top:4px;font-style:italic}
    .images-side{display:flex;flex-direction:column;gap:8px}
    .img-side-row{display:flex;align-items:flex-start;gap:12px;break-inside:avoid-page;page-break-inside:avoid}
    .img-side-text{font-family:'Hanken Grotesk',sans-serif;font-size:12px;color:var(--muted);line-height:1.55;padding-top:2px}
    .img-num{font-family:'Hanken Grotesk',sans-serif;font-size:11px;font-weight:500;color:var(--muted)}
    .img-side-desc{color:var(--muted);font-style:italic}
    .help-link-row{display:flex;align-items:center;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);flex-wrap:wrap}
    .help-open{font-family:'Hanken Grotesk',sans-serif;font-size:12px;font-weight:600;color:var(--accent);text-decoration:none;padding:3px 8px;border:1px solid rgba(79,142,247,0.3);border-radius:6px;white-space:nowrap;flex-shrink:0}
    .help-key{font-family:'Hanken Grotesk',sans-serif;font-size:13px;font-weight:600;color:var(--accent);text-decoration:none}
    .help-key:hover{text-decoration:underline}
    .help-open:hover{background:rgba(79,142,247,0.1)}
    .footer{margin-top:72px;padding-top:22px;border-top:1px solid var(--border);text-align:center;font-family:'Hanken Grotesk',sans-serif;font-size:10px;color:var(--subtle);letter-spacing:0.1em;text-transform:uppercase}
    .cover-page{display:none}
    .print-header{display:none}
    .print-footer{display:none}
    .print-footer-override{display:none}
    @page{margin:14mm 14mm 24mm 14mm}
    @media print{
      html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      *{font-family:'Trebuchet MS','Century Gothic',Arial,sans-serif !important}
      body{background:#fff !important;color:#0F1523 !important;orphans:2;widows:2}
      /* ── Hide screen-only elements ── */
      .cover-page{display:none !important}
      .pbar{display:none !important}
      .expand-btn{display:none !important}
      .doc-hdr{display:none !important}
      .footer{display:none !important}
      /* ── Header: normal flow, appears once on first page only ── */
      .print-header{display:none !important}
      /* ── Footer: fixed, repeats on every page ── */
      .print-footer{display:flex !important;align-items:center;justify-content:space-between;position:fixed;bottom:9mm;left:0;right:0;height:auto;padding:0;background:#fff;z-index:10}
      /* ── Footer override: covers browser-generated URL footer ── */
      .print-footer-override{display:block !important;position:fixed;bottom:0;left:0;right:0;height:6mm;background:#fff;z-index:100}
      /* ── Layout: no top padding needed, header is in normal flow ── */
      .wrap{padding:0 0 20px !important}
      .groups{gap:24px !important}
      /* ── Sections: allow natural page breaks between them ── */
      section{break-before:auto;page-break-before:auto;break-inside:auto;page-break-inside:auto}
      /* ── Section headers ── */
      .section-hdr{display:block !important;border-bottom:2px solid #BFDBFE !important;background:none !important;padding-bottom:8px !important;margin-top:24px !important;margin-bottom:12px !important;gap:0 !important}
      .sec-icon{display:none !important}
      .sec-count{display:none !important}
      .sec-label{font-size:16px !important;font-weight:700 !important;color:#2563EB !important;display:block !important}
      /* ── Task rows and section headers: don't orphan ── */
      .task-row{break-after:avoid;page-break-after:avoid}
      .section-hdr{break-after:avoid;page-break-after:avoid}
      /* ── Task cards: never split across pages ── */
      .task-card{background:#fff !important;border:none !important;border-left:3px solid #2563EB !important;padding:10px 14px !important;margin-bottom:10px !important;break-inside:avoid !important;page-break-inside:avoid !important;box-shadow:none !important;border-radius:0 !important}
      .task-card--simple{break-inside:avoid !important;page-break-inside:avoid !important}
      /* ── Simple task cards (no desc/images) ── */
      .task-card--simple{border-left:3px solid #BFDBFE !important;padding:9px 18px !important}
      /* ── Key badge ── */
      .key-badge{font-size:10px !important;font-weight:700 !important;border:1px solid #93C5FD !important;color:#2563EB !important;background:#EFF6FF !important;padding:2px 8px !important;border-radius:3px !important;letter-spacing:0 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      /* ── Task text ── */
      .task-summary{font-size:13px !important;font-weight:700 !important;color:#0F1523 !important}
      .task-card--simple .task-summary{font-weight:600 !important;color:#374151 !important;font-size:12px !important}
      /* ── Description ── */
      .task-desc,.task-desc.open{max-height:none !important;overflow:visible !important;display:block !important}
      .task-desc-inner{font-size:12px !important;color:#374151 !important;line-height:1.65 !important;border-top:none !important;padding-top:8px !important;margin-top:8px !important}
      .rn-body{color:#0F1523 !important}
      .rn-body img{page-break-inside:avoid;break-inside:avoid;max-height:130mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .rn-body figure{page-break-inside:avoid;break-inside:avoid}
      /* ── Images ── */
      .img-print-label{display:block !important;font-size:11px !important;font-weight:600 !important;color:#374151 !important;margin-bottom:4px}
      .img-desc-em{font-style:italic;color:#5A6480;font-weight:400}
      .img-screen-desc{display:none !important}
      .img-wrap{margin-bottom:14px !important;margin-top:0 !important}
      .img-wrap img{max-width:100% !important;border-radius:5px !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      /* Grid layout */
      .images-grid{display:grid !important;grid-template-columns:1fr 1fr !important;gap:6px !important;margin-top:8px !important}
      .img-pair{break-inside:avoid-page !important;page-break-inside:avoid !important}
      .img-pair--full{grid-column:span 2 !important}
      /* Side layout */
      .images-side{display:flex !important;flex-direction:column !important;gap:8px !important;margin-top:8px !important}
      .img-side-row{display:flex !important;align-items:flex-start !important;gap:10px !important;break-inside:avoid-page !important;page-break-inside:avoid !important}
      .img-side-text{font-size:11px !important;color:#374151 !important;line-height:1.5 !important;padding-top:2px !important}
      .img-num{font-weight:600 !important;color:#374151 !important}
      .img-side-desc{color:#5A6480 !important;font-style:italic !important}
      /* ── Help links ── */
      .help-link-row{border-top:0.5px solid #F3F4F6 !important;margin-top:10px !important;padding-top:10px !important}
      .help-open{color:#2563EB !important;font-size:11px !important;font-weight:600 !important;border-color:#93C5FD !important}
      /* ── Print header elements ── */
      .print-header-left{display:flex;align-items:center;gap:10px}
      .print-header-title{font-size:16px;font-weight:700;color:#0F1523}
      .print-header-right{display:flex;align-items:center;gap:10px}
      .print-header-client{font-size:12px;font-weight:700;color:#0F1523}
      .print-version-badge{font-size:10px;color:#2563EB;border:1px solid #2563EB;padding:2px 8px;border-radius:4px;display:inline-block;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .print-header-date{font-size:11px;color:#5A6480}
      /* ── Print footer elements ── */
      .print-footer-text{font-size:10px;color:#9CA3AF}
      .print-footer-logo{opacity:0.35}
    }
  </style>
  ${expanded ? '<style>.task-desc.open{max-height:none !important}</style>' : ''}
</head>
<body>
  <!-- Print-only: fixed header (hidden on screen) -->
  <div class="print-header">
    <div class="print-header-left">
      <img src="/logo-dark.png" alt="Intelisale" style="height:20px">
      <div class="print-header-title">Release Notes</div>
    </div>
    <div class="print-header-right">
      ${meta.clientName ? `<span class="print-header-client">${esc(meta.clientName)}</span>` : ''}
      ${config.version ? `<span class="print-version-badge">${esc(config.version)}</span>` : ''}
      <span class="print-header-date">${dateStr}</span>
    </div>
  </div>

  <!-- Print-only: fixed footer (hidden on screen) -->
  <div class="print-footer">
    <span class="print-footer-text">${dateStr}${meta.clientName ? ' &middot; ' + esc(meta.clientName) : ''}${config.version ? ' &middot; ' + esc(config.version) : ''} &middot; INTELISALE</span>
    <img src="/favicon.png" alt="" class="print-footer-logo" style="height:18px;opacity:0.35">
  </div>

  ${hideBar ? '' : `<div class="pbar">
    <span class="pbar-left">${esc(meta.clientName || 'Intelisale')}${config.version ? ' · ' + esc(config.version) : ''} Release Notes</span>
    <div style="display:flex;gap:8px">
      <button class="pbtn pbtn--html" onclick="exportHtml()">⤓ Export HTML</button>
      <button class="pbtn pbtn--pdf" onclick="window.print()">↓ Export PDF</button>
    </div>
  </div>`}
  ${BRAIN_BG_HTML}
  <div class="wrap">
    <div class="hero">
      <div class="hero-top">
        <img class="hero-logo-img" src="${esc(meta.origin || '')}/logo-white.png" alt="intelisale">
      </div>
      <div class="hero-eyebrow"><span class="dot"></span> PREGLED NOVIH FUNKCIONALNOSTI I ISPRAVKI</div>
      <div class="hero-title">Release Notes</div>
      <div class="hero-divider"></div>
      <div class="hero-meta">
        ${meta.clientName ? `<div><div class="hm-l">Klijent</div><div class="hm-v">${esc(meta.clientName)}</div></div>` : ''}
        ${config.version ? `<div><div class="hm-l">Verzija</div><div class="hm-v">${esc(config.version)}</div></div>` : ''}
        <div><div class="hm-l">Datum</div><div class="hm-v">${dateStr}</div></div>
        ${meta.productName ? `<div><div class="hm-l">Proizvod</div><div class="hm-v">${esc(meta.productName)}</div></div>` : ''}
      </div>
    </div>
    <div class="groups">
      ${sectionsHtml || '<p style="color:var(--muted);font-family:Hanken Grotesk,sans-serif;text-align:center;padding:40px 0">Nema taskova.</p>'}
    </div>
    <div class="footer">INTELISALE · Empowering Sales Excellence · www.intelisale.com</div>
  </div>
  <div class="print-footer-override"></div>
  <script>
    function toggle(id){var card=document.getElementById(id),desc=document.getElementById(id+'-d'),btn=card?card.querySelector('.expand-btn'):null;if(!desc)return;var open=desc.classList.contains('open');desc.classList.toggle('open',!open);if(btn)btn.classList.toggle('open',!open);if(card)card.classList.toggle('open',!open)}
    // Download this page as a standalone HTML file with every card expanded.
    function exportHtml(){
      var descs=document.querySelectorAll('.task-desc'),btns=document.querySelectorAll('.expand-btn');
      var dPrev=[],bPrev=[];
      descs.forEach(function(d,i){dPrev[i]=d.classList.contains('open');d.classList.add('open')});
      btns.forEach(function(b,i){bPrev[i]=b.classList.contains('open');b.classList.add('open')});
      var html='<!DOCTYPE html>\\n'+document.documentElement.outerHTML;
      html=html.replace('</head>','<style>.task-desc.open{max-height:none !important}</style></head>');
      descs.forEach(function(d,i){if(!dPrev[i])d.classList.remove('open')});
      btns.forEach(function(b,i){if(!bPrev[i])b.classList.remove('open')});
      var blob=new Blob([html],{type:'text/html'});
      var a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download=(document.title||'release-notes').replace(/[\\\\/:*?"<>|]/g,'-')+'.html';
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(function(){URL.revokeObjectURL(a.href)},60000);
    }
  </script>
</body>
</html>`
}
