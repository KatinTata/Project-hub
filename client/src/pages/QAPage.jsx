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
    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: 'var(--accent)', background: 'var(--accentTint)', padding: '1px 6px', borderRadius: 4 }}>
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
    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, padding: '3px 10px', borderRadius: 20, fontWeight: 500, background: s.bg, color: s.color, border: s.border }}>
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

const QA_DATA = [
  {
    id: 'dashboard',
    label: 'Dashboard i praćenje projekata',
    icon: <IconGrid />,
    iconBg: 'rgba(79,142,247,0.12)',
    iconColor: 'var(--accent)',
    questions: [
      {
        q: 'Šta vidim na glavnoj stranici (Dashboard) i šta mi sve prikazuje?',
        text: 'tabovi projekata metrički kartica donut grafikon bar grafikon tabela taskova jira automatski pregled',
        a: (<>
          <AP>Dashboard je centralna komandna tabla sa kompletnim pregledom vaših projekata. Čim se ulogujete, vidite:</AP>
          <UL>
            <LI><S>Tabove projekata</S> — lista svih projekata kojima imate pristup u horizontalnom redu na vrhu</LI>
            <LI><S>8 metričkih kartica</S> — ključni pokazatelji performansi: ukupan broj taskova, završeni, in progress, for grooming, estimacija u satima, utrošeno, razlika i prekoračenja</LI>
            <LI><S>Donut grafikon</S> — vizuelna distribucija taskova po statusu (zelena=završeno, žuta=u toku, siva=planiranje)</LI>
            <LI><S>Bar grafikon</S> — poređenje estimacije i utrošenog vremena po taskovima</LI>
            <LI><S>Tabela taskova</S> — kompletna lista svih taskova sa filterima i pretragom</LI>
          </UL>
          <InfoBox type="green">Svi podaci se automatski povlače iz Jire — ne morate ništa ručno unositi.</InfoBox>
        </>),
      },
      {
        q: 'Šta tačno znači svaka od 8 metričkih kartica?',
        text: 'ukupno taskova završeno in progress for grooming estimacija utrošeno razlika prekoračenja KPI indikator',
        a: (<UL>
          <LI><S>UKUPNO TASKOVA</S> — ukupan broj roditeljskih taskova i subtaskova koji se prate za ovaj projekat</LI>
          <LI><S>ZAVRŠENO</S> — taskovi u statusu Resolved, Closed ili Done, sa procentom od ukupnog broja</LI>
          <LI><S>IN PROGRESS</S> — taskovi koji su trenutno aktivno u razvoju ili testiranju</LI>
          <LI><S>FOR GROOMING</S> — taskovi koji još čekaju planiranje i estimaciju; visok broj znači puno neplanirane budućnosti</LI>
          <LI><S>ESTIMACIJA</S> — ukupno originalno procenjeno vreme za sve taskove u satima</LI>
          <LI><S>UTROŠENO</S> — ukupno logovano vreme rada u satima (direktno iz Jire)</LI>
          <LI><S>RAZLIKA</S> — razlika između estimacije i utrošenog. Zelena boja i negativan broj su dobra stvar (radimo unutar procene), crvena boja znači prekoračenje</LI>
          <LI><S>PREKORAČENJA</S> — broj taskova koji su prekoračili estimaciju za više od 15%. Trebalo bi da bude 0 ili što manji</LI>
        </UL>),
      },
      {
        q: 'Šta znači crvena boja na nekom tasku u tabeli?',
        text: 'crvena boja prekoračenje estimacija 15% procenat pozadina progress bar ID ključ',
        a: (<>
          <AP>Crvena boja na tasku znači da je taj task <S>prekoračio originalnu estimaciju za više od 15%</S>. Konkretno vidite:</AP>
          <UL>
            <LI>Crvenu pozadinu celog reda taska</LI>
            <LI>Crvenu boju Jira ključa (ID) taska</LI>
            <LI>Procenat prekoračenja ispod ključa (npr. "+87% prekoračenje")</LI>
            <LI>Crveni progress bar u koloni Napredak</LI>
            <LI>Crvenu vrednost u koloni Utrošeno</LI>
          </UL>
          <InfoBox type="amber">Prekoračeni taskovi se prikazuju i u crvenom baneru iznad tabele, kao i u KPI kartici "PREKORAČENJA".</InfoBox>
        </>),
      },
      {
        q: 'Kako mogu da filtriram taskove u tabeli?',
        text: 'filter dugmadi pretraga search svi završeni in progress grooming prekoračenje kategorija tražiti',
        a: (<>
          <AP>Iznad tabele taskova se nalaze filter dugmadi sa brojevima:</AP>
          <BdgRow>
            <Bdg c="gray">Svi (48)</Bdg>
            <Bdg c="green">Završeni (20)</Bdg>
            <Bdg c="blue">In Progress (4)</Bdg>
            <Bdg c="gray">Grooming (24)</Bdg>
            <Bdg c="red">Prekoračenje (3)</Bdg>
          </BdgRow>
          <AP>Klik na bilo koji filter prikazuje samo taskove te kategorije. Filter "Prekoračenje" je posebno koristan za fokusiranje na problematične taskove. Pored filtera, na desnoj strani je <S>polje za pretragu</S> koje filtrira taskove po nazivu u realnom vremenu dok kucate.</AP>
        </>),
      },
      {
        q: 'Kako da vidim subtaskove određenog taska?',
        text: 'subtask expand klik razviti skupiti jira ključ komponenta status utrošeno uvučeni',
        a: (<AP>Kliknite na bilo koji red u tabeli taskova. Red će se razviti i prikazati sve subtaskove tog taska, uvučene sa manjim fontom. Za svaki subtask vidite: Jira ključ, komponentu, naziv, status i utrošeno vreme. Ponovnim klikom na red skupljate subtaskove.</AP>),
      },
      {
        q: 'Šta je donut grafikon i kako ga čitam?',
        text: 'donut kružni grafikon segment status zelena žuta siva procenat završenosti progress bar vizuelno',
        a: (<>
          <AP>Donut (kružni) grafikon prikazuje vizuelnu raspodelu svih taskova po statusu. Svaki segment ima boju:</AP>
          <BdgRow>
            <Bdg c="green">Završeno</Bdg>
            <Bdg c="amber">In Progress / Testing</Bdg>
            <Bdg c="gray">For Grooming / Todo</Bdg>
          </BdgRow>
          <AP>Broj u centru grafika je <S>procenat završenosti</S> projekta. Ispod grafika nalaze se tri progress bara sa tačnim brojevima: koliko taskova je u kojoj kategoriji od ukupnog.</AP>
        </>),
      },
      {
        q: 'Šta mi prikazuje stubičasti (bar) grafikon i šta znači kada su stubovi crveni?',
        text: 'bar grafikon stub estimirano utrošeno plavi zeleni crveni prekoračenje hover tooltip poređenje',
        a: (<>
          <AP>Bar grafikon prikazuje poređenje <S>estimiranog i utrošenog vremena</S> za 12 taskova sa najvećom estimacijom:</AP>
          <BdgRow>
            <Bdg c="blue">Plavi stub — Estimirano vreme</Bdg>
            <Bdg c="green">Zeleni stub — Utrošeno (OK)</Bdg>
            <Bdg c="red">Crveni stub — Utrošeno (prekoračenje)</Bdg>
          </BdgRow>
          <AP>Kada je stub utrošenog vremena <S>viši od plavog stuba estimacije</S> i crvene boje — task je prekoračio procenu. Pređite mišem (hover) preko bilo kog stuba da vidite tooltip sa detaljima: ključ taska, estimirano, utrošeno i razlika.</AP>
        </>),
      },
      {
        q: 'Koliko se često osvežavaju podaci sa Jire?',
        text: 'osvežavanje refresh automatski ručno ikonica kružna strelica podešavanja vreme dnevno promena novi taskovi',
        a: (<>
          <AP>Podaci se osvežavaju na dva načina:</AP>
          <UL>
            <LI><S>Ručno</S> — klikom na ikonicu osvežavanja na desnoj strani header-a projekta (kružna strelica)</LI>
            <LI><S>Automatski</S> — administrator može da podesi vreme dnevnog automatskog osvežavanja u Podešavanjima (npr. "09:00" — platforma svaki dan u 9h automatski povlači nove podatke)</LI>
          </UL>
          <InfoBox>Platforma pamti prethodne podatke i prikazuje vam šta se promenilo od poslednjeg osvežavanja: novi taskovi, promene statusa, promene estimacije.</InfoBox>
        </>),
      },
      {
        q: 'Šta je progress bar na vrhu projekta i kako da ga čitam?',
        text: 'progress bar zeleni žuti sivi trobojan vizuelno procenat završenosti legenda header',
        a: (<>
          <AP>Horizontalni progress bar ispod naslova projekta prikazuje <S>ukupan napredak projekta vizuelno u jednoj liniji</S>. Bar je trobojan:</AP>
          <UL>
            <LI><span style={{ fontWeight: 600, color: 'var(--green)' }}>Zeleni deo</span> — procenat završenih taskova</LI>
            <LI><span style={{ fontWeight: 600, color: 'var(--amber)' }}>Žuti deo</span> — procenat taskova u toku (in progress)</LI>
            <LI><S>Sivi deo</S> — preostali taskovi (grooming/todo)</LI>
          </UL>
          <AP>Broj sa desne strane prikazuje ukupni procenat završenosti (zeleni + žuti deo). Ispod bara je legenda sa tačnim brojevima.</AP>
        </>),
      },
    ],
  },

  {
    id: 'projekti',
    label: 'Projekti i Jira integracija',
    icon: <IconFolder />,
    iconBg: 'rgba(34,197,94,0.12)',
    iconColor: 'var(--green)',
    questions: [
      {
        q: 'Zašto ne vidim projekat koji bi trebalo da postoji?',
        text: 'ne vidim projekat pristup administrator arhiviran kreiran vidljivost',
        a: (<>
          <AP>Moguće je da:</AP>
          <UL>
            <LI>Administrator još nije dodelio vama pristup tom projektu — kontaktirajte ga</LI>
            <LI>Projekat je arhiviran (privremeno sakriven)</LI>
            <LI>Projekat još nije kreiran u sistemu</LI>
          </UL>
          <InfoBox type="amber">Klijenti vide samo projekte koji su im eksplicitno dodeljeni. Administrator kontroliše vidljivost.</InfoBox>
        </>),
      },
      {
        q: 'Šta znači status projekta (zelena / žuta tačka na tabu)?',
        text: 'zelena žuta siva tačka tab status aktivan pauziran završen jira epic',
        a: (<>
          <BdgRow>
            <Bdg c="green">Zelena — Aktivan projekat, u toku</Bdg>
            <Bdg c="amber">Žuta — Projekat je pauziran</Bdg>
            <Bdg c="gray">Siva — Projekat je završen</Bdg>
          </BdgRow>
          <AP>Status se određuje na osnovu statusa Jira epica i taskova unutar projekta.</AP>
        </>),
      },
      {
        q: 'Da li vidim Jira podatke u realnom vremenu ili su keširani?',
        text: 'keširano keširanje realtime osvežavanje razlike prethodni podaci performanse brzina',
        a: (<AP>Podaci se <S>keširaju</S> radi brzine i performansi. Pri svakom osvežavanju (ručnom ili automatskom), platforma povlači najsvežije podatke iz Jire i prikazuje razlike od prethodnog osvežavanja. Između osvežavanja prikazuju se poslednji preuzeti podaci.</AP>),
      },
      {
        q: 'Šta su Faze projekta i kako ih koristim?',
        text: 'faze phases milestone etape isporuke boja napredak administrator backend frontend',
        a: (<>
          <AP>Faze (Phases) su opcioni milestone-ovi koji grupišu taskove u logičke etape isporuke (npr. "Faza 1 — Backend", "Faza 2 — Frontend"). Svaka faza ima boju i prikazuje napredak u okviru te etape.</AP>
          <AP>Upravljanje fazama je u nadležnosti administratora. Klijenti mogu videti faze ako je to administrator konfigurisao.</AP>
        </>),
      },
      {
        q: 'Mogu li da pregledam listu svih taskova bez filtera?',
        text: 'lista taskova bez filtera svi pretraga naziv pronađi',
        a: (<AP>Da. U tabeli taskova kliknite na filter <Bdg c="gray">Svi</Bdg> (prvi filter s leva) da vidite sve taskove bez ograničenja. Možete koristiti polje za pretragu da brzo pronađete specifičan task po nazivu ili delu naziva.</AP>),
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
        q: 'Šta su Release Notes i kada se pojavljuju?',
        text: 'release notes formalna obaveštenja funkcionalnosti ispravke greške promene verzija klijent',
        a: (<>
          <AP>Release Notes su formalna obaveštenja o novim funkcionalnostima, ispravkama grešaka i promenama u sistemu koji tim isporučuje. Prikazuju se u modulu <S>Release Notes</S> u navigacionoj traci.</AP>
          <InfoBox>Vidite samo release notes koji su vam eksplicitno dodeljeni — svaki klijent vidi samo svoje relevantne informacije.</InfoBox>
        </>),
      },
      {
        q: 'Kako da pristupim mojim Release Notes?',
        text: 'pristup navigaciona traka lista datum direktan link email token bez prijavljivanja otvoriti',
        a: (<>
          <AP>Kliknite na <S>Release Notes</S> u navigacionoj traci. Vidite listu svih release notes koji su vam dodeljeni, sortirane po datumu. Klik na bilo koji release notes otvara detaljan prikaz sadržaja.</AP>
          <AP>Administrator vam može poslati i <S>direktan link</S> na release notes putem emaila — u tom slučaju možete pročitati sadržaj i bez prijavljivanja na platformu.</AP>
        </>),
      },
      {
        q: 'Koje informacije obično sadrže Release Notes?',
        text: 'nove funkcionalnosti ispravke greške poboljšanja performansi tehničke promene datum isporuke sadržaj',
        a: (<>
          <AP>Release notes tipično sadrže:</AP>
          <UL>
            <LI><S>Nove funkcionalnosti</S> — šta je novo isporučeno u ovoj verziji</LI>
            <LI><S>Ispravke grešaka</S> — problemi koji su rešeni</LI>
            <LI><S>Poboljšanja performansi</S> — optimizacije i unapređenja</LI>
            <LI><S>Tehničke promene</S> — promene koje mogu uticati na integracije</LI>
            <LI><S>Datum isporuke</S> — kada su promene primenjene</LI>
          </UL>
        </>),
      },
      {
        q: 'Šta znači status "Released" na release notes?',
        text: 'released status produkcija primenjeno draft vidljivo objavljen',
        a: (<>
          <BdgRow><Bdg c="green">Released</Bdg></BdgRow>
          <AP>označava da su promene opisane u release notes već primenjene u produkcijskom sistemu i vidljive su vama. Suprotno od draft statusa (koji je vidljiv samo administratorima tokom kreiranja).</AP>
        </>),
      },
      {
        q: 'Mogu li da podelim Release Notes sa nekim ko nema nalog?',
        text: 'javni link token bez naloga podeliti email jedinstven siguran pristup bez registracije',
        a: (<AP>Administrator može da generiše <S>javni link</S> za svaki objavljeni release notes. Taj link možete podeliti sa bilo kim — osoba ne mora da ima nalog na platformi da bi pročitala sadržaj. Link je jedinstven i siguran (token-based).</AP>),
      },
    ],
  },

  {
    id: 'dokumenta',
    label: 'Dokumenta',
    icon: <IconDocPages />,
    iconBg: 'rgba(245,158,11,0.12)',
    iconColor: 'var(--amber)',
    questions: [
      {
        q: 'Koje dokumente mogu da vidim na platformi?',
        text: 'dokumenti deljeni sekcije folderi projektna dokumentacija specifikacije izveštaji ugovori klijent vidljivost',
        a: (<>
          <AP>Vidite samo dokumente koji su vam eksplicitno deljeni od strane administratora. Dokumenti su organizovani u <S>sekcije</S> (foldere) kao što su: Projektna dokumentacija, Specifikacije, Izveštaji, Ugovori i sl.</AP>
          <InfoBox type="green">Dokumenti drugih klijenata su skriveni — privatnost podataka je garantovana.</InfoBox>
        </>),
      },
      {
        q: 'Kako da preuzmem dokument?',
        text: 'preuzimanje download ikonica fajl računar prijavljivanje PDF',
        a: (<AP>U Dokumenta modulu, pronađite željeni dokument i kliknite na ikonicu <S>preuzimanja (download)</S> pored naziva fajla. Fajl će se preuzeti na vaš računar. Prijavljivanje na platformu je obavezno za pristup dokumentima.</AP>),
      },
      {
        q: 'Mogu li da gledam PDF direktno na platformi bez preuzimanja?',
        text: 'PDF thumbnail pregled stranica browser preuzimanje prikaz miniatura',
        a: (<AP>Da. PDF dokumenti prikazuju <S>thumbnail prve stranice</S> direktno u listi, tako da možete videti o čemu se radi bez preuzimanja. Za kompletni pregled sadržaja koristite opciju preuzimanja ili pregledača u browseru.</AP>),
      },
      {
        q: 'Zašto ne vidim dokument koji mi je trebalo da bude poslat?',
        text: 'ne vidim dokument pristup administrator sekcija osvežiti F5 poslat',
        a: (<>
          <AP>Nekoliko mogućih razloga:</AP>
          <UL>
            <LI>Administrator još nije dodelio pristup vama specifično — obratite se administratoru</LI>
            <LI>Dokument je u sekciji kojoj nemate pristup</LI>
            <LI>Osvežite stranicu klikom na F5 u browseru da proverite da li se pojavio</LI>
          </UL>
        </>),
      },
    ],
  },

  {
    id: 'poruke',
    label: 'Poruke i komunikacija',
    icon: <IconChat />,
    iconBg: 'rgba(168,85,247,0.12)',
    iconColor: '#A855F7',
    questions: [
      {
        q: 'Kako da znam da imam novu poruku?',
        text: 'nova poruka notifikacija zvono crvena tačka nepročitane 60 sekundi automatski provera',
        a: (<>
          <AP>Crvena tačka se pojavljuje na <S>ikoni zvona</S> u navigacionoj traci na vrhu ekrana. Klik na zvono prikazuje poslednjih 5 nepročitanih poruka sa kratkim pregledom sadržaja. Odatle možete direktno otvoriti konverzaciju ili kliknuti "Označi sve kao pročitano".</AP>
          <InfoBox>Platforma proverava nove poruke svakih 60 sekundi automatski — ne morate osvežavati stranicu.</InfoBox>
        </>),
      },
      {
        q: 'Koje poruke mogu da vidim kao klijent? Da li vidim poruke za druge klijente?',
        text: 'klijent vidljivost privatnost direktno sve korisnici izolacija drugi',
        a: (<>
          <AP>Kao klijent, vidite samo:</AP>
          <UL>
            <LI>Poruke koje su vam <S>direktno poslate</S></LI>
            <LI>Poruke koje su poslate <S>"svima"</S> na projektu</LI>
          </UL>
          <InfoBox type="green">Ne možete videti poruke namenjene drugim klijentima — svaki klijent ima svoju privatnu komunikaciju sa timom.</InfoBox>
        </>),
      },
      {
        q: 'Kako se šalje poruka vezana za određeni Jira task?',
        text: 'slanje poruke jira task ključ hover ikona forma automatski naziv konverzacija tema',
        a: (<>
          <AP>Postoje dva načina:</AP>
          <UL>
            <LI><S>Iz tabele taskova</S> — na desktop uređajima, kada pređete mišem (hover) preko reda taska, pojavljuje se ikona poruke. Klik automatski otvara formu sa popunjenim Jira ključem taska.</LI>
            <LI><S>Iz Poruka modula</S> — u polju za slanje poruke unesite Jira ključ taska u predviđeno polje (npr. <M>KNJAZ-101</M>). Sistem automatski pronalazi naziv taska.</LI>
          </UL>
          <AP>Ovako poslate poruke grupišu se u konverzacije po temi/tasku, što olakšava praćenje komunikacije.</AP>
        </>),
      },
      {
        q: 'Da li mogu da odgovorim na poruku?',
        text: 'odgovor reply konverzacija levi panel desni panel pošalji hronološki',
        a: (<AP>Da. Otvorite konverzaciju klikom na nju u levom panelu, a zatim unesite odgovor u polje na dnu desnog panela i kliknite Pošalji. Odgovor se odmah pojavljuje u konverzaciji hronološki.</AP>),
      },
      {
        q: 'Kako su organizovane konverzacije?',
        text: 'konverzacije projekat tema leva strana lista organizacija jira task generalna panel',
        a: (<AP>Konverzacije su organizovane po <S>projektu i temi</S>. U levom panelu birate projekat iz liste, a zatim vidite listu svih konverzacija za taj projekat. Svaka konverzacija može biti vezana za specifičan Jira task ili može biti generalna po temi. Klik na konverzaciju otvara sve poruke u desnom panelu.</AP>),
      },
      {
        q: 'Zašto ne mogu da vidim neke projekte u Porukama?',
        text: 'ne mogu da vidim projekat pristup administrator arhiviran lista poruke',
        a: (<AP>Vidite samo projekte kojima imate dodeljeni pristup. Ako projekat koji tražite nije u listi, obratite se administratoru da vam dodeli pristup. Moguće je i da je projekat arhiviran.</AP>),
      },
    ],
  },

  {
    id: 'nalog',
    label: 'Nalog i podešavanja',
    icon: <IconUser />,
    iconBg: 'rgba(107,114,128,0.12)',
    iconColor: 'var(--textMuted)',
    questions: [
      {
        q: 'Kako da promenim lozinku?',
        text: 'promena lozinke avatar podešavanja profil stara nova sačuvaj dropdown',
        a: (<ol style={{ paddingLeft: 20, color: 'var(--text)', fontSize: 14, lineHeight: 1.9, margin: '4px 0' }}>
          <li>Kliknite na vaš avatar (inicijali) u gornjem desnom uglu</li>
          <li>Izaberite <S>Podešavanja</S> iz dropdown menija</li>
          <li>U tabu <S>Profil</S> pronađite sekciju za promenu lozinke</li>
          <li>Unesite staru lozinku i dva puta novu lozinku</li>
          <li>Kliknite <S>Sačuvaj</S></li>
        </ol>),
      },
      {
        q: 'Kako da promenim temu (tamna / svetla)?',
        text: 'tema tamna svetla sistemska toggle ikonica navigacija podešavanja tab sunce mesec',
        a: (<>
          <AP>Postoje dva načina:</AP>
          <UL>
            <LI><S>Brzo</S> — kliknite na ikonicu sunca/meseca u gornjoj navigacionoj traci, tema se menja odmah</LI>
            <LI><S>Detaljno</S> — idite u Podešavanja → tab Tema, gde možete izabrati Tamnu, Svetlu ili Sistemsku temu (prati podešavanja vašeg uređaja)</LI>
          </UL>
          <AP>Izbor se pamti i primenjuje pri svakom ponovnom otvaranju platforme.</AP>
        </>),
      },
      {
        q: 'Zaboravio/la sam lozinku — šta da radim?',
        text: 'zaboravljena lozinka reset email administrator privremena samoreset',
        a: (<AP>Platforma trenutno ne podržava samoreset lozinke putem emaila. <S>Obratite se svom administratoru</S> koji može resetovati vašu lozinku iz sistema za upravljanje korisnicima. Dobićete novu privremenu lozinku koju zatim možete promeniti u Podešavanjima.</AP>),
      },
      {
        q: 'Koliko dugo ostajem prijavljen/a?',
        text: 'sesija 7 dana jwt token istekne sigurnost kredencijali prijaviti',
        a: (<AP>Sesija traje <S>7 dana</S> od poslednje prijave. Nakon toga, biće vam prikazana login stranica i moraćete ponovo da unesete kredencijale. Ovo je standardna sigurnosna mera.</AP>),
      },
      {
        q: 'Kako da se odjavim?',
        text: 'odjava logout avatar meni navigaciona traka preusmeriti login',
        a: (<AP>Kliknite na vaš avatar (inicijali) u gornjem desnom uglu navigacione trake, a zatim izaberite <S>Odjava</S> iz menija. Bićete odmah odjavljeni i preusmereni na login stranicu.</AP>),
      },
      {
        q: 'Mogu li da promenim jezik interfejsa?',
        text: 'jezik srpski engleski prevod interfejs podešavanja tab tema odmah',
        a: (<AP>Da. Idite u Podešavanja → tab Tema i jezik, gde možete prebaciti između Srpskog i Engleskog jezika. Promena se odmah primenjuje na sve tekste u interfejsu.</AP>),
      },
    ],
  },

  {
    id: 'sigurnost',
    label: 'Sigurnost i privatnost',
    icon: <IconLock />,
    iconBg: 'rgba(239,68,68,0.10)',
    iconColor: 'var(--red)',
    questions: [
      {
        q: 'Da li su moji podaci sigurni na platformi?',
        text: 'sigurnost bezbednost lozinka hash bcrypt api token enkriptovan AES JWT sesija rate limiting zaštita',
        a: (<>
          <AP>Da. Platforma koristi više slojeva zaštite:</AP>
          <UL>
            <LI><S>Lozinke</S> — nikad se ne čuvaju u originalnom obliku, uvek kao hash (bcrypt)</LI>
            <LI><S>API tokeni</S> — enkriptovani AES-256 algoritmom pre čuvanja u bazi</LI>
            <LI><S>Sesije</S> — JWT tokeni sa rokom trajanja od 7 dana</LI>
            <LI><S>Izolacija podataka</S> — svaki klijent vidi samo svoje podatke</LI>
            <LI><S>Rate limiting</S> — ograničen broj pokušaja prijave (zaštita od napada)</LI>
          </UL>
        </>),
      },
      {
        q: 'Da li drugi klijenti mogu da vide moje projekte ili poruke?',
        text: 'privatnost izolacija projekti poruke release notes dokumenti drugi klijenti striktna',
        a: (<>
          <AP>Ne. Sistem je dizajniran sa <S>striktnom izolacijom podataka po korisniku</S>:</AP>
          <UL>
            <LI>Vidite samo projekte dodeljene vama</LI>
            <LI>Vidite samo poruke upućene vama ili svima</LI>
            <LI>Vidite samo release notes dodeljene vama</LI>
            <LI>Vidite samo dokumente u sekcijama kojima imate pristup</LI>
          </UL>
        </>),
      },
      {
        q: 'Šta se dešava kada istekne moja sesija?',
        text: 'sesija istekne 7 dana login stranica preusmereni email lozinka sigurnosna mera',
        a: (<AP>Posle 7 dana od poslednje prijave, vaša sesija automatski istekne. Sledeći put kada pokušate da koristite platformu, bićete preusmereni na login stranicu i moraćete uneti email i lozinku ponovo. Ovo je sigurnosna mera koja sprečava neovlašćen pristup.</AP>),
      },
      {
        q: 'Mogu li da pristupim platformi sa više uređaja istovremeno?',
        text: 'više uređaja kompjuter laptop tablet telefon responsive sesija istovremeno nezavisno',
        a: (<AP>Da. Možete se prijaviti sa kompjutera, laptopa, tableta i telefona istovremeno. Svaki uređaj ima svoju sesiju nezavisno od ostalih. Platforma je responsive i prilagođena za korišćenje na svim uređajima.</AP>),
      },
    ],
  },
]

// Pre-assign stable IDs
const QA_DATA_STABLE = QA_DATA.map(cat => ({
  ...cat,
  questions: cat.questions.map((q, qi) => ({ ...q, uid: `${cat.id}-${qi}` })),
}))

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
        <span style={{ fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 14, fontWeight: 500, color: isOpen ? 'var(--accent)' : 'var(--text)', lineHeight: 1.4 }}>
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

function CategorySection({ category, visibleQuestions, openId, setOpenId }) {
  return (
    <div style={{ marginBottom: 48 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0, background: category.iconBg, color: category.iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {category.icon}
        </div>
        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>
          {category.label}
        </span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--textMuted)', background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 12, padding: '2px 8px', marginLeft: 'auto' }}>
          {visibleQuestions.length} pitanja
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
        fontFamily: "'DM Sans', -apple-system, sans-serif",
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
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, opacity: active ? 0.9 : 0.7 }}>
        {count}
      </span>
    </button>
  )
}

// ── QAPage ────────────────────────────────────────────────────────────────────

export default function QAPage({
  user, theme, onLogout,
  onGoToDashboard, onGoToDocuments, onGoToReleaseNotes, onGoToReleaseNotesEditor,
  onGoToMessages, onGoToQA, onOpenSettings, onOpenUsers, onOpenChat,
  projects = [],
}) {
  const [openId, setOpenId] = useState(null)
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState('all')
  const [searchFocused, setSearchFocused] = useState(false)

  const messagesAction = onGoToMessages || onOpenChat

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
    { id: 'all', label: 'Sve', count: totalAll },
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
        onOpenSettings={onOpenSettings}
        onOpenUsers={onOpenUsers}
        projects={projects}
      />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 32, color: 'var(--text)', marginBottom: 12 }}>
            Pitanja i odgovori
          </h1>
          <p style={{ color: 'var(--textMuted)', fontSize: 15, fontFamily: "'DM Sans', -apple-system, sans-serif", lineHeight: 1.6 }}>
            Pronađite odgovore na najčešća pitanja o Intelisale Project Hub platformi
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
            placeholder="Pretraži pitanja..."
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={{
              width: '100%',
              background: 'var(--bg)',
              border: `1px solid ${searchFocused ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 12,
              padding: '12px 20px 12px 44px',
              color: 'var(--text)',
              fontFamily: "'DM Sans', -apple-system, sans-serif",
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
            <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>Nema pitanja koja odgovaraju pretrazi</p>
            <p style={{ fontSize: 13 }}>Pokušajte sa drugačijim pojmom pretrage.</p>
          </div>
        ) : (
          filtered.map(cat => (
            <CategorySection
              key={cat.id}
              category={cat}
              visibleQuestions={cat.questions}
              openId={openId}
              setOpenId={setOpenId}
            />
          ))
        )}

      </div>
    </div>
  )
}
