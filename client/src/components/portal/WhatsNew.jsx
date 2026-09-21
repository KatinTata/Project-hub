import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api.js'
import { useT } from '../../lang.jsx'
import { fmtRelativeTime } from '../../utils/format.js'
import Card from '../../ui/Card.jsx'
import Button from '../../ui/Button.jsx'
import { toast } from '../../ui/Toast.jsx'

// P3-4: jedan hronološki tok umesto tri pločice koje svaka pokazuju po jednu
// stavku. Spaja release-ove, poruke, poslate izveštaje i upozorenja za JEDAN
// projekat — odgovor na "šta se promenilo od prošlog puta".

const font = "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif"
const MAX_ITEMS = 8

const KIND_COLOR = {
  release: 'var(--green)',
  message: 'var(--accent)',
  report: 'var(--textMuted)',
  alert: 'var(--amber)',
}

export default function WhatsNew({ project, releases = [], reports = [], unreadCount = 0 }) {
  const t = useT()
  const navigate = useNavigate()
  const projectId = project?.id

  const { data: messagesRes } = useQuery({
    queryKey: ['portalMessages', projectId],
    queryFn: () => api.getMessages(projectId, { limit: 20 }),
    enabled: !!projectId && typeof projectId === 'number',
    staleTime: 60_000,
  })

  const { data: alertsRes } = useQuery({
    queryKey: ['portalAlerts'],
    queryFn: () => api.getMyAlerts(),
    staleTime: 60_000,
  })

  const items = useMemo(() => {
    const out = []

    for (const r of releases) {
      out.push({
        id: `rel-${r.id}`,
        kind: 'release',
        date: r.released_at || r.created_at,
        title: r.title || r.version || t('portal.tile.releaseFallback'),
        sub: r.version && r.title ? r.version : null,
        onOpen: () => navigate(`/release-notes/${r.id}`),
      })
    }

    const messages = messagesRes?.messages || messagesRes || []
    for (const m of (Array.isArray(messages) ? messages : [])) {
      out.push({
        id: `msg-${m.id}`,
        kind: 'message',
        date: m.created_at,
        title: m.subject || m.sender_name || t('portal.news.message'),
        sub: (m.text || '').slice(0, 120),
        unread: !m.is_read,
        onOpen: () => navigate(`/messages?project=${projectId}`),
      })
    }

    for (const r of reports) {
      out.push({
        id: `rep-${r.id}`,
        kind: 'report',
        date: r.ran_at,
        title: t('portal.news.report'),
        sub: r.period || null,
        onDownload: () => api.downloadReportRun(r.id).catch(e => toast.error(e.message)),
      })
    }

    for (const a of (alertsRes?.alerts || [])) {
      if (a.project_id !== projectId) continue
      out.push({
        id: `alr-${a.delivery_id}`,
        kind: 'alert',
        date: a.created_at,
        title: a.title || t('portal.news.alert'),
        sub: a.body || null,
        unread: !a.read_at,
      })
    }

    return out
      .filter(x => x.date)
      .sort((x, y) => String(y.date).localeCompare(String(x.date)))
      .slice(0, MAX_ITEMS)
  }, [releases, reports, messagesRes, alertsRes, projectId, navigate, t])

  return (
    <Card style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
          {t('portal.news.title')}
        </span>
        {unreadCount > 0 && (
          <span style={{ fontFamily: font, fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>
            {t('portal.tile.unread', { n: unreadCount })}
          </span>
        )}
        <Button variant="pill" style={{ marginLeft: 'auto' }} onClick={() => navigate(`/messages?project=${projectId}`)}>
          {t('portal.news.openMessages')}
        </Button>
      </div>
      <div style={{ fontFamily: font, fontSize: 12, color: 'var(--textMuted)', marginBottom: 14 }}>
        {t('portal.news.sub')}
      </div>

      {items.length === 0 ? (
        <div style={{ fontFamily: font, fontSize: 13, color: 'var(--textMuted)', padding: '8px 0' }}>
          {t('portal.news.empty')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {items.map(item => (
            <div
              key={item.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '11px 0', borderTop: '1px solid var(--border)',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: KIND_COLOR[item.kind], flexShrink: 0, marginTop: 6 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: font, fontSize: 11, color: KIND_COLOR[item.kind], textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t(`portal.news.kind.${item.kind}`)}
                  </span>
                  <span style={{ fontFamily: font, fontSize: 11, color: 'var(--textSubtle)' }}>
                    {fmtRelativeTime(item.date, t)}
                  </span>
                  {item.unread && (
                    <span style={{ fontFamily: font, fontSize: 10, fontWeight: 700, color: 'var(--accent)' }}>
                      {t('portal.news.new')}
                    </span>
                  )}
                </div>
                <div style={{ fontFamily: font, fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.title}
                </div>
                {item.sub && (
                  <div style={{ fontFamily: font, fontSize: 12, color: 'var(--textMuted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.sub}
                  </div>
                )}
              </div>
              {item.onOpen && (
                <Button variant="pill" style={{ flexShrink: 0 }} onClick={item.onOpen}>{t('portal.open')}</Button>
              )}
              {item.onDownload && (
                <Button variant="pill" style={{ flexShrink: 0 }} onClick={item.onDownload}>{t('portal.reports.download')}</Button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
