import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api.js'
import { usePhasesQuery } from '../../queries.js'
import { useT } from '../../lang.jsx'
import TaskTable from '../TaskTable.jsx'
import Card from '../../ui/Card.jsx'
import Button from '../../ui/Button.jsx'
import { CollapseToggle } from '../../ui/collapse.jsx'
import { StatusDonut, ProgressTrend, PhaseBars } from './ClientCharts.jsx'
import PhaseTimeline from './PhaseTimeline.jsx'
import Velocity from './Velocity.jsx'
import WhatsNew from './WhatsNew.jsx'

// P3-1/P3-4: klijentski pregled projekta. Redosled prati pitanja koja klijent
// zaista postavlja: gde smo (stanje svih zadataka po statusu + plan po fazama),
// kojim tempom se radi, šta se promenilo od prošlog puta. Dokumenta imaju svoju
// stranicu u meniju i ne ponavljaju se ovde (odluka 21.09.2026.).
// Interne brojeve server ne šalje roli `user` (client-safe DTO u jira.js) —
// ovde se ne računa ništa iz sati.

const font = "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif"

// Boje statusa su iste kao u donutu i u tabeli zadataka — jedan vizuelni jezik.
const STATUS_COLORS = {
  done: 'var(--green)',
  testing: 'var(--amber)',
  inprog: 'var(--accent)',
  todo: 'var(--textSubtle)',
}

function StatusSentence({ project, data, phases, t }) {
  const total = data?.total || 0
  const done = data?.done || 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  // Traka pokazuje SVE zadatke podeljene po statusu, ne samo procenat završenih:
  // klijent odmah vidi koliko je isporučeno, koliko je na testiranju, u radu i
  // koliko tek predstoji — sa tačnim brojevima ispod trake.
  const segments = [
    { id: 'done', label: t('portal.chart.done'), value: done, color: STATUS_COLORS.done },
    { id: 'testing', label: t('portal.chart.testing'), value: data?.testing || 0, color: STATUS_COLORS.testing },
    { id: 'inprog', label: t('portal.chart.inprog'), value: data?.inprog || 0, color: STATUS_COLORS.inprog },
    { id: 'todo', label: t('portal.chart.todo'), value: (data?.todo || 0) + (data?.unknown || 0), color: STATUS_COLORS.todo },
  ]

  // "Kasni" ako postoji faza sa prošlim rokom koja nije završena — izvedeno
  // iz faza (boja + rečenica), bez internih estimacija.
  const today = new Date().toISOString().slice(0, 10)
  const late = (phases || []).some(p => {
    if (!p.due_date || p.due_date >= today) return false
    const keys = p.taskKeys || []
    if (!keys.length) return false
    const byKey = new Set((data?.tasks || []).filter(x => x.statusCategory === 'done').map(x => x.key))
    return keys.some(k => !byKey.has(k))
  })
  const isDone = total > 0 && done === total

  const color = isDone ? 'var(--green)' : late ? 'var(--amber)' : 'var(--accent)'
  const label = isDone ? t('portal.status.done') : late ? t('portal.status.late') : t('portal.status.onTrack')
  const sentence = isDone
    ? t('portal.sentence.done', { name: project.displayName || project.epicKey })
    : t(late ? 'portal.sentence.late' : 'portal.sentence.onTrack', { pct })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <h2 style={{ fontFamily: 'Hanken Grotesk', fontWeight: 800, fontSize: 24, color: 'var(--text)', margin: 0 }}>
          {project.displayName || project.epicKey}
        </h2>
        <span style={{
          fontFamily: font, fontSize: 12, fontWeight: 600, padding: '3px 12px', borderRadius: 20,
          color, background: 'var(--surfaceAlt)', border: `1px solid ${color}`,
        }}>{label}</span>
      </div>
      <p style={{ fontFamily: font, fontSize: 15, color: 'var(--textMuted)', margin: '0 0 14px', lineHeight: 1.6 }}>
        {sentence}
      </p>
      {/* Traka svih zadataka po statusu */}
      <div style={{ display: 'flex', height: 16, borderRadius: 8, background: 'var(--surfaceAlt)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        {total > 0 && segments.filter(seg => seg.value > 0).map(seg => (
          <div
            key={seg.id}
            title={`${seg.label}: ${seg.value}`}
            style={{ width: `${(seg.value / total) * 100}%`, background: seg.color, transition: 'width 0.4s ease' }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {segments.filter(seg => seg.value > 0).map(seg => (
            <span key={seg.id} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, fontFamily: font, fontSize: 12, color: 'var(--textMuted)' }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: seg.color, alignSelf: 'center' }} />
              <span>{seg.label}</span>
              <strong style={{ fontFamily: 'Hanken Grotesk', fontSize: 13, color: 'var(--text)' }}>{seg.value}</strong>
              <span style={{ color: 'var(--textSubtle)' }}>· {Math.round((seg.value / total) * 100)}%</span>
            </span>
          ))}
        </div>
        <span style={{ fontFamily: font, fontSize: 12, color: 'var(--textSubtle)' }}>{t('portal.progress', { done, total })}</span>
      </div>
    </div>
  )
}

// Kratak vodič pri prvom loginu (1.4) — pamti se u localStorage.
function OnboardingCard({ t, onDismiss }) {
  return (
    <Card style={{ padding: '20px 24px', marginBottom: 20, borderColor: 'var(--accent)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 8 }}>
            {t('portal.onboarding.title')}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontFamily: font, fontSize: 13, color: 'var(--textMuted)', lineHeight: 1.8 }}>
            <li>{t('portal.onboarding.releases')}</li>
            <li>{t('portal.onboarding.documents')}</li>
            <li>{t('portal.onboarding.messages')}</li>
          </ul>
        </div>
        <Button variant="ghost" onClick={onDismiss}>{t('portal.onboarding.dismiss')}</Button>
      </div>
    </Card>
  )
}

export default function ClientOverview({ project, data, loading, error, unreadCount }) {
  const t = useT()
  const navigate = useNavigate()
  const [introDismissed, setIntroDismissed] = useState(() => localStorage.getItem('jt_portal_intro') === '1')
  // Zadaci su default OTVORENI — spisak sa stanjem svakog zadatka je ono zbog
  // čega klijent i otvara projekat; izbor se pamti (odluka 21.09.2026.).
  const [tasksOpen, setTasksOpen] = useState(() => localStorage.getItem('jt_portal_tasks_open') !== '0')
  function toggleTasks() {
    setTasksOpen(o => {
      try { localStorage.setItem('jt_portal_tasks_open', o ? '0' : '1') } catch { /* best-effort */ }
      return !o
    })
  }

  const phasesQuery = usePhasesQuery(project?.id)
  const phases = useMemo(() => phasesQuery.data?.phases || [], [phasesQuery.data])

  // Poslednji release-ovi za ovaj projekat (klijentska lista je već filtrirana po dodeli)
  const releasesQuery = useQuery({
    queryKey: ['clientReleases'],
    queryFn: () => api.getClientReleaseNotes(),
    staleTime: 60_000,
  })

  // Izveštaji poslati klijentu (P3-2)
  const reportsQuery = useQuery({
    queryKey: ['myReports'],
    queryFn: () => api.getMyReports(),
    staleTime: 60_000,
  })
  const myReports = useMemo(
    () => (reportsQuery.data?.runs || []).filter(r => r.project_id === project?.id).slice(0, 5),
    [reportsQuery.data, project?.id]
  )
  // Samo objave ovog projekta — objava bez project_id se ranije prikazivala na
  // SVAKOM projektu klijenta (ispravka 14.09.2026).
  const releases = useMemo(() => {
    const all = releasesQuery.data?.notes || []
    return all.filter(n => n.project_id === project?.id).slice(0, 5)
  }, [releasesQuery.data, project?.id])

  useEffect(() => {
    if (introDismissed) localStorage.setItem('jt_portal_intro', '1')
  }, [introDismissed])

  const tasksByPhase = useMemo(() => {
    const map = {}
    const byKey = {}
    for (const task of (data?.tasks || [])) byKey[task.key] = task
    for (const p of phases) map[p.id] = (p.taskKeys || []).map(k => byKey[k]).filter(Boolean)
    return map
  }, [phases, data])

  // Vremenska osa se crta samo kad faze imaju rokove; inače ostaju trake napretka.
  const hasPhaseDates = useMemo(() => phases.some(p => p.due_date), [phases])

  if (loading) {
    return <div style={{ padding: 48, textAlign: 'center', color: 'var(--textMuted)', fontFamily: font }}>{t('pc.loadingData')}</div>
  }
  if (error) {
    return (
      <Card style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ fontFamily: font, fontSize: 14, color: 'var(--red)', marginBottom: 6 }}>{t('portal.error.title')}</div>
        <div style={{ fontFamily: font, fontSize: 13, color: 'var(--textMuted)' }}>{t('portal.error.sub')}</div>
      </Card>
    )
  }
  if (!data) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {!introDismissed && <OnboardingCard t={t} onDismiss={() => setIntroDismissed(true)} />}

      {/* Stanje projekta jednom rečenicom + progress */}
      <Card style={{ padding: '24px 28px' }}>
        <StatusSentence project={project} data={data} phases={phases} t={t} />
      </Card>

      {/* Plan po fazama: gde smo u odnosu na rokove (trake napretka kad rokova nema) */}
      {hasPhaseDates
        ? <PhaseTimeline phases={phases} tasksByPhase={tasksByPhase} />
        : <PhaseBars phases={phases} tasksByPhase={tasksByPhase} />}

      {/* Raspodela statusa + tempo rada (tempo bez projektovanog datuma — odluka 14.09.2026.) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, alignItems: 'start' }}>
        <StatusDonut data={data} />
        <Velocity projectId={project.id} data={data} />
      </div>

      {/* Napredak kroz vreme */}
      <ProgressTrend projectId={project.id} />

      {/* Šta je novo: objave, poruke, izveštaji i upozorenja u jednom toku */}
      <WhatsNew project={project} releases={releases} reports={myReports} unreadCount={unreadCount} />

      {/* Detalji: taskovi (sklopivo, default sklopljeno — "story, ne dashboard") */}
      <Card style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: tasksOpen ? 14 : 0 }}>
          <CollapseToggle open={tasksOpen} onClick={toggleTasks} label={t('portal.section.tasks')} />
          <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
            {t('portal.section.tasks')}
          </span>
          <span style={{ fontFamily: font, fontSize: 12, color: 'var(--textSubtle)', marginLeft: 8 }}>
            {t('portal.section.tasksHint', { n: data.total || 0 })}
          </span>
        </div>
        {tasksOpen && (
          <TaskTable
            tasks={data.tasks || []}
            overTasks={[]}
            isClient
            projectId={project.id}
            onOpenMessages={() => navigate(`/messages?project=${project.id}`)}
            hasBillableField={!!data.hasBillableField}
            clientTexts={data.clientTexts}
          />
        )}
      </Card>
    </div>
  )
}
