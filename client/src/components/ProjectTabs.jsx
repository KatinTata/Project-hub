import { useState, useEffect, useRef } from 'react'
import { useWindowSize } from '../hooks/useWindowSize.js'
import { useT } from '../lang.jsx'

function statusDot(data) {
  if (!data) return 'var(--textMuted)'
  const pct = data.total > 0 ? data.done / data.total : 0
  if (pct >= 0.8) return 'var(--green)'
  if (pct >= 0.4) return 'var(--amber)'
  return 'var(--red)'
}

export default function ProjectTabs({ projects, activeId, onSelect, onAdd, onArchive, onOpenArchive, onOpenSettings, projectData }) {
  const t = useT()
  const { isMobile } = useWindowSize()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [addHover, setAddHover] = useState(false)
  const [confirmId, setConfirmId] = useState(null)
  const [visibleCount, setVisibleCount] = useState(null)
  const [overflowOpen, setOverflowOpen] = useState(false)

  const measureRef = useRef(null)
  const visibleRef = useRef(null)
  const overflowRef = useRef(null)

  function handleArchiveConfirm(id) {
    setConfirmId(null)
    setDropdownOpen(false)
    setOverflowOpen(false)
    onArchive?.(id)
  }

  const activeProject = projects.find(p => p.id === activeId)
  const overflowProjects = visibleCount !== null ? projects.slice(visibleCount) : []
  const activeInOverflow = overflowProjects.some(p => p.id === activeId)

  // Close overflow dropdown on outside click
  useEffect(() => {
    if (!overflowOpen) return
    function handle(e) {
      if (overflowRef.current && !overflowRef.current.contains(e.target)) setOverflowOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [overflowOpen])

  // Measure pill widths from hidden container, compute visibleCount
  useEffect(() => {
    if (isMobile) return
    if (!visibleRef.current || !measureRef.current) return

    const OVERFLOW_BTN_W = 96
    const GAP = 8

    function recalc() {
      if (!visibleRef.current || !measureRef.current) return
      const pills = Array.from(measureRef.current.children)
      if (!pills.length) { setVisibleCount(null); return }
      const available = visibleRef.current.offsetWidth
      let total = 0
      let count = pills.length
      for (let i = 0; i < pills.length; i++) {
        const w = pills[i].offsetWidth + GAP
        const remaining = pills.length - i - 1
        const reserve = remaining > 0 ? OVERFLOW_BTN_W + GAP : 0
        if (total + w + reserve > available) { count = i; break }
        total += w
      }
      setVisibleCount(count >= pills.length ? null : Math.max(1, count))
    }

    const ro = new ResizeObserver(recalc)
    ro.observe(visibleRef.current)
    recalc()
    return () => ro.disconnect()
  }, [projects.length, isMobile])

  return (
    <>
      {/* Hidden measurement container — all pills off-screen */}
      {!isMobile && (
        <div ref={measureRef} aria-hidden style={{ position: 'fixed', top: -9999, left: -9999, display: 'flex', gap: 8, pointerEvents: 'none', visibility: 'hidden' }}>
          {projects.map(p => (
            <ProjectPill key={p.id} project={p} active={false} dot="transparent"
              onSelect={() => {}} onArchive={null} confirmId={null} setConfirmId={() => {}} onArchiveConfirm={() => {}} />
          ))}
        </div>
      )}

      <div style={{
        position: 'sticky', top: 56, zIndex: 90,
        background: 'var(--surface)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        padding: isMobile ? '8px 12px' : '0 28px', gap: 8,
      }}>

        {isMobile ? (
          <>
            <div style={{ flex: 1, position: 'relative' }}>
              <button
                onClick={() => setDropdownOpen(o => !o)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px', borderRadius: 20, border: 'none',
                  background: 'var(--accent)', color: '#fff',
                  fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, fontSize: 14,
                  cursor: 'pointer', minHeight: 44,
                  boxShadow: '0 2px 12px rgba(79,142,247,0.35)', maxWidth: '100%',
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(255,255,255,0.85)', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {activeProject ? (activeProject.displayName || activeProject.epicKey) : t('tabs.selectProject')}
                </span>
                <span style={{ fontSize: 10, opacity: 0.8, flexShrink: 0, transition: 'transform 0.2s', transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
              </button>

              {dropdownOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => { setDropdownOpen(false); setConfirmId(null) }} />
                  <div className="glass-card" style={{
                    position: 'absolute', top: 'calc(100% + 8px)', left: 0, minWidth: '100%',
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                    zIndex: 101, overflow: 'hidden', padding: 6,
                    display: 'flex', flexDirection: 'column', gap: 4,
                    maxHeight: '60vh', overflowY: 'auto',
                  }}>
                    {projects.map(p => {
                      const active = p.id === activeId
                      const dot = statusDot(projectData[p.id])
                      const confirming = confirmId === p.id
                      return (
                        <div key={p.id}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <button
                              onClick={() => { onSelect(p.id); setDropdownOpen(false); setConfirmId(null) }}
                              style={{
                                flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                                padding: '9px 12px', borderRadius: 10,
                                border: active ? 'none' : '1px solid var(--border)',
                                background: active ? 'var(--accent)' : 'transparent',
                                color: active ? '#fff' : 'var(--text)',
                                fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
                                fontWeight: active ? 600 : 400, fontSize: 14,
                                cursor: 'pointer', minHeight: 44, textAlign: 'left',
                                boxShadow: active ? '0 2px 8px rgba(79,142,247,0.25)' : 'none',
                              }}
                            >
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? 'rgba(255,255,255,0.85)' : dot, flexShrink: 0 }} />
                              <span style={{ flex: 1 }}>{p.displayName || p.epicKey}</span>
                            </button>
                            {onArchive && (
                              <button
                                onClick={e => { e.stopPropagation(); setConfirmId(confirming ? null : p.id) }}
                                title={t('tabs.removeProject')}
                                style={{
                                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                                  border: '1px solid var(--border)', background: confirming ? 'var(--redTint)' : 'transparent',
                                  color: confirming ? 'var(--red)' : 'var(--textMuted)',
                                  fontSize: 14, cursor: 'pointer', transition: 'all 0.15s ease',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                              >
                                ×
                              </button>
                            )}
                          </div>
                          {confirming && (
                            <div style={{ margin: '4px 0 2px 0', padding: '10px 12px', background: 'var(--redTint)', border: '1px solid #EF444430', borderRadius: 8 }}>
                              <div style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, color: 'var(--text)', marginBottom: 8 }}>
                                {t('tabs.archiveConfirm')}
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => setConfirmId(null)} style={{ flex: 1, padding: '6px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--textMuted)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, cursor: 'pointer' }}>
                                  {t('tabs.cancel')}
                                </button>
                                <button onClick={() => handleArchiveConfirm(p.id)} style={{ flex: 1, padding: '6px', borderRadius: 6, border: 'none', background: 'var(--red)', color: '#fff', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                                  {t('tabs.archive')}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <button
                      onClick={() => { setDropdownOpen(false); onOpenArchive?.() }}
                      style={{
                        padding: '8px 12px', borderRadius: 8, border: 'none',
                        background: 'transparent', color: 'var(--textMuted)',
                        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12,
                        cursor: 'pointer', textAlign: 'left', marginTop: 4,
                        borderTop: '1px solid var(--border)', paddingTop: 10,
                      }}
                    >
                      {t('tabs.archiveTitle')}
                    </button>
                  </div>
                </>
              )}
            </div>

            {(onAdd || onOpenSettings) && (
              <button
                onClick={() => onAdd ? onAdd() : onOpenSettings?.()}
                title={t('tabs.addProject')}
                style={{
                  width: 40, height: 40, borderRadius: '50%',
                  border: '2px dashed var(--borderHover)', background: 'transparent',
                  color: 'var(--accent)', fontSize: 20,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s ease',
                }}
                onTouchStart={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderStyle = 'solid' }}
                onTouchEnd={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderStyle = 'dashed' }}
              >
                +
              </button>
            )}
          </>
        ) : (
          /* ── Desktop: pill tabs with overflow dropdown ── */
          <>
            <div ref={visibleRef} style={{
              flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center',
              gap: 8, padding: '10px 0',
            }}>
              {(visibleCount !== null ? projects.slice(0, visibleCount) : projects).map(p => (
                <ProjectPill
                  key={p.id}
                  project={p}
                  active={p.id === activeId}
                  dot={statusDot(projectData[p.id])}
                  onSelect={onSelect}
                  onArchive={onArchive}
                  confirmId={confirmId}
                  setConfirmId={setConfirmId}
                  onArchiveConfirm={handleArchiveConfirm}
                />
              ))}

              {/* Overflow "Vidi više" button */}
              {visibleCount !== null && (
                <div ref={overflowRef} style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    onClick={() => setOverflowOpen(o => !o)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 20,
                      border: `1px solid ${overflowOpen || activeInOverflow ? 'var(--accent)' : 'var(--border)'}`,
                      background: overflowOpen ? 'rgba(79,142,247,0.1)' : activeInOverflow ? 'rgba(79,142,247,0.06)' : 'transparent',
                      color: overflowOpen || activeInOverflow ? 'var(--accent)' : 'var(--textMuted)',
                      fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
                      fontSize: 13, fontWeight: 500,
                      cursor: 'pointer', transition: 'all 0.2s ease', whiteSpace: 'nowrap',
                    }}
                  >
                    +{projects.length - visibleCount}
                    <span style={{ fontSize: 9, transition: 'transform 0.2s', transform: overflowOpen ? 'rotate(180deg)' : 'none', display: 'inline-block' }}>▼</span>
                  </button>

                  {overflowOpen && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 8px)', left: 0,
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                      zIndex: 200, padding: 6, minWidth: 220, maxWidth: 360,
                      display: 'flex', flexDirection: 'column', gap: 2,
                    }}>
                      {overflowProjects.map(p => {
                        const active = p.id === activeId
                        const dot = statusDot(projectData[p.id])
                        const confirming = confirmId === p.id
                        return (
                          <div key={p.id}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <button
                                onClick={() => { onSelect(p.id); setOverflowOpen(false); setConfirmId(null) }}
                                style={{
                                  flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                                  padding: '8px 10px', borderRadius: 8, border: 'none',
                                  background: active ? 'var(--accent)' : 'transparent',
                                  color: active ? '#fff' : 'var(--text)',
                                  fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
                                  fontWeight: active ? 600 : 400, fontSize: 13,
                                  cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surfaceAlt)' }}
                                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                              >
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? 'rgba(255,255,255,0.85)' : dot, flexShrink: 0 }} />
                                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.displayName || p.epicKey}</span>
                              </button>
                              {onArchive && (
                                <button
                                  onClick={e => { e.stopPropagation(); setConfirmId(confirming ? null : p.id) }}
                                  title={t('tabs.removeProject')}
                                  style={{
                                    width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                                    border: '1px solid var(--border)', background: confirming ? 'var(--redTint)' : 'transparent',
                                    color: confirming ? 'var(--red)' : 'var(--textMuted)',
                                    cursor: 'pointer', transition: 'all 0.15s ease',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
                                  }}
                                >
                                  ×
                                </button>
                              )}
                            </div>
                            {confirming && (
                              <div style={{ margin: '4px 0 2px', padding: '10px 10px', background: 'var(--redTint)', border: '1px solid #EF444430', borderRadius: 8 }}>
                                <div style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, color: 'var(--text)', marginBottom: 8 }}>
                                  {t('tabs.archiveConfirm')}
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button onClick={() => setConfirmId(null)} style={{ flex: 1, padding: '6px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--textMuted)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 12, cursor: 'pointer' }}>
                                    {t('tabs.cancel')}
                                  </button>
                                  <button onClick={() => handleArchiveConfirm(p.id)} style={{ flex: 1, padding: '6px', borderRadius: 6, border: 'none', background: 'var(--red)', color: '#fff', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                                    {t('tabs.archive')}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {(onOpenArchive || onAdd || onOpenSettings) && (
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 16, borderLeft: projects.length > 0 ? '1px solid var(--border)' : 'none', marginLeft: 8 }}>
                {onOpenArchive && (
                  <button
                    onClick={onOpenArchive}
                    title={t('tabs.archiveTitle')}
                    style={{
                      width: 32, height: 32, borderRadius: '50%',
                      border: '1px solid var(--border)', background: 'transparent',
                      color: 'var(--textMuted)', fontSize: 15,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--borderHover)'; e.currentTarget.style.color = 'var(--text)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--textMuted)' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1.5" y="2" width="11" height="3" rx="0.5"/>
                      <path d="M2.5 5v6.5a.5.5 0 00.5.5h8a.5.5 0 00.5-.5V5M5.5 8h3"/>
                    </svg>
                  </button>
                )}

                {(onAdd || onOpenSettings) && (
                  <button
                    onClick={() => onAdd ? onAdd() : onOpenSettings?.()}
                    onMouseEnter={() => setAddHover(true)}
                    onMouseLeave={() => setAddHover(false)}
                    style={{
                      padding: '5px 12px', borderRadius: 8,
                      border: addHover ? '2px solid var(--accent)' : '2px dashed var(--borderHover)',
                      background: addHover ? 'rgba(79,142,247,0.08)' : 'transparent',
                      color: addHover ? 'var(--accent)' : 'var(--textMuted)',
                      fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
                      fontSize: 12, fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: 5,
                      cursor: 'pointer', transition: 'all 0.2s ease', whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
                    {t('tabs.addProject')}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Inline confirm overlay for desktop */}
      {confirmId && !isMobile && !overflowOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 200 }} onClick={() => setConfirmId(null)} />
          <div className="glass-card" style={{
            position: 'fixed', top: 110, left: '50%', transform: 'translateX(-50%)',
            zIndex: 201, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '20px 24px', minWidth: 300,
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}>
            <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 6 }}>
              {t('tabs.archiveConfirm')}
            </div>
            <div style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 13, color: 'var(--textMuted)', marginBottom: 20 }}>
              {t('tabs.archiveDesc')}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmId(null)} style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 14, cursor: 'pointer' }}>
                {t('tabs.cancel')}
              </button>
              <button onClick={() => handleArchiveConfirm(confirmId)} style={{ flex: 1, padding: '9px', borderRadius: 8, border: 'none', background: 'var(--red)', color: '#fff', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                {t('tabs.archive')}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

function ProjectPill({ project, active, dot, onSelect, onArchive, confirmId, setConfirmId, onArchiveConfirm }) {
  const t = useT()
  const [hover, setHover] = useState(false)

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => onSelect(project.id)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: active ? '8px 12px 8px 16px' : '8px 16px',
          borderRadius: 20,
          border: active ? 'none' : `1px solid ${hover ? 'var(--borderHover)' : 'var(--border)'}`,
          background: active ? 'var(--accent)' : hover ? 'var(--surfaceAlt)' : 'transparent',
          color: active ? '#fff' : 'var(--text)',
          fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
          fontWeight: active ? 600 : 500, fontSize: 14,
          whiteSpace: 'nowrap', transition: 'all 0.2s ease',
          boxShadow: active ? '0 2px 12px rgba(79,142,247,0.35)' : 'none',
          cursor: 'pointer',
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? 'rgba(255,255,255,0.85)' : dot, flexShrink: 0 }} />
        <span>{project.displayName || project.epicKey}</span>
        {onArchive && (hover || active) && (
          <span
            onClick={e => { e.stopPropagation(); setConfirmId(confirmId === project.id ? null : project.id) }}
            title={t('tabs.removeProject')}
            style={{
              width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
              background: active ? 'rgba(255,255,255,0.25)' : 'var(--border)',
              color: active ? '#fff' : 'var(--textMuted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, lineHeight: 1, cursor: 'pointer', transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--red)'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = active ? 'rgba(255,255,255,0.25)' : 'var(--border)'; e.currentTarget.style.color = active ? '#fff' : 'var(--textMuted)' }}
          >
            ×
          </span>
        )}
      </button>
    </div>
  )
}
