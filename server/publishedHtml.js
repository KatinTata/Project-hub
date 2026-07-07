// Post-processing for stored published release-notes HTML. Notes are
// snapshots, so fixes/features added to the generator after publishing are
// retrofitted here, on the way out.

const LEGACY_TASK_LINK_RE = /<a class="task-summary task-link"[^>]*>([\s\S]*?)<\/a>/g

// Same download logic as the generator's exportHtml (expanded copy, named by title).
const EXPORT_SCRIPT = `<script>
function exportHtml(){var descs=document.querySelectorAll('.task-desc'),btns=document.querySelectorAll('.expand-btn');var dPrev=[],bPrev=[];descs.forEach(function(d,i){dPrev[i]=d.classList.contains('open');d.classList.add('open')});btns.forEach(function(b,i){bPrev[i]=b.classList.contains('open');b.classList.add('open')});var html='<!DOCTYPE html>\\n'+document.documentElement.outerHTML;html=html.replace('</head>','<style>.task-desc.open{max-height:none !important}</style></head>');descs.forEach(function(d,i){if(!dPrev[i])d.classList.remove('open')});btns.forEach(function(b,i){if(!bPrev[i])b.classList.remove('open')});var blob=new Blob([html],{type:'text/html'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(document.title||'release-notes').replace(/[\\\\/:*?"<>|]/g,'-')+'.html';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href)},60000)}
</script>`

const INJECT_STYLE = '<style>.pbtn--html{background:#EA580C}.pbtn--pdf{background:#7C3AED}.rn-export-float{position:fixed;top:10px;right:16px;z-index:1000;display:flex;gap:8px}@media print{.rn-export-float{display:none !important}}</style>'

const TWO_BUTTONS = '<button class="pbtn pbtn--html" onclick="exportHtml()">⤓ Export HTML</button><button class="pbtn pbtn--pdf" onclick="window.print()">↓ Export PDF</button>'
const LEGACY_PDF_BUTTON = '<button class="pbtn" onclick="window.print()">↓ Export PDF</button>'

export function preparePublishedHtml(html) {
  // 1. Clients must never get Jira task links (legacy notes carried them).
  let out = html.replace(LEGACY_TASK_LINK_RE, '<span class="task-summary">$1</span>')

  // 2. Retrofit Export HTML/PDF into notes published before the buttons existed.
  if (!out.includes('function exportHtml')) {
    out = out.replace('</head>', INJECT_STYLE + '</head>')
    if (out.includes(LEGACY_PDF_BUTTON)) {
      // Old toolbar with a single PDF button → swap in both buttons
      out = out.replace(LEGACY_PDF_BUTTON, `<div style="display:flex;gap:8px">${TWO_BUTTONS}</div>`)
    } else {
      // No recognizable toolbar → float the buttons top-right (hidden in print)
      out = out.replace('<body>', `<body><div class="rn-export-float">${TWO_BUTTONS}</div>`)
    }
    out = out.replace('</body>', EXPORT_SCRIPT + '</body>')
  }
  return out
}
