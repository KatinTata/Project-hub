import { api } from '../../api.js'
import { useT } from '../../lang.jsx'
import JqlEditor from '../../components/JqlEditor.jsx'
import JqlFieldSelect from './JqlFieldSelect.jsx'
import Step1Row from './Step1Row.jsx'
import { statusCat } from './uiHelpers.js'
import { labelStyle, inputStyle, smallBtnStyle, pillBtnStyle } from './uiHelpers.js'

// Wizard step 1: pick project / JQL / copy-from-existing, then select tasks.
export default function SelectStep({ source, config, setConfigField, isMobile, onContinue }) {
  const t = useT()
  const {
    projects, selectedProject, setSelectedProject,
    tasks, loadingTasks, taskError,
    customJql, setCustomJql, qf, setQf, qfOp, setQfOp, setFetchTrigger,
    search, setSearch, statusFilter, setStatusFilter,
    selectedIds, setSelectedIds, toggleSelected,
    copyDropOpen, setCopyDropOpen, existingNotes, setExistingNotes, copyLoading, copiedEdits,
    applyQuickFilters, fetchFieldSuggestions, handleCopyFromNote, handleAddByJql,
    filteredTasks, countByStatus,
  } = source

  return (
    <div>
      {/* Config bar */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>{t('rne.project')}</label>
            <select value={selectedProject?.id || ''} onChange={e => setSelectedProject(projects.find(p => p.id == e.target.value) || null)}
              style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontFamily: 'Hanken Grotesk', fontSize: 14 }}>
              <option value="">{t('rne.selectProject')}</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.displayName || p.epicKey}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>{t('rne.clientName')}</label>
            <input value={config.clientName} onChange={e => setConfigField('clientName', e.target.value)} placeholder={t('rne.clientPlaceholder')}
              style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t('rne.version')}</label>
            <input value={config.version} onChange={e => setConfigField('version', e.target.value)} placeholder={t('rne.versionPlaceholder')}
              style={inputStyle} />
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16, alignItems: 'flex-start' }}>
          {/* JQL column */}
          <div style={{ flex: 1, width: isMobile ? '100%' : undefined }}>
            <div style={{ marginBottom: 10 }}>
              <span style={labelStyle}>{t('rne.quickFilters')} <span style={{ textTransform: 'none', fontFamily: 'Hanken Grotesk', color: 'var(--textSubtle)' }}>{t('rne.quickFiltersHint')}</span></span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <JqlFieldSelect label="Fix Version" fieldName="fixVersion" values={qf.version} onChange={v => setQf(p => ({ ...p, version: v }))} op={qfOp.version} onOpChange={o => setQfOp(p => ({ ...p, version: o }))} fetchSuggestions={fetchFieldSuggestions} placeholder={t('rne.egVersion')} />
                <JqlFieldSelect label="Client - Impact Scope" fieldName="Client - Impact Scope" values={qf.impact} onChange={v => setQf(p => ({ ...p, impact: v }))} op={qfOp.impact} onOpChange={o => setQfOp(p => ({ ...p, impact: o }))} fetchSuggestions={fetchFieldSuggestions} placeholder={t('rne.egImpact')} />
                <JqlFieldSelect label="Client Requested" fieldName="Client Requested" values={qf.requested} onChange={v => setQf(p => ({ ...p, requested: v }))} op={qfOp.requested} onOpChange={o => setQfOp(p => ({ ...p, requested: o }))} fetchSuggestions={fetchFieldSuggestions} placeholder={t('rne.egRequested')} />
                <button onClick={applyQuickFilters} style={{ ...smallBtnStyle, height: 34 }}>{t('rne.buildJql')}</button>
              </div>
            </div>
            <label style={labelStyle}>{t('rne.customJql')}</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <JqlEditor
                  value={customJql}
                  onChange={setCustomJql}
                  placeholder={t('rne.jqlPlaceholder')}
                  rows={2}
                  showPreview={false}
                />
              </div>
              {(() => {
                const applyDisabled = (!selectedProject && !customJql.trim()) || (copiedEdits && tasks.length > 0 && !customJql.trim())
                return (
                  <button
                    disabled={applyDisabled}
                    title={applyDisabled ? t('rne.selectProjectOrJql') : ''}
                    onClick={() => {
                      if (copiedEdits && tasks.length > 0) handleAddByJql()
                      else setFetchTrigger(n => n + 1)
                    }}
                    style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontFamily: 'Hanken Grotesk', fontWeight: 600, border: 'none', whiteSpace: 'nowrap', transition: 'all 0.2s ease',
                      cursor: applyDisabled ? 'not-allowed' : 'pointer',
                      background: applyDisabled ? 'var(--surfaceAlt)' : 'var(--accent)',
                      color: applyDisabled ? 'var(--textMuted)' : '#fff',
                    }}>
                    {copiedEdits && tasks.length > 0 ? t('rne.add') : t('rne.apply')}
                  </button>
                )
              })()}
            </div>
            {!selectedProject && (
              <div style={{ marginTop: 6, fontFamily: 'Hanken Grotesk', fontSize: 12, color: 'var(--textMuted)' }}>
                {t('rne.noProjectJqlHintPre')}<code>fixVersion = "EP 3.6"</code>{t('rne.noProjectJqlHintPost')}
              </div>
            )}
          </div>

          {/* Copy from existing column */}
          <div style={{ width: isMobile ? '100%' : 190, flexShrink: 0 }}>
            <label style={labelStyle}>{t('rne.copyFromExisting')}</label>
            <div style={{ position: 'relative' }} data-copy-dropdown>
              <button
                onClick={() => {
                  const next = !copyDropOpen
                  setCopyDropOpen(next)
                  if (next && existingNotes === null) {
                    api.getReleaseNotesList()
                      .then(d => setExistingNotes(d.notes || []))
                      .catch(() => setExistingNotes([]))
                  }
                }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'Hanken Grotesk', fontSize: 13, fontWeight: 500, transition: 'all 0.15s',
                  background: copiedEdits ? 'rgba(34,197,94,0.08)' : 'var(--bg)',
                  border: `1px solid ${copiedEdits ? 'rgba(34,197,94,0.35)' : 'var(--border)'}`,
                  color: copiedEdits ? 'var(--green)' : 'var(--text)',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {copyLoading ? t('rne.loading') : copiedEdits ? t('rne.copyLoaded') : t('rne.selectReleaseNotes')}
                </span>
                <span style={{ fontSize: 10, flexShrink: 0, transform: copyDropOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block', color: 'var(--textMuted)' }}>▾</span>
              </button>
              <p style={{ margin: '5px 0 0', fontFamily: 'Hanken Grotesk', fontSize: 11, color: 'var(--textMuted)', lineHeight: 1.4 }}>
                {copiedEdits ? t('rne.tasksLoaded') : t('rne.copyDesc')}
              </p>
              {copyDropOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, minWidth: 300, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', zIndex: 200, overflow: 'hidden' }}>
                  {existingNotes === null ? (
                    <div style={{ padding: '12px 16px', fontFamily: 'Hanken Grotesk', fontSize: 13, color: 'var(--textMuted)' }}>{t('rne.loading')}</div>
                  ) : existingNotes.length === 0 ? (
                    <div style={{ padding: '12px 16px', fontFamily: 'Hanken Grotesk', fontSize: 13, color: 'var(--textMuted)' }}>{t('rne.noPublished')}</div>
                  ) : (
                    <div style={{ maxHeight: 240, overflowY: 'auto', padding: 6 }}>
                      {existingNotes.map(note => (
                        <button
                          key={note.id}
                          disabled={copyLoading}
                          onClick={() => handleCopyFromNote(note)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', background: 'transparent', border: 'none', borderRadius: 7, cursor: copyLoading ? 'not-allowed' : 'pointer', textAlign: 'left', transition: 'background 0.1s', opacity: copyLoading ? 0.6 : 1 }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--surfaceAlt)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span style={{ flex: 1, fontFamily: 'Hanken Grotesk', fontSize: 13, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.title || t('rne.noTitle')}</span>
                          {note.version && (
                            <span style={{ fontFamily: 'Hanken Grotesk', fontSize: 10, color: 'var(--accent)', background: 'rgba(79,142,247,0.1)', border: '1px solid rgba(79,142,247,0.25)', borderRadius: 4, padding: '1px 6px', flexShrink: 0 }}>{note.version}</span>
                          )}
                          <span style={{ fontFamily: 'Hanken Grotesk', fontSize: 10, color: 'var(--textMuted)', flexShrink: 0 }}>{new Date(note.created_at).toLocaleDateString('sr-Latn-RS')}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Task list */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 15, color: 'var(--text)', marginRight: 4 }}>
              {t('rne.selectTasks')}
              {tasks.length > 0 && (
                <span style={{ fontFamily: 'Hanken Grotesk', fontSize: 12, color: 'var(--textMuted)', fontWeight: 400, marginLeft: 8 }}>
                  {selectedIds.size}/{tasks.length}
                </span>
              )}
            </span>
            {tasks.length > 0 && (
              <>
                <button onClick={() => setSelectedIds(new Set(tasks.map(t => t.id)))} style={pillBtnStyle}>{t('rne.selectAll')}</button>
                <button onClick={() => setSelectedIds(new Set())} style={pillBtnStyle}>{t('rne.clearAll')}</button>
                <button onClick={() => setSelectedIds(new Set(tasks.filter(t => statusCat(t) === 'resolved').map(t => t.id)))} style={pillBtnStyle}>{t('rne.onlyResolved')}</button>
              </>
            )}
            <button onClick={onContinue} disabled={selectedIds.size === 0}
              style={{ marginLeft: 'auto', padding: '7px 20px', borderRadius: 8, fontSize: 13, fontFamily: 'Hanken Grotesk', fontWeight: 600, border: 'none', transition: 'all 0.2s ease', cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer', background: selectedIds.size === 0 ? 'var(--surfaceAlt)' : 'var(--accent)', color: selectedIds.size === 0 ? 'var(--textMuted)' : '#fff', whiteSpace: 'nowrap' }}>
              {t('rne.continue')} {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
            </button>
          </div>

          <input placeholder={t('rne.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontFamily: 'Hanken Grotesk', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }} />

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontFamily: 'Hanken Grotesk', fontSize: 11, color: 'var(--textMuted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 2 }}>{t('rne.filterLabel')}</span>
            {[
              { key: 'all', label: t('rne.filterAll', { count: countByStatus.all }) },
              { key: 'resolved', label: `Resolved (${countByStatus.resolved})` },
              { key: 'inprog', label: `In Progress (${countByStatus.inprog})` },
              { key: 'testing', label: `For Testing (${countByStatus.testing})` },
            ].map(f => {
              const on = statusFilter === f.key
              return (
                <button key={f.key} onClick={() => setStatusFilter(f.key)} style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, fontFamily: 'Hanken Grotesk', cursor: 'pointer', transition: 'all 0.2s ease',
                  border: on ? '1px solid var(--accent)' : '1px solid var(--borderHover)',
                  color: on ? '#fff' : 'var(--text)', background: on ? 'var(--accent)' : 'var(--surfaceAlt)',
                }}>{f.label}</button>
              )
            })}
          </div>
        </div>

        {/* Rows */}
        <div>
          {loadingTasks ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--textMuted)', fontFamily: 'Hanken Grotesk', fontSize: 14 }}>{t('rne.loading')}</div>
          ) : taskError ? (
            <div style={{ padding: 24, margin: 16, borderRadius: 8, background: 'var(--redTint)', border: '1px solid var(--red)', color: 'var(--red)', fontFamily: 'Hanken Grotesk', fontSize: 13 }}>
              <strong>{t('rne.errorLabel')}:</strong> {taskError}
            </div>
          ) : (!selectedProject && !customJql.trim()) ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--textMuted)', fontFamily: 'Hanken Grotesk', fontSize: 14 }}>{t('rne.noTasksEmpty')}</div>
          ) : filteredTasks.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--textMuted)', fontFamily: 'Hanken Grotesk', fontSize: 14 }}>{t('rne.noTasksEmpty')}</div>
          ) : filteredTasks.map(task => (
            <Step1Row key={task.id} task={task} selected={selectedIds.has(task.id)} onToggle={() => toggleSelected(task.id)} />
          ))}
        </div>
      </div>
    </div>
  )
}
