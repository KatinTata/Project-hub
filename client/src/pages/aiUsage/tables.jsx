import { useState } from 'react'
import { useT } from '../../lang.jsx'
import { fmtTok, fmtNum, fmtMoney } from '../../components/aiCharts.jsx'
import { card, thStyle, tdStyle, tdMono } from './ui.jsx'

// P2-B2: velike tabele ne renderuju sve redove odjednom — prvih 50 + "prikaži
// još". (<table> semantika se ne slaže sa absolute-position virtualizacijom,
// a redovi ovde su lagani pa je inkrementalni prikaz dovoljan.)
const ROWS_STEP = 50

function useRevealRows(rows) {
  const [limit, setLimit] = useState(ROWS_STEP)
  const all = rows || []
  return {
    visible: all.slice(0, limit),
    hiddenCount: Math.max(0, all.length - limit),
    showMore: () => setLimit(l => l + ROWS_STEP),
  }
}

function ShowMoreRow({ colSpan, hiddenCount, onClick, t }) {
  if (!hiddenCount) return null
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0 }}>
        <button onClick={onClick} style={{
          width: '100%', padding: '10px 0', background: 'var(--surfaceAlt)', border: 'none',
          color: 'var(--accent)', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>
          {t('ai2.showMore', { n: hiddenCount })}
        </button>
      </td>
    </tr>
  )
}

export function PivotTable({ title, rows, childKey, childName, nameKey, idKey, expanded, setExpanded }) {
  const t = useT()
  const { visible, hiddenCount, showMore } = useRevealRows(rows)
  if (!rows?.length) return null
  const total = rows.reduce((s, r) => s + r.cost_usd, 0)
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{title}</span>
        <span style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: 'var(--textMuted)' }}>{t('ai2.total', { v: fmtMoney(total) })}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: 'var(--surfaceAlt)' }}>
          <th style={thStyle}>{t('ai2.name')}</th><th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.requests')}</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.tokens')}</th><th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.cost')}</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.share')}</th>
        </tr></thead>
        <tbody>
          {visible.map(r => {
            const id = r[idKey]
            const kids = r[childKey] || []
            const isOpen = !!expanded[id]
            return [
              <tr key={id} onClick={() => kids.length && setExpanded(p => ({ ...p, [id]: !p[id] }))} style={{ cursor: kids.length ? 'pointer' : 'default' }}>
                <td style={tdStyle}>{kids.length > 0 && <span style={{ marginRight: 6, opacity: 0.5, fontSize: 10 }}>{isOpen ? '▼' : '▶'}</span>}{r[nameKey]}</td>
                <td style={{ ...tdMono, textAlign: 'right' }}>{fmtNum(r.requests)}</td>
                <td style={{ ...tdMono, textAlign: 'right' }}>{fmtTok(r.tokens)}</td>
                <td style={{ ...tdMono, textAlign: 'right', fontWeight: 600 }}>{fmtMoney(r.cost_usd)}</td>
                <td style={{ ...tdMono, textAlign: 'right', color: 'var(--textMuted)' }}>{total > 0 ? Math.round(r.cost_usd / total * 100) + '%' : '—'}</td>
              </tr>,
              ...(isOpen ? kids.map((k, i) => (
                <tr key={id + '-' + i} style={{ background: 'var(--surfaceAlt)' }}>
                  <td style={{ ...tdStyle, paddingLeft: 38, color: 'var(--textMuted)', fontSize: 12 }}>{childName(k)}</td>
                  <td style={{ ...tdMono, textAlign: 'right', color: 'var(--textMuted)' }}>{fmtNum(k.requests)}</td>
                  <td style={{ ...tdMono, textAlign: 'right', color: 'var(--textMuted)' }}>{fmtTok(k.tokens)}</td>
                  <td style={{ ...tdMono, textAlign: 'right', color: 'var(--textMuted)' }}>{fmtMoney(k.cost_usd)}</td>
                  <td style={tdStyle} />
                </tr>
              )) : []),
            ]
          })}
          <ShowMoreRow colSpan={5} hiddenCount={hiddenCount} onClick={showMore} t={t} />
        </tbody>
      </table>
    </div>
  )
}

export function SimpleTable({ title, rows, nameKey, costKey = 'cost', cur = 'USD' }) {
  const t = useT()
  const { visible, hiddenCount, showMore } = useRevealRows(rows)
  if (!rows?.length) return null
  const total = rows.reduce((s, r) => s + (r[costKey] || 0), 0)
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{title}</span>
        <span style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, color: 'var(--textMuted)' }}>{t('ai2.total', { v: fmtMoney(total, cur) })}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: 'var(--surfaceAlt)' }}>
          <th style={thStyle}>{t('ai2.name')}</th><th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.requests')}</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.tokens')}</th><th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.cost')}</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.share')}</th>
        </tr></thead>
        <tbody>{visible.map((r, i) => (
          <tr key={i}>
            <td style={tdStyle}>{r[nameKey]}</td>
            <td style={{ ...tdMono, textAlign: 'right' }}>{fmtNum(r.requests)}</td>
            <td style={{ ...tdMono, textAlign: 'right' }}>{fmtTok(r.tokens)}</td>
            <td style={{ ...tdMono, textAlign: 'right', fontWeight: 600 }}>{fmtMoney(r[costKey], cur)}</td>
            <td style={{ ...tdMono, textAlign: 'right', color: 'var(--textMuted)' }}>{total > 0 ? Math.round((r[costKey] || 0) / total * 100) + '%' : '—'}</td>
          </tr>
        ))}
          <ShowMoreRow colSpan={5} hiddenCount={hiddenCount} onClick={showMore} t={t} />
        </tbody>
      </table>
    </div>
  )
}

export function ModelsTable({ rows }) {
  const t = useT()
  const { visible, hiddenCount, showMore } = useRevealRows(rows)
  if (!rows?.length) return null
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)', fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{t('ai2.table.byModel')}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: 'var(--surfaceAlt)' }}>
          <th style={thStyle}>{t('ai2.model')}</th><th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.requests')}</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.input')}</th><th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.output')}</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>{t('ai2.cost')}</th>
        </tr></thead>
        <tbody>{visible.map(r => (
          <tr key={r.model}>
            <td style={tdStyle}>
              {r.model}
              {!r.priced && <span title={t('ai2.model.noPriceTitle')} style={{ marginLeft: 8, fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'var(--amberTint)', color: 'var(--amber)', border: '1px solid var(--amber)' }}>{t('ai2.model.noPrice')}</span>}
            </td>
            <td style={{ ...tdMono, textAlign: 'right' }}>{fmtNum(r.requests)}</td>
            <td style={{ ...tdMono, textAlign: 'right' }}>{fmtTok(r.prompt_tokens)}</td>
            <td style={{ ...tdMono, textAlign: 'right' }}>{fmtTok(r.completion_tokens)}</td>
            <td style={{ ...tdMono, textAlign: 'right', fontWeight: 600 }}>{fmtMoney(r.cost_usd)}</td>
          </tr>
        ))}
          <ShowMoreRow colSpan={5} hiddenCount={hiddenCount} onClick={showMore} t={t} />
        </tbody>
      </table>
    </div>
  )
}
