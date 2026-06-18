import { useRef, useEffect, useState, useCallback } from 'react'

// Rich-text body editor for a release-note task.
// Single flowing contentEditable so images can float and text wraps around them
// (Word-like inline insert). No external library. Stores sanitized HTML.

const ALLOWED_TAGS = new Set(['P', 'BR', 'DIV', 'H2', 'H3', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'UL', 'OL', 'LI', 'A', 'SPAN', 'IMG', 'FIGURE', 'FIGCAPTION'])
const ALLOWED_STYLE = new Set(['color', 'background-color', 'float', 'width', 'max-width', 'margin', 'display', 'text-align'])

function cleanStyle(value) {
  return String(value || '')
    .split(';')
    .map(p => p.trim())
    .filter(Boolean)
    .filter(p => ALLOWED_STYLE.has(p.split(':')[0].trim().toLowerCase()))
    .join('; ')
}

// Whitelist-sanitize an HTML fragment (runs in browser via DOMParser).
export function sanitizeBodyHtml(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(`<div id="r">${html}</div>`, 'text/html')
  const root = doc.getElementById('r')
  const walk = node => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) continue // text
      if (child.nodeType !== 1) { child.remove(); continue }
      const tag = child.tagName
      if (!ALLOWED_TAGS.has(tag)) {
        // unwrap unknown element, keep its children
        while (child.firstChild) node.insertBefore(child.firstChild, child)
        child.remove()
        continue
      }
      for (const attr of Array.from(child.attributes)) {
        const n = attr.name.toLowerCase()
        if (n.startsWith('on')) { child.removeAttribute(attr.name); continue }
        if (tag === 'A' && n === 'href') {
          if (/^\s*javascript:/i.test(attr.value)) child.removeAttribute(attr.name)
          continue
        }
        if (tag === 'IMG' && (n === 'src' || n === 'alt')) continue
        if (n === 'class') continue
        if (n === 'style') { const s = cleanStyle(attr.value); if (s) child.setAttribute('style', s); else child.removeAttribute('style'); continue }
        child.removeAttribute(attr.name)
      }
      if (tag === 'A') { child.setAttribute('target', '_blank'); child.setAttribute('rel', 'noopener noreferrer') }
      walk(child)
    }
  }
  walk(root)
  return root.innerHTML
}

const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// Plain text → safe HTML paragraphs (blank line = new paragraph).
export function textToHtml(text) {
  const t = String(text || '').trim()
  if (!t) return ''
  return t.split(/\n{2,}/).map(block => `<p>${esc(block).replace(/\n/g, '<br>')}</p>`).join('')
}

// HTML → plain text (for AI prompt context + the plain mirror).
export function htmlToText(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('br').forEach(br => br.replaceWith('\n'))
  doc.querySelectorAll('p, div, h2, h3, li').forEach(el => el.append('\n'))
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
}

const FLOAT_PRESETS = {
  left:  w => `float:left; width:${w}%; margin:4px 14px 8px 0; max-width:100%`,
  right: w => `float:right; width:${w}%; margin:4px 0 8px 14px; max-width:100%`,
  full:  w => `float:none; display:block; width:${w}%; margin:10px auto; max-width:100%`,
}
function imgWidth(el) { const m = /width:\s*(\d+)%/.exec(el.getAttribute('style') || ''); return m ? parseInt(m[1], 10) : 50 }
function imgAlign(el) { const s = el.getAttribute('style') || ''; if (/float:\s*left/.test(s)) return 'left'; if (/float:\s*right/.test(s)) return 'right'; return 'full' }

const TB = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 30, height: 28, padding: '0 7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', borderRadius: 6, cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 13, lineHeight: 1 }
const SWATCHES = ['#0F1523', '#2563EB', '#16A34A', '#D97706', '#DC2626', '#7C3AED']

export default function RichBodyEditor({ value, onChange, placeholder, maxImageMB = 5, onError }) {
  const ref = useRef(null)
  const dragImg = useRef(null)        // image being repositioned inside the editor
  const last = useRef(value || '')
  const [empty, setEmpty] = useState(!value)
  const [sel, setSel] = useState(null)       // selected <img> element
  const [colorOpen, setColorOpen] = useState(false)

  useEffect(() => {
    if (!ref.current) return
    if ((value || '') !== last.current) {
      ref.current.innerHTML = value || ''
      last.current = value || ''
      setEmpty(!ref.current.textContent.trim() && !ref.current.querySelector('img'))
    }
  }, [value])

  useEffect(() => { if (ref.current) { ref.current.innerHTML = value || ''; setEmpty(!ref.current.textContent.trim() && !ref.current.querySelector('img')) } }, []) // eslint-disable-line

  const emit = useCallback(() => {
    if (!ref.current) return
    const html = ref.current.innerHTML
    last.current = html
    setEmpty(!ref.current.textContent.trim() && !ref.current.querySelector('img'))
    onChange?.(html)
  }, [onChange])

  const cmd = (command, arg) => { ref.current?.focus(); document.execCommand(command, false, arg); emit() }
  const block = tag => { ref.current?.focus(); document.execCommand('formatBlock', false, tag); emit() }

  function insertImageFiles(files, dropEvent) {
    for (const file of Array.from(files || [])) {
      if (!file.type.startsWith('image/')) continue
      if (file.size > maxImageMB * 1024 * 1024) { onError?.(`Slika je prevelika (max ${maxImageMB}MB)`); continue }
      const reader = new FileReader()
      reader.onload = e => {
        const html = `<img src="${e.target.result}" alt="" style="${FLOAT_PRESETS.right(45)}">`
        ref.current?.focus()
        if (dropEvent && document.caretRangeFromPoint) {
          const r = document.caretRangeFromPoint(dropEvent.clientX, dropEvent.clientY)
          if (r) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(r) }
        }
        document.execCommand('insertHTML', false, html + '<p></p>')
        emit()
      }
      reader.readAsDataURL(file)
    }
  }

  function pickImage() {
    const inp = document.createElement('input')
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true
    inp.onchange = e => insertImageFiles(e.target.files)
    inp.click()
  }

  function onClickEditor(e) {
    if (e.target.tagName === 'IMG') { setSel(e.target); e.target.style.outline = '2px solid var(--accent)' }
    else if (sel) { sel.style.outline = ''; setSel(null) }
  }
  function applyImg(mut) { if (!sel) return; mut(sel); emit() }
  function setAlign(a) { applyImg(el => el.setAttribute('style', FLOAT_PRESETS[a](imgWidth(el)))) }
  function bumpWidth(d) { applyImg(el => { const a = imgAlign(el); const w = Math.max(20, Math.min(100, imgWidth(el) + d)); el.setAttribute('style', FLOAT_PRESETS[a](w)) }) }
  function removeImg() { if (!sel) return; sel.remove(); setSel(null); emit() }

  function caretRangeAt(x, y) {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y)
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y)
      if (p) { const r = document.createRange(); r.setStart(p.offsetNode, p.offset); r.collapse(true); return r }
    }
    return null
  }
  // Dragging an existing image → MOVE it (native contentEditable drag copies it).
  function onDragStartEditor(e) {
    if (e.target.tagName === 'IMG') {
      dragImg.current = e.target
      e.dataTransfer.effectAllowed = 'move'
      try { e.dataTransfer.setData('text/plain', '') } catch { /* some browsers require setData */ }
    }
  }
  function onDragOverEditor(e) {
    const isFile = e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('Files')
    if (dragImg.current || isFile) {
      e.preventDefault(); e.stopPropagation()
      e.dataTransfer.dropEffect = dragImg.current ? 'move' : 'copy'
    }
  }
  function onDropEditor(e) {
    if (dragImg.current) {
      e.preventDefault(); e.stopPropagation()
      const img = dragImg.current
      dragImg.current = null
      const r = caretRangeAt(e.clientX, e.clientY)
      if (r && r.startContainer !== img && !img.contains(r.startContainer)) {
        img.remove()
        r.insertNode(img)
        const sel2 = window.getSelection(); sel2.removeAllRanges()
        const after = document.createRange(); after.setStartAfter(img); after.collapse(true); sel2.addRange(after)
      }
      img.style.outline = ''
      setSel(null)
      emit()
      return
    }
    if (e.dataTransfer?.files?.length) { e.preventDefault(); e.stopPropagation(); insertImageFiles(e.dataTransfer.files, e) }
  }
  function onDragEndEditor() { dragImg.current = null }

  const md = e => e.preventDefault() // keep selection on toolbar mousedown

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg)' }}>
      <div onMouseDown={md} style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 6, borderBottom: '1px solid var(--border)', background: 'var(--surfaceAlt)' }}>
        <button style={{ ...TB, fontWeight: 700 }} title="Podebljano" onClick={() => cmd('bold')}>B</button>
        <button style={{ ...TB, fontStyle: 'italic' }} title="Kurziv" onClick={() => cmd('italic')}>I</button>
        <button style={{ ...TB, textDecoration: 'underline' }} title="Podvučeno" onClick={() => cmd('underline')}>U</button>
        <span style={{ width: 1, background: 'var(--border)', margin: '2px 2px' }} />
        <button style={TB} title="Naslov" onClick={() => block('H3')}>H</button>
        <button style={TB} title="Običan pasus" onClick={() => block('P')}>¶</button>
        <button style={TB} title="Lista" onClick={() => cmd('insertUnorderedList')}>• Lista</button>
        <button style={TB} title="Numerisana lista" onClick={() => cmd('insertOrderedList')}>1. Lista</button>
        <span style={{ width: 1, background: 'var(--border)', margin: '2px 2px' }} />
        <div style={{ position: 'relative' }}>
          <button style={TB} title="Boja teksta" onClick={() => setColorOpen(o => !o)}><span style={{ color: 'var(--accent)', fontWeight: 700 }}>A</span> ▾</button>
          {colorOpen && (
            <div onMouseDown={md} style={{ position: 'absolute', top: 32, left: 0, zIndex: 20, display: 'flex', gap: 4, padding: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
              {SWATCHES.map(c => (
                <button key={c} title={c} onClick={() => { cmd('foreColor', c); setColorOpen(false) }} style={{ width: 18, height: 18, borderRadius: 4, background: c, border: '1px solid var(--border)', cursor: 'pointer', padding: 0 }} />
              ))}
              <button title="Žuti marker" onClick={() => { document.execCommand('hiliteColor', false, '#FEF08A') || document.execCommand('backColor', false, '#FEF08A'); emit(); setColorOpen(false) }} style={{ ...TB, minWidth: 24, height: 18, background: '#FEF08A', color: '#713F12', fontSize: 11 }}>H</button>
            </div>
          )}
        </div>
        <button style={TB} title="Link" onClick={() => { const u = window.prompt('URL linka:'); if (u) cmd('createLink', u) }}>Link</button>
        <span style={{ width: 1, background: 'var(--border)', margin: '2px 2px' }} />
        <button style={{ ...TB, color: 'var(--accent)', borderColor: 'var(--accent)' }} title="Ubaci sliku" onClick={pickImage}>＋ Slika</button>
      </div>

      {sel && (
        <div onMouseDown={md} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: '1px solid var(--border)', background: 'rgba(79,142,247,0.08)', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--textMuted)' }}>
          <span>Slika:</span>
          {[['left', 'Levo'], ['full', 'Centar / puna'], ['right', 'Desno']].map(([a, lbl]) => (
            <button key={a} onClick={() => setAlign(a)} style={{ ...TB, height: 24, fontSize: 12, fontWeight: imgAlign(sel) === a ? 700 : 400, borderColor: imgAlign(sel) === a ? 'var(--accent)' : 'var(--border)', color: imgAlign(sel) === a ? 'var(--accent)' : 'var(--text)' }}>{lbl}</button>
          ))}
          <span style={{ width: 1, height: 18, background: 'var(--border)' }} />
          <button onClick={() => bumpWidth(-10)} style={{ ...TB, height: 24, minWidth: 26 }}>−</button>
          <span style={{ fontFamily: 'DM Mono', minWidth: 38, textAlign: 'center' }}>{imgWidth(sel)}%</span>
          <button onClick={() => bumpWidth(10)} style={{ ...TB, height: 24, minWidth: 26 }}>＋</button>
          <button onClick={removeImg} style={{ ...TB, height: 24, marginLeft: 'auto', color: 'var(--red)', borderColor: 'var(--red)' }}>Ukloni</button>
        </div>
      )}

      <div style={{ position: 'relative' }}>
        {empty && placeholder && (
          <div style={{ position: 'absolute', top: 12, left: 14, color: 'var(--textSubtle)', fontFamily: 'DM Sans', fontSize: 13, pointerEvents: 'none' }}>{placeholder}</div>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onBlur={emit}
          onClick={onClickEditor}
          onDragStart={onDragStartEditor}
          onDragOver={onDragOverEditor}
          onDrop={onDropEditor}
          onDragEnd={onDragEndEditor}
          style={{ minHeight: 120, padding: '10px 14px', color: 'var(--text)', fontFamily: 'DM Sans', fontSize: 13, lineHeight: 1.6, outline: 'none' }}
        />
      </div>
    </div>
  )
}
