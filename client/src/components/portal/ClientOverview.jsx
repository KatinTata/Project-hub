import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api.js'
import { usePhasesQuery } from '../../queries.js'
import { useT } from '../../lang.jsx'
import { fmtDateLong } from '../../utils/format.js'
import PhaseProgress from '../PhaseProgress.jsx'
import TaskTable from '../TaskTable.jsx'
import Card from '../../ui/Card.jsx'
import Button from '../../ui/Button.jsx'
import { useCollapsedSections, CollapseToggle } from '../../ui/collapse.jsx'

// P3-1: klijentski pregled projekta — "story", ne dashboard. Prikazuje SAMO
// klijentu relevantno: napredak, status na putu/kasni (iz faza, bez internih
// sati), sledeći ključni datum, poslednji release-ovi, poruke. Interne brojeve
// server ionako više ne šalje roli `user` (client-safe DTO u jira.js).

const font = "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif"

function StatusSentence({ project, data, phases, t }) {
  const total = data?.total || 0
  const done = data?.done || 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

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
      {/* Progress bar */}
      <div style={{ height: 10, borderRadius: 6, background: 'var(--surfaceAlt)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: font, fontSize: 12, color: 'var(--textSubtle)' }}>
        <span>{t('portal.progress', { done, total })}</span>
        <span>{pct}%</span>
      </div>
    </div>
  )
}

function InfoTile({ label, value, sub, onClick, accent, t }) {
  return (
    <Card
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      style={{ padding: '16px 20px', cursor: onClick ? 'pointer' : 'default', minWidth: 0 }}
    >
      <div style={{ fontFamily: font, fontSize: 11, color: 'var(--textMuted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 16, color: accent || 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontFamily: font, fontSize: 12, color: 'var(--textSubtle)', marginTop: 3 }}>{sub}</div>}
      {onClick && <div style={{ fontFamily: font, fontSize: 12, color: 'var(--accent)', marginTop: 8 }}>{t('portal.open')} →</div>}
    </Card>
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
  const { collapsed: sec, toggle: toggleSec } = useCollapsedSections('jt_portal_sections')
  const [introDismissed, setIntroDismissed] = useState(() => localStorage.getItem('jt_portal_intro') === '1')
  // Taskovi su default SKLOPLJENI ("story, ne dashboard") — zaseban ključ
  const [tasksOpen, setTasksOpen] = useState(() => localStorage.getItem('jt_portal_tasks_open') === '1')
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
  const releases = useMemo(() => {
    const all = releasesQuery.data?.notes || []
    return all.filter(n => !n.project_id || n.project_id === project?.id).slice(0, 3)
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

  // Sledeći ključni datum: najbliži budući rok faze; ako ga nema — poslednji prošli.
  const nextDate = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const withDue = phases.filter(p => p.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date))
    return withDue.find(p => p.due_date >= today) || withDue[withDue.length - 1] || null
  }, [phases])

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

      {/* Šta je novo: release / poruke / sledeći datum */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <InfoTile
          t={t}
          label={t('portal.tile.lastRelease')}
          value={releases[0] ? (releases[0].title || releases[0].version || t('portal.tile.releaseFallback')) : t('portal.tile.noReleases')}
          sub={releases[0] ? fmtDateLong(releases[0].released_at || releases[0].created_at) : t('portal.tile.noReleasesSub')}
          onClick={releases[0] ? () => navigate(`/release-notes/${releases[0].id}`) : () => navigate('/release-notes')}
        />
        <InfoTile
          t={t}
          label={t('portal.tile.messages')}
          value={unreadCount > 0 ? t('portal.tile.unread', { n: unreadCount }) : t('portal.tile.noUnread')}
          accent={unreadCount > 0 ? 'var(--accent)' : undefined}
          sub={t('portal.tile.messagesSub')}
          onClick={() => navigate(`/messages?project=${project.id}`)}
        />
        <InfoTile
          t={t}
          label={t('portal.tile.nextDate')}
          value={nextDate ? fmtDateLong(nextDate.due_date) : t('portal.tile.noDates')}
          sub={nextDate ? nextDate.name : t('portal.tile.noDatesSub')}
        />
      </div>

      {/* Faze */}
      <Card style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: sec.phases ? 0 : 14 }}>
          <CollapseToggle open={!sec.phases} onClick={() => toggleSec('phases')} label={t('portal.section.phases')} />
          <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
            {t('portal.section.phases')}
          </span>
        </div>
        {!sec.phases && <PhaseProgress phases={phases} tasksByPhase={tasksByPhase} />}
      </Card>

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
          />
        )}
      </Card>
    </div>
  )
}
