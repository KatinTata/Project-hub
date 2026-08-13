import { useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../../api.js'
import Topbar from '../../components/Topbar.jsx'
import BrainAnimation from '../../components/BrainAnimation.jsx'
import { useT } from '../../lang.jsx'
import { useWindowSize } from '../../hooks/useWindowSize.js'
import { sanitizeBodyHtml, htmlToText } from '../../components/RichBodyEditor.jsx'
import { isClientRole } from '../../utils/roles.js'
import { generatePublishHtml, migrateBodyHtml, getHelpLinks, todayStr } from '../../lib/renderReleaseNoteHtml.js'
import { useTaskSource } from './useTaskSource.js'
import { useTaskEdits } from './useTaskEdits.js'
import { useSections } from './useSections.js'
import SelectStep from './SelectStep.jsx'
import ContentStep from './ContentStep.jsx'
import PreviewStep from './PreviewStep.jsx'
import Stepper from './Stepper.jsx'
import Toast from './Toast.jsx'
import PublishModal from './PublishModal.jsx'

// Release notes wizard: 1) select tasks → 2) edit content → 3) preview/export/publish.
// Domain state lives in hooks (useTaskSource/useTaskEdits/useSections); this
// component owns only wizard navigation, config, publish/export and the toast.
export default function ReleaseNotesEditorPage({ user, theme, onLogout, onOpenSettings, onOpenUsers }) {
  const t = useT()
  const { isMobile } = useWindowSize()
  const navigate = useNavigate()

  // wizard — korak živi u URL query-ju (?step=N) pa Back/Forward rade (A3);
  // maxStep je in-memory (podaci koraka ionako ne preživljavaju refresh),
  // pa se preduboki direktan link bezbedno spušta na korak 1.
  const [searchParams, setSearchParams] = useSearchParams()
  const [maxStep, setMaxStep] = useState(1)
  const requestedStep = parseInt(searchParams.get('step'), 10) || 1
  const wizardStep = Math.max(1, Math.min(requestedStep, maxStep))
  function setWizardStep(n) {
    setSearchParams(n > 1 ? { step: String(n) } : {})
  }

  // config (step 1)
  // `lang` je jezik OBJAVE (header/labele u HTML-u i Excel-u), ne jezik aplikacije
  const [config, setConfig] = useState({ clientName: '', version: '', lang: 'sr' })

  // step 3
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewDate, setPreviewDate] = useState('')

  // publish
  const [publishModal, setPublishModal] = useState(null)
  const [publishState, setPublishState] = useState(null)

  // toast
  const [toast, setToast] = useState(null)

  // Stabilan (B1) — ulazi u useCallback deps hook-ova i memo kartica
  const showToast = useCallback(message => {
    setToast({ message })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const source = useTaskSource({ t, showToast, setConfig })
  const { tasks, selectedIds, selectedProject, copiedEdits } = source
  const edits = useTaskEdits({ tasks, selectedIds, selectedProject, copiedEdits, outputLang: config.lang, t, showToast })
  const sections = useSections({ tasks, selectedIds })

  const hasAiKey = true // server either uses user's key or ANTHROPIC_API_KEY env var

  function setConfigField(key, val) { setConfig(prev => ({ ...prev, [key]: val })) }

  function goToStep(n) {
    if (n > maxStep) return
    setWizardStep(n)
  }

  function goToContentStep() {
    if (selectedIds.size === 0) return
    edits.seedEditsForSelection()
    setWizardStep(2)
    setMaxStep(s => Math.max(s, 2))
    // Background-fetch Jira details for all selected tasks so descriptions are ready
    setTimeout(() => {
      for (const task of tasks.filter(t => selectedIds.has(t.id))) {
        edits.fetchAndSetDetail(task)
      }
    }, 0)
  }

  function goToPreviewStep() {
    setPreviewTitle(`${config.clientName || ''} ${config.version || ''}`.trim() || selectedProject?.displayName || selectedProject?.epicKey || 'Release Notes')
    setPreviewDate(todayStr(config.lang))
    setWizardStep(3)
    setMaxStep(s => Math.max(s, 3))
  }

  async function openPublishModal() {
    try {
      const [usersData, sectionsData] = await Promise.all([
        api.getUsers().catch(() => []),
        api.getReleaseNoteSections().catch(() => ({ sections: [] })),
      ])
      const clientUsers = (Array.isArray(usersData) ? usersData : []).filter(u => isClientRole(u.role))
      const noteSections = sectionsData?.sections || []
      setPublishModal({ clientUsers, sections: noteSections })
    } catch (err) {
      showToast(err.message)
    }
  }

  // Single source for the final HTML. `expanded` opens all cards; `hideBar`
  // drops the in-document Export PDF bar (used for the in-app iframe).
  function buildPublishHtml({ expanded = false, hideBar = false } = {}) {
    const selectedTasks = tasks.filter(t => selectedIds.has(t.id))
    return generatePublishHtml(selectedTasks, edits.taskEdits, config, {
      clientName: config.clientName,
      version: config.version,
      productName: selectedProject?.displayName || selectedProject?.epicKey || '',
      jiraUrl: user?.jiraUrl || '',
      date: previewDate || todayStr(config.lang),
      origin: typeof window !== 'undefined' ? window.location.origin : '',
    }, { sectionOverrides: sections.sectionOverrides, sectionLabels: sections.sectionLabels, expanded, hideBar })
  }

  // Export the preview iframe to PDF. Chrome names the file after the MAIN
  // window's title, so swap it to the release-notes name, then restore.
  function exportPdf() {
    const f = document.getElementById('rn-preview-frame')
    if (!f?.contentWindow) return
    const name = (previewTitle || `${config.clientName || ''} ${config.version || ''}`.trim() || 'Release Notes').replace(/[\\/:*?"<>|]/g, '-')
    const prev = document.title
    let restored = false
    const restore = () => { if (restored) return; restored = true; document.title = prev; window.removeEventListener('afterprint', restore) }
    document.title = name
    try { if (f.contentDocument) f.contentDocument.title = name } catch { /* cross-origin guard */ }
    window.addEventListener('afterprint', restore)
    setTimeout(restore, 3000)
    f.contentWindow.focus()
    f.contentWindow.print()
  }

  // Open the rendered release notes (expanded) in a new tab to verify the look.
  function openHtmlPreview() {
    const blob = new Blob([buildPublishHtml({ expanded: true, hideBar: true })], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  // Download the standalone HTML file with every item expanded (no clicking).
  function exportHtml() {
    const name = (previewTitle || `${config.clientName || ''} ${config.version || ''}`.trim() || 'release-notes').replace(/[\\/:*?"<>|]/g, '-')
    const blob = new Blob([buildPublishHtml({ expanded: false })], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}.html`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  // Download the current release notes as .xlsx (sections → task rows).
  async function exportExcelRn() {
    const selTasks = tasks.filter(t => selectedIds.has(t.id))
    const { groups, groupOrder } = sections.buildGroups(selTasks)
    const excelSections = groupOrder.map(prefix => ({
      label: sections.getSectionLabel(prefix),
      tasks: groups[prefix].map(task => {
        const edit = edits.taskEdits[task.id] || {}
        return {
          key: task.key,
          name: edit.name || task.fields?.summary || '',
          text: htmlToText(sanitizeBodyHtml(migrateBodyHtml(edit))),
          helpLinks: getHelpLinks(task).map(l => ({ key: l.key, summary: l.summary })),
        }
      }),
    }))
    const name = (previewTitle || `${config.clientName || ''} ${config.version || ''}`.trim() || 'release-notes').replace(/[\\/:*?"<>|]/g, '-')
    const token = localStorage.getItem('jt_token')
    const res = await fetch('/api/release-notes/export/xlsx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: name, clientName: config.clientName, version: config.version, lang: config.lang || 'sr', date: previewDate || todayStr(config.lang), sections: excelSections }),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); showToast(t('rne.excelError', { error: d.error || res.status })); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}.xlsx`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  async function handlePublish(selectedClientIds, sectionName) {
    const html = buildPublishHtml()
    setPublishState({ loading: true })
    const jt = localStorage.getItem('jt_token')
    try {
      const res = await fetch('/api/release-notes/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jt}` },
        body: JSON.stringify({
          html,
          title: previewTitle || `${config.clientName || ''} ${config.version || ''}`.trim(),
          version: config.version || null,
          projectId: selectedProject?.id || null,
          sectionName: sectionName || null,
        }),
      })
      const ct = res.headers.get('content-type') || ''
      if (!ct.includes('application/json')) { setPublishState({ error: t('rne.serverError', { status: res.status }) }); return }
      const data = await res.json()
      if (data.token) {
        if (data.id && selectedClientIds.length > 0) {
          await api.setReleaseNoteClients(data.id, selectedClientIds).catch(() => {})
        }
        setPublishState(null)
        navigate('/release-notes')
      } else {
        setPublishState({ error: data.error || t('rne.noTokenReturned') })
      }
    } catch (err) {
      setPublishState({ error: err.message })
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', position: 'relative' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <BrainAnimation opacity={0.45} fullscreen />
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>
      <Topbar user={user} theme={theme} onLogout={onLogout} onOpenSettings={onOpenSettings} onOpenUsers={onOpenUsers} />
      <div style={{ padding: '20px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <Stepper step={wizardStep} maxStep={maxStep} onStepClick={goToStep} />
        </div>
        {wizardStep === 1 && (
          <SelectStep
            source={source} config={config} setConfigField={setConfigField}
            isMobile={isMobile} onContinue={goToContentStep}
          />
        )}
        {wizardStep === 2 && (
          <ContentStep
            user={user} source={source} edits={edits} sections={sections}
            config={config} previewDate={previewDate} hasAiKey={hasAiKey} showToast={showToast}
            onBack={() => setWizardStep(1)} onNext={goToPreviewStep}
          />
        )}
        {wizardStep === 3 && (
          <PreviewStep
            source={source} edits={edits} sections={sections}
            html={buildPublishHtml({ expanded: true, hideBar: true })}
            previewTitle={previewTitle} setPreviewTitle={setPreviewTitle}
            previewDate={previewDate} setPreviewDate={setPreviewDate}
            publishState={publishState} setPublishState={setPublishState}
            onBack={() => setWizardStep(2)}
            onOpenHtmlPreview={openHtmlPreview} onExportHtml={exportHtml}
            onExportExcel={exportExcelRn} onExportPdf={exportPdf}
            onOpenPublishModal={openPublishModal}
          />
        )}
      </div>
      {toast && <Toast message={toast.message} onClose={() => setToast(null)} />}
      {publishModal && (
        <PublishModal
          clientUsers={publishModal.clientUsers}
          sections={publishModal.sections}
          publishState={publishState}
          onClose={() => { setPublishModal(null); setPublishState(null) }}
          onPublish={async (clientIds, sectionName) => { setPublishModal(null); await handlePublish(clientIds, sectionName) }}
        />
      )}
      </div>
    </div>
  )
}
