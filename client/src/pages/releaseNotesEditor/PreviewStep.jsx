import { DndContext, pointerWithin, PointerSensor, TouchSensor, useSensor, useSensors, useDraggable, useDroppable } from '@dnd-kit/core'
import { useT } from '../../lang.jsx'
import { GROUP_CONFIG } from '../../lib/renderReleaseNoteHtml.js'
import { smallBtnStyle } from './uiHelpers.js'

// Red u reorder listi: draggable ručica + droppable meta (ubacivanje ispred).
function ReorderRow({ task, edit, prefix, cfgColor, isTarget, t }) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `t-${task.id}`,
    data: { taskId: task.id, prefix },
  })
  const { setNodeRef: setDropRef } = useDroppable({
    id: `d-${task.id}`,
    data: { type: 'task', taskId: task.id, prefix },
  })
  return (
    <div ref={setDropRef}>
      {isTarget && <div style={{ height: 2, background: cfgColor, margin: '2px 6px', borderRadius: 2 }} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', background: 'var(--surfaceAlt)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 4, opacity: isDragging ? 0.45 : 1 }}>
        <span ref={setDragRef} {...listeners} {...attributes}
          title={t('rne.dragReorderTitle')}
          style={{ cursor: 'grab', color: 'var(--textSubtle)', letterSpacing: 2, userSelect: 'none', flexShrink: 0, touchAction: 'none' }}>⠿</span>
        <span style={{ fontFamily: 'Hanken Grotesk', fontSize: 11, color: 'var(--accent)', flexShrink: 0 }}>{task.key}</span>
        <span style={{ fontFamily: 'Hanken Grotesk', fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{edit.name || task.fields?.summary || ''}</span>
      </div>
    </div>
  )
}

// Sekcija kao droppable (prevlačenje na sekciju = dodaj na kraj te sekcije).
function ReorderSection({ prefix, label, color, children }) {
  const { setNodeRef } = useDroppable({ id: `s-${prefix}`, data: { type: 'section', prefix } })
  return (
    <div ref={setNodeRef} style={{ marginBottom: 6 }}>
      <div style={{ fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 12, color, padding: '4px 6px' }}>{label}</div>
      {children}
    </div>
  )
}

// Compact reorder list for the Pregled step — small rows make drag reliable.
// dnd-kit (Pointer + Touch senzori, P2-C6) pa prevlačenje radi i na dodir.
// Mutations flow into sectionOverrides/sectionTaskOrders, so the preview/PDF/
// publish all reflect the current order immediately.
function ReorderList({ t, source, edits, sections }) {
  const { tasks, selectedIds } = source
  const { taskEdits } = edits
  const {
    setDragOverPrefix, dragOverTaskId, setDragOverTaskId,
    dragTaskId, dragFromPrefix, buildGroups, applyDrop, getSectionLabel,
  } = sections
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  )
  const selTasks = tasks.filter(t => selectedIds.has(t.id))
  const { groups, groupOrder } = buildGroups(selTasks)

  function handleDragStart({ active }) {
    dragTaskId.current = active.data.current.taskId
    dragFromPrefix.current = active.data.current.prefix
  }
  function handleDragOver({ over }) {
    const d = over?.data?.current
    setDragOverTaskId(d?.type === 'task' ? d.taskId : null)
    setDragOverPrefix(d?.prefix ?? null)
  }
  function handleDragEnd({ over }) {
    const d = over?.data?.current
    if (d) applyDrop(d.prefix, d.type === 'task' ? d.taskId : null)
    else { dragTaskId.current = null; dragFromPrefix.current = null; setDragOverPrefix(null); setDragOverTaskId(null) }
  }

  return (
    <div style={{ marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontFamily: 'Hanken Grotesk', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
        {t('rne.order')} <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 400, fontSize: 12, color: 'var(--textMuted)' }}>{t('rne.orderHintPre')}<span style={{ letterSpacing: 2 }}>⠿</span>{t('rne.orderHintPost')}</span>
      </div>
      <div style={{ padding: 8 }}>
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          {groupOrder.map(prefix => {
            const cfg = { ...(GROUP_CONFIG[prefix] || { label: prefix, color: '#8B99B5' }), label: getSectionLabel(prefix) }
            return (
              <ReorderSection key={prefix} prefix={prefix} label={cfg.label} color={cfg.color}>
                {groups[prefix].map(task => (
                  <ReorderRow
                    key={task.id}
                    task={task}
                    edit={taskEdits[task.id] || {}}
                    prefix={prefix}
                    cfgColor={cfg.color}
                    isTarget={dragOverTaskId === task.id}
                    t={t}
                  />
                ))}
              </ReorderSection>
            )
          })}
        </DndContext>
      </div>
    </div>
  )
}

// Wizard step 3: final preview (iframe), reorder, title/date, export + publish.
export default function PreviewStep({ source, edits, sections, html, previewTitle, setPreviewTitle, previewDate, setPreviewDate, publishState, setPublishState, onBack, onOpenHtmlPreview, onExportHtml, onExportExcel, onExportPdf, onOpenPublishModal }) {
  const t = useT()
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <button onClick={onBack} style={{ ...smallBtnStyle }}>{t('rn.back')}</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={onOpenHtmlPreview} style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontFamily: 'Hanken Grotesk', fontWeight: 600, background: '#16A34A', color: '#fff', border: 'none', cursor: 'pointer' }}>{t('rne.previewHtml')}</button>
          <button onClick={onExportHtml} style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontFamily: 'Hanken Grotesk', fontWeight: 600, background: '#EA580C', color: '#fff', border: 'none', cursor: 'pointer' }}>Export HTML</button>
          <button onClick={onExportExcel} style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontFamily: 'Hanken Grotesk', fontWeight: 600, background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>Export Excel</button>
          <button onClick={onExportPdf} style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontFamily: 'Hanken Grotesk', fontWeight: 600, background: '#7C3AED', color: '#fff', border: 'none', cursor: 'pointer' }}>{t('rne.exportPdf')}</button>
          <button onClick={onOpenPublishModal} disabled={publishState?.loading}
            style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontFamily: 'Hanken Grotesk', fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', cursor: publishState?.loading ? 'wait' : 'pointer' }}>
            {publishState?.loading ? t('app.loading') : 'Publish'}
          </button>
        </div>
      </div>

      {publishState?.error && (
        <div style={{ padding: '12px 16px', background: 'var(--redTint)', border: '1px solid var(--red)', borderRadius: 8, fontSize: 13, color: 'var(--red)', fontFamily: 'Hanken Grotesk', marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
          <span>{publishState.error}</span>
          <button onClick={() => setPublishState(null)} style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer' }}>×</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input value={previewTitle} onChange={e => setPreviewTitle(e.target.value)}
          placeholder={t('rne.titlePlaceholder')}
          style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontFamily: 'Hanken Grotesk', fontSize: 14, boxSizing: 'border-box' }} />
        <input value={previewDate} onChange={e => setPreviewDate(e.target.value)}
          style={{ width: 220, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontFamily: 'Hanken Grotesk', fontSize: 13, boxSizing: 'border-box' }} />
      </div>

      <ReorderList t={t} source={source} edits={edits} sections={sections} />

      <iframe id="rn-preview-frame" title={t('rne.previewIframeTitle')} srcDoc={html}
        style={{ width: '100%', height: '78vh', border: '1px solid var(--border)', borderRadius: 12, background: '#fff' }} />
    </div>
  )
}
