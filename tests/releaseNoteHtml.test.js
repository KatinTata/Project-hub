// Jezik objave (sr/en) u generisanom release-notes HTML-u.
// Isti sadržaj, dva jezika zaglavlja — bez ikakvog uticaja na tekst zadataka.

import { describe, it, expect, vi } from 'vitest'

// RichBodyEditor je browser modul (TipTap + DOMParser); u Node testu nam treba
// samo prolaz kroz sanitizaciju, pa ga mokujemo umesto da uvodimo jsdom.
vi.mock('../client/src/components/RichBodyEditor.jsx', () => ({
  sanitizeBodyHtml: html => html || '',
  textToHtml: text => (text ? `<p>${text}</p>` : ''),
  htmlToText: html => String(html || '').replace(/<[^>]+>/g, ''),
}))

const { generatePublishHtml, todayStr } = await import('../client/src/lib/renderReleaseNoteHtml.js')

const tasks = [{
  id: '1', key: 'PP-1804',
  fields: { summary: 'Ulistavanje artikala', issuetype: { name: 'Story' }, issuelinks: [] },
}]
const edits = { 1: { name: 'Ulistavanje artikala', bodyHtml: '<p>Opis promene</p>' } }
const meta = { clientName: 'Slovenija', productName: 'Pricing Portal', date: '13. avgust 2026.' }

describe('jezik objave', () => {
  it('srpski je podrazumevan', () => {
    const html = generatePublishHtml(tasks, edits, { version: '4.7.3' }, meta)
    expect(html).toContain('<html lang="sr">')
    expect(html).toContain('PREGLED NOVIH FUNKCIONALNOSTI I ISPRAVKI')
    expect(html).toContain('>Klijent<')
    expect(html).toContain('>Verzija<')
    expect(html).toContain('>Datum<')
    expect(html).toContain('>Proizvod<')
  })

  it('engleski menja zaglavlje i labele', () => {
    const html = generatePublishHtml(tasks, edits, { version: '4.7.3', lang: 'en' }, meta)
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('OVERVIEW OF NEW FEATURES AND FIXES')
    expect(html).toContain('>Client<')
    expect(html).toContain('>Version<')
    expect(html).toContain('>Date<')
    expect(html).toContain('>Product<')
    // srpske labele ne smeju da ostanu
    expect(html).not.toContain('PREGLED NOVIH FUNKCIONALNOSTI')
    expect(html).not.toContain('>Klijent<')
  })

  it('sadržaj zadatka se ne dira pri promeni jezika', () => {
    const sr = generatePublishHtml(tasks, edits, { version: '1.0' }, meta)
    const en = generatePublishHtml(tasks, edits, { version: '1.0', lang: 'en' }, meta)
    for (const html of [sr, en]) {
      expect(html).toContain('Ulistavanje artikala')
      expect(html).toContain('Opis promene')
    }
  })

  it('prazna lista koristi poruku na izabranom jeziku', () => {
    expect(generatePublishHtml([], {}, {}, meta)).toContain('Nema taskova.')
    expect(generatePublishHtml([], {}, { lang: 'en' }, meta)).toContain('No items.')
  })

  it('todayStr formatira datum po jeziku', () => {
    expect(todayStr('sr')).toMatch(/\d{4}\.?$/)
    expect(todayStr('en')).toMatch(/\d{4}$/)
    expect(todayStr('en')).not.toEqual(todayStr('sr'))
  })
})
