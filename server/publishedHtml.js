// Post-processing for stored published release-notes HTML. Notes are
// snapshots, so fixes/features added to the generator after publishing are
// retrofitted here, on the way out.
//
// Bezbednosni model (K2): sadržaj se sanitizuje pri upisu (server/sanitize.js),
// a pri serviranju se SVI inline skriptovi i on* handleri uklanjaju i zamenjuju
// jednim poznatim bootstrap skriptom (event delegacija po klasama). CSP dozvoljava
// isključivo taj skript preko SHA-256 hash-a — ubačen <script> ili onclick se
// ne izvršava čak i ako nekako preživi upis.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LEGACY_TASK_LINK_RE = /<a class="task-summary task-link"[^>]*>([\s\S]*?)<\/a>/g

// Logoi kao data URI za retrofit starih note-ova: sačuvani HTML referencira
// slike URL-om ka aplikaciji, a helmet-ov Cross-Origin-Resource-Policy header
// blokira te slike u preuzetom fajlu (file:// je drugi origin). Novi note-ovi
// ih već nose ugrađene (generator na klijentu, ?inline), pa se regexi ispod
// na njih ne poklapaju.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
function loadLogoDataUri(name) {
  for (const dir of ['../client/public', '../client/dist']) {
    try {
      const buf = fs.readFileSync(path.join(__dirname, dir, name))
      return `data:image/png;base64,${buf.toString('base64')}`
    } catch { /* probaj sledeću lokaciju */ }
  }
  return null // fajl nedostaje — ostavi postojeći URL, ne ruši serviranje
}
const LOGO_WHITE_URI = loadLogoDataUri('logo-white.png')
const LOGO_DARK_URI = loadLogoDataUri('logo-dark.png')
const FAVICON_URI = loadLogoDataUri('favicon.png')

const LEGACY_LOGO_WHITE_RE = /(<img[^>]*\bsrc=")[^"]*\/logo-white\.png(")/g
const LEGACY_LOGO_DARK_RE = /(<img[^>]*\bsrc=")[^"]*\/logo-dark\.png(")/g
const LEGACY_FAVICON_RE = /(<img[^>]*\bsrc=")[^"]*\/favicon\.png(")/g

// Jedini skript koji javna strana sme da izvrši. Sadrži toggle + export logiku
// (istu koju je generator ranije ugrađivao inline) i delegira klikove po
// klasama, pa radi i za stare note-ove kojima su onclick atributi skinuti.
// PAŽNJA: svaka izmena teksta menja SHA-256 hash — PUBLISHED_CSP se računa iz njega.
const BOOTSTRAP_JS = `(function(){
function toggle(id){var card=document.getElementById(id),desc=document.getElementById(id+'-d'),btn=card?card.querySelector('.expand-btn'):null;if(!desc)return;var open=desc.classList.contains('open');desc.classList.toggle('open',!open);if(btn)btn.classList.toggle('open',!open);if(card)card.classList.toggle('open',!open)}
function exportHtml(){var descs=document.querySelectorAll('.task-desc'),btns=document.querySelectorAll('.expand-btn');var dPrev=[],bPrev=[];descs.forEach(function(d,i){dPrev[i]=d.classList.contains('open');d.classList.add('open')});btns.forEach(function(b,i){bPrev[i]=b.classList.contains('open');b.classList.add('open')});var html='<!DOCTYPE html>\\n'+document.documentElement.outerHTML;html=html.replace('</head>','<style>.task-desc.open{max-height:none !important}</style></head>');descs.forEach(function(d,i){if(!dPrev[i])d.classList.remove('open')});btns.forEach(function(b,i){if(!bPrev[i])b.classList.remove('open')});var blob=new Blob([html],{type:'text/html'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(document.title||'release-notes').replace(/[\\\\/:*?"<>|]/g,'-')+'.html';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href)},60000)}
document.addEventListener('click',function(e){var t=e.target,b=t&&t.closest?t.closest('button'):null;if(!b)return;if(b.classList.contains('expand-btn')){var card=b.closest('.task-card');if(card&&card.id)toggle(card.id)}else if(b.classList.contains('pbtn--html')){exportHtml()}else if(b.classList.contains('pbtn--pdf')){window.print()}})
})()`

const BOOTSTRAP_HASH = crypto.createHash('sha256').update(BOOTSTRAP_JS, 'utf8').digest('base64')

// CSP za javne /rn strane: bez ijednog spoljnog resursa osim Google Fonts,
// bez skripti osim bootstrap-a, bez frame-ovanja i formi.
export const PUBLISHED_CSP = [
  "default-src 'none'",
  `script-src 'sha256-${BOOTSTRAP_HASH}'`,
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' https: data:",
  "font-src https:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

export function setPublishedSecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', PUBLISHED_CSP)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
}

const INJECT_STYLE = '<style>.pbtn--html{background:#EA580C}.pbtn--pdf{background:#7C3AED}.rn-export-float{position:fixed;top:10px;right:16px;z-index:1000;display:flex;gap:8px}@media print{.rn-export-float{display:none !important}}</style>'

const TWO_BUTTONS = '<button class="pbtn pbtn--html">⤓ Export HTML</button><button class="pbtn pbtn--pdf">↓ Export PDF</button>'
// Stari note-ovi nose dugmad sa onclick atributima — prepoznaj obe varijante.
const LEGACY_PDF_BUTTON_RE = /<button class="pbtn"(?: onclick="window\.print\(\)")?>↓ Export PDF<\/button>/

export function preparePublishedHtml(html) {
  // 1. Clients must never get Jira task links (legacy notes carried them).
  let out = html.replace(LEGACY_TASK_LINK_RE, '<span class="task-summary">$1</span>')

  // 2. Ukloni SVE sačuvane inline skriptove i on* handlere — funkcionalnost
  //    preuzima bootstrap ispod. (Bez ovoga bi u preuzetom HTML fajlu, gde CSP
  //    ne važi, stari onclick + delegacija okinuli toggle dvaput.)
  out = out.replace(/<script\b[\s\S]*?<\/script>/gi, '')
  out = out.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
  out = out.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')

  // 3. Retrofit Export HTML/PDF into notes published before the buttons existed.
  if (!out.includes('pbtn--html')) {
    out = out.replace('</head>', INJECT_STYLE + '</head>')
    if (LEGACY_PDF_BUTTON_RE.test(out)) {
      // Old toolbar with a single PDF button → swap in both buttons
      out = out.replace(LEGACY_PDF_BUTTON_RE, `<div style="display:flex;gap:8px">${TWO_BUTTONS}</div>`)
    } else {
      // No recognizable toolbar → float the buttons top-right (hidden in print)
      out = out.replace('<body>', `<body><div class="rn-export-float">${TWO_BUTTONS}</div>`)
    }
  }

  // 4. Retrofit logoa u note-ove objavljene dok je generator koristio URL-ove:
  //    ugradi slike kao data URI da i preuzeti HTML fajl radi bez mreže.
  if (LOGO_WHITE_URI) out = out.replace(LEGACY_LOGO_WHITE_RE, `$1${LOGO_WHITE_URI}$2`)
  if (LOGO_DARK_URI) out = out.replace(LEGACY_LOGO_DARK_RE, `$1${LOGO_DARK_URI}$2`)
  if (FAVICON_URI) out = out.replace(LEGACY_FAVICON_RE, `$1${FAVICON_URI}$2`)

  // 5. Jedini dozvoljeni skript (CSP hash) ide na kraj body-ja.
  out = out.includes('</body>')
    ? out.replace('</body>', `<script>${BOOTSTRAP_JS}</script></body>`)
    : out + `<script>${BOOTSTRAP_JS}</script>`
  return out
}
