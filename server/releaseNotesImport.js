// Uvoz starih release note-ova iz fajlova (22.09.2026.).
//
// Release note-ovi su godinama slati klijentima kao fajlovi (HTML, PDF, Excel).
// Ovde se sadržaj tih fajlova pretvara u HTML koji se dalje ponaša isto kao
// sadržaj napisan u editoru: prolazi kroz sanitizePublishedHtml i upisuje se u
// published_notes. Formatiranje se NE rekonstruiše savršeno — cilj je da tekst
// bude čitljiv i pretraživ, a admin ga posle može doraditi u editoru.
//
// Bez novih zavisnosti: pdfjs-dist i ExcelJS su već u projektu.

import ExcelJS from 'exceljs'

export const IMPORT_EXTENSIONS = ['.html', '.htm', '.pdf', '.xlsx']

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// PDF nema pojam pasusa — ima samo pozicionirane komadiće teksta. pdfjs javlja
// kraj reda kroz `hasEOL`, pa se redovi spajaju u pasuse: prazan red razdvaja
// pasus, kratak red koji počinje crticom/brojem ostaje svoj red (liste).
async function htmlFromPdf(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
  }).promise

  const blocks = []
  try {
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
      const page = await doc.getPage(pageNo)
      const content = await page.getTextContent()
      const lines = []
      let line = ''
      for (const item of content.items) {
        if (typeof item.str !== 'string') continue
        line += item.str
        if (item.hasEOL) { lines.push(line.trim()); line = '' }
      }
      if (line.trim()) lines.push(line.trim())

      let paragraph = []
      const flush = () => {
        if (!paragraph.length) return
        blocks.push(`<p>${escapeHtml(paragraph.join(' '))}</p>`)
        paragraph = []
      }
      for (const raw of lines) {
        const text = raw.trim()
        if (!text) { flush(); continue }
        if (/^([-•*–]|\d+[.)])\s+/.test(text)) { flush(); blocks.push(`<p>${escapeHtml(text)}</p>`); continue }
        paragraph.push(text)
      }
      flush()
      page.cleanup()
    }
  } finally {
    await doc.destroy()
  }
  return blocks.join('\n')
}

// Excel: svaki list postaje naslov + tabela, prvi neprazan red je zaglavlje.
// Prazni redovi i prazne kolone se preskaču da tabela ne bude puna praznina.
async function htmlFromXlsx(buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)

  const out = []
  wb.eachSheet(sheet => {
    const rows = []
    sheet.eachRow({ includeEmpty: false }, row => {
      const cells = []
      row.eachCell({ includeEmpty: true }, cell => cells.push(cellText(cell)))
      if (cells.some(c => c.trim())) rows.push(cells)
    })
    if (!rows.length) return

    const width = Math.max(...rows.map(r => r.length))
    const used = []
    for (let i = 0; i < width; i++) {
      if (rows.some(r => (r[i] || '').trim())) used.push(i)
    }
    if (!used.length) return

    const cell = (r, i) => escapeHtml((r[i] || '').trim())
    const [head, ...body] = rows
    out.push(`<h2>${escapeHtml(sheet.name)}</h2>`)
    out.push('<table>')
    out.push(`<thead><tr>${used.map(i => `<th>${cell(head, i)}</th>`).join('')}</tr></thead>`)
    if (body.length) {
      out.push(`<tbody>${body.map(r => `<tr>${used.map(i => `<td>${cell(r, i)}</td>`).join('')}</tr>`).join('')}</tbody>`)
    }
    out.push('</table>')
  })
  return out.join('\n')
}

function cellText(cell) {
  const v = cell?.value
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('')
    if (v.text != null) return String(v.text)
    if (v.result != null) return String(v.result)
    if (v.hyperlink) return String(v.hyperlink)
    return ''
  }
  return String(v)
}

// Vraća HTML spreman za sanitizaciju. Nepodržana ekstenzija javlja grešku sa
// porukom koja ide korisniku (ruta je hvata i vraća 400).
export async function htmlFromImportedFile(buffer, ext) {
  const e = String(ext || '').toLowerCase()
  if (e === '.pdf') return htmlFromPdf(buffer)
  if (e === '.xlsx') return htmlFromXlsx(buffer)
  if (e === '.html' || e === '.htm') return buffer.toString('utf8')
  throw new Error(`Nepodržan format: ${e || 'bez ekstenzije'}`)
}

// Uvezeni sadržaj je goli HTML (pasusi, tabela) — bez omotača bi javni /rn link
// izgledao kao neformatiran tekst. Omotnica je namerno minimalna: isti font kao
// aplikacija, čitljiva širina i tabela sa linijama.
export function wrapImportedHtml(bodyHtml, { title, version } = {}) {
  // Verzija se dodaje samo ako je već nema u naslovu („Release 3.4.1“ + „3.4.1“
  // bi inače dalo „Release 3.4.1 · 3.4.1“).
  const showVersion = version && !String(title || '').includes(version)
  const heading = [title, showVersion ? version : null].filter(Boolean).join(' · ')
  return `<!DOCTYPE html>
<html lang="sr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title || 'Release note')}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600;700&display=swap">
<style>
  body { margin: 0; padding: 32px 16px; background: #F0F2F8; color: #0F1523;
         font-family: 'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif; }
  .rn-doc { max-width: 760px; margin: 0 auto; background: #fff; border: 1px solid #E2E6F0;
            border-radius: 12px; padding: 32px; }
  .rn-doc h1 { font-size: 24px; margin: 0 0 24px; }
  .rn-doc h2 { font-size: 17px; margin: 28px 0 10px; }
  .rn-doc p { font-size: 14px; line-height: 1.7; margin: 0 0 10px; }
  .rn-doc table { border-collapse: collapse; width: 100%; margin: 12px 0 20px; font-size: 13px; }
  .rn-doc th, .rn-doc td { border: 1px solid #E2E6F0; padding: 8px 10px; text-align: left; vertical-align: top; }
  .rn-doc th { background: #F8F9FC; font-weight: 600; }
</style>
</head>
<body>
<div class="rn-doc">
${heading ? `<h1>${escapeHtml(heading)}</h1>` : ''}
${bodyHtml}
</div>
</body>
</html>`
}
