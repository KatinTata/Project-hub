import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'

// Rich-text body editor (TipTap / ProseMirror). Stores sanitized HTML via
// value/onChange. ProseMirror handles inline image drag-MOVE correctly.

const ALLOWED_TAGS = new Set(['P', 'BR', 'DIV', 'H1', 'H2', 'H3', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE', 'UL', 'OL', 'LI', 'A', 'SPAN', 'IMG', 'FIGURE', 'FIGCAPTION', 'BLOCKQUOTE', 'CODE', 'PRE', 'MARK', 'HR'])
const ALLOWED_STYLE = new Set(['color', 'background-color', 'float', 'width', 'max-width', 'margin', 'display', 'text-align'])

function cleanStyle(value) {
  return String(value || '').split(';').map(p => p.trim()).filter(Boolean)
    .filter(p => ALLOWED_STYLE.has(p.split(':')[0].trim().toLowerCase())).join('; ')
}

export function sanitizeBodyHtml(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(`<div id="r">${html}</div>`, 'text/html')
  const root = doc.getElementById('r')
  const walk = node => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) continue
      if (child.nodeType !== 1) { child.remove(); continue }
      const tag = child.tagName
      if (!ALLOWED_TAGS.has(tag)) { while (child.firstChild) node.insertBefore(child.firstChild, child); child.remove(); continue }
      for (const attr of Array.from(child.attributes)) {
        const n = attr.name.toLowerCase()
        if (n.startsWith('on')) { child.removeAttribute(attr.name); continue }
        if (tag === 'A' && n === 'href') { if (/^\s*javascript:/i.test(attr.value)) child.removeAttribute(attr.name); continue }
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

const inlineMd = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

// Plain/markdown-ish text → HTML. Recognizes "- " / "* " bullet lines as a real
// <ul>, blank lines as paragraph breaks, and **bold**.
export function textToHtml(text) {
  const t = String(text || '').replace(/\r\n/g, '\n').trim()
  if (!t) return ''
  const out = []
  let para = [], list = []
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inlineMd).join('<br>')}</p>`); para = [] } }
  const flushList = () => { if (list.length) { out.push(`<ul>${list.map(li => `<li>${inlineMd(li)}</li>`).join('')}</ul>`); list = [] } }
  for (const raw of t.split('\n')) {
    const line = raw.trim()
    const m = /^[-*]\s+(.+)$/.exec(line)
    if (m) { flushPara(); list.push(m[1]) }
    else if (!line) { flushPara(); flushList() }
    else { flushList(); para.push(line) }
  }
  flushPara(); flushList()
  return out.join('')
}

export function htmlToText(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('br').forEach(br => br.replaceWith('\n'))
  doc.querySelectorAll('p, div, h1, h2, h3, li, blockquote').forEach(el => el.append('\n'))
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
}

// ── Image with float/width via a style attribute ─────────────────────────────
const FLOAT = {
  left: w => `float:left;width:${w}%;margin:4px 14px 8px 0;max-width:100%`,
  right: w => `float:right;width:${w}%;margin:4px 0 8px 14px;max-width:100%`,
  full: w => `float:none;display:block;width:${w}%;margin:10px auto;max-width:100%`,
}
const StyledImage = Image.extend({
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      style: { default: FLOAT.right(45), parseHTML: el => el.getAttribute('style'), renderHTML: a => (a.style ? { style: a.style } : {}) },
    }
  },
  // NodeView: native ProseMirror drag to move (smooth, with drop indicator) +
  // corner handles for fluid resize.
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('span')
      dom.className = 'rbe-img'
      dom.draggable = true // let ProseMirror handle the drag/move natively
      const img = document.createElement('img')
      img.src = node.attrs.src
      img.draggable = false
      if (node.attrs.alt) img.alt = node.attrs.alt
      dom.appendChild(img)
      const apply = style => dom.setAttribute('style', style || FLOAT.right(45))
      apply(node.attrs.style)

      let curStyle = node.attrs.style

      for (const pos of ['nw', 'ne', 'sw', 'se']) {
        const h = document.createElement('span')
        h.className = `rbe-img-handle rbe-h-${pos}`
        h.draggable = false
        h.addEventListener('mousedown', e => {
          e.preventDefault(); e.stopPropagation()
          dom.draggable = false // don't start a node-drag while resizing
          const startX = e.clientX
          const startW = img.getBoundingClientRect().width
          const editorW = editor.view.dom.clientWidth || 600
          const dir = (pos === 'ne' || pos === 'se') ? 1 : -1
          const align = alignOf(curStyle)
          const onMove = ev => {
            const w = startW + (ev.clientX - startX) * dir
            const pct = Math.max(15, Math.min(100, Math.round((w / editorW) * 100)))
            curStyle = FLOAT[align](pct)
            apply(curStyle)
          }
          const onUp = () => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            dom.draggable = true
            if (typeof getPos === 'function') {
              editor.view.dispatch(editor.view.state.tr.setNodeMarkup(getPos(), undefined, { ...node.attrs, style: curStyle }))
            }
          }
          document.addEventListener('mousemove', onMove)
          document.addEventListener('mouseup', onUp)
        })
        dom.appendChild(h)
      }

      return {
        dom,
        update(updated) {
          if (updated.type.name !== node.type.name) return false
          if (updated.attrs.src !== img.src) img.src = updated.attrs.src
          curStyle = updated.attrs.style
          apply(updated.attrs.style)
          return true
        },
        ignoreMutation: () => true,
        // Let PM handle drag (move) + click (select); only swallow resize-handle events.
        stopEvent: e => e.target?.classList?.contains?.('rbe-img-handle'),
      }
    }
  },
})
const widthOf = s => { const m = /width:\s*(\d+)%/.exec(s || ''); return m ? parseInt(m[1], 10) : 50 }
const alignOf = s => (/float:\s*left/.test(s || '') ? 'left' : /float:\s*right/.test(s || '') ? 'right' : 'full')

const aSvg = lines => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    {lines.map(([x1, x2], i) => <line key={i} x1={x1} y1={4 + i * 4} x2={x2} y2={4 + i * 4} />)}
  </svg>
)
const ALIGN_ICON = {
  left: aSvg([[2.5, 13.5], [2.5, 9.5], [2.5, 11.5]]),
  center: aSvg([[2.5, 13.5], [4.5, 11.5], [3.5, 12.5]]),
  right: aSvg([[2.5, 13.5], [6.5, 13.5], [4.5, 13.5]]),
  justify: aSvg([[2.5, 13.5], [2.5, 13.5], [2.5, 13.5]]),
}

const SWATCHES = ['#0F1523', '#2563EB', '#16A34A', '#D97706', '#DC2626', '#7C3AED']
const TB = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 30, height: 28, padding: '0 8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', borderRadius: 6, cursor: 'pointer', fontFamily: 'Hanken Grotesk', fontSize: 13, lineHeight: 1 }
const active = on => on ? { ...TB, background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : TB
const sep = <span style={{ width: 1, background: 'var(--border)', margin: '2px 2px', alignSelf: 'stretch' }} />

export default function RichBodyEditor({ value, onChange, placeholder, maxImageMB = 5, onError }) {
  const lastEmitted = useRef(value || '')
  const colorRef = useRef(null)
  const dragLabelRef = useRef(null) // floating "Levo/Centar/Desno" hint while dragging an image

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, dropcursor: { color: '#2563EB', width: 4 } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
      StyledImage.configure({ inline: true, allowBase64: true }),
      TextStyle,
      Color,
      Highlight.configure({ HTMLAttributes: { style: 'background-color:#FEF08A' } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: placeholder || 'Piši ovde…' }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => { const html = editor.getHTML(); lastEmitted.current = html; onChange?.(html) },
    editorProps: {
      handleDrop(view, event, slice, moved) {
        // Moving an existing image: place it at the drop point AND set its side
        // (left/center/right) from where it was dropped horizontally.
        if (moved) {
          const sel = view.state.selection
          const dn = sel.node // NodeSelection only — guarantees we delete the right node
          // Only take over when the dragged thing is exactly the selected image.
          if (dn && dn.type.name === 'image') {
            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
            if (!coords) return false
            // Dropped inside its own range → no-op (avoids duplicate).
            if (coords.pos >= sel.from && coords.pos <= sel.to) { event.preventDefault(); return true }
            event.preventDefault()
            const rect = view.dom.getBoundingClientRect()
            const rel = (event.clientX - rect.left) / rect.width
            const align = rel < 0.42 ? 'left' : rel > 0.58 ? 'right' : 'full'
            let tr = view.state.tr.delete(sel.from, sel.to)
            const target = Math.min(tr.doc.content.size, tr.mapping.map(coords.pos))
            tr = tr.insert(target, dn.type.create({ ...dn.attrs, style: FLOAT[align](widthOf(dn.attrs.style)) }))
            view.dispatch(tr)
            return true
          }
          return false // let ProseMirror move it (reliable, never copies)
        }
        const files = Array.from(event.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'))
        if (!files.length) return false
        event.preventDefault()
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })
        for (const file of files) {
          if (file.size > maxImageMB * 1024 * 1024) { onError?.(`Slika je prevelika (max ${maxImageMB}MB)`); continue }
          const reader = new FileReader()
          reader.onload = e => {
            const node = view.state.schema.nodes.image.create({ src: e.target.result, style: FLOAT.right(45) })
            view.dispatch(view.state.tr.insert(at ? at.pos : view.state.selection.from, node))
          }
          reader.readAsDataURL(file)
        }
        return true
      },
      handleDOMEvents: {
        dragover: (view, event) => {
          const lbl = dragLabelRef.current
          const isImg = view.dragging?.slice?.content?.firstChild?.type?.name === 'image'
          if (!lbl || !isImg) return false
          const rect = view.dom.getBoundingClientRect()
          const rel = (event.clientX - rect.left) / rect.width
          lbl.textContent = (rel < 0.42 ? 'Levo' : rel > 0.58 ? 'Desno' : 'Centar') + ' — pusti ovde'
          lbl.style.left = (event.clientX + 16) + 'px'
          lbl.style.top = (event.clientY + 16) + 'px'
          lbl.style.display = 'block'
          return false
        },
        drop: () => { if (dragLabelRef.current) dragLabelRef.current.style.display = 'none'; return false },
        dragend: () => { if (dragLabelRef.current) dragLabelRef.current.style.display = 'none'; return false },
      },
    },
  }, [])

  // External content changes (e.g. AI apply) — only when different from our own emit.
  useEffect(() => {
    if (!editor) return
    if ((value || '') !== lastEmitted.current) {
      editor.commands.setContent(value || '', false)
      lastEmitted.current = value || ''
    }
  }, [value, editor])

  if (!editor) return null

  const run = fn => () => { fn(editor.chain().focus()).run() }
  const headingValue = editor.isActive('heading', { level: 1 }) ? 'h1' : editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'p'
  const alignValue = ['left', 'center', 'right', 'justify'].find(a => editor.isActive({ textAlign: a })) || 'left'

  function setHeading(v) {
    const c = editor.chain().focus()
    if (v === 'p') c.setParagraph().run()
    else c.toggleHeading({ level: parseInt(v[1], 10) }).run()
  }
  function pickImage() {
    const inp = document.createElement('input')
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true
    inp.onchange = e => {
      for (const file of Array.from(e.target.files || [])) {
        if (file.size > maxImageMB * 1024 * 1024) { onError?.(`Slika je prevelika (max ${maxImageMB}MB)`); continue }
        const reader = new FileReader()
        reader.onload = ev => editor.chain().focus().insertContentAt(editor.state.selection.to, { type: 'image', attrs: { src: ev.target.result, style: FLOAT.right(45) } }).run()
        reader.readAsDataURL(file)
      }
    }
    inp.click()
  }
  function setLink() {
    const prev = editor.getAttributes('link').href || ''
    const url = window.prompt('URL linka:', prev)
    if (url === null) return
    if (url === '') editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  const imgActive = editor.isActive('image')
  const imgStyle = imgActive ? (editor.getAttributes('image').style || '') : ''
  const setImgStyle = s => editor.chain().focus().updateAttributes('image', { style: s }).run()

  return (
    <div className="rbe" style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg)' }}>
      <style>{`
        .rbe .ProseMirror{outline:none;min-height:130px;padding:10px 14px;font-family:'Hanken Grotesk',sans-serif;font-size:13px;line-height:1.6;color:var(--text)}
        .rbe .ProseMirror>*:first-child{margin-top:0}
        .rbe .ProseMirror p{margin:0 0 8px}
        .rbe .ProseMirror h1{font-family:'Hanken Grotesk',sans-serif;font-weight:800;font-size:20px;margin:10px 0 6px}
        .rbe .ProseMirror h2{font-family:'Hanken Grotesk',sans-serif;font-weight:700;font-size:17px;margin:10px 0 4px}
        .rbe .ProseMirror h3{font-family:'Hanken Grotesk',sans-serif;font-weight:700;font-size:15px;margin:8px 0 4px}
        .rbe .ProseMirror ul,.rbe .ProseMirror ol{padding-left:22px;margin:6px 0}
        .rbe .ProseMirror li{margin:2px 0}
        .rbe .ProseMirror blockquote{border-left:3px solid var(--border);padding-left:12px;color:var(--textMuted);margin:8px 0}
        .rbe .ProseMirror code{background:var(--surfaceAlt);padding:1px 4px;border-radius:4px;font-family:'Hanken Grotesk',sans-serif;font-size:12px}
        .rbe .ProseMirror a{color:var(--accent)}
        .rbe .ProseMirror .rbe-img{position:relative;display:inline-block;line-height:0}
        .rbe .ProseMirror .rbe-img img{width:100%;height:auto;display:block;border-radius:5px}
        .rbe .ProseMirror .rbe-img.ProseMirror-selectednode{outline:2px solid var(--accent);outline-offset:2px}
        .rbe .ProseMirror .rbe-img-handle{position:absolute;width:12px;height:12px;background:var(--accent);border:2px solid #fff;border-radius:50%;display:none;z-index:5;box-shadow:0 1px 3px rgba(0,0,0,0.35)}
        .rbe .ProseMirror .rbe-img:hover .rbe-img-handle,.rbe .ProseMirror .rbe-img.ProseMirror-selectednode .rbe-img-handle{display:block}
        .rbe-h-nw{top:-7px;left:-7px;cursor:nwse-resize}
        .rbe-h-ne{top:-7px;right:-7px;cursor:nesw-resize}
        .rbe-h-sw{bottom:-7px;left:-7px;cursor:nesw-resize}
        .rbe-h-se{bottom:-7px;right:-7px;cursor:nwse-resize}
        .rbe .ProseMirror::after{content:"";display:block;clear:both}
        .rbe .ProseMirror p.is-editor-empty:first-child::before{content:attr(data-placeholder);color:var(--textSubtle);float:left;height:0;pointer-events:none}
      `}</style>

      <div onMouseDown={e => { if (!/^(SELECT|OPTION)$/.test(e.target.tagName)) e.preventDefault() }} style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 6, borderBottom: '1px solid var(--border)', background: 'var(--surfaceAlt)' }}>
        <button title="Poništi" style={TB} onClick={run(c => c.undo())}>↶</button>
        <button title="Ponovi" style={TB} onClick={run(c => c.redo())}>↷</button>
        {sep}
        <select value={headingValue} onChange={e => setHeading(e.target.value)} style={{ ...TB, minWidth: 96, padding: '0 6px' }}>
          <option value="p">Tekst</option>
          <option value="h1">Naslov 1</option>
          <option value="h2">Naslov 2</option>
          <option value="h3">Naslov 3</option>
        </select>
        {sep}
        <button title="Podebljano" style={{ ...active(editor.isActive('bold')), fontWeight: 700 }} onClick={run(c => c.toggleBold())}>B</button>
        <button title="Kurziv" style={{ ...active(editor.isActive('italic')), fontStyle: 'italic' }} onClick={run(c => c.toggleItalic())}>I</button>
        <button title="Podvučeno" style={{ ...active(editor.isActive('underline')), textDecoration: 'underline' }} onClick={run(c => c.toggleUnderline())}>U</button>
        <button title="Precrtano" style={{ ...active(editor.isActive('strike')), textDecoration: 'line-through' }} onClick={run(c => c.toggleStrike())}>S</button>
        {sep}
        <button title="Lista" style={active(editor.isActive('bulletList'))} onClick={run(c => c.toggleBulletList())}>• Lista</button>
        <button title="Numerisana" style={active(editor.isActive('orderedList'))} onClick={run(c => c.toggleOrderedList())}>1. Lista</button>
        <button title="Citat" style={active(editor.isActive('blockquote'))} onClick={run(c => c.toggleBlockquote())}>Citat</button>
        <button title="Kod" style={active(editor.isActive('code'))} onClick={run(c => c.toggleCode())}>Kod</button>
        {sep}
        <div style={{ position: 'relative' }}>
          <button title="Boja teksta" style={TB} onClick={() => { const el = colorRef.current; if (el) el.style.display = el.style.display === 'flex' ? 'none' : 'flex' }}><span style={{ color: 'var(--accent)', fontWeight: 700 }}>A</span> ▾</button>
          <div ref={colorRef} style={{ display: 'none', position: 'absolute', top: 32, left: 0, zIndex: 20, gap: 4, padding: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
            {SWATCHES.map(c => <button key={c} title={c} onMouseDown={e => e.preventDefault()} onClick={() => { editor.chain().focus().setColor(c).run(); colorRef.current.style.display = 'none' }} style={{ width: 18, height: 18, borderRadius: 4, background: c, border: '1px solid var(--border)', cursor: 'pointer', padding: 0 }} />)}
            <button title="Bez boje" onMouseDown={e => e.preventDefault()} onClick={() => { editor.chain().focus().unsetColor().run(); colorRef.current.style.display = 'none' }} style={{ ...TB, minWidth: 24, height: 18, fontSize: 11 }}>×</button>
          </div>
        </div>
        <button title="Marker" style={active(editor.isActive('highlight'))} onClick={run(c => c.toggleHighlight())}>Marker</button>
        {sep}
        {[['left', 'Levo'], ['center', 'Centar'], ['right', 'Desno'], ['justify', 'Obostrano']].map(([a, lbl]) => (
          <button key={a} title={lbl} style={active(alignValue === a)} onClick={run(c => c.setTextAlign(a))}>{ALIGN_ICON[a]}</button>
        ))}
        <button title="Link" style={active(editor.isActive('link'))} onClick={setLink}>Link</button>
        <button title="Linija" style={TB} onClick={run(c => c.setHorizontalRule())}>—</button>
        <button title="Očisti stil" style={TB} onClick={run(c => c.unsetAllMarks().clearNodes())}>Očisti</button>
        {sep}
        <button title="Ubaci sliku" style={{ ...TB, color: 'var(--accent)', borderColor: 'var(--accent)' }} onClick={pickImage}>＋ Slika</button>
      </div>

      {imgActive && (
        <div onMouseDown={e => e.preventDefault()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: '1px solid var(--border)', background: 'rgba(79,142,247,0.08)', fontFamily: 'Hanken Grotesk', fontSize: 12, color: 'var(--textMuted)' }}>
          <span>Slika:</span>
          {[['left', 'Levo'], ['full', 'Centar / puna'], ['right', 'Desno']].map(([a, lbl]) => (
            <button key={a} onClick={() => setImgStyle(FLOAT[a](widthOf(imgStyle)))} style={{ ...active(alignOf(imgStyle) === a), height: 24, fontSize: 12 }}>{lbl}</button>
          ))}
          {sep}
          <button onClick={() => setImgStyle(FLOAT[alignOf(imgStyle)](Math.max(20, widthOf(imgStyle) - 10)))} style={{ ...TB, height: 24, minWidth: 26 }}>−</button>
          <span style={{ fontFamily: 'Hanken Grotesk', minWidth: 38, textAlign: 'center' }}>{widthOf(imgStyle)}%</span>
          <button onClick={() => setImgStyle(FLOAT[alignOf(imgStyle)](Math.min(100, widthOf(imgStyle) + 10)))} style={{ ...TB, height: 24, minWidth: 26 }}>＋</button>
          <button onClick={run(c => c.deleteSelection())} style={{ ...TB, height: 24, marginLeft: 'auto', color: 'var(--red)', borderColor: 'var(--red)' }}>Ukloni</button>
        </div>
      )}

      <EditorContent editor={editor} />
      <div ref={dragLabelRef} style={{ display: 'none', position: 'fixed', zIndex: 9999, pointerEvents: 'none', background: 'var(--accent)', color: '#fff', fontFamily: 'Hanken Grotesk', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,0.3)', whiteSpace: 'nowrap' }} />
    </div>
  )
}
