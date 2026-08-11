import { useState } from 'react'
import Topbar from '../components/Topbar.jsx'
import { useT } from '../lang.jsx'

// ── Answer content helpers ─────────────────────────────────────────────────────

function AP({ children }) {
  return <p style={{ marginBottom: 10, fontSize: 14, color: 'var(--textMuted)', lineHeight: 1.7 }}>{children}</p>
}

function InfoBox({ type = 'blue', children }) {
  const colors = {
    blue:  { bg: 'var(--accentTint)', border: 'var(--accent)' },
    green: { bg: 'var(--greenTint)',  border: 'var(--green)' },
    amber: { bg: 'var(--amberTint)', border: 'var(--amber)' },
    red:   { bg: 'var(--redTint)',   border: 'var(--red)' },
  }
  const c = colors[type] || colors.blue
  return (
    <div style={{ borderLeft: `3px solid ${c.border}`, background: c.bg, borderRadius: 6, padding: '12px 16px', margin: '12px 0', fontSize: 14, color: 'var(--textMuted)', lineHeight: 1.6 }}>
      {children}
    </div>
  )
}

function UL({ children }) {
  return <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0' }}>{children}</ul>
}

function LI({ children }) {
  return (
    <li style={{ padding: '4px 0 4px 20px', position: 'relative', fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>
      <span style={{ position: 'absolute', left: 0, color: 'var(--accent)', fontSize: 11, top: 6, lineHeight: 1 }}>▸</span>
      {children}
    </li>
  )
}

function S({ children, color }) {
  return <span style={{ fontWeight: 600, color: color || 'var(--text)' }}>{children}</span>
}

function M({ children }) {
  return (
    <span style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13, color: 'var(--accent)', background: 'var(--accentTint)', padding: '1px 6px', borderRadius: 4 }}>
      {children}
    </span>
  )
}

function BdgRow({ children }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '10px 0' }}>{children}</div>
}

function Bdg({ c = 'gray', children }) {
  const map = {
    green: { bg: 'var(--greenTint)',  color: 'var(--green)',     border: '1px solid var(--green)' },
    blue:  { bg: 'var(--accentTint)', color: 'var(--accent)',    border: '1px solid var(--accent)' },
    amber: { bg: 'var(--amberTint)',  color: 'var(--amber)',     border: '1px solid var(--amber)' },
    red:   { bg: 'var(--redTint)',    color: 'var(--red)',       border: '1px solid var(--red)' },
    gray:  { bg: 'var(--surfaceAlt)', color: 'var(--textMuted)', border: '1px solid var(--border)' },
  }
  const s = map[c] || map.gray
  return (
    <span style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, padding: '3px 10px', borderRadius: 20, fontWeight: 500, background: s.bg, color: s.color, border: s.border }}>
      {children}
    </span>
  )
}

// ── Category SVG icons ─────────────────────────────────────────────────────────

function IconGrid() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={18} height={18}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
    </svg>
  )
}

function IconFolder() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={18} height={18}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
    </svg>
  )
}

function IconDoc() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={18} height={18}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  )
}

function IconDocPages() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={18} height={18}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
    </svg>
  )
}

function IconChat() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={18} height={18}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
    </svg>
  )
}

function IconUser() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={18} height={18}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  )
}

function IconLock() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={18} height={18}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  )
}

// ── Q&A Data ──────────────────────────────────────────────────────────────────

function getQaData(t) {
  return [
  {
    id: 'dashboard',
    label: t('qa2.cat.dashboard'),
    icon: <IconGrid />,
    iconBg: 'rgba(79,142,247,0.12)',
    iconColor: 'var(--accent)',
    questions: [
      {
        q: t('qa2.dash.q1.q'),
        text: 'tabovi projekata metrički kartica donut grafikon bar grafikon tabela taskova jira automatski pregled',
        a: (<>
          <AP>{t('qa2.dash.q1.intro')}</AP>
          <UL>
            <LI><S>{t('qa2.dash.q1.li1.s')}</S>{t('qa2.dash.q1.li1.t')}</LI>
            <LI><S>{t('qa2.dash.q1.li2.s')}</S>{t('qa2.dash.q1.li2.t')}</LI>
            <LI><S>{t('qa2.dash.q1.li3.s')}</S>{t('qa2.dash.q1.li3.t')}</LI>
            <LI><S>{t('qa2.dash.q1.li4.s')}</S>{t('qa2.dash.q1.li4.t')}</LI>
            <LI><S>{t('qa2.dash.q1.li5.s')}</S>{t('qa2.dash.q1.li5.t')}</LI>
          </UL>
          <InfoBox type="green">{t('qa2.dash.q1.info')}</InfoBox>
        </>),
      },
      {
        q: t('qa2.dash.q2.q'),
        text: 'ukupno taskova završeno in progress for grooming estimacija utrošeno razlika prekoračenja KPI indikator',
        a: (<UL>
          <LI><S>{t('qa2.dash.q2.li1.s')}</S>{t('qa2.dash.q2.li1.t')}</LI>
          <LI><S>{t('qa2.dash.q2.li2.s')}</S>{t('qa2.dash.q2.li2.t')}</LI>
          <LI><S>IN PROGRESS</S>{t('qa2.dash.q2.li3.t')}</LI>
          <LI><S>FOR GROOMING</S>{t('qa2.dash.q2.li4.t')}</LI>
          <LI><S>{t('qa2.dash.q2.li5.s')}</S>{t('qa2.dash.q2.li5.t')}</LI>
          <LI><S>{t('qa2.dash.q2.li6.s')}</S>{t('qa2.dash.q2.li6.t')}</LI>
          <LI><S>{t('qa2.dash.q2.li7.s')}</S>{t('qa2.dash.q2.li7.t')}</LI>
          <LI><S>{t('qa2.dash.q2.li8.s')}</S>{t('qa2.dash.q2.li8.t')}</LI>
        </UL>),
      },
      {
        q: t('qa2.dash.q3.q'),
        text: 'crvena boja prekoračenje estimacija 15% procenat pozadina progress bar ID ključ',
        a: (<>
          <AP>{t('qa2.dash.q3.intro.a')}<S>{t('qa2.dash.q3.intro.s')}</S>{t('qa2.dash.q3.intro.b')}</AP>
          <UL>
            <LI>{t('qa2.dash.q3.li1')}</LI>
            <LI>{t('qa2.dash.q3.li2')}</LI>
            <LI>{t('qa2.dash.q3.li3')}</LI>
            <LI>{t('qa2.dash.q3.li4')}</LI>
            <LI>{t('qa2.dash.q3.li5')}</LI>
          </UL>
          <InfoBox type="amber">{t('qa2.dash.q3.info')}</InfoBox>
        </>),
      },
      {
        q: t('qa2.dash.q4.q'),
        text: 'filter dugmadi pretraga search svi završeni in progress grooming prekoračenje kategorija tražiti',
        a: (<>
          <AP>{t('qa2.dash.q4.intro')}</AP>
          <BdgRow>
            <Bdg c="gray">{t('qa2.dash.q4.b1')}</Bdg>
            <Bdg c="green">{t('qa2.dash.q4.b2')}</Bdg>
            <Bdg c="blue">{t('qa2.dash.q4.b3')}</Bdg>
            <Bdg c="gray">{t('qa2.dash.q4.b4')}</Bdg>
            <Bdg c="red">{t('qa2.dash.q4.b5')}</Bdg>
          </BdgRow>
          <AP>{t('qa2.dash.q4.p2.a')}<S>{t('qa2.dash.q4.p2.s')}</S>{t('qa2.dash.q4.p2.b')}</AP>
        </>),
      },
      {
        q: t('qa2.dash.q5.q'),
        text: 'subtask expand klik razviti skupiti jira ključ komponenta status utrošeno uvučeni',
        a: (<AP>{t('qa2.dash.q5.a')}</AP>),
      },
      {
        q: t('qa2.dash.q6.q'),
        text: 'donut kružni grafikon segment status zelena žuta siva procenat završenosti progress bar vizuelno',
        a: (<>
          <AP>{t('qa2.dash.q6.intro')}</AP>
          <BdgRow>
            <Bdg c="green">{t('qa2.dash.q6.b1')}</Bdg>
            <Bdg c="amber">In Progress / Testing</Bdg>
            <Bdg c="gray">For Grooming / Todo</Bdg>
          </BdgRow>
          <AP>{t('qa2.dash.q6.p2.a')}<S>{t('qa2.dash.q6.p2.s')}</S>{t('qa2.dash.q6.p2.b')}</AP>
        </>),
      },
      {
        q: t('qa2.dash.q7.q'),
        text: 'bar grafikon stub estimirano utrošeno plavi zeleni crveni prekoračenje hover tooltip poređenje',
        a: (<>
          <AP>{t('qa2.dash.q7.p1.a')}<S>{t('qa2.dash.q7.p1.s')}</S>{t('qa2.dash.q7.p1.b')}</AP>
          <BdgRow>
            <Bdg c="blue">{t('qa2.dash.q7.b1')}</Bdg>
            <Bdg c="green">{t('qa2.dash.q7.b2')}</Bdg>
            <Bdg c="red">{t('qa2.dash.q7.b3')}</Bdg>
          </BdgRow>
          <AP>{t('qa2.dash.q7.p2.a')}<S>{t('qa2.dash.q7.p2.s')}</S>{t('qa2.dash.q7.p2.b')}</AP>
        </>),
      },
      {
        q: t('qa2.dash.q8.q'),
        text: 'osvežavanje refresh automatski ručno ikonica kružna strelica podešavanja vreme dnevno promena novi taskovi',
        a: (<>
          <AP>{t('qa2.dash.q8.intro')}</AP>
          <UL>
            <LI><S>{t('qa2.dash.q8.li1.s')}</S>{t('qa2.dash.q8.li1.t')}</LI>
            <LI><S>{t('qa2.dash.q8.li2.s')}</S>{t('qa2.dash.q8.li2.t')}</LI>
          </UL>
          <InfoBox>{t('qa2.dash.q8.info')}</InfoBox>
        </>),
      },
      {
        q: t('qa2.dash.q9.q'),
        text: 'progress bar zeleni žuti sivi trobojan vizuelno procenat završenosti legenda header',
        a: (<>
          <AP>{t('qa2.dash.q9.p1.a')}<S>{t('qa2.dash.q9.p1.s')}</S>{t('qa2.dash.q9.p1.b')}</AP>
          <UL>
            <LI><span style={{ fontWeight: 600, color: 'var(--green)' }}>{t('qa2.dash.q9.li1.s')}</span>{t('qa2.dash.q9.li1.t')}</LI>
            <LI><span style={{ fontWeight: 600, color: 'var(--amber)' }}>{t('qa2.dash.q9.li2.s')}</span>{t('qa2.dash.q9.li2.t')}</LI>
            <LI><S>{t('qa2.dash.q9.li3.s')}</S>{t('qa2.dash.q9.li3.t')}</LI>
          </UL>
          <AP>{t('qa2.dash.q9.p2')}</AP>
        </>),
      },
    ],
  },

  {
    id: 'projekti',
    label: t('qa2.cat.projekti'),
    icon: <IconFolder />,
    iconBg: 'rgba(34,197,94,0.12)',
    iconColor: 'var(--green)',
    questions: [
      {
        q: t('qa2.prj.q1.q'),
        text: 'ne vidim projekat pristup administrator arhiviran kreiran vidljivost',
        a: (<>
          <AP>{t('qa2.prj.q1.intro')}</AP>
          <UL>
            <LI>{t('qa2.prj.q1.li1')}</LI>
            <LI>{t('qa2.prj.q1.li2')}</LI>
            <LI>{t('qa2.prj.q1.li3')}</LI>
          </UL>
          <InfoBox type="amber">{t('qa2.prj.q1.info')}</InfoBox>
        </>),
      },
      {
        q: t('qa2.prj.q2.q'),
        text: 'zelena žuta siva tačka tab status aktivan pauziran završen jira epic',
        a: (<>
          <BdgRow>
            <Bdg c="green">{t('qa2.prj.q2.b1')}</Bdg>
            <Bdg c="amber">{t('qa2.prj.q2.b2')}</Bdg>
            <Bdg c="gray">{t('qa2.prj.q2.b3')}</Bdg>
          </BdgRow>
          <AP>{t('qa2.prj.q2.p')}</AP>
        </>),
      },
      {
        q: t('qa2.prj.q3.q'),
        text: 'keširano keširanje realtime osvežavanje razlike prethodni podaci performanse brzina',
        a: (<AP>{t('qa2.prj.q3.a')}<S>{t('qa2.prj.q3.s')}</S>{t('qa2.prj.q3.b')}</AP>),
      },
      {
        q: t('qa2.prj.q4.q'),
        text: 'faze phases milestone etape isporuke boja napredak administrator backend frontend',
        a: (<>
          <AP>{t('qa2.prj.q4.p1')}</AP>
          <AP>{t('qa2.prj.q4.p2')}</AP>
        </>),
      },
      {
        q: t('qa2.prj.q5.q'),
        text: 'lista taskova bez filtera svi pretraga naziv pronađi',
        a: (<AP>{t('qa2.prj.q5.a')}<Bdg c="gray">{t('table.filter.all')}</Bdg>{t('qa2.prj.q5.b')}</AP>),
      },
    ],
  },

  {
    id: 'release',
    label: 'Release Notes',
    icon: <IconDoc />,
    iconBg: 'rgba(20,184,166,0.12)',
    iconColor: '#14B8A6',
    questions: [
      {
        q: t('qa2.rel.q1.q'),
        text: 'release notes formalna obaveštenja funkcionalnosti ispravke greške promene verzija klijent',
        a: (<>
          <AP>{t('qa2.rel.q1.a')}<S>Release Notes</S>{t('qa2.rel.q1.b')}</AP>
          <InfoBox>{t('qa2.rel.q1.info')}</InfoBox>
        </>),
      },
      {
        q: t('qa2.rel.q2.q'),
        text: 'pristup navigaciona traka lista datum direktan link email token bez prijavljivanja otvoriti',
        a: (<>
          <AP>{t('qa2.rel.q2.p1.a')}<S>Release Notes</S>{t('qa2.rel.q2.p1.b')}</AP>
          <AP>{t('qa2.rel.q2.p2.a')}<S>{t('qa2.rel.q2.p2.s')}</S>{t('qa2.rel.q2.p2.b')}</AP>
        </>),
      },
      {
        q: t('qa2.rel.q3.q'),
        text: 'nove funkcionalnosti ispravke greške poboljšanja performansi tehničke promene datum isporuke sadržaj',
        a: (<>
          <AP>{t('qa2.rel.q3.intro')}</AP>
          <UL>
            <LI><S>{t('qa2.rel.q3.li1.s')}</S>{t('qa2.rel.q3.li1.t')}</LI>
            <LI><S>{t('qa2.rel.q3.li2.s')}</S>{t('qa2.rel.q3.li2.t')}</LI>
            <LI><S>{t('qa2.rel.q3.li3.s')}</S>{t('qa2.rel.q3.li3.t')}</LI>
            <LI><S>{t('qa2.rel.q3.li4.s')}</S>{t('qa2.rel.q3.li4.t')}</LI>
            <LI><S>{t('qa2.rel.q3.li5.s')}</S>{t('qa2.rel.q3.li5.t')}</LI>
          </UL>
        </>),
      },
      {
        q: t('qa2.rel.q4.q'),
        text: 'released status produkcija primenjeno draft vidljivo objavljen',
        a: (<>
          <BdgRow><Bdg c="green">Released</Bdg></BdgRow>
          <AP>{t('qa2.rel.q4.a')}</AP>
        </>),
      },
      {
        q: t('qa2.rel.q5.q'),
        text: 'javni link token bez naloga podeliti email jedinstven siguran pristup bez registracije',
        a: (<AP>{t('qa2.rel.q5.a')}<S>{t('qa2.rel.q5.s')}</S>{t('qa2.rel.q5.b')}</AP>),
      },
    ],
  },

  {
    id: 'dokumenta',
    label: t('docs.title'),
    icon: <IconDocPages />,
    iconBg: 'rgba(245,158,11,0.12)',
    iconColor: 'var(--amber)',
    questions: [
      {
        q: t('qa2.doc.q1.q'),
        text: 'dokumenti deljeni sekcije folderi projektna dokumentacija specifikacije izveštaji ugovori klijent vidljivost',
        a: (<>
          <AP>{t('qa2.doc.q1.a')}<S>{t('qa2.doc.q1.s')}</S>{t('qa2.doc.q1.b')}</AP>
          <InfoBox type="green">{t('qa2.doc.q1.info')}</InfoBox>
        </>),
      },
      {
        q: t('qa2.doc.q2.q'),
        text: 'preuzimanje download ikonica fajl računar prijavljivanje PDF',
        a: (<AP>{t('qa2.doc.q2.a')}<S>{t('qa2.doc.q2.s')}</S>{t('qa2.doc.q2.b')}</AP>),
      },
      {
        q: t('qa2.doc.q3.q'),
        text: 'PDF thumbnail pregled stranica browser preuzimanje prikaz miniatura',
        a: (<AP>{t('qa2.doc.q3.a')}<S>{t('qa2.doc.q3.s')}</S>{t('qa2.doc.q3.b')}</AP>),
      },
      {
        q: t('qa2.doc.q4.q'),
        text: 'ne vidim dokument pristup administrator sekcija osvežiti F5 poslat',
        a: (<>
          <AP>{t('qa2.doc.q4.intro')}</AP>
          <UL>
            <LI>{t('qa2.doc.q4.li1')}</LI>
            <LI>{t('qa2.doc.q4.li2')}</LI>
            <LI>{t('qa2.doc.q4.li3')}</LI>
          </UL>
        </>),
      },
    ],
  },

  {
    id: 'poruke',
    label: t('qa2.cat.poruke'),
    icon: <IconChat />,
    iconBg: 'rgba(168,85,247,0.12)',
    iconColor: '#A855F7',
    questions: [
      {
        q: t('qa2.msg.q1.q'),
        text: 'nova poruka notifikacija zvono crvena tačka nepročitane 60 sekundi automatski provera',
        a: (<>
          <AP>{t('qa2.msg.q1.a')}<S>{t('qa2.msg.q1.s')}</S>{t('qa2.msg.q1.b')}</AP>
          <InfoBox>{t('qa2.msg.q1.info')}</InfoBox>
        </>),
      },
      {
        q: t('qa2.msg.q2.q'),
        text: 'klijent vidljivost privatnost direktno sve korisnici izolacija drugi',
        a: (<>
          <AP>{t('qa2.msg.q2.intro')}</AP>
          <UL>
            <LI>{t('qa2.msg.q2.li1.t')}<S>{t('qa2.msg.q2.li1.s')}</S></LI>
            <LI>{t('qa2.msg.q2.li2.a')}<S>{t('qa2.msg.q2.li2.s')}</S>{t('qa2.msg.q2.li2.b')}</LI>
          </UL>
          <InfoBox type="green">{t('qa2.msg.q2.info')}</InfoBox>
        </>),
      },
      {
        q: t('qa2.msg.q3.q'),
        text: 'slanje poruke jira task ključ hover ikona forma automatski naziv konverzacija tema',
        a: (<>
          <AP>{t('qa2.common.twoWays')}</AP>
          <UL>
            <LI><S>{t('qa2.msg.q3.li1.s')}</S>{t('qa2.msg.q3.li1.t')}</LI>
            <LI><S>{t('qa2.msg.q3.li2.s')}</S>{t('qa2.msg.q3.li2.a')}<M>KNJAZ-101</M>{t('qa2.msg.q3.li2.b')}</LI>
          </UL>
          <AP>{t('qa2.msg.q3.p2')}</AP>
        </>),
      },
      {
        q: t('qa2.msg.q4.q'),
        text: 'odgovor reply konverzacija levi panel desni panel pošalji hronološki',
        a: (<AP>{t('qa2.msg.q4.a')}</AP>),
      },
      {
        q: t('qa2.msg.q5.q'),
        text: 'konverzacije projekat tema leva strana lista organizacija jira task generalna panel',
        a: (<AP>{t('qa2.msg.q5.a')}<S>{t('qa2.msg.q5.s')}</S>{t('qa2.msg.q5.b')}</AP>),
      },
      {
        q: t('qa2.msg.q6.q'),
        text: 'ne mogu da vidim projekat pristup administrator arhiviran lista poruke',
        a: (<AP>{t('qa2.msg.q6.a')}</AP>),
      },
    ],
  },

  {
    id: 'nalog',
    label: t('qa2.cat.nalog'),
    icon: <IconUser />,
    iconBg: 'rgba(107,114,128,0.12)',
    iconColor: 'var(--textMuted)',
    questions: [
      {
        q: t('qa2.acc.q1.q'),
        text: 'promena lozinke avatar podešavanja profil stara nova sačuvaj dropdown',
        a: (<ol style={{ paddingLeft: 20, color: 'var(--text)', fontSize: 14, lineHeight: 1.9, margin: '4px 0' }}>
          <li>{t('qa2.acc.q1.li1')}</li>
          <li>{t('qa2.acc.q1.li2.a')}<S>{t('topbar.settings')}</S>{t('qa2.acc.q1.li2.b')}</li>
          <li>{t('qa2.acc.q1.li3.a')}<S>{t('settings.tab.profile')}</S>{t('qa2.acc.q1.li3.b')}</li>
          <li>{t('qa2.acc.q1.li4')}</li>
          <li>{t('qa2.acc.q1.li5.a')}<S>{t('settings.jira.save')}</S></li>
        </ol>),
      },
      {
        q: t('qa2.acc.q2.q'),
        text: 'tema tamna svetla sistemska toggle ikonica navigacija podešavanja tab sunce mesec',
        a: (<>
          <AP>{t('qa2.common.twoWays')}</AP>
          <UL>
            <LI><S>{t('qa2.acc.q2.li1.s')}</S>{t('qa2.acc.q2.li1.t')}</LI>
            <LI><S>{t('qa2.acc.q2.li2.s')}</S>{t('qa2.acc.q2.li2.t')}</LI>
          </UL>
          <AP>{t('qa2.acc.q2.p2')}</AP>
        </>),
      },
      {
        q: t('qa2.acc.q3.q'),
        text: 'zaboravljena lozinka reset email administrator privremena samoreset',
        a: (<AP>{t('qa2.acc.q3.a')}<S>{t('qa2.acc.q3.s')}</S>{t('qa2.acc.q3.b')}</AP>),
      },
      {
        q: t('qa2.acc.q4.q'),
        text: 'sesija 7 dana jwt token istekne sigurnost kredencijali prijaviti',
        a: (<AP>{t('qa2.acc.q4.a')}<S>{t('qa2.acc.q4.s')}</S>{t('qa2.acc.q4.b')}</AP>),
      },
      {
        q: t('qa2.acc.q5.q'),
        text: 'odjava logout avatar meni navigaciona traka preusmeriti login',
        a: (<AP>{t('qa2.acc.q5.a')}<S>{t('topbar.logout')}</S>{t('qa2.acc.q5.b')}</AP>),
      },
      {
        q: t('qa2.acc.q6.q'),
        text: 'jezik srpski engleski prevod interfejs podešavanja tab tema odmah',
        a: (<AP>{t('qa2.acc.q6.a')}</AP>),
      },
    ],
  },

  {
    id: 'sigurnost',
    label: t('qa2.cat.sigurnost'),
    icon: <IconLock />,
    iconBg: 'rgba(239,68,68,0.10)',
    iconColor: 'var(--red)',
    questions: [
      {
        q: t('qa2.sec.q1.q'),
        text: 'sigurnost bezbednost lozinka hash bcrypt api token enkriptovan AES JWT sesija rate limiting zaštita',
        a: (<>
          <AP>{t('qa2.sec.q1.intro')}</AP>
          <UL>
            <LI><S>{t('qa2.sec.q1.li1.s')}</S>{t('qa2.sec.q1.li1.t')}</LI>
            <LI><S>{t('qa2.sec.q1.li2.s')}</S>{t('qa2.sec.q1.li2.t')}</LI>
            <LI><S>{t('qa2.sec.q1.li3.s')}</S>{t('qa2.sec.q1.li3.t')}</LI>
            <LI><S>{t('qa2.sec.q1.li4.s')}</S>{t('qa2.sec.q1.li4.t')}</LI>
            <LI><S>Rate limiting</S>{t('qa2.sec.q1.li5.t')}</LI>
          </UL>
        </>),
      },
      {
        q: t('qa2.sec.q2.q'),
        text: 'privatnost izolacija projekti poruke release notes dokumenti drugi klijenti striktna',
        a: (<>
          <AP>{t('qa2.sec.q2.a')}<S>{t('qa2.sec.q2.s')}</S>{t('qa2.sec.q2.b')}</AP>
          <UL>
            <LI>{t('qa2.sec.q2.li1')}</LI>
            <LI>{t('qa2.sec.q2.li2')}</LI>
            <LI>{t('qa2.sec.q2.li3')}</LI>
            <LI>{t('qa2.sec.q2.li4')}</LI>
          </UL>
        </>),
      },
      {
        q: t('qa2.sec.q3.q'),
        text: 'sesija istekne 7 dana login stranica preusmereni email lozinka sigurnosna mera',
        a: (<AP>{t('qa2.sec.q3.a')}</AP>),
      },
      {
        q: t('qa2.sec.q4.q'),
        text: 'više uređaja kompjuter laptop tablet telefon responsive sesija istovremeno nezavisno',
        a: (<AP>{t('qa2.sec.q4.a')}</AP>),
      },
    ],
  },
  ]
}

// ── QAItem ────────────────────────────────────────────────────────────────────

function QAItem({ q, a, isOpen, onToggle }) {
  const [hover, setHover] = useState(false)
  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${isOpen ? 'var(--accent)' : 'var(--border)'}`,
      borderRadius: 12,
      marginBottom: 8,
      overflow: 'hidden',
      transition: 'border-color 0.2s ease',
    }}>
      <div
        role="button"
        onClick={onToggle}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          padding: '16px 20px',
          cursor: 'pointer',
          userSelect: 'none',
          background: isOpen ? 'var(--accentTint)' : hover ? 'var(--surfaceAlt)' : 'transparent',
          transition: 'background 0.2s ease',
        }}
      >
        <span style={{ fontFamily: "'Hanken Grotesk', -apple-system, sans-serif", fontSize: 14, fontWeight: 500, color: isOpen ? 'var(--accent)' : 'var(--text)', lineHeight: 1.4 }}>
          {q}
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
          width={16} height={16}
          style={{ flexShrink: 0, color: 'var(--textMuted)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s ease' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </div>
      <div style={{ maxHeight: isOpen ? 2000 : 0, overflow: 'hidden', transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1)' }}>
        <div style={{ padding: '18px 20px 20px', borderTop: '1px solid var(--border)' }}>
          {a}
        </div>
      </div>
    </div>
  )
}

// ── CategorySection ───────────────────────────────────────────────────────────

function CategorySection({ category, visibleQuestions, openId, setOpenId, t }) {
  return (
    <div style={{ marginBottom: 48 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0, background: category.iconBg, color: category.iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {category.icon}
        </div>
        <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>
          {category.label}
        </span>
        <span style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, color: 'var(--textMuted)', background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 12, padding: '2px 8px', marginLeft: 'auto' }}>
          {t('qa2.category.count', { n: visibleQuestions.length })}
        </span>
      </div>
      {visibleQuestions.map(item => (
        <QAItem
          key={item.uid}
          q={item.q}
          a={item.a}
          isOpen={openId === item.uid}
          onToggle={() => setOpenId(prev => prev === item.uid ? null : item.uid)}
        />
      ))}
    </div>
  )
}

// ── Pill ─────────────────────────────────────────────────────────────────────

function Pill({ label, count, active, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: active ? 'var(--accent)' : hover ? 'var(--accentTint)' : 'var(--surface)',
        border: `1px solid ${active ? 'var(--accent)' : hover ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 20,
        padding: '6px 16px',
        color: active ? '#fff' : hover ? 'var(--accent)' : 'var(--textMuted)',
        cursor: 'pointer',
        fontFamily: "'Hanken Grotesk', -apple-system, sans-serif",
        fontSize: 13,
        fontWeight: 500,
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {label}
      <span style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, opacity: active ? 0.9 : 0.7 }}>
        {count}
      </span>
    </button>
  )
}

// ── QAPage ────────────────────────────────────────────────────────────────────

export default function QAPage({
  user, theme, onLogout,
  onGoToDashboard, onGoToDocuments, onGoToReleaseNotes, onGoToReleaseNotesEditor,
  onGoToMessages, onGoToQA, onGoToAiUsage, onOpenSettings, onOpenUsers, onOpenChat,
  projects = [],
}) {
  const t = useT()
  const [openId, setOpenId] = useState(null)
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState('all')
  const [searchFocused, setSearchFocused] = useState(false)

  const messagesAction = onGoToMessages || onOpenChat

  const QA_DATA = getQaData(t)
  const QA_DATA_STABLE = QA_DATA.map(cat => ({
    ...cat,
    questions: cat.questions.map((q, qi) => ({ ...q, uid: `${cat.id}-${qi}` })),
  }))

  const totalAll = QA_DATA_STABLE.reduce((s, c) => s + c.questions.length, 0)

  const filtered = QA_DATA_STABLE.map(cat => ({
    ...cat,
    questions: cat.questions.filter(item => {
      if (activeCat !== 'all' && activeCat !== cat.id) return false
      if (!search.trim()) return true
      const s = search.toLowerCase().trim()
      return item.q.toLowerCase().includes(s) || item.text.toLowerCase().includes(s)
    }),
  })).filter(cat => cat.questions.length > 0)

  const pills = [
    { id: 'all', label: t('qa2.pill.all'), count: totalAll },
    ...QA_DATA_STABLE.map(c => ({ id: c.id, label: c.label, count: c.questions.length })),
  ]

  function handleSearch(val) {
    setSearch(val)
    setOpenId(null)
  }

  function handleCat(id) {
    setActiveCat(id)
    setOpenId(null)
  }

  return (
    <div className="page-in" style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Topbar
        user={user}
        theme={theme}
        currentPage="qa"
        onLogout={onLogout}
        onGoToDashboard={onGoToDashboard}
        onGoToReleaseNotes={onGoToReleaseNotes}
        onGoToReleaseNotesEditor={onGoToReleaseNotesEditor}
        onGoToDocuments={onGoToDocuments}
        onGoToMessages={messagesAction}
        onGoToQA={onGoToQA}
        onGoToAiUsage={onGoToAiUsage}
        onOpenSettings={onOpenSettings}
        onOpenUsers={onOpenUsers}
        projects={projects}
      />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontFamily: 'Hanken Grotesk', fontWeight: 800, fontSize: 32, color: 'var(--text)', marginBottom: 12 }}>
            {t('qa2.page.title')}
          </h1>
          <p style={{ color: 'var(--textMuted)', fontSize: 15, fontFamily: "'Hanken Grotesk', -apple-system, sans-serif", lineHeight: 1.6 }}>
            {t('qa2.page.subtitle')}
          </p>
        </div>

        {/* Search */}
        <div style={{ maxWidth: 600, margin: '0 auto 32px', position: 'relative' }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
            width={18} height={18}
            style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--textMuted)', pointerEvents: 'none' }}
          >
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder={t('qa2.search.placeholder')}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={{
              width: '100%',
              background: 'var(--bg)',
              border: `1px solid ${searchFocused ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 12,
              padding: '12px 20px 12px 44px',
              color: 'var(--text)',
              fontFamily: "'Hanken Grotesk', -apple-system, sans-serif",
              fontSize: 15,
              outline: 'none',
              transition: 'border-color 0.2s ease',
            }}
          />
        </div>

        {/* Category pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 40, overflowX: 'auto', padding: '0 4px' }}>
          {pills.map(pill => (
            <Pill
              key={pill.id}
              label={pill.label}
              count={pill.count}
              active={activeCat === pill.id}
              onClick={() => handleCat(pill.id)}
            />
          ))}
        </div>

        {/* Content */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 32px', color: 'var(--textMuted)' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--surfaceAlt)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={24} height={24}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 15.803m10.607 0A7.5 7.5 0 0 1 5.196 15.803" />
              </svg>
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>{t('qa2.empty.title')}</p>
            <p style={{ fontSize: 13 }}>{t('qa2.empty.sub')}</p>
          </div>
        ) : (
          filtered.map(cat => (
            <CategorySection
              key={cat.id}
              category={cat}
              visibleQuestions={cat.questions}
              openId={openId}
              setOpenId={setOpenId}
              t={t}
            />
          ))
        )}

      </div>
    </div>
  )
}
