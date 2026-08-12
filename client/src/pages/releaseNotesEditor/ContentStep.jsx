import { memo } from 'react'
import { useT } from '../../lang.jsx'
import RichBodyEditor from '../../components/RichBodyEditor.jsx'
import { GROUP_CONFIG, KEY_COLORS, keyPrefixOf, getHelpLinks, migrateBodyHtml } from '../../lib/renderReleaseNoteHtml.js'
import { buildHelpUrl, smallBtnStyle, iconBtnStyle } from './uiHelpers.js'
import { IconLink } from '../../ui/icons.jsx'

// Stabilna referenca za taskove bez izmena — čuva memo dosledan identitet
const EMPTY_EDIT = {}

// Kartica jednog taska — React.memo (B1): kucanje u jednom tasku menja samo
// njegov `edit` objekat, pa ostale kartice (i njihovi TipTap editori) ne
// re-renderuju. Svi handleri iz hook-ova su stabilni (useCallback + ref).
const ContentTaskCard = memo(function ContentTaskCard({
  task, edit, prefix, cfgColor, isInsertTarget,
  aiLoading, aiCooldown, bulkActive, hasBackup, hasAiKey, jiraUrl,
  updateEdit, updateBody, generateTaskDesc, translateTask, revertAi,
  removeFromSelection, showToast, applyDrop, setDragOverTaskId, setDragOverPrefix,
}) {
  const t = useT()
  const helpLinks = getHelpLinks(task)
  const keyC = KEY_COLORS[keyPrefixOf(task)] || KEY_COLORS.OTHER
  return (
    <div>
      {/* Drop indicator line */}
      {isInsertTarget && (
        <div style={{ height: 3, borderRadius: 2, background: cfgColor, margin: '2px 0', opacity: 0.7 }} />
      )}
      <div
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; setDragOverTaskId(task.id); setDragOverPrefix(prefix) }}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); applyDrop(prefix, task.id) }}
        style={{ background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontFamily: 'Hanken Grotesk', fontSize: 11, padding: '3px 9px', borderRadius: 6, background: keyC.bg, color: keyC.color, border: `1px solid ${keyC.border}`, flexShrink: 0 }}>{task.key}</span>
          <input value={edit.name || ''} onChange={e => updateEdit(task.id, 'name', e.target.value)} placeholder={t('rne.taskNamePlaceholder')}
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontFamily: 'Hanken Grotesk', fontSize: 14, fontWeight: 600 }} />
          <button onClick={() => removeFromSelection(task.id)} title={t('rne.removeTask')} style={{ ...iconBtnStyle, color: 'var(--textMuted)' }}>×</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          <button onClick={() => !aiLoading && !aiCooldown && !bulkActive && generateTaskDesc(task.id)}
            disabled={aiLoading || aiCooldown || bulkActive}
            title={!hasAiKey ? t('rne.noApiKeyShort') : ''}
            style={{ padding: '5px 14px', borderRadius: 7, fontSize: 12, fontFamily: 'Hanken Grotesk', fontWeight: 600, border: '1px solid #7C3AED', background: '#7C3AED', color: '#fff', cursor: 'pointer', opacity: (!hasAiKey || aiCooldown || bulkActive) ? 0.45 : 1 }}>
            {aiLoading ? t('rne.generating') : t('rne.generateText')}
          </button>
          <button onClick={() => !aiLoading && !aiCooldown && !bulkActive && translateTask(task.id)}
            disabled={aiLoading || aiCooldown || bulkActive}
            title={!hasAiKey ? t('rne.noApiKeyShort') : ''}
            style={{ padding: '5px 14px', borderRadius: 7, fontSize: 12, fontFamily: 'Hanken Grotesk', fontWeight: 600, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', opacity: (!hasAiKey || aiCooldown || bulkActive) ? 0.45 : 1 }}>
            {t('rne.translate')}
          </button>
          {hasBackup && (
            <button onClick={() => revertAi(task.id)} title={t('rne.revertTitle')}
              style={{ padding: '5px 14px', borderRadius: 7, fontSize: 12, fontFamily: 'Hanken Grotesk', fontWeight: 600, border: '1px solid var(--amber)', background: 'var(--amberTint)', color: 'var(--amber)', cursor: 'pointer' }}>
              {t('rne.revertOriginal')}
            </button>
          )}
        </div>
        <RichBodyEditor
          value={migrateBodyHtml(edit)}
          onChange={html => updateBody(task.id, html)}
          placeholder={t('rne.bodyPlaceholder')}
          onError={showToast}
        />
        {helpLinks.map(link => (
          <div key={link.key} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8, marginTop: 4, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--amber)', display: 'flex', alignItems: 'center' }}><IconLink /></span>
            <span style={{ fontFamily: 'Hanken Grotesk', fontSize: 11, padding: '3px 9px', borderRadius: 6, background: 'rgba(245,158,11,0.15)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.3)', flexShrink: 0 }}>{link.key}</span>
            {link.summary && <span style={{ fontFamily: 'Hanken Grotesk', fontSize: 12, color: 'var(--textMuted)', flex: 1 }}>{link.summary}</span>}
            {buildHelpUrl(link.key, jiraUrl) && (
              <a href={buildHelpUrl(link.key, jiraUrl)} target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: 'Hanken Grotesk', fontSize: 12, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', padding: '3px 8px', border: '1px solid rgba(79,142,247,0.3)', borderRadius: 6 }}>
                {t('rne.open')}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
})

// Wizard step 2: edit task names/bodies grouped by section, AI generate/translate,
// drag tasks between sections, rename sections.
export default function ContentStep({ user, source, edits, sections, config, previewDate, hasAiKey, showToast, onBack, onNext }) {
  const t = useT()
  const { tasks, selectedIds, removeFromSelection } = source
  const {
    taskEdits, aiLoadingIds, aiCooldownIds, bulkProgress, aiBackup,
    updateEdit, updateBody, revertAi, revertAllAi,
    generateTaskDesc, translateTask, generateAllDescriptions, translateAll,
  } = edits
  const {
    dragOverPrefix, setDragOverPrefix, dragOverTaskId, setDragOverTaskId,
    editingSection, setEditingSection, editingSectionValue, setEditingSectionValue,
    setSectionLabels, dragFromPrefix, buildGroups, applyDrop, getSectionLabel,
  } = sections

  const selTasks = tasks.filter(t => selectedIds.has(t.id))
  const { groups, groupOrder } = buildGroups(selTasks)

  return (
    <div>
      <style>{`
        @page { margin: 16mm 18mm 20mm 18mm; }
        @media print {
          html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          * { font-family: 'Trebuchet MS', 'Century Gothic', Arial, sans-serif !important; }
          body { background: #fff !important; }
          [data-no-print] { display: none !important; }
          /* Hide topbar (sticky header) and stepper wrapper */
          body > div > div:first-child { display: none !important; }
          body > div > div:nth-child(2) > div:first-child { display: none !important; }
          .preview-wrap { padding: 20px 0 40px !important; border: none !important; background: #fff !important; }
        }
      `}</style>

      {/* Action bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ ...smallBtnStyle }}>{t('rn.back')}</button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={generateAllDescriptions} disabled={!!bulkProgress || !hasAiKey}
            style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontFamily: 'Hanken Grotesk', fontWeight: 600, cursor: 'pointer', border: '1px solid #7C3AED', background: '#7C3AED', color: '#fff', opacity: (!!bulkProgress || !hasAiKey) ? 0.5 : 1 }}>
            {bulkProgress?.action === 'generate' ? t('rne.generatingProgress', { current: bulkProgress.current, total: bulkProgress.total }) : t('rne.generateAll')}
          </button>
          <button onClick={translateAll} disabled={!!bulkProgress || !hasAiKey}
            style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontFamily: 'Hanken Grotesk', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', opacity: (!!bulkProgress || !hasAiKey) ? 0.5 : 1 }}>
            {bulkProgress?.action === 'translate' ? t('rne.translatingProgress', { current: bulkProgress.current, total: bulkProgress.total }) : t('rne.translateAll')}
          </button>
          {Object.keys(aiBackup).length > 0 && (
            <button onClick={revertAllAi} title={t('rne.revertAllTitle')}
              style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontFamily: 'Hanken Grotesk', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--amber)', background: 'var(--amberTint)', color: 'var(--amber)' }}>
              {t('rne.revertAllCount', { count: Object.keys(aiBackup).length })}
            </button>
          )}
          <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 2px' }} />
          <button onClick={onNext}
            style={{ padding: '9px 24px', borderRadius: 8, fontSize: 14, fontFamily: 'Hanken Grotesk', fontWeight: 600, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff' }}>
            {t('rne.nextPreview')}
          </button>
        </div>
      </div>
      <div style={{ fontFamily: 'Hanken Grotesk', fontSize: 12, color: 'var(--textMuted)', marginBottom: 16 }}>
        {t('rne.step3Hint')}
      </div>

      {/* Document */}
      <div className="preview-wrap" style={{ maxWidth: 860, margin: '0 auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '40px 48px' }}>
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontFamily: 'Hanken Grotesk', fontSize: 10, color: 'var(--textMuted)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 8 }}>INTELISALE</div>
          <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 800, fontSize: 36, color: 'var(--text)', lineHeight: 1.1, marginBottom: 6 }}>Release Notes</div>
          <div style={{ fontFamily: 'Hanken Grotesk', fontSize: 12, color: 'var(--textMuted)', marginBottom: 2 }}>{previewDate}</div>
          {config.clientName && <div style={{ fontFamily: 'Hanken Grotesk', fontSize: 12, color: 'var(--textMuted)' }}>{config.clientName}{config.version ? ` · ${config.version}` : ''}</div>}
          <div style={{ height: 2, marginTop: 20, background: 'linear-gradient(90deg, var(--accent) 0%, transparent 70%)', borderRadius: 2, opacity: 0.35 }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
          {groupOrder.map(prefix => {
            const baseCfg = GROUP_CONFIG[prefix] || { label: prefix, icon: '📋', color: '#8B99B5' }
            const cfg = { ...baseCfg, label: getSectionLabel(prefix) }
            const isDropTarget = dragOverPrefix === prefix
            return (
              <div
                key={prefix}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverPrefix !== prefix) setDragOverPrefix(prefix) }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) { setDragOverPrefix(null); setDragOverTaskId(null) } }}
                onDrop={e => { e.preventDefault(); applyDrop(prefix, null) }}
                style={{ borderRadius: 10, outline: isDropTarget ? `2px dashed ${cfg.color}50` : '2px dashed transparent', transition: 'outline 0.12s', padding: 4 }}
              >
                {/* Section header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 10, borderBottom: `2px solid ${cfg.color}28`, padding: '6px 8px 10px' }}>
                  {editingSection === prefix ? (
                    <input
                      autoFocus
                      value={editingSectionValue}
                      onChange={e => setEditingSectionValue(e.target.value)}
                      onBlur={() => {
                        if (editingSectionValue.trim()) setSectionLabels(prev => ({ ...prev, [prefix]: editingSectionValue.trim() }))
                        setEditingSection(null)
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') setEditingSection(null)
                      }}
                      style={{ fontFamily: 'Hanken Grotesk', fontWeight: 800, fontSize: 18, color: cfg.color, background: 'transparent', border: 'none', borderBottom: `2px solid ${cfg.color}`, outline: 'none', padding: '0 2px', minWidth: 80, flex: 1 }}
                    />
                  ) : (
                    <span
                      onClick={() => { setEditingSection(prefix); setEditingSectionValue(getSectionLabel(prefix)) }}
                      title={t('rne.renameSectionTitle')}
                      style={{ fontFamily: 'Hanken Grotesk', fontWeight: 800, fontSize: 18, color: cfg.color, cursor: 'pointer', borderBottom: '2px dashed transparent', transition: 'border-color 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.borderBottomColor = `${cfg.color}60`}
                      onMouseLeave={e => e.currentTarget.style.borderBottomColor = 'transparent'}
                    >{cfg.label}</span>
                  )}
                  <span style={{ fontFamily: 'Hanken Grotesk', fontSize: 11, padding: '2px 9px', borderRadius: 20, background: `${cfg.color}18`, color: cfg.color, border: `1px solid ${cfg.color}33` }}>{groups[prefix].length}</span>
                  {isDropTarget && dragFromPrefix.current !== prefix && (
                    <span style={{ fontFamily: 'Hanken Grotesk', fontSize: 11, color: cfg.color, marginLeft: 'auto', opacity: 0.8 }}>{t('rne.dropHere')}</span>
                  )}
                </div>

                {/* Task cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {groups[prefix].map(task => (
                    <ContentTaskCard
                      key={task.id}
                      task={task}
                      edit={taskEdits[task.id] || EMPTY_EDIT}
                      prefix={prefix}
                      cfgColor={cfg.color}
                      isInsertTarget={dragOverTaskId === task.id}
                      aiLoading={aiLoadingIds.has(task.id)}
                      aiCooldown={aiCooldownIds.has(task.id)}
                      bulkActive={!!bulkProgress}
                      hasBackup={!!aiBackup[task.id]}
                      hasAiKey={hasAiKey}
                      jiraUrl={user?.jiraUrl}
                      updateEdit={updateEdit}
                      updateBody={updateBody}
                      generateTaskDesc={generateTaskDesc}
                      translateTask={translateTask}
                      revertAi={revertAi}
                      removeFromSelection={removeFromSelection}
                      showToast={showToast}
                      applyDrop={applyDrop}
                      setDragOverTaskId={setDragOverTaskId}
                      setDragOverPrefix={setDragOverPrefix}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: 60, paddingTop: 20, borderTop: '1px solid var(--border)', textAlign: 'center', fontFamily: 'Hanken Grotesk', fontSize: 10, color: 'var(--textSubtle)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          INTELISALE · Empowering Sales Excellence · www.intelisale.com
        </div>
      </div>
    </div>
  )
}
