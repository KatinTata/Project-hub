import { QueryClient, useQuery, useQueries } from '@tanstack/react-query'
import { api } from './api.js'
import { processEpicData, billableSecondsOf } from './utils.js'
import { buildStackMatrix } from './utils/stacks.js'

// ── Query client (A2) ─────────────────────────────────────────────────────────
// Server state živi u React Query kešu; jt_cache_* localStorage ostaje kao
// persistencija Jira podataka preko sesija (instant otvaranje bez mreže).

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

// ── Persisted Jira cache (localStorage) ───────────────────────────────────────

export function saveProjectCache(projectId, data) {
  try {
    localStorage.setItem(`jt_cache_${projectId}`, JSON.stringify({ data, ts: Date.now() }))
  } catch { /* quota — keš je best-effort */ }
}

export function loadProjectCache(projectId) {
  try {
    const raw = localStorage.getItem(`jt_cache_${projectId}`)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function clearProjectCache(projectId) {
  localStorage.removeItem(`jt_cache_${projectId}`)
  queryClient.removeQueries({ queryKey: ['projectData', projectId] })
}

// ── Projects list ─────────────────────────────────────────────────────────────

export function useProjectsQuery(options = {}) {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => api.getProjects(),
    staleTime: 60_000,
    ...options,
  })
}

// ── Per-project Jira data ─────────────────────────────────────────────────────
// Ponašanje kao pre RQ: keširan projekat se NE osvežava automatski (staleTime
// Infinity + initialData iz localStorage); fetch ide samo za projekte bez keša,
// na ručni refresh, na dnevni auto-refresh i posle izmene filtera.

async function fetchProjectData(project, { isClient }) {
  // Prethodno stanje (za feed promena) — keš je uvek ogledalo poslednjih podataka
  const prevCache = loadProjectCache(project.id)
  const { parents, subtasks, epicSelf, hasBillableField, clientTexts, clientLang } = await api.getTasks(project)
  const data = processEpicData(parents, subtasks, epicSelf)
  data.hasBillableField = !!hasBillableField
  data.clientTexts = clientTexts || null
  data.clientLang = clientLang || null
  const fetchedAt = Date.now()
  saveProjectCache(project.id, data)

  // Daily snapshot (history) — fire and forget; server keeps one per day
  if (!isClient && typeof project.id === 'number') {
    try {
      const sm = buildStackMatrix(data.tasks, [])
      const stacks = {}
      for (const s of sm.stacks) stacks[s] = { plan: sm.colTotals[s].plan, spent: sm.colTotals[s].spent, remaining: sm.colTotals[s].remaining }
      const billableSpent = (data.tasks || []).reduce((acc, t) => acc + billableSecondsOf(t), 0)
      api.saveSnapshot(project.id, {
        total: data.total, done: data.done, inprog: data.inprog, testing: data.testing, todo: data.todo, unknown: data.unknown || 0,
        totalEst: data.totalEst, totalSpent: data.totalSpent, remainingEst: sm.grand.remaining, billableSpent, stacks,
      }).catch(() => {})
    } catch { /* snapshot je best-effort */ }
  }

  return {
    data,
    fetchedAt,
    prev: prevCache ? { data: prevCache.data, time: fetchedAt } : undefined,
  }
}

export function useProjectDataQueries(projects, { isClient, enabled = true } = {}) {
  return useQueries({
    queries: (projects || []).map(p => ({
      queryKey: ['projectData', p.id],
      queryFn: () => fetchProjectData(p, { isClient }),
      staleTime: Infinity,
      gcTime: Infinity,
      retry: false,
      enabled,
      initialData: () => {
        const cached = loadProjectCache(p.id)
        return cached ? { data: cached.data, fetchedAt: cached.ts } : undefined
      },
      initialDataUpdatedAt: () => loadProjectCache(p.id)?.ts,
    })),
  })
}

// ── Phases / team (deljeno između ProjectCard i PhaseBuilder) ─────────────────

export function usePhasesQuery(projectId, options = {}) {
  return useQuery({
    queryKey: ['phases', projectId],
    queryFn: () => api.getPhases(projectId),
    staleTime: 30_000,
    enabled: !!projectId && typeof projectId === 'number',
    ...options,
  })
}

export function useTeamQuery(projectId, options = {}) {
  return useQuery({
    queryKey: ['team', projectId],
    queryFn: () => api.getTeam(projectId),
    staleTime: 30_000,
    enabled: !!projectId && typeof projectId === 'number',
    ...options,
  })
}

// ── Notifications (60s polling, pauza u pozadini, backoff na greške — B4) ─────

export function useNotificationsQuery({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const [{ count }, messages, alertsRes] = await Promise.all([
        api.getUnreadCount(),
        api.getRecentUnread(),
        api.getMyAlerts().catch(() => ({ alerts: [], unread: 0 })),
      ])
      // Upozorenja (P3-3) u istom zvonu kao poruke — prilagođena obliku stavke
      const alertItems = (alertsRes.alerts || [])
        .filter(a => !a.read_at)
        .map(a => ({
          id: `alert-${a.delivery_id}`,
          kind: 'alert',
          type: a.type,
          severity: a.severity,
          project_id: a.project_id,
          project_name: a.project_name,
          created_at: a.created_at,
          sender_name: a.title,
          text: a.body || '',
        }))
      const merged = [...alertItems, ...(messages || [])]
        .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)))
        .slice(0, 15)
      return { count: (count || 0) + alertItems.length, messages: merged }
    },
    enabled,
    retry: false,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    refetchInterval: query => {
      const failures = Math.min(query.state.errorUpdateCount ?? 0, 3)
      return 60_000 * 2 ** failures
    },
  })
}
