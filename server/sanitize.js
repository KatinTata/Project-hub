import sanitizeHtml from 'sanitize-html'

// Serverska sanitizacija HTML-a objavljenih release note-ova (K2).
// Ulaz je KOMPLETAN dokument koji generiše generatePublishHtml na klijentu
// (head + <style> + SVG pozadina + kartice), pa whitelist mora da propusti
// celu tu strukturu netaknutu. Skida se sve što izvršava kod: <script>,
// on* atributi, javascript: šeme, iframe/object/embed/form, meta http-equiv.
// Interaktivnost (toggle/export dugmad) se vraća pri serviranju kroz jedan
// poznat skript sa CSP hash-om — vidi server/publishedHtml.js.

// Unutar <svg> HTML parser čuva camelCase imena tagova i atributa
// (linearGradient, viewBox...) — zato whitelist sadrži obe varijante.
const SVG_TAGS = [
  'svg', 'defs', 'lineargradient', 'linearGradient', 'radialgradient', 'radialGradient',
  'stop', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon',
  'use', 'text', 'tspan',
]

const SVG_ATTRS = [
  'viewbox', 'viewBox', 'xmlns', 'preserveaspectratio', 'preserveAspectRatio',
  'fill', 'stroke', 'stroke-width', 'stroke-linejoin', 'stroke-linecap',
  'stroke-dasharray', 'stroke-dashoffset',
  'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'd', 'points',
  'offset', 'stop-color', 'stop-opacity', 'href',
  'gradientunits', 'gradientUnits', 'gradienttransform', 'gradientTransform',
  'transform', 'opacity', 'aria-hidden',
]

const FONT_LINK_RE = /^https:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/

export function sanitizePublishedHtml(html) {
  const clean = sanitizeHtml(String(html || ''), {
    allowedTags: [
      'html', 'head', 'meta', 'title', 'link', 'style', 'body',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr',
      'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup',
      'a', 'img', 'button', 'section', 'div', 'span',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
      'blockquote', 'code', 'pre', 'figure', 'figcaption', 'mark', 'small',
      ...SVG_TAGS,
    ],
    allowedAttributes: {
      '*': ['style', 'class', 'id', 'lang', 'dir', 'data-key', 'title', 'aria-hidden', 'aria-label', 'role'],
      meta: ['charset', 'name', 'content'],
      link: ['rel', 'href', 'crossorigin'],
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'loading'],
      button: ['type', 'disabled'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan', 'scope'],
      ...Object.fromEntries(SVG_TAGS.map(t => [t, [...SVG_ATTRS, 'style', 'class', 'id']])),
    },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowedSchemesByTag: { img: ['https', 'http', 'data'] },
    allowProtocolRelative: false,
    // <style> sadržaj mora da prođe netaknut (ceo dizajn dokumenta je u njemu);
    // izvršavanje skripti blokira CSP na serviranju, ne CSS.
    allowVulnerableTags: true,
    disallowedTagsMode: 'discard',
    // <link> sme samo ka Google Fonts (jedino što generator koristi).
    exclusiveFilter: frame =>
      frame.tag === 'link' && !FONT_LINK_RE.test(frame.attribs?.href || ''),
  })
  // htmlparser2 baca doctype — vrati ga da brauzer ne uđe u quirks mode.
  return /^\s*<!doctype/i.test(clean) ? clean : '<!DOCTYPE html>\n' + clean
}
