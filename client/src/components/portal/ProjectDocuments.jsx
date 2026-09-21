import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api.js'
import { useT } from '../../lang.jsx'
import { fmtDateNumericLocale } from '../../utils/format.js'
import Card from '../../ui/Card.jsx'
import Button from '../../ui/Button.jsx'
import { toast } from '../../ui/Toast.jsx'

// P3-4: dokumenta na stranici projekta. Server već vraća samo ona koja su
// vidljiva tom klijentu (documents.visible_to), pa ovde nema filtriranja —
// samo poslednjih nekoliko i prečica ka punoj stranici.
//
// NAPOMENA: dokumenta još nisu vezana za projekat (`documents` nema project_id),
// pa je ovo lista svih dokumenata deljenih sa klijentom. Vezivanje za projekat
// je zasebna stavka u docs/SPEC-klijentski-portal.md.

const font = "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif"
const MAX_ITEMS = 5

function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function ProjectDocuments() {
  const t = useT()
  const navigate = useNavigate()

  const { data } = useQuery({
    queryKey: ['portalDocuments'],
    queryFn: () => api.getDocuments(),
    staleTime: 5 * 60_000,
  })

  const docs = (Array.isArray(data) ? data : []).slice(0, MAX_ITEMS)
  if (!docs.length) return null

  return (
    <Card style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
          {t('portal.docs.title')}
        </span>
        <Button variant="pill" style={{ marginLeft: 'auto' }} onClick={() => navigate('/documents')}>
          {t('portal.docs.all')}
        </Button>
      </div>
      <div style={{ fontFamily: font, fontSize: 12, color: 'var(--textMuted)', marginBottom: 10 }}>
        {t('portal.docs.sub')}
      </div>

      {docs.map(doc => (
        <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: font, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {doc.name || doc.original_name}
            </div>
            <div style={{ fontFamily: font, fontSize: 11, color: 'var(--textSubtle)', marginTop: 2 }}>
              {[fmtDateNumericLocale(doc.created_at, ''), fmtSize(doc.file_size)].filter(Boolean).join(' · ')}
            </div>
          </div>
          <Button
            variant="pill"
            style={{ flexShrink: 0 }}
            onClick={() => api.downloadDocument(doc.id, doc.original_name || doc.name).catch(e => toast.error(e.message))}
          >
            {t('portal.reports.download')}
          </Button>
        </div>
      ))}
    </Card>
  )
}
