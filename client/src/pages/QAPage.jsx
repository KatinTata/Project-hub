import { useState, useEffect, useMemo } from 'react'
import Topbar from '../components/Topbar.jsx'
import { useT, useLang } from '../lang.jsx'
import { api } from '../api.js'
import { isClientRole } from '../utils/roles.js'
import { useConfirm } from '../ui/Confirm.jsx'
import { toast } from '../ui/Toast.jsx'
import Button from '../ui/Button.jsx'
import Input from '../ui/Input.jsx'
import Label from '../ui/Label.jsx'
import { getQaData } from './qaData.jsx'

// ── QAItem ────────────────────────────────────────────────────────────────────

function QAItem({ q, a, isOpen, onToggle, actions }) {
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
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
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
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {actions}
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
            width={16} height={16}
            style={{ flexShrink: 0, color: 'var(--textMuted)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s ease' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </span>
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

function CategorySection({ category, visibleQuestions, openId, setOpenId, t, renderActions }) {
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
          actions={renderActions ? renderActions(item) : null}
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

// ── FAQ admin forma (P2-E1) ───────────────────────────────────────────────────

function FaqForm({ initial, categories, lang, onSaved, onCancel, t }) {
  const [category, setCategory] = useState(initial?.category || categories[0]?.id || 'dashboard')
  const [question, setQuestion] = useState(initial?.question || '')
  const [keywords, setKeywords] = useState(initial?.keywords || '')
  const [answer, setAnswer] = useState(initial?.answer || '')
  const [position, setPosition] = useState(initial?.position ?? 0)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!question.trim() || !answer.trim()) { toast.error(t('qa2.admin.required')); return }
    setBusy(true)
    try {
      const body = { category, lang, question, keywords, answer, position: Number(position) || 0 }
      if (initial?.id) await api.updateFaq(initial.id, body)
      else await api.createFaq(body)
      onSaved()
    } catch (e) {
      toast.error(e.message)
    } finally { setBusy(false) }
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
      <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 14 }}>
        {initial?.id ? t('qa2.admin.editTitle') : t('qa2.admin.newTitle')} ({lang})
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12, marginBottom: 12 }}>
        <div>
          <Label>{t('qa2.admin.category')}</Label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontFamily: 'Hanken Grotesk', fontSize: 14 }}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <Label>{t('qa2.admin.position')}</Label>
          <Input type="number" value={position} onChange={e => setPosition(e.target.value)} style={{ width: '100%' }} />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <Label>{t('qa2.admin.question')}</Label>
        <Input value={question} onChange={e => setQuestion(e.target.value)} style={{ width: '100%' }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <Label>{t('qa2.admin.keywords')}</Label>
        <Input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder={t('qa2.admin.keywordsHint')} style={{ width: '100%' }} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <Label>{t('qa2.admin.answer')}</Label>
        <textarea value={answer} onChange={e => setAnswer(e.target.value)} rows={8}
          className="ui-input" style={{ width: '100%', fontSize: 13, resize: 'vertical', fontFamily: 'monospace' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onCancel}>{t('tabs.cancel')}</Button>
        <Button variant="primary" onClick={save} disabled={busy}>{busy ? t('app.loading') : t('settings.jira.save')}</Button>
      </div>
    </div>
  )
}

// ── QAPage ────────────────────────────────────────────────────────────────────

export default function QAPage({ user, theme, onLogout, onOpenSettings, onOpenUsers, projects = [] }) {
  const t = useT()
  const { lang } = useLang()
  const confirm = useConfirm()
  const isAdmin = !isClientRole(user?.role)
  const [openId, setOpenId] = useState(null)
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState('all')
  const [searchFocused, setSearchFocused] = useState(false)

  // FAQ iz baze (P2-E1); ugrađeni sadržaj je fallback dok tabela nije popunjena
  const [dbFaq, setDbFaq] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [formItem, setFormItem] = useState(null) // null | {} (novo) | red iz baze

  function loadFaq() {
    api.getFaq(lang).then(r => setDbFaq(r?.faq || [])).catch(() => setDbFaq([]))
  }
  useEffect(() => { loadFaq() }, [lang]) // eslint-disable-line react-hooks/exhaustive-deps

  const localData = useMemo(() => getQaData(t), [t])
  const usingDb = !!(dbFaq && dbFaq.length > 0)

  const QA_DATA_STABLE = useMemo(() => {
    if (usingDb) {
      const metaById = Object.fromEntries(localData.map(c => [c.id, c]))
      const fallbackMeta = localData[0]
      const byCat = {}
      for (const row of dbFaq) (byCat[row.category] ||= []).push(row)
      const order = [
        ...localData.map(c => c.id).filter(id => byCat[id]),
        ...Object.keys(byCat).filter(id => !localData.some(c => c.id === id)),
      ]
      return order.map(id => {
        const meta = metaById[id] || fallbackMeta
        return {
          id,
          label: metaById[id]?.label || id,
          icon: meta.icon,
          iconBg: meta.iconBg,
          iconColor: meta.iconColor,
          questions: byCat[id].map(row => ({
            uid: `db-${row.id}`,
            db: row,
            q: row.question,
            text: row.keywords || '',
            a: <div dangerouslySetInnerHTML={{ __html: row.answer }} />,
          })),
        }
      })
    }
    return localData.map(cat => ({
      ...cat,
      questions: cat.questions.map((q, qi) => ({ ...q, uid: `${cat.id}-${qi}` })),
    }))
  }, [usingDb, dbFaq, localData])

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

  async function handleDelete(item) {
    if (!(await confirm(t('qa2.admin.deleteConfirm')))) return
    try {
      await api.deleteFaq(item.db.id)
      loadFaq()
    } catch (e) { toast.error(e.message) }
  }

  const renderActions = editMode && usingDb ? item => (
    <span style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
      <Button variant="pill" onClick={() => { setFormItem(item.db); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>{t('qa2.admin.edit')}</Button>
      <Button variant="pill" style={{ color: 'var(--red)' }} onClick={() => handleDelete(item)}>{t('rn.delete')}</Button>
    </span>
  ) : null

  return (
    <div className="page-in" style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Topbar
        user={user}
        theme={theme}
        onLogout={onLogout}
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
          {isAdmin && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
              <Button variant={editMode ? 'primary' : 'ghost'} onClick={() => { setEditMode(m => !m); setFormItem(null) }}>
                {editMode ? t('qa2.admin.done') : t('qa2.admin.manage')}
              </Button>
              {editMode && usingDb && (
                <Button variant="subtle" onClick={() => { setFormItem({}) }}>{t('qa2.admin.new')}</Button>
              )}
            </div>
          )}
          {isAdmin && editMode && !usingDb && (
            <p style={{ marginTop: 10, fontSize: 12, color: 'var(--amber)', fontFamily: "'Hanken Grotesk', sans-serif" }}>
              {t('qa2.admin.seedHint')}
            </p>
          )}
        </div>

        {isAdmin && editMode && formItem && (
          <FaqForm
            initial={formItem.id ? formItem : null}
            categories={localData.map(c => ({ id: c.id, label: c.label }))}
            lang={lang}
            t={t}
            onCancel={() => setFormItem(null)}
            onSaved={() => { setFormItem(null); loadFaq() }}
          />
        )}

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
              renderActions={renderActions}
            />
          ))
        )}

      </div>
    </div>
  )
}
