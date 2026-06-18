import { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'
import Topbar from '../components/Topbar.jsx'
import JqlEditor from '../components/JqlEditor.jsx'
import BrainAnimation from '../components/BrainAnimation.jsx'
import { useT } from '../lang.jsx'
import { useWindowSize } from '../hooks/useWindowSize.js'
import RichBodyEditor, { sanitizeBodyHtml, textToHtml, htmlToText } from '../components/RichBodyEditor.jsx'

// ── Pure helpers ───────────────────────────────────────────────────────────────

// Build the rich body HTML for a task: prefer stored bodyHtml, otherwise migrate
// from the legacy plain `description` + `images` block.
function migrateBodyHtml(edit) {
  if (edit?.bodyHtml != null) return edit.bodyHtml
  let html = textToHtml(edit?.description || '')
  for (const img of (edit?.images || [])) {
    if (!img?.base64) continue
    const cap = img.desc ? `<figcaption>${esc(img.desc)}</figcaption>` : ''
    html += `<figure style="margin:10px 0"><img src="${img.base64}" alt="${esc(img.desc || '')}" style="width:60%;display:block;margin:0 auto;max-width:100%">${cap}</figure>`
  }
  return html
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function aiEnhance(action, content) {
  const jt = localStorage.getItem('jt_token')
  const res = await fetch('/api/release-notes/ai-enhance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jt}` },
    body: JSON.stringify({ action, content }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const d = await res.json()
  if (d.error) throw new Error(d.error)
  return d.result || ''
}

function statusCat(task) {
  const s = task.fields?.status?.name || ''
  if (['Resolved', 'Done', 'Closed'].includes(s)) return 'resolved'
  if (['In Progress', 'Development', 'Review'].includes(s)) return 'inprog'
  if (['For Testing', 'TESTING STARTED', 'On Hold - Testing'].includes(s)) return 'testing'
  return 'other'
}

function statusBadgeStyle(cat) {
  const m = {
    resolved: { background: 'var(--greenTint)', color: 'var(--green)', border: '1px solid rgba(34,197,94,0.3)' },
    inprog:   { background: 'rgba(79,142,247,0.12)', color: 'var(--accent)', border: '1px solid rgba(79,142,247,0.3)' },
    testing:  { background: 'var(--amberTint)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.3)' },
    other:    { background: 'var(--surfaceAlt)', color: 'var(--textMuted)', border: '1px solid var(--border)' },
  }
  return m[cat] || m.other
}

function statusLabel(task) {
  return task.fields?.status?.name || '—'
}

function buildHelpUrl(key, jiraUrl) {
  if (!key || !jiraUrl) return null
  return 'https://' + jiraUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') + '/browse/' + key
}

function todayStr() {
  return new Date().toLocaleDateString('sr-Latn-RS', { day: 'numeric', month: 'long', year: 'numeric' })
}

const PREFIX_ORDER = ['ECOM', 'DB', 'DEVOPS', 'SRC']
const GROUP_CONFIG = {
  ECOM:   { label: 'Funkcionalnosti i UI',   icon: '🎨', color: '#4F8EF7' },
  DB:     { label: 'Backend & Baza',          icon: '🗄️', color: '#A855F7' },
  DEVOPS: { label: 'DevOps & Infrastruktura', icon: '⚙️', color: '#F59E0B' },
  SRC:    { label: 'Support & Ostalo',        icon: '🛠️', color: '#22C55E' },
}
const KEY_COLORS = {
  ECOM:   { bg: 'rgba(79,142,247,0.15)',  color: '#4F8EF7', border: 'rgba(79,142,247,0.35)'  },
  DB:     { bg: 'rgba(168,85,247,0.15)',  color: '#A855F7', border: 'rgba(168,85,247,0.35)'  },
  DEVOPS: { bg: 'rgba(245,158,11,0.15)',  color: '#F59E0B', border: 'rgba(245,158,11,0.35)'  },
  SRC:    { bg: 'rgba(34,197,94,0.15)',   color: '#22C55E', border: 'rgba(34,197,94,0.35)'   },
  OTHER:  { bg: 'rgba(107,122,153,0.15)', color: '#8B99B5', border: 'rgba(107,122,153,0.35)' },
}

function getHelpLinks(task) {
  return (task.fields?.issuelinks || []).filter(l =>
    (l.outwardIssue?.key || l.inwardIssue?.key || l.key || '').startsWith('HELP')
  ).map(l => ({
    key: l.outwardIssue?.key || l.inwardIssue?.key || l.key,
    summary: l.outwardIssue?.fields?.summary || l.inwardIssue?.fields?.summary || l.summary || '',
    status: l.outwardIssue?.fields?.status?.name || l.inwardIssue?.fields?.status?.name || l.status || '',
  }))
}

function generatePublishHtml(selectedTasks, taskEdits, config, meta, { sectionOverrides = {}, sectionLabels = {} } = {}) {
  const dateStr = esc(meta.date || todayStr())
  const title = esc(`${meta.clientName || 'Release Notes'} ${config.version || ''}`.trim())
  const jiraBase = meta.jiraUrl ? 'https://' + meta.jiraUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') : null

  const groups = {}
  for (const task of selectedTasks) {
    const prefix = sectionOverrides[task.id] || (task.key || '').split('-')[0].toUpperCase()
    if (!groups[prefix]) groups[prefix] = []
    groups[prefix].push(task)
  }
  const groupOrder = [
    ...PREFIX_ORDER.filter(p => groups[p]?.length),
    ...Object.keys(groups).filter(p => !PREFIX_ORDER.includes(p) && groups[p]?.length),
  ]

  const sectionsHtml = groupOrder.map(prefix => {
    const baseCfg = GROUP_CONFIG[prefix] || { label: prefix, icon: '📋', color: '#8B99B5' }
    const cfg = { ...baseCfg, label: sectionLabels[prefix] || baseCfg.label }
    const keyC = KEY_COLORS[prefix] || KEY_COLORS.OTHER
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
        const isDone = ['Done', 'Closed', 'Resolved'].includes(link.status)
        const stBg  = isDone ? 'rgba(34,197,94,0.12)'  : 'rgba(79,142,247,0.12)'
        const stCol = isDone ? '#22C55E' : '#4F8EF7'
        const stBor = isDone ? 'rgba(34,197,94,0.3)'   : 'rgba(79,142,247,0.3)'
        return `<div class="help-link-row">
          <span>🔗</span>
          <span class="key-badge" style="background:rgba(245,158,11,0.15);color:#F59E0B;border:1px solid rgba(245,158,11,0.3)">${esc(link.key)}</span>
          ${link.summary ? `<span style="font-family:'DM Sans',sans-serif;font-size:13px;color:#6B7A99;flex:1">${esc(link.summary)}</span>` : ''}
          ${link.status ? `<span class="key-badge" style="background:${stBg};color:${stCol};border:1px solid ${stBor}">${esc(link.status)}</span>` : ''}
          ${url ? `<a class="help-open" href="${url}" target="_blank" rel="noopener noreferrer">↗ Otvori</a>` : ''}
        </div>`
      }).join('')

      const isSimple = !hasExpand
      return `<div class="task-card${isSimple ? ' task-card--simple' : ''}" id="${cardId}">
        <div class="task-row">
          <span class="key-badge" style="background:${keyC.bg};color:${keyC.color};border:1px solid ${keyC.border}">${key}</span>
          <span class="task-summary">${name}</span>
          ${hasExpand ? `<button class="expand-btn" onclick="toggle('${cardId}')" title="Prikaži/sakrij detalje">▾</button>` : ''}
        </div>
        ${hasExpand ? `<div class="task-desc" id="${cardId}-d">
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
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{--bg:#F0F2F8;--surface:#FFFFFF;--border:#E2E6F0;--border2:#C8CFDF;--text:#0F1523;--muted:#5A6480;--subtle:#A0AABF;--accent:#2563EB}
    body{font-family:'DM Sans',-apple-system,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;font-size:15px;line-height:1.6}
    .pbar{position:fixed;top:0;left:0;right:0;z-index:100;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:10px 28px;gap:12px}
    .pbar-left{font-family:'DM Mono',monospace;font-size:12px;color:var(--muted)}
    .pbtn{background:var(--accent);color:#fff;border:none;border-radius:8px;padding:7px 18px;font-family:'DM Sans',sans-serif;font-weight:600;font-size:13px;cursor:pointer;transition:opacity 0.2s}
    .pbtn:hover{opacity:0.85}
    .wrap{max-width:860px;margin:0 auto;padding:84px 28px 80px}
    .doc-hdr{margin-bottom:48px}
    .doc-hdr-top{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px}
    .brand{font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.14em;margin-bottom:10px}
    .doc-title{font-family:'Syne',sans-serif;font-weight:800;font-size:40px;color:var(--text);line-height:1.1;letter-spacing:-0.02em}
    .meta-col{display:flex;flex-direction:column;align-items:flex-end;gap:8px;padding-top:4px}
    .badge-accent{font-family:'DM Mono',monospace;font-size:13px;font-weight:500;padding:5px 12px;border-radius:6px;background:rgba(79,142,247,0.1);color:var(--accent);border:1px solid rgba(79,142,247,0.25)}
    .badge-green{font-family:'DM Mono',monospace;font-size:13px;font-weight:500;padding:5px 12px;border-radius:6px;background:rgba(34,197,94,0.1);color:#22C55E;border:1px solid rgba(34,197,94,0.25)}
    .doc-date,.doc-client{font-family:'DM Mono',monospace;font-size:11px;color:var(--muted)}
    .divider{height:2px;margin-top:24px;background:linear-gradient(90deg,var(--accent) 0%,transparent 70%);border-radius:2px;opacity:0.35}
    .groups{display:flex;flex-direction:column;gap:44px}
    .section-hdr{display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid}
    .sec-icon{font-size:20px;line-height:1}
    .sec-label{font-family:'Syne',sans-serif;font-weight:800;font-size:18px}
    .sec-count{font-family:'DM Mono',monospace;font-size:11px;font-weight:500;padding:2px 9px;border-radius:20px;margin-left:2px}
    .task-list{display:flex;flex-direction:column;gap:8px}
    .task-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:13px 16px;transition:border-color 0.2s;break-inside:avoid}
    .task-card.open{border-color:var(--border2)}
    .task-row{display:flex;align-items:center;gap:12px}
    .key-badge{font-family:'DM Mono',monospace;font-size:11px;font-weight:500;padding:3px 9px;border-radius:6px;flex-shrink:0;letter-spacing:0.04em;white-space:nowrap}
    .task-summary{font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;color:var(--text);flex:1;line-height:1.4}
    .expand-btn{background:transparent;border:none;color:var(--muted);cursor:pointer;font-size:17px;padding:0 2px;flex-shrink:0;transition:transform 0.25s ease,color 0.2s;display:flex;align-items:center;line-height:1}
    .expand-btn:hover{color:var(--text)}
    .expand-btn.open{transform:rotate(180deg);color:var(--accent)}
    .task-desc{max-height:0;overflow:hidden;transition:max-height 0.32s cubic-bezier(0.4,0,0.2,1)}
    .task-desc.open{max-height:3000px}
    .task-desc-inner{margin-top:12px;padding-top:12px;border-top:1px solid var(--border);font-family:'DM Sans',sans-serif;font-size:13px;color:var(--muted);line-height:1.75}
    .rn-body{color:#0F1523}
    .rn-body::after{content:"";display:block;clear:both}
    .rn-body p{margin:0 0 8px}
    .rn-body h2,.rn-body h3{font-family:'Syne',sans-serif;color:#0F1523;margin:10px 0 4px;line-height:1.3}
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
    .img-screen-desc{font-family:'DM Sans',sans-serif;font-size:11px;color:var(--muted);margin-top:4px;font-style:italic}
    .images-side{display:flex;flex-direction:column;gap:8px}
    .img-side-row{display:flex;align-items:flex-start;gap:12px;break-inside:avoid-page;page-break-inside:avoid}
    .img-side-text{font-family:'DM Sans',sans-serif;font-size:12px;color:var(--muted);line-height:1.55;padding-top:2px}
    .img-num{font-family:'DM Mono',monospace;font-size:11px;font-weight:500;color:var(--muted)}
    .img-side-desc{color:var(--muted);font-style:italic}
    .help-link-row{display:flex;align-items:center;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);flex-wrap:wrap}
    .help-open{font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;color:var(--accent);text-decoration:none;padding:3px 8px;border:1px solid rgba(79,142,247,0.3);border-radius:6px;white-space:nowrap;flex-shrink:0}
    .help-open:hover{background:rgba(79,142,247,0.1)}
    .footer{margin-top:72px;padding-top:22px;border-top:1px solid var(--border);text-align:center;font-family:'DM Mono',monospace;font-size:10px;color:var(--subtle);letter-spacing:0.1em;text-transform:uppercase}
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
      .print-header{display:flex !important;align-items:center;justify-content:space-between;position:relative;margin-bottom:24px;padding-bottom:16px;border-bottom:1.5px solid #0F1523}
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
      .task-card{background:#fff !important;border:none !important;border-left:3px solid #2563EB !important;padding:10px 14px !important;margin-bottom:10px !important;break-inside:auto;page-break-inside:auto;box-shadow:none !important;border-radius:0 !important}
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
      .rn-body img{page-break-inside:avoid;break-inside:avoid}
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

  <div class="pbar">
    <span class="pbar-left">${esc(meta.clientName || 'Intelisale')}${config.version ? ' · ' + esc(config.version) : ''} Release Notes</span>
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
          ${meta.productName ? `<span class="badge-accent">${esc(meta.productName)}</span>` : ''}
          ${config.version ? `<span class="badge-green">${esc(config.version)}</span>` : ''}
          <span class="doc-date">${dateStr}</span>
          ${meta.clientName ? `<span class="doc-client">${esc(meta.clientName)}</span>` : ''}
        </div>
      </div>
      <div class="divider"></div>
    </div>
    <div class="groups">
      ${sectionsHtml || '<p style="color:var(--muted);font-family:DM Sans,sans-serif;text-align:center;padding:40px 0">Nema taskova.</p>'}
    </div>
    <div class="footer">INTELISALE · Empowering Sales Excellence · www.intelisale.com</div>
  </div>
  <div class="print-footer-override"></div>
  <script>
    function toggle(id){var card=document.getElementById(id),desc=document.getElementById(id+'-d'),btn=card?card.querySelector('.expand-btn'):null;if(!desc)return;var open=desc.classList.contains('open');desc.classList.toggle('open',!open);if(btn)btn.classList.toggle('open',!open);if(card)card.classList.toggle('open',!open)}
  </script>
</body>
</html>`
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────

function IconSparkle() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ display: 'block', flexShrink: 0 }}>
      <path d="M6 1L7.2 4.8L11 6L7.2 7.2L6 11L4.8 7.2L1 6L4.8 4.8L6 1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  )
}

function IconGlobe() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ display: 'block', flexShrink: 0 }}>
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M6 1C4.5 2.8 4 4.2 4 6s.5 3.2 2 5M6 1c1.5 1.8 2 3.2 2 5s-.5 3.2-2 5M1 6h10" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  )
}

function IconLink() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ display: 'block', flexShrink: 0 }}>
      <path d="M5 7L7 5M3.5 8.5L2.2 9.8a2 2 0 0 1-2.83-2.83L.87 5.47A2 2 0 0 1 3.5 5M8.5 3.5l1.3-1.3a2 2 0 0 1 2.83 2.83l-.5.5A2 2 0 0 1 8.5 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ReleaseNotesEditorPage({ user, theme, onLogout, onGoToDashboard, onGoToReleaseNotes, onGoToReleaseNotesEditor, onGoToDocuments, onGoToQA, onOpenSettings, onOpenUsers, onOpenChat }) {
  const t = useT()
  const { isMobile } = useWindowSize()
  // wizard
  const [wizardStep, setWizardStep] = useState(1)
  const [maxStep, setMaxStep] = useState(1)

  // data
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [taskError, setTaskError] = useState(null)

  // config (step 1)
  const [config, setConfig] = useState({ clientName: '', version: '' })
  const [customJql, setCustomJql] = useState('')
  const [fetchTrigger, setFetchTrigger] = useState(0)

  // step 1 selection
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedIds, setSelectedIds] = useState(new Set())

  // step 2 editing
  const [taskEdits, setTaskEdits] = useState({})
  const [taskJiraDetails, setTaskJiraDetails] = useState({}) // { [id]: { description, loading, error } }
  const [aiPreviews, setAiPreviews] = useState({}) // { [taskId]: string } — pending AI suggestion
  const [expandedId, setExpandedId] = useState(null)
  const [aiLoadingIds, setAiLoadingIds] = useState(new Set())
  const [aiCooldownIds, setAiCooldownIds] = useState(new Set())
  const [bulkProgress, setBulkProgress] = useState(null)

  // step 3
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewDate, setPreviewDate] = useState('')

  // section overrides: { [taskId]: customPrefix } and { [prefix]: customLabel }
  const [sectionOverrides, setSectionOverrides] = useState({})
  const [sectionLabels, setSectionLabels] = useState({})
  const [editingSection, setEditingSection] = useState(null) // prefix being renamed
  const [editingSectionValue, setEditingSectionValue] = useState('')
  const [dragOverPrefix, setDragOverPrefix] = useState(null)
  const [dragOverTaskId, setDragOverTaskId] = useState(null) // task id to insert before
  const [sectionTaskOrders, setSectionTaskOrders] = useState({}) // { [prefix]: [id,...] }
  const dragTaskId = useRef(null)
  const dragFromPrefix = useRef(null)

  // publish
  const [publishModal, setPublishModal] = useState(null)
  const [publishState, setPublishState] = useState(null)

  // toast
  const [toast, setToast] = useState(null)

  // copy from existing
  const [copyDropOpen, setCopyDropOpen] = useState(false)
  const [existingNotes, setExistingNotes] = useState(null) // null = not loaded yet
  const [copyLoading, setCopyLoading] = useState(false)
  const [copiedEdits, setCopiedEdits] = useState(null) // { [key]: { name, description } } keyed by task key

  // Ref to skip one useEffect run when copy sets selectedProject directly
  const skipNextFetchRef = useRef(false)

  useEffect(() => {
    api.getProjects().then(setProjects).catch(() => {})
  }, [])

  useEffect(() => {
    if (!copyDropOpen) return
    function close(e) {
      if (!e.target.closest('[data-copy-dropdown]')) setCopyDropOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [copyDropOpen])

  // Normal project/JQL fetch — skipped when copy does it directly
  useEffect(() => {
    if (!selectedProject) { setTasks([]); setTaskError(null); return }
    if (skipNextFetchRef.current) { skipNextFetchRef.current = false; return }
    setLoadingTasks(true)
    setTaskError(null)
    setSelectedIds(new Set())
    const token = localStorage.getItem('jt_token')
    fetch('/api/release-notes/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ projectId: selectedProject.id, ...(customJql.trim() ? { customJql: customJql.trim() } : {}) }),
    })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`); return d })
      .then(data => { setTasks(data.tasks || []) })
      .catch(err => { setTaskError(err.message); setTasks([]) })
      .finally(() => setLoadingTasks(false))
  }, [selectedProject, fetchTrigger])

  function showToast(message) {
    setToast({ message })
    setTimeout(() => setToast(null), 3500)
  }

  function setConfigField(key, val) { setConfig(prev => ({ ...prev, [key]: val })) }

  function toggleSelected(taskId) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(taskId) ? n.delete(taskId) : n.add(taskId); return n })
  }

  function goToStep(n) {
    if (n > maxStep) return
    setWizardStep(n)
  }

  function goToStep2() {
    if (selectedIds.size === 0) return
    setTaskEdits(prev => {
      const edits = { ...prev }
      for (const task of tasks) {
        if (selectedIds.has(task.id) && !edits[task.id]) {
          const copied = copiedEdits?.[task.key]
          edits[task.id] = {
            name: copied?.name || task.fields?.summary || task.summary || '',
            description: copied?.description || '',
            images: [],
          }
        }
      }
      return edits
    })
    setExpandedId(null)
    setWizardStep(2)
    setMaxStep(s => Math.max(s, 2))
    // Background-fetch Jira details for all selected tasks so descriptions are ready
    setTimeout(() => {
      for (const task of tasks.filter(t => selectedIds.has(t.id))) {
        fetchAndSetDetail(task)
      }
    }, 0)
  }

  function goToStep3() {
    setPreviewTitle(`${config.clientName || ''} ${config.version || ''}`.trim() || selectedProject?.displayName || selectedProject?.epicKey || 'Release Notes')
    setPreviewDate(todayStr())
    setWizardStep(3)
    setMaxStep(s => Math.max(s, 3))
  }

  function goToStep4() {
    if (!previewTitle) setPreviewTitle(`${config.clientName || ''} ${config.version || ''}`.trim() || selectedProject?.displayName || selectedProject?.epicKey || 'Release Notes')
    if (!previewDate) setPreviewDate(todayStr())
    setWizardStep(4)
    setMaxStep(s => Math.max(s, 4))
  }

  function removeFromSelection(taskId) {
    setSelectedIds(prev => { const n = new Set(prev); n.delete(taskId); return n })
  }

  function updateEdit(taskId, key, value) {
    setTaskEdits(prev => ({ ...prev, [taskId]: { ...prev[taskId], [key]: value } }))
  }

  // Rich body: store HTML + keep a plain-text mirror (used for AI prompt context).
  function updateBody(taskId, html) {
    setTaskEdits(prev => ({ ...prev, [taskId]: { ...prev[taskId], bodyHtml: html, description: htmlToText(html) } }))
  }
  // Apply AI/translate plain text into the rich body (converts to paragraphs).
  function applyAiText(taskId, text) {
    setTaskEdits(prev => ({ ...prev, [taskId]: { ...prev[taskId], description: text, bodyHtml: textToHtml(text) } }))
  }

  // Fetch Jira detail for a task, pre-fill description if empty
  async function fetchAndSetDetail(task) {
    if (taskJiraDetails[task.id]?.description !== undefined || taskJiraDetails[task.id]?.loading) return
    setTaskJiraDetails(prev => ({ ...prev, [task.id]: { loading: true } }))
    try {
      const jt = localStorage.getItem('jt_token')
      const res = await fetch('/api/release-notes/task-detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jt}` },
        body: JSON.stringify({ taskKey: task.key, projectId: selectedProject?.id }),
      })
      const d = await res.json()
      setTaskJiraDetails(prev => ({ ...prev, [task.id]: d }))
      // Pre-fill description if still empty
      setTaskEdits(prev => {
        const current = prev[task.id]
        if (current && !current.description && d.description) {
          return { ...prev, [task.id]: { ...current, description: d.description } }
        }
        return prev
      })
    } catch {
      setTaskJiraDetails(prev => ({ ...prev, [task.id]: { error: true } }))
    }
  }

  function handleExpandTask(taskId) {
    const isOpening = expandedId !== taskId
    setExpandedId(isOpening ? taskId : null)
    if (isOpening) {
      const task = tasks.find(t => t.id === taskId)
      if (task) fetchAndSetDetail(task)
    }
  }

  async function generateTaskDesc(taskId, { applyDirectly = false } = {}) {
    const edit = taskEdits[taskId]
    if (!edit) return
    const jiraDetail = taskJiraDetails[taskId]
    setAiLoadingIds(prev => new Set([...prev, taskId]))
    try {
      const jiraDesc = jiraDetail?.description || ''
      const content = `Naziv taska: ${edit.name}${jiraDesc ? `\n\nOriginalni Jira opis:\n${jiraDesc}` : ''}`
      const result = await aiEnhance('generate_description', content)
      if (applyDirectly) {
        applyAiText(taskId, result)
      } else {
        setAiPreviews(prev => ({ ...prev, [taskId]: result }))
      }
    } catch (e) {
      showToast(t('rne.aiFailed'))
    } finally {
      setAiLoadingIds(prev => { const n = new Set(prev); n.delete(taskId); return n })
      setAiCooldownIds(prev => new Set([...prev, taskId]))
      setTimeout(() => setAiCooldownIds(prev => { const n = new Set(prev); n.delete(taskId); return n }), 3000)
    }
  }

  async function translateTask(taskId) {
    const edit = taskEdits[taskId]
    if (!edit) return
    setAiLoadingIds(prev => new Set([...prev, taskId]))
    try {
      const images = edit.images || []
      const parts = [`Summary: ${edit.name}`]
      if (edit.description) parts.push(`Description: ${edit.description}`)
      images.forEach((img, i) => { if (img.desc) parts.push(`Image${i + 1}: ${img.desc}`) })
      const result = await aiEnhance('translate_en', parts.join('\n'))

      const lines = result.split('\n')
      const get = (prefix) => {
        const line = lines.find(l => l.toLowerCase().startsWith(prefix.toLowerCase() + ':'))
        return line ? line.slice(prefix.length + 1).trim() : null
      }
      const newName = get('Summary')
      const newDesc = get('Description')
      const newImageDescs = images.map((_, i) => get(`Image${i + 1}`))

      const anyChanged = newName || newDesc || newImageDescs.some(Boolean)
      if (!anyChanged) {
        showToast(t('rne.aiTranslateFailed'))
        return
      }
      setTaskEdits(prev => ({
        ...prev,
        [taskId]: {
          ...prev[taskId],
          ...(newName ? { name: newName } : {}),
          ...(newDesc ? { description: newDesc, bodyHtml: textToHtml(newDesc) } : {}),
          images: prev[taskId].images.map((img, i) =>
            newImageDescs[i] ? { ...img, desc: newImageDescs[i] } : img
          ),
        },
      }))
      showToast(t('rne.translateDone'))
    } catch {
      showToast(t('rne.aiTranslateFailed'))
    } finally {
      setAiLoadingIds(prev => { const n = new Set(prev); n.delete(taskId); return n })
      setAiCooldownIds(prev => new Set([...prev, taskId]))
      setTimeout(() => setAiCooldownIds(prev => { const n = new Set(prev); n.delete(taskId); return n }), 3000)
    }
  }

  async function generateAllDescriptions() {
    if (bulkProgress) return
    const sel = tasks.filter(t => selectedIds.has(t.id))
    for (let i = 0; i < sel.length; i++) {
      setBulkProgress({ current: i + 1, total: sel.length, action: 'generate' })
      const task = sel[i]
      if (!taskJiraDetails[task.id]?.description && !taskJiraDetails[task.id]?.error) {
        await fetchAndSetDetail(task)
      }
      await generateTaskDesc(task.id, { applyDirectly: true })
    }
    setBulkProgress(null)
  }

  async function translateAll() {
    if (bulkProgress) return
    const sel = tasks.filter(t => selectedIds.has(t.id))
    for (let i = 0; i < sel.length; i++) {
      setBulkProgress({ current: i + 1, total: sel.length, action: 'translate' })
      await translateTask(sel[i].id)
    }
    setBulkProgress(null)
  }

  function handleImageUpload(taskId, files) {
    for (const file of Array.from(files)) {
      if (file.size > 5 * 1024 * 1024) { showToast('Slika je prevelika (max 5MB)'); continue }
      const reader = new FileReader()
      reader.onload = e => {
        setTaskEdits(prev => ({
          ...prev,
          [taskId]: { ...prev[taskId], images: [...(prev[taskId]?.images || []), { base64: e.target.result, mimeType: file.type, desc: '' }] },
        }))
      }
      reader.readAsDataURL(file)
    }
  }

  function removeImage(taskId, idx) {
    setTaskEdits(prev => ({ ...prev, [taskId]: { ...prev[taskId], images: prev[taskId].images.filter((_, i) => i !== idx) } }))
  }

  function updateImageDesc(taskId, idx, desc) {
    setTaskEdits(prev => ({
      ...prev,
      [taskId]: { ...prev[taskId], images: prev[taskId].images.map((img, i) => i === idx ? { ...img, desc } : img) },
    }))
  }

  function setImageLayout(taskId, layout) {
    setTaskEdits(prev => ({ ...prev, [taskId]: { ...prev[taskId], imageLayout: layout } }))
  }

  async function openPublishModal() {
    try {
      const [usersData, sectionsData] = await Promise.all([
        api.getUsers().catch(() => []),
        api.getReleaseNoteSections().catch(() => ({ sections: [] })),
      ])
      const clientUsers = (Array.isArray(usersData) ? usersData : []).filter(u => u.role === 'client')
      const sections = sectionsData?.sections || []
      setPublishModal({ clientUsers, sections })
    } catch (err) {
      showToast(err.message)
    }
  }

  // Single source for the final HTML — used by both the Pregled iframe and Publish.
  function buildPublishHtml() {
    const selectedTasks = tasks.filter(t => selectedIds.has(t.id))
    return generatePublishHtml(selectedTasks, taskEdits, config, {
      clientName: config.clientName,
      version: config.version,
      productName: selectedProject?.displayName || selectedProject?.epicKey || '',
      jiraUrl: user?.jiraUrl || '',
      date: previewDate || todayStr(),
    }, { sectionOverrides, sectionLabels })
  }

  // Export the preview iframe to PDF. Chrome names the file after the MAIN
  // window's title, so swap it to the release-notes name, then restore.
  function exportPdf() {
    const f = document.getElementById('rn-preview-frame')
    if (!f?.contentWindow) return
    const name = (previewTitle || `${config.clientName || ''} ${config.version || ''}`.trim() || 'Release Notes').replace(/[\\/:*?"<>|]/g, '-')
    const prev = document.title
    let restored = false
    const restore = () => { if (restored) return; restored = true; document.title = prev; window.removeEventListener('afterprint', restore) }
    document.title = name
    try { if (f.contentDocument) f.contentDocument.title = name } catch { /* cross-origin guard */ }
    window.addEventListener('afterprint', restore)
    setTimeout(restore, 3000)
    f.contentWindow.focus()
    f.contentWindow.print()
  }

  async function handlePublish(selectedClientIds, sectionName) {
    const html = buildPublishHtml()
    setPublishState({ loading: true })
    const jt = localStorage.getItem('jt_token')
    try {
      const res = await fetch('/api/release-notes/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jt}` },
        body: JSON.stringify({
          html,
          title: previewTitle || `${config.clientName || ''} ${config.version || ''}`.trim(),
          version: config.version || null,
          projectId: selectedProject?.id || null,
          sectionName: sectionName || null,
        }),
      })
      const ct = res.headers.get('content-type') || ''
      if (!ct.includes('application/json')) { setPublishState({ error: `Server greška ${res.status}` }); return }
      const data = await res.json()
      if (data.token) {
        if (data.id && selectedClientIds.length > 0) {
          await api.setReleaseNoteClients(data.id, selectedClientIds).catch(() => {})
        }
        setPublishState(null)
        onGoToReleaseNotes()
      } else {
        setPublishState({ error: data.error || 'Server nije vratio token.' })
      }
    } catch (err) {
      setPublishState({ error: err.message })
    }
  }

  const hasAiKey = true // server either uses user's key or ANTHROPIC_API_KEY env var

  // ── Step 1 ─────────────────────────────────────────────────────────────────

  function parseNoteHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const result = {}
    doc.querySelectorAll('.task-card').forEach(card => {
      const keyEl = card.querySelector('.task-row .key-badge')
      const summaryEl = card.querySelector('.task-summary')
      const descInner = card.querySelector('.task-desc-inner')
      if (!keyEl) return
      const key = keyEl.textContent.trim()
      const name = summaryEl?.textContent.trim() || ''
      let description = ''
      if (descInner) {
        const clone = descInner.cloneNode(true)
        clone.querySelectorAll('div').forEach(d => d.remove()) // remove image divs
        clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'))
        description = clone.textContent.trim()
      }
      result[key] = { name, description }
    })
    return result
  }

  async function handleCopyFromNote(note) {
    if (!note) return
    setCopyLoading(true)
    try {
      const detail = await api.getReleaseNoteDetail(note.id)
      const noteData = detail.note || detail
      const edits = parseNoteHtml(noteData.html || '')
      const keys = Object.keys(edits)
      if (keys.length === 0) { showToast(t('rne.noTasks')); return }

      const pid = noteData.project_id || note.project_id
      const proj = pid ? projects.find(p => p.id === pid) : selectedProject
      if (!proj) { showToast('Projekat nije pronađen'); return }

      // Fetch only the copied tasks directly (bypass useEffect)
      setLoadingTasks(true)
      const token = localStorage.getItem('jt_token')
      const res = await fetch('/api/release-notes/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ projectId: proj.id, customJql: `issuekey IN (${keys.join(', ')})` }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const loaded = data.tasks || []

      // Pre-fill config
      const version = noteData.version || ''
      const clientName = version ? (noteData.title || '').replace(version, '').trim() : (noteData.title || '')
      setConfig({ clientName, version })

      // Skip the useEffect that would fire if project changes
      if (proj.id !== selectedProject?.id) skipNextFetchRef.current = true
      setSelectedProject(proj)
      setCopiedEdits(edits)
      setTasks(loaded)
      setSelectedIds(new Set(loaded.filter(t => edits[t.key]).map(t => t.id)))
      setCustomJql('') // clear JQL — user can add more via JQL below
      setCopyDropOpen(false)
      showToast(t('rne.copyLoaded') + `: ${loaded.length} / "${noteData.title || 'release notes'}"`)
    } catch (err) {
      showToast('Greška: ' + (err.message || 'nepoznata greška'))
    } finally {
      setCopyLoading(false)
      setLoadingTasks(false)
    }
  }

  // Adds more tasks via JQL on top of existing list (merge mode when copiedEdits active)
  async function handleAddByJql() {
    if (!selectedProject || !customJql.trim()) return
    setLoadingTasks(true)
    setTaskError(null)
    try {
      const token = localStorage.getItem('jt_token')
      const res = await fetch('/api/release-notes/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ projectId: selectedProject.id, customJql: customJql.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const newTasks = data.tasks || []
      // Merge: only add tasks not already in the list
      setTasks(prev => {
        const existingKeys = new Set(prev.map(t => t.key))
        const toAdd = newTasks.filter(t => !existingKeys.has(t.key))
        return [...prev, ...toAdd]
      })
      setSelectedIds(prev => {
        const n = new Set(prev)
        newTasks.forEach(t => n.add(t.id))
        return n
      })
    } catch (err) {
      setTaskError(err.message)
    } finally {
      setLoadingTasks(false)
    }
  }

  const filteredTasks = tasks.filter(t => {
    const matchSearch = !search ||
      (t.key || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.fields?.summary || t.summary || '').toLowerCase().includes(search.toLowerCase())
    const matchFilter = statusFilter === 'all' || statusCat(t) === statusFilter
    return matchSearch && matchFilter
  })

  const countByStatus = {
    all: tasks.length,
    resolved: tasks.filter(t => statusCat(t) === 'resolved').length,
    inprog: tasks.filter(t => statusCat(t) === 'inprog').length,
    testing: tasks.filter(t => statusCat(t) === 'testing').length,
  }

  const renderStep1 = () => (
    <div>
      {/* Config bar */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Projekat</label>
            <select value={selectedProject?.id || ''} onChange={e => setSelectedProject(projects.find(p => p.id == e.target.value) || null)}
              style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontFamily: 'DM Sans', fontSize: 14 }}>
              <option value="">Izaberi projekat...</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.displayName || p.epicKey}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Naziv klijenta</label>
            <input value={config.clientName} onChange={e => setConfigField('clientName', e.target.value)} placeholder={t('rne.clientPlaceholder')}
              style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Verzija</label>
            <input value={config.version} onChange={e => setConfigField('version', e.target.value)} placeholder={t('rne.versionPlaceholder')}
              style={inputStyle} />
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16, alignItems: 'flex-start' }}>
          {/* JQL column */}
          <div style={{ flex: 1, width: isMobile ? '100%' : undefined }}>
            <label style={labelStyle}>Prilagođeni JQL (opciono)</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <JqlEditor
                  value={customJql}
                  onChange={setCustomJql}
                  placeholder={t('rne.jqlPlaceholder')}
                  rows={2}
                  showPreview={false}
                />
              </div>
              <button
                disabled={!selectedProject || (copiedEdits && tasks.length > 0 && !customJql.trim())}
                onClick={() => {
                  if (copiedEdits && tasks.length > 0) handleAddByJql()
                  else if (selectedProject) setFetchTrigger(n => n + 1)
                }}
                style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontFamily: 'DM Sans', fontWeight: 600, border: 'none', whiteSpace: 'nowrap', transition: 'all 0.2s ease',
                  cursor: (!selectedProject || (copiedEdits && tasks.length > 0 && !customJql.trim())) ? 'not-allowed' : 'pointer',
                  background: (!selectedProject || (copiedEdits && tasks.length > 0 && !customJql.trim())) ? 'var(--surfaceAlt)' : 'var(--accent)',
                  color: (!selectedProject || (copiedEdits && tasks.length > 0 && !customJql.trim())) ? 'var(--textMuted)' : '#fff',
                }}>
                {copiedEdits && tasks.length > 0 ? t('rne.add') : t('rne.apply')}
              </button>
            </div>
          </div>

          {/* Copy from existing column */}
          <div style={{ width: isMobile ? '100%' : 190, flexShrink: 0 }}>
            <label style={labelStyle}>Kopiraj iz postojećeg</label>
            <div style={{ position: 'relative' }} data-copy-dropdown>
              <button
                onClick={() => {
                  const next = !copyDropOpen
                  setCopyDropOpen(next)
                  if (next && existingNotes === null) {
                    api.getReleaseNotesList()
                      .then(d => setExistingNotes(d.notes || []))
                      .catch(() => setExistingNotes([]))
                  }
                }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500, transition: 'all 0.15s',
                  background: copiedEdits ? 'rgba(34,197,94,0.08)' : 'var(--bg)',
                  border: `1px solid ${copiedEdits ? 'rgba(34,197,94,0.35)' : 'var(--border)'}`,
                  color: copiedEdits ? 'var(--green)' : 'var(--text)',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {copyLoading ? t('rne.loading') : copiedEdits ? t('rne.copyLoaded') : t('rne.selectReleaseNotes')}
                </span>
                <span style={{ fontSize: 10, flexShrink: 0, transform: copyDropOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block', color: 'var(--textMuted)' }}>▾</span>
              </button>
              <p style={{ margin: '5px 0 0', fontFamily: 'DM Sans', fontSize: 11, color: 'var(--textMuted)', lineHeight: 1.4 }}>
                {copiedEdits ? t('rne.tasksLoaded') : t('rne.copyDesc')}
              </p>
              {copyDropOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, minWidth: 300, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', zIndex: 200, overflow: 'hidden' }}>
                  {existingNotes === null ? (
                    <div style={{ padding: '12px 16px', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--textMuted)' }}>{t('rne.loading')}</div>
                  ) : existingNotes.length === 0 ? (
                    <div style={{ padding: '12px 16px', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--textMuted)' }}>{t('rne.noPublished')}</div>
                  ) : (
                    <div style={{ maxHeight: 240, overflowY: 'auto', padding: 6 }}>
                      {existingNotes.map(note => (
                        <button
                          key={note.id}
                          disabled={copyLoading}
                          onClick={() => handleCopyFromNote(note)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', background: 'transparent', border: 'none', borderRadius: 7, cursor: copyLoading ? 'not-allowed' : 'pointer', textAlign: 'left', transition: 'background 0.1s', opacity: copyLoading ? 0.6 : 1 }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--surfaceAlt)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span style={{ flex: 1, fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.title || t('rne.noTitle')}</span>
                          {note.version && (
                            <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'var(--accent)', background: 'rgba(79,142,247,0.1)', border: '1px solid rgba(79,142,247,0.25)', borderRadius: 4, padding: '1px 6px', flexShrink: 0 }}>{note.version}</span>
                          )}
                          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'var(--textMuted)', flexShrink: 0 }}>{new Date(note.created_at).toLocaleDateString('sr-Latn-RS')}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Task list */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: 'var(--text)', marginRight: 4 }}>
              Izaberi taskove
              {tasks.length > 0 && (
                <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--textMuted)', fontWeight: 400, marginLeft: 8 }}>
                  {selectedIds.size}/{tasks.length}
                </span>
              )}
            </span>
            {tasks.length > 0 && (
              <>
                <button onClick={() => setSelectedIds(new Set(tasks.map(t => t.id)))} style={pillBtnStyle}>Izaberi sve</button>
                <button onClick={() => setSelectedIds(new Set())} style={pillBtnStyle}>Poništi sve</button>
                <button onClick={() => setSelectedIds(new Set(tasks.filter(t => statusCat(t) === 'resolved').map(t => t.id)))} style={pillBtnStyle}>Samo Resolved</button>
              </>
            )}
            <button onClick={goToStep2} disabled={selectedIds.size === 0}
              style={{ marginLeft: 'auto', padding: '7px 20px', borderRadius: 8, fontSize: 13, fontFamily: 'DM Sans', fontWeight: 600, border: 'none', transition: 'all 0.2s ease', cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer', background: selectedIds.size === 0 ? 'var(--surfaceAlt)' : 'var(--accent)', color: selectedIds.size === 0 ? 'var(--textMuted)' : '#fff', whiteSpace: 'nowrap' }}>
              Nastavi → {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
            </button>
          </div>

          <input placeholder="Pretraži po imenu ili ključu..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontFamily: 'DM Sans', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }} />

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { key: 'all', label: `Svi (${countByStatus.all})` },
              { key: 'resolved', label: `Resolved (${countByStatus.resolved})` },
              { key: 'inprog', label: `In Progress (${countByStatus.inprog})` },
              { key: 'testing', label: `For Testing (${countByStatus.testing})` },
            ].map(f => (
              <button key={f.key} onClick={() => setStatusFilter(f.key)} style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 11, fontFamily: 'DM Mono', cursor: 'pointer', transition: 'all 0.2s ease',
                border: statusFilter === f.key ? '1px solid var(--accent)' : '1px solid var(--border)',
                color: statusFilter === f.key ? 'var(--accent)' : 'var(--textMuted)', background: 'transparent',
              }}>{f.label}</button>
            ))}
          </div>
        </div>

        {/* Rows */}
        <div>
          {loadingTasks ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--textMuted)', fontFamily: 'DM Sans', fontSize: 14 }}>{t('rne.loading')}</div>
          ) : taskError ? (
            <div style={{ padding: 24, margin: 16, borderRadius: 8, background: 'var(--redTint)', border: '1px solid var(--red)', color: 'var(--red)', fontFamily: 'DM Sans', fontSize: 13 }}>
              <strong>Greška:</strong> {taskError}
            </div>
          ) : !selectedProject ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--textMuted)', fontFamily: 'DM Sans', fontSize: 14 }}>{t('rne.noTasksEmpty')}</div>
          ) : filteredTasks.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--textMuted)', fontFamily: 'DM Sans', fontSize: 14 }}>{t('rne.noTasksEmpty')}</div>
          ) : filteredTasks.map(task => (
            <Step1Row key={task.id} task={task} selected={selectedIds.has(task.id)} onToggle={() => toggleSelected(task.id)} />
          ))}
        </div>
      </div>
    </div>
  )

  // ── Step 2 ─────────────────────────────────────────────────────────────────

  const selectedTasks = tasks.filter(t => selectedIds.has(t.id))

  const renderStep2 = () => (
    <div style={{ paddingBottom: 80 }}>
      {selectedTasks.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--textMuted)', fontFamily: 'DM Sans' }}>
          {t('rne.noTasksEmpty')}{' '}
          <button onClick={() => setWizardStep(1)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 14 }}>{t('rn.back')}</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {selectedTasks.map(task => {
            const edit = taskEdits[task.id] || {}
            const isExpanded = expandedId === task.id
            const isAiLoading = aiLoadingIds.has(task.id)
            const isAiCooldown = aiCooldownIds.has(task.id)
            const detail = taskJiraDetails[task.id]
            const cat = statusCat(task)
            const badgeStyle = { ...statusBadgeStyle(cat), fontSize: 10, fontFamily: 'DM Mono', padding: '2px 7px', borderRadius: 4, flexShrink: 0 }
            const helpLinks = getHelpLinks(task)

            return (
              <div key={task.id} style={{
                background: 'var(--surface)',
                border: `1px solid ${isExpanded ? 'var(--borderHover)' : 'var(--border)'}`,
                borderLeft: `3px solid ${isExpanded ? 'var(--accent)' : 'transparent'}`,
                borderRadius: 10, overflow: 'hidden', transition: 'all 0.2s ease',
              }}>
                {/* Card header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}
                  onClick={() => handleExpandTask(task.id)}>
                  <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--accent)', flexShrink: 0, minWidth: 70 }}>{task.key}</span>
                  <input
                    value={edit.name || ''}
                    onChange={e => { e.stopPropagation(); updateEdit(task.id, 'name', e.target.value) }}
                    onClick={e => e.stopPropagation()}
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500, minWidth: 0 }}
                    placeholder={t('rne.taskNamePlaceholder')}
                  />
                  <span style={badgeStyle}>{statusLabel(task)}</span>
                  {helpLinks.length > 0 && (
                    <span style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--amber)', flexShrink: 0 }} title={helpLinks.map(h => h.key).join(', ')}>
                      <IconLink /> {helpLinks.length}
                    </span>
                  )}
                  <button onClick={e => { e.stopPropagation(); !isAiLoading && !isAiCooldown && !bulkProgress && generateTaskDesc(task.id) }}
                    disabled={isAiLoading || isAiCooldown || !!bulkProgress}
                    title={!hasAiKey ? t('rne.noApiKeyShort') : t('rne.generateAI')}
                    style={{ ...iconBtnStyle, color: isAiLoading ? 'var(--textMuted)' : 'var(--accent)', opacity: (!hasAiKey || isAiCooldown || !!bulkProgress) ? 0.4 : 1 }}>
                    {isAiLoading ? <span style={{ fontSize: 10, opacity: 0.7 }}>···</span> : <IconSparkle />}
                  </button>
                  <button onClick={e => { e.stopPropagation(); !isAiLoading && !isAiCooldown && !bulkProgress && translateTask(task.id) }}
                    disabled={isAiLoading || isAiCooldown || !!bulkProgress}
                    title={!hasAiKey ? t('rne.noApiKeyShort') : t('rne.translate')}
                    style={{ ...iconBtnStyle, opacity: (!hasAiKey || isAiCooldown || !!bulkProgress) ? 0.4 : 1 }}>
                    <IconGlobe />
                  </button>
                  <button onClick={e => { e.stopPropagation(); removeFromSelection(task.id) }}
                    title={t('rne.removeTask')}
                    style={{ ...iconBtnStyle, color: 'var(--textMuted)' }}>
                    ×
                  </button>
                  <span style={{ color: 'var(--textMuted)', fontSize: 13, flexShrink: 0, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block' }}>▾</span>
                </div>

                {/* Expanded body */}
                {isExpanded && (
                  <div style={{ padding: '14px 14px 14px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Detail loading indicator */}
                    {detail?.loading && (
                      <div style={{ fontSize: 12, fontFamily: 'DM Mono', color: 'var(--textMuted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', opacity: 0.5 }}>○</span> {t('rne.loadingJira')}
                      </div>
                    )}

                    {/* A: Name */}
                    <div>
                      <label style={labelStyle}>Naziv</label>
                      <input value={edit.name || ''} onChange={e => updateEdit(task.id, 'name', e.target.value)}
                        style={inputStyle} />
                    </div>

                    {/* B: Description */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <label style={{ ...labelStyle, margin: 0 }}>Opis</label>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => !isAiLoading && !isAiCooldown && !bulkProgress && generateTaskDesc(task.id)}
                            disabled={isAiLoading || isAiCooldown || !!bulkProgress}
                            style={{ ...smallBtnStyle, opacity: (isAiCooldown || !!bulkProgress) ? 0.4 : 1 }}>
                            {isAiLoading ? t('rne.generating') : <><IconSparkle /> {t('rne.generateAI')}</>}
                          </button>
                          <button
                            onClick={() => !isAiLoading && !isAiCooldown && !bulkProgress && translateTask(task.id)}
                            disabled={isAiLoading || isAiCooldown || !!bulkProgress}
                            style={{ ...smallBtnStyle, opacity: (isAiCooldown || !!bulkProgress) ? 0.4 : 1 }}>
                            <><IconGlobe /> {t('rne.translate')}</>

                          </button>
                        </div>
                      </div>
                      <RichBodyEditor
                        value={migrateBodyHtml(edit)}
                        onChange={html => updateBody(task.id, html)}
                        placeholder={detail?.loading ? t('rne.loadingJira') : t('rne.taskNamePlaceholder')}
                        onError={showToast}
                      />

                      {/* AI preview */}
                      {aiPreviews[task.id] && (
                        <div style={{ marginTop: 10, background: 'rgba(79,142,247,0.06)', border: '1px solid rgba(79,142,247,0.25)', borderRadius: 8, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid rgba(79,142,247,0.15)' }}>
                            <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 5 }}><IconSparkle /> AI</span>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => {
                                  applyAiText(task.id, aiPreviews[task.id])
                                  setAiPreviews(prev => { const n = { ...prev }; delete n[task.id]; return n })
                                }}
                                style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, fontFamily: 'DM Sans', fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                                {t('rne.apply')}
                              </button>
                              <button
                                onClick={() => setAiPreviews(prev => { const n = { ...prev }; delete n[task.id]; return n })}
                                style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, fontFamily: 'DM Sans', background: 'transparent', border: '1px solid rgba(79,142,247,0.3)', color: 'var(--textMuted)', cursor: 'pointer' }}>
                                {t('rne.delete')}
                              </button>
                            </div>
                          </div>
                          <div style={{ padding: '10px 12px', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                            {aiPreviews[task.id]}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Slike se sada ubacuju direktno u telo (rich editor gore) */}

                    {/* HELP links — auto from Jira */}
                    {helpLinks.length > 0 && (
                      <div>
                        <label style={labelStyle}>Help desk linkovi (automatski iz Jira)</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {helpLinks.map(link => (
                            <div key={link.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6 }}>
                              <span style={{ fontFamily: 'DM Mono', fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.3)', flexShrink: 0 }}>{link.key}</span>
                              {link.summary && <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--textMuted)', flex: 1 }}>{link.summary}</span>}
                              {link.status && <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'var(--textMuted)' }}>{link.status}</span>}
                              {buildHelpUrl(link.key, user?.jiraUrl) && (
                                <a href={buildHelpUrl(link.key, user?.jiraUrl)} target="_blank" rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--accent)', textDecoration: 'none', flexShrink: 0 }}>↗</a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Fixed bottom bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '12px 28px' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setWizardStep(1)} style={{ ...smallBtnStyle }}>{t('rn.back')}</button>
          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
          <button
            onClick={generateAllDescriptions}
            disabled={!!bulkProgress}
            title={!hasAiKey ? t('rne.noApiKey') : ''}
            style={{ ...smallBtnStyle, opacity: !hasAiKey ? 0.5 : bulkProgress ? 0.6 : 1 }}>
            {bulkProgress?.action === 'generate' ? `${t('rne.generating')} ${bulkProgress.current}/${bulkProgress.total}` : <><IconSparkle /> {t('rne.generateAI')}</>}
          </button>
          <button
            onClick={translateAll}
            disabled={!!bulkProgress}
            title={!hasAiKey ? t('rne.noApiKey') : ''}
            style={{ ...smallBtnStyle, opacity: !hasAiKey ? 0.5 : bulkProgress ? 0.6 : 1 }}>
            {bulkProgress?.action === 'translate' ? `${t('rne.translating')} ${bulkProgress.current}/${bulkProgress.total}` : <><IconGlobe /> {t('rne.translate')}</>}
          </button>
          <button onClick={goToStep3} style={{ marginLeft: 'auto', padding: '9px 24px', borderRadius: 8, fontSize: 14, fontFamily: 'DM Sans', fontWeight: 600, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', transition: 'all 0.2s ease' }}>
            Preview →
          </button>
        </div>
      </div>
    </div>
  )

  // ── Step 3 ─────────────────────────────────────────────────────────────────

  function buildGroups(taskList) {
    const groups = {}
    for (const task of taskList) {
      const prefix = sectionOverrides[task.id] || (task.key || '').split('-')[0].toUpperCase()
      if (!groups[prefix]) groups[prefix] = []
      groups[prefix].push(task)
    }
    // Apply explicit ordering within each section
    for (const prefix of Object.keys(groups)) {
      const order = sectionTaskOrders[prefix]
      if (order?.length) {
        groups[prefix].sort((a, b) => {
          const ia = order.indexOf(a.id)
          const ib = order.indexOf(b.id)
          if (ia === -1 && ib === -1) return 0
          if (ia === -1) return 1
          if (ib === -1) return -1
          return ia - ib
        })
      }
    }
    const groupOrder = [
      ...PREFIX_ORDER.filter(p => groups[p]?.length),
      ...Object.keys(groups).filter(p => !PREFIX_ORDER.includes(p) && groups[p]?.length),
    ]
    return { groups, groupOrder }
  }

  function applyDrop(toPrefix, beforeTaskId) {
    const fromTaskId = dragTaskId.current
    if (!fromTaskId) return
    const fromPrefix = dragFromPrefix.current
    dragTaskId.current = null
    dragFromPrefix.current = null
    setDragOverPrefix(null)
    setDragOverTaskId(null)

    // Move to new section if needed
    if (fromPrefix !== toPrefix) {
      setSectionOverrides(prev => ({ ...prev, [fromTaskId]: toPrefix }))
    }

    // Reorder: build new order for both affected sections using current groups snapshot
    setSectionTaskOrders(prev => {
      const selTasks = tasks.filter(t => selectedIds.has(t.id))
      // Compute which section each task belongs to (applying pending cross-section move)
      const snap = {}
      for (const task of selTasks) {
        const p = (fromPrefix !== toPrefix && task.id === fromTaskId)
          ? toPrefix
          : (sectionOverrides[task.id] || (task.key || '').split('-')[0].toUpperCase())
        if (!snap[p]) snap[p] = []
        snap[p].push(task.id)
      }
      // Apply existing explicit orders
      for (const p of Object.keys(snap)) {
        const order = prev[p]
        if (order?.length) snap[p].sort((a, b) => { const ia = order.indexOf(a); const ib = order.indexOf(b); if (ia === -1 && ib === -1) return 0; if (ia === -1) return 1; if (ib === -1) return -1; return ia - ib })
      }

      const toList = snap[toPrefix] ? [...snap[toPrefix]] : []
      // Remove dragged task from list (it may already be there or not)
      const filtered = toList.filter(id => id !== fromTaskId)
      if (beforeTaskId) {
        const idx = filtered.indexOf(beforeTaskId)
        if (idx !== -1) filtered.splice(idx, 0, fromTaskId)
        else filtered.push(fromTaskId)
      } else {
        filtered.push(fromTaskId)
      }

      const result = { ...prev, [toPrefix]: filtered }
      if (fromPrefix !== toPrefix) {
        const fromList = (snap[fromPrefix] || []).filter(id => id !== fromTaskId)
        result[fromPrefix] = fromList
      }
      return result
    })
  }

  function getSectionLabel(prefix) {
    return sectionLabels[prefix] || GROUP_CONFIG[prefix]?.label || prefix
  }

  const renderStep3 = () => {
    const selTasks = tasks.filter(t => selectedIds.has(t.id))
    const { groups, groupOrder } = buildGroups(selTasks)

    return (
      <div>
        <style>{`
          @page { margin: 16mm 18mm 20mm 18mm; }
          @media print {
            html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            * { font-family: 'Trebuchet MS', 'Century Gothic', Arial, sans-serif !important; }
            body { background: #fff !important; }
            [data-no-print] { display: none !important; }
            /* Hide topbar (sticky header) and stepper wrapper */
            body > div > div:first-child { display: none !important; }
            body > div > div:nth-child(2) > div:first-child { display: none !important; }
            .preview-wrap { padding: 20px 0 40px !important; border: none !important; background: #fff !important; }
          }
        `}</style>

        {/* Action bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setWizardStep(1)} style={{ ...smallBtnStyle }}>{t('rn.back')}</button>
          <button onClick={generateAllDescriptions} disabled={!!bulkProgress || !hasAiKey} style={{ ...smallBtnStyle, opacity: (!!bulkProgress || !hasAiKey) ? 0.5 : 1 }}>
            {bulkProgress?.action === 'generate' ? `Generišem ${bulkProgress.current}/${bulkProgress.total}…` : <><IconSparkle /> Generiši sve</>}
          </button>
          <button onClick={translateAll} disabled={!!bulkProgress || !hasAiKey} style={{ ...smallBtnStyle, opacity: (!!bulkProgress || !hasAiKey) ? 0.5 : 1 }}>
            {bulkProgress?.action === 'translate' ? `Prevodim ${bulkProgress.current}/${bulkProgress.total}…` : <><IconGlobe /> Prevedi sve</>}
          </button>
          <button onClick={goToStep3} style={{ marginLeft: 'auto', padding: '9px 24px', borderRadius: 8, fontSize: 14, fontFamily: 'DM Sans', fontWeight: 600, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff' }}>
            Dalje: Pregled →
          </button>
        </div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--textMuted)', marginBottom: 16 }}>
          Po kartici: dugme za AI opis i prevod, pa stilizuj tekst i ubaci slike · prevuci <span style={{ letterSpacing: 2 }}>⠿</span> da preurediš redosled ili premestiš u drugu sekciju · klikni naziv sekcije da je preimenuješ.
        </div>

        {/* Document */}
        <div className="preview-wrap" style={{ maxWidth: 860, margin: '0 auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '40px 48px' }}>
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'var(--textMuted)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 8 }}>INTELISALE</div>
            <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 36, color: 'var(--text)', lineHeight: 1.1, marginBottom: 6 }}>Release Notes</div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--textMuted)', marginBottom: 2 }}>{previewDate}</div>
            {config.clientName && <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--textMuted)' }}>{config.clientName}{config.version ? ` · ${config.version}` : ''}</div>}
            <div style={{ height: 2, marginTop: 20, background: 'linear-gradient(90deg, var(--accent) 0%, transparent 70%)', borderRadius: 2, opacity: 0.35 }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
            {groupOrder.map(prefix => {
              const baseCfg = GROUP_CONFIG[prefix] || { label: prefix, icon: '📋', color: '#8B99B5' }
              const cfg = { ...baseCfg, label: getSectionLabel(prefix) }
              const keyC = KEY_COLORS[prefix] || KEY_COLORS.OTHER
              const isDropTarget = dragOverPrefix === prefix
              return (
                <div
                  key={prefix}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverPrefix !== prefix) setDragOverPrefix(prefix) }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) { setDragOverPrefix(null); setDragOverTaskId(null) } }}
                  onDrop={e => { e.preventDefault(); applyDrop(prefix, null) }}
                  style={{ borderRadius: 10, outline: isDropTarget ? `2px dashed ${cfg.color}50` : '2px dashed transparent', transition: 'outline 0.12s', padding: 4 }}
                >
                  {/* Section header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 10, borderBottom: `2px solid ${cfg.color}28`, padding: '6px 8px 10px' }}>
                    {editingSection === prefix ? (
                      <input
                        autoFocus
                        value={editingSectionValue}
                        onChange={e => setEditingSectionValue(e.target.value)}
                        onBlur={() => {
                          if (editingSectionValue.trim()) setSectionLabels(prev => ({ ...prev, [prefix]: editingSectionValue.trim() }))
                          setEditingSection(null)
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') e.currentTarget.blur()
                          if (e.key === 'Escape') setEditingSection(null)
                        }}
                        style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18, color: cfg.color, background: 'transparent', border: 'none', borderBottom: `2px solid ${cfg.color}`, outline: 'none', padding: '0 2px', minWidth: 80, flex: 1 }}
                      />
                    ) : (
                      <span
                        onClick={() => { setEditingSection(prefix); setEditingSectionValue(getSectionLabel(prefix)) }}
                        title="Klikni da preimenješ sekciju"
                        style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18, color: cfg.color, cursor: 'pointer', borderBottom: '2px dashed transparent', transition: 'border-color 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.borderBottomColor = `${cfg.color}60`}
                        onMouseLeave={e => e.currentTarget.style.borderBottomColor = 'transparent'}
                      >{cfg.label}</span>
                    )}
                    <span style={{ fontFamily: 'DM Mono', fontSize: 11, padding: '2px 9px', borderRadius: 20, background: `${cfg.color}18`, color: cfg.color, border: `1px solid ${cfg.color}33` }}>{groups[prefix].length}</span>
                    {isDropTarget && dragFromPrefix.current !== prefix && (
                      <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: cfg.color, marginLeft: 'auto', opacity: 0.8 }}>⟵ Pusti ovde</span>
                    )}
                  </div>

                  {/* Task cards */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {groups[prefix].map(task => {
                      const edit = taskEdits[task.id] || {}
                      const helpLinks = getHelpLinks(task)
                      const isInsertTarget = dragOverTaskId === task.id
                      return (
                        <div key={task.id}>
                          {/* Drop indicator line */}
                          {isInsertTarget && (
                            <div style={{ height: 3, borderRadius: 2, background: cfg.color, margin: '2px 0', opacity: 0.7 }} />
                          )}
                          <div
                            onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; if (dragOverTaskId !== task.id) setDragOverTaskId(task.id); if (dragOverPrefix !== prefix) setDragOverPrefix(prefix) }}
                            onDrop={e => { e.preventDefault(); e.stopPropagation(); applyDrop(prefix, task.id) }}
                            style={{ background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                              <span
                                draggable={true}
                                onDragStart={e => { dragTaskId.current = task.id; dragFromPrefix.current = prefix; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', task.id) }}
                                onDragEnd={() => { setDragOverPrefix(null); setDragOverTaskId(null) }}
                                title="Prevuci da preurediš ili premestiš"
                                style={{ color: 'var(--textSubtle)', fontSize: 16, flexShrink: 0, userSelect: 'none', letterSpacing: 2, cursor: 'grab' }}>⠿</span>
                              <span style={{ fontFamily: 'DM Mono', fontSize: 11, padding: '3px 9px', borderRadius: 6, background: keyC.bg, color: keyC.color, border: `1px solid ${keyC.border}`, flexShrink: 0 }}>{task.key}</span>
                              <input value={edit.name || ''} onChange={e => updateEdit(task.id, 'name', e.target.value)} placeholder={t('rne.taskNamePlaceholder')}
                                style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontFamily: 'DM Sans', fontSize: 14, fontWeight: 600 }} />
                              <button onClick={() => !aiLoadingIds.has(task.id) && !aiCooldownIds.has(task.id) && !bulkProgress && generateTaskDesc(task.id, { applyDirectly: true })}
                                disabled={aiLoadingIds.has(task.id) || aiCooldownIds.has(task.id) || !!bulkProgress}
                                title={!hasAiKey ? t('rne.noApiKeyShort') : t('rne.generateAI')}
                                style={{ ...iconBtnStyle, color: 'var(--accent)', opacity: (!hasAiKey || aiCooldownIds.has(task.id) || !!bulkProgress) ? 0.4 : 1 }}>
                                {aiLoadingIds.has(task.id) ? <span style={{ fontSize: 10, opacity: 0.7 }}>···</span> : <IconSparkle />}
                              </button>
                              <button onClick={() => !aiLoadingIds.has(task.id) && !aiCooldownIds.has(task.id) && !bulkProgress && translateTask(task.id)}
                                disabled={aiLoadingIds.has(task.id) || aiCooldownIds.has(task.id) || !!bulkProgress}
                                title={!hasAiKey ? t('rne.noApiKeyShort') : t('rne.translate')}
                                style={{ ...iconBtnStyle, opacity: (!hasAiKey || aiCooldownIds.has(task.id) || !!bulkProgress) ? 0.4 : 1 }}>
                                <IconGlobe />
                              </button>
                              <button onClick={() => removeFromSelection(task.id)} title={t('rne.removeTask')} style={{ ...iconBtnStyle, color: 'var(--textMuted)' }}>×</button>
                            </div>
                            <RichBodyEditor
                              value={migrateBodyHtml(edit)}
                              onChange={html => updateBody(task.id, html)}
                              placeholder="Dodaj opis, stil i slike…"
                              onError={showToast}
                            />
                            {helpLinks.map(link => (
                              <div key={link.key} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8, marginTop: 4, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                                <span style={{ color: 'var(--amber)', display: 'flex', alignItems: 'center' }}><IconLink /></span>
                                <span style={{ fontFamily: 'DM Mono', fontSize: 11, padding: '3px 9px', borderRadius: 6, background: 'rgba(245,158,11,0.15)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.3)', flexShrink: 0 }}>{link.key}</span>
                                {link.summary && <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--textMuted)', flex: 1 }}>{link.summary}</span>}
                                {buildHelpUrl(link.key, user?.jiraUrl) && (
                                  <a href={buildHelpUrl(link.key, user?.jiraUrl)} target="_blank" rel="noopener noreferrer"
                                    style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', padding: '3px 8px', border: '1px solid rgba(79,142,247,0.3)', borderRadius: 6 }}>
                                    ↗ Otvori
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 60, paddingTop: 20, borderTop: '1px solid var(--border)', textAlign: 'center', fontFamily: 'DM Mono', fontSize: 10, color: 'var(--textSubtle)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            INTELISALE · Empowering Sales Excellence · www.intelisale.com
          </div>
        </div>
      </div>
    )
  }

  // ── Step 4: Pregled & Export ─────────────────────────────────────────────────
  const renderStep4 = () => {
    const html = buildPublishHtml()
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button onClick={() => setWizardStep(2)} style={{ ...smallBtnStyle }}>{t('rn.back')}</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={exportPdf} style={smallBtnStyle}>{t('rne.exportPdf')}</button>
            <button onClick={openPublishModal} disabled={publishState?.loading}
              style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontFamily: 'DM Sans', fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', cursor: publishState?.loading ? 'wait' : 'pointer' }}>
              {publishState?.loading ? t('app.loading') : 'Publish'}
            </button>
          </div>
        </div>

        {publishState?.error && (
          <div style={{ padding: '12px 16px', background: 'var(--redTint)', border: '1px solid var(--red)', borderRadius: 8, fontSize: 13, color: 'var(--red)', fontFamily: 'DM Sans', marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
            <span>{publishState.error}</span>
            <button onClick={() => setPublishState(null)} style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer' }}>×</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <input value={previewTitle} onChange={e => setPreviewTitle(e.target.value)}
            placeholder={t('rne.titlePlaceholder')}
            style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontFamily: 'DM Sans', fontSize: 14, boxSizing: 'border-box' }} />
          <input value={previewDate} onChange={e => setPreviewDate(e.target.value)}
            style={{ width: 220, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontFamily: 'DM Mono', fontSize: 13, boxSizing: 'border-box' }} />
        </div>

        <iframe id="rn-preview-frame" title="Pregled release notes" srcDoc={html}
          style={{ width: '100%', height: '78vh', border: '1px solid var(--border)', borderRadius: 12, background: '#fff' }} />
      </div>
    )
  }

  // ── Return ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', position: 'relative' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <BrainAnimation opacity={0.45} fullscreen />
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>
      <Topbar
        user={user} theme={theme} currentPage="releaseNotesEditor"
        onLogout={onLogout} onGoToDashboard={onGoToDashboard} onGoToReleaseNotes={onGoToReleaseNotes}
        onGoToReleaseNotesEditor={onGoToReleaseNotesEditor}
        onGoToDocuments={onGoToDocuments} onGoToQA={onGoToQA} onOpenSettings={onOpenSettings} onOpenUsers={onOpenUsers} onOpenChat={onOpenChat}
      />
      <div style={{ padding: '20px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <Stepper step={wizardStep} maxStep={maxStep} onStepClick={goToStep} />
        </div>
        {wizardStep === 1 && renderStep1()}
        {wizardStep === 2 && renderStep3()}
        {wizardStep === 3 && renderStep4()}
      </div>
      {toast && <Toast message={toast.message} onClose={() => setToast(null)} />}
      {publishModal && (
        <PublishModal
          clientUsers={publishModal.clientUsers}
          sections={publishModal.sections}
          publishState={publishState}
          onClose={() => { setPublishModal(null); setPublishState(null) }}
          onPublish={async (clientIds, sectionName) => { setPublishModal(null); await handlePublish(clientIds, sectionName) }}
        />
      )}
      </div>
    </div>
  )
}

// ── Shared style objects ───────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontFamily: 'DM Sans', fontSize: 14, boxSizing: 'border-box',
}

const pillBtnStyle = {
  background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
  color: 'var(--textMuted)', fontSize: 11, fontFamily: 'DM Mono', cursor: 'pointer', padding: '4px 10px',
  transition: 'all 0.2s ease', whiteSpace: 'nowrap',
}

const iconBtnStyle = {
  background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14,
  padding: '2px 4px', display: 'flex', alignItems: 'center', flexShrink: 0, transition: 'opacity 0.2s',
}

const smallBtnStyle = {
  background: 'transparent', border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text)', fontSize: 12, fontFamily: 'DM Sans', cursor: 'pointer', padding: '6px 14px',
  transition: 'all 0.2s ease', whiteSpace: 'nowrap',
}

const labelStyle = {
  fontSize: 11, fontFamily: 'DM Mono', color: 'var(--textMuted)', textTransform: 'uppercase',
  display: 'block', marginBottom: 6, letterSpacing: '0.05em',
}

// ── Step1Row ───────────────────────────────────────────────────────────────────

function Step1Row({ task, selected, onToggle }) {
  const [hovered, setHovered] = useState(false)
  const cat = statusCat(task)
  const badgeStyle = statusBadgeStyle(cat)

  return (
    <div
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 20px',
        cursor: 'pointer', transition: 'background 0.15s',
        background: selected ? 'rgba(79,142,247,0.06)' : hovered ? 'var(--surfaceAlt)' : 'transparent',
        borderLeft: `3px solid ${selected ? 'var(--accent)' : 'transparent'}`,
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
        border: selected ? 'none' : '2px solid var(--border)',
        background: selected ? 'var(--accent)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease',
      }}>
        {selected && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
      </div>
      <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--accent)', flexShrink: 0, minWidth: 80 }}>{task.key}</span>
      <span style={{ ...badgeStyle, fontSize: 10, fontFamily: 'DM Mono', padding: '2px 7px', borderRadius: 4, flexShrink: 0 }}>
        {statusLabel(task)}
      </span>
      <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {task.fields?.summary || task.summary || ''}
      </span>
    </div>
  )
}

// ── Stepper ────────────────────────────────────────────────────────────────────

function Stepper({ step, maxStep, onStepClick }) {
  const steps = [
    { n: 1, label: 'Selekcija' },
    { n: 2, label: 'Sadržaj i stil' },
    { n: 3, label: 'Pregled' },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 20px' }}>
      {steps.map((s, i) => {
        const isActive = s.n === step
        const isDone = s.n < step
        const isClickable = s.n <= maxStep
        return (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center' }}>
            <div
              onClick={() => isClickable && onStepClick(s.n)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: isClickable ? 'pointer' : 'default', padding: '4px 10px', borderRadius: 6, background: isActive ? 'rgba(79,142,247,0.1)' : 'transparent', transition: 'all 0.2s ease' }}
            >
              <div style={{
                width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontFamily: 'DM Mono', fontWeight: 500, flexShrink: 0,
                background: isDone ? 'var(--green)' : isActive ? 'var(--accent)' : 'var(--surfaceAlt)',
                color: isDone || isActive ? '#fff' : 'var(--textMuted)',
                border: isDone || isActive ? 'none' : '1px solid var(--border)',
              }}>
                {isDone ? '✓' : s.n}
              </div>
              <span style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? 'var(--accent)' : isDone ? 'var(--green)' : 'var(--textMuted)' }}>{s.label}</span>
            </div>
            {i < steps.length - 1 && <span style={{ color: 'var(--border)', margin: '0 4px', fontSize: 16, userSelect: 'none' }}>›</span>}
          </div>
        )
      })}
    </div>
  )
}

// ── Toast ──────────────────────────────────────────────────────────────────────

function Toast({ message, onClose }) {
  return (
    <div style={{
      position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--surface)', border: '1px solid var(--red)', borderRadius: 8, zIndex: 2000,
      padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10,
      fontFamily: 'DM Sans', fontSize: 13, color: 'var(--red)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      whiteSpace: 'nowrap', maxWidth: 'calc(100vw - 40px)',
    }}>
      ⚠️ {message}
      <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 16, padding: 0, marginLeft: 4 }}>×</button>
    </div>
  )
}

// ── PublishModal ───────────────────────────────────────────────────────────────

function PublishModal({ clientUsers, sections = [], onClose, onPublish, publishState }) {
  const t = useT()
  const [selected, setSelected] = useState(new Set())
  const [publishing, setPublishing] = useState(false)
  const [sectionDropOpen, setSectionDropOpen] = useState(false)
  const [selectedSection, setSelectedSection] = useState(null) // null | { id, name } | { id: 'new', name: '' }
  const [newSectionName, setNewSectionName] = useState('')

  function toggle(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function getSectionName() {
    if (!selectedSection) return null
    if (selectedSection.id === 'new') return newSectionName.trim() || null
    return selectedSection.name
  }

  async function handleConfirm() {
    setPublishing(true)
    await onPublish([...selected], getSectionName())
    setPublishing(false)
  }

  const isNew = selectedSection?.id === 'new'
  const sectionLabel = !selectedSection ? 'Bez sekcije' : isNew ? (newSectionName || 'Nova sekcija...') : selectedSection.name

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 480, boxShadow: '0 24px 80px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Release Notes</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--textMuted)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '16px 24px' }}>

          {/* Section picker — dropdown */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--textMuted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Sekcija</div>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setSectionDropOpen(o => !o)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 13, fontWeight: selectedSection ? 500 : 400, transition: 'all 0.15s',
                  background: selectedSection ? 'rgba(79,142,247,0.08)' : 'var(--bg)',
                  border: `1px solid ${selectedSection ? 'rgba(79,142,247,0.35)' : 'var(--border)'}`,
                  color: selectedSection ? 'var(--accent)' : 'var(--textMuted)',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sectionLabel}</span>
                <span style={{ fontSize: 10, flexShrink: 0, transform: sectionDropOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block', color: 'var(--textMuted)' }}>▾</span>
              </button>
              {sectionDropOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', zIndex: 200, overflow: 'hidden' }}>
                  <div style={{ maxHeight: 220, overflowY: 'auto', padding: 6 }}>
                    {/* No section option */}
                    <button
                      onClick={() => { setSelectedSection(null); setSectionDropOpen(false) }}
                      style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '8px 10px', background: !selectedSection ? 'rgba(79,142,247,0.08)' : 'transparent', border: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s', color: !selectedSection ? 'var(--accent)' : 'var(--textMuted)', fontFamily: 'DM Sans', fontSize: 13 }}
                      onMouseEnter={e => { if (selectedSection) e.currentTarget.style.background = 'var(--surfaceAlt)' }}
                      onMouseLeave={e => { if (selectedSection) e.currentTarget.style.background = 'transparent' }}
                    >Bez sekcije</button>
                    {/* Existing sections */}
                    {sections.map(s => (
                      <button key={s.id}
                        onClick={() => { setSelectedSection(s); setSectionDropOpen(false) }}
                        style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '8px 10px', background: selectedSection?.id === s.id ? 'rgba(79,142,247,0.08)' : 'transparent', border: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s', color: selectedSection?.id === s.id ? 'var(--accent)' : 'var(--text)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500 }}
                        onMouseEnter={e => { if (selectedSection?.id !== s.id) e.currentTarget.style.background = 'var(--surfaceAlt)' }}
                        onMouseLeave={e => { if (selectedSection?.id !== s.id) e.currentTarget.style.background = 'transparent' }}
                      >{s.name}</button>
                    ))}
                    {/* Divider + new section */}
                    <div style={{ height: 1, background: 'var(--border)', margin: '4px 6px' }} />
                    <button
                      onClick={() => { setSelectedSection({ id: 'new', name: '' }); setSectionDropOpen(false) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '8px 10px', background: isNew ? 'rgba(79,142,247,0.08)' : 'transparent', border: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s', color: isNew ? 'var(--accent)' : 'var(--textMuted)', fontFamily: 'DM Sans', fontSize: 13 }}
                      onMouseEnter={e => { if (!isNew) e.currentTarget.style.background = 'var(--surfaceAlt)' }}
                      onMouseLeave={e => { if (!isNew) e.currentTarget.style.background = 'transparent' }}
                    >
                      <span style={{ fontWeight: 700, fontSize: 15, lineHeight: 1 }}>+</span> Nova sekcija
                    </button>
                  </div>
                </div>
              )}
            </div>
            {isNew && (
              <input
                autoFocus
                value={newSectionName}
                onChange={e => setNewSectionName(e.target.value)}
                placeholder="Naziv sekcije..."
                style={{ marginTop: 8, width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13, fontFamily: 'DM Sans', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
              />
            )}
          </div>

          <div style={{ fontSize: 13, color: 'var(--textMuted)', fontFamily: 'DM Sans', marginBottom: 16, lineHeight: 1.6 }}>
            {t('rn.assignClients')}
          </div>
          {clientUsers.length === 0 ? (
            <div style={{ color: 'var(--textMuted)', fontFamily: 'DM Sans', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>{t('rn.noClientUsers')}</div>
          ) : (
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {clientUsers.map(u => (
                <div key={u.id} onClick={() => toggle(u.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <div style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0, border: selected.has(u.id) ? 'none' : '2px solid var(--border)', background: selected.has(u.id) ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease' }}>
                    {selected.has(u.id) && <span style={{ color: '#fff', fontSize: 12 }}>✓</span>}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{u.name}</div>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--textMuted)' }}>{u.email}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {publishState?.error && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--redTint)', border: '1px solid var(--red)', borderRadius: 8, fontSize: 13, color: 'var(--red)', fontFamily: 'DM Sans' }}>
              {publishState.error}
            </div>
          )}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontFamily: 'DM Sans', background: 'transparent', border: '1px solid var(--border)', color: 'var(--textMuted)', cursor: 'pointer' }}>
            {t('rn.cancel')}
          </button>
          <button onClick={handleConfirm} disabled={publishing || publishState?.loading} style={{ padding: '8px 24px', borderRadius: 8, fontSize: 13, fontFamily: 'DM Sans', fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', cursor: publishing ? 'wait' : 'pointer' }}>
            {publishing || publishState?.loading ? t('app.loading') : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  )
}
