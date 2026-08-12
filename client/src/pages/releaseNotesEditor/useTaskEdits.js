import { useState, useRef, useCallback } from 'react'
import { textToHtml, htmlToText } from '../../components/RichBodyEditor.jsx'

async function aiEnhance(action, content) {
  const jt = localStorage.getItem('jt_token')
  const res = await fetch('/api/release-notes/ai-enhance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jt}` },
    body: JSON.stringify({ action, content }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const d = await res.json()
  if (d.error) throw new Error(d.error)
  return d.result || ''
}

// Content-editing domain: per-task edits (name/body), fetched Jira details,
// AI generate/translate (single + bulk) with undo backups.
export function useTaskEdits({ tasks, selectedIds, selectedProject, copiedEdits, t, showToast }) {
  const [taskEdits, setTaskEdits] = useState({})
  const [taskJiraDetails, setTaskJiraDetails] = useState({}) // { [id]: { description, loading, error } }
  const [aiLoadingIds, setAiLoadingIds] = useState(new Set())
  const [aiCooldownIds, setAiCooldownIds] = useState(new Set())
  const [bulkProgress, setBulkProgress] = useState(null)
  const [aiBackup, setAiBackup] = useState({}) // { [taskId]: { name, description, bodyHtml } } — undo for AI
  // Ref ogledala state-a: handleri čitaju kroz ref pa mogu biti stabilni
  // (useCallback bez zavisnosti) — uslov da React.memo kartica radi (B1).
  const editsRef = useRef(taskEdits)
  editsRef.current = taskEdits
  const detailsRef = useRef(taskJiraDetails)
  detailsRef.current = taskJiraDetails
  const backupRef = useRef(aiBackup)
  backupRef.current = aiBackup

  // Seed edits for the current selection (called when entering the content step).
  function seedEditsForSelection() {
    setTaskEdits(prev => {
      const edits = { ...prev }
      for (const task of tasks) {
        if (selectedIds.has(task.id) && !edits[task.id]) {
          const copied = copiedEdits?.[task.key]
          edits[task.id] = {
            name: copied?.name || task.fields?.summary || task.summary || '',
            description: copied?.description || '',
            images: [],
          }
        }
      }
      return edits
    })
  }

  const updateEdit = useCallback((taskId, key, value) => {
    setTaskEdits(prev => ({ ...prev, [taskId]: { ...prev[taskId], [key]: value } }))
  }, [])

  // Rich body: store HTML + keep a plain-text mirror (used for AI prompt context).
  const updateBody = useCallback((taskId, html) => {
    setTaskEdits(prev => ({ ...prev, [taskId]: { ...prev[taskId], bodyHtml: html, description: htmlToText(html) } }))
  }, [])

  // Snapshot a task's content so the user can revert an AI change.
  const backupAi = useCallback(taskId => {
    const cur = editsRef.current[taskId] || {}
    setAiBackup(b => ({ ...b, [taskId]: { name: cur.name, description: cur.description, bodyHtml: cur.bodyHtml } }))
  }, [])

  const revertAi = useCallback(taskId => {
    const bk = backupRef.current[taskId]
    if (!bk) return
    setTaskEdits(prev => ({ ...prev, [taskId]: { ...prev[taskId], name: bk.name, description: bk.description, bodyHtml: bk.bodyHtml } }))
    setAiBackup(b => { const n = { ...b }; delete n[taskId]; return n })
  }, [])

  function revertAllAi() {
    setTaskEdits(prev => {
      const next = { ...prev }
      for (const [id, bk] of Object.entries(aiBackup)) next[id] = { ...next[id], name: bk.name, description: bk.description, bodyHtml: bk.bodyHtml }
      return next
    })
    setAiBackup({})
  }

  // Apply AI/translate plain text into the rich body (converts to paragraphs).
  const applyAiText = useCallback((taskId, text) => {
    backupAi(taskId)
    setTaskEdits(prev => ({ ...prev, [taskId]: { ...prev[taskId], description: text, bodyHtml: textToHtml(text) } }))
  }, [backupAi])

  // Fetch Jira detail for a task, pre-fill description if empty
  async function fetchAndSetDetail(task) {
    if (taskJiraDetails[task.id]?.description !== undefined || taskJiraDetails[task.id]?.loading) return
    setTaskJiraDetails(prev => ({ ...prev, [task.id]: { loading: true } }))
    try {
      const jt = localStorage.getItem('jt_token')
      const res = await fetch('/api/release-notes/task-detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jt}` },
        body: JSON.stringify({ taskKey: task.key, projectId: selectedProject?.id }),
      })
      const d = await res.json()
      setTaskJiraDetails(prev => ({ ...prev, [task.id]: d }))
      // Pre-fill description if still empty
      setTaskEdits(prev => {
        const current = prev[task.id]
        if (current && !current.description && d.description) {
          return { ...prev, [task.id]: { ...current, description: d.description } }
        }
        return prev
      })
    } catch {
      setTaskJiraDetails(prev => ({ ...prev, [task.id]: { error: true } }))
    }
  }

  const generateTaskDesc = useCallback(async taskId => {
    const edit = editsRef.current[taskId]
    if (!edit) return
    const jiraDetail = detailsRef.current[taskId]
    setAiLoadingIds(prev => new Set([...prev, taskId]))
    try {
      const jiraDesc = (jiraDetail?.description || '').trim()
      const comments = (jiraDetail?.comments || [])
        .map(c => (c.text || '').replace(/\s*\n\s*/g, ' ').trim())
        .filter(Boolean)
        .map(t => `- ${t}`)
      const content = [
        '## Naziv taska:', edit.name || 'nema',
        '', '## Opis (Jira):', jiraDesc || 'nema',
        '', '## Subtaskovi:', 'nema',
        '', '## Relevantni komentari (pomoćni kontekst):', comments.length ? comments.join('\n') : 'nema',
      ].join('\n')
      const result = await aiEnhance('generate_description', content)
      applyAiText(taskId, result)
    } catch {
      showToast(t('rne.aiFailed'))
    } finally {
      setAiLoadingIds(prev => { const n = new Set(prev); n.delete(taskId); return n })
      setAiCooldownIds(prev => new Set([...prev, taskId]))
      setTimeout(() => setAiCooldownIds(prev => { const n = new Set(prev); n.delete(taskId); return n }), 3000)
    }
  }, [applyAiText, showToast, t]) // eslint-disable-line react-hooks/exhaustive-deps

  const translateTask = useCallback(async taskId => {
    const edit = editsRef.current[taskId]
    if (!edit) return
    setAiLoadingIds(prev => new Set([...prev, taskId]))
    try {
      const images = edit.images || []
      const parts = [`Summary: ${edit.name}`]
      if (edit.description) parts.push(`Description: ${edit.description}`)
      images.forEach((img, i) => { if (img.desc) parts.push(`Image${i + 1}: ${img.desc}`) })
      const result = await aiEnhance('translate_en', parts.join('\n'))

      const lines = result.split('\n')
      const get = (prefix) => {
        const line = lines.find(l => l.toLowerCase().startsWith(prefix.toLowerCase() + ':'))
        return line ? line.slice(prefix.length + 1).trim() : null
      }
      const newName = get('Summary')
      const newDesc = get('Description')
      const newImageDescs = images.map((_, i) => get(`Image${i + 1}`))

      const anyChanged = newName || newDesc || newImageDescs.some(Boolean)
      if (!anyChanged) {
        showToast(t('rne.aiTranslateFailed'))
        return
      }
      backupAi(taskId)
      setTaskEdits(prev => ({
        ...prev,
        [taskId]: {
          ...prev[taskId],
          ...(newName ? { name: newName } : {}),
          ...(newDesc ? { description: newDesc, bodyHtml: textToHtml(newDesc) } : {}),
          images: prev[taskId].images.map((img, i) =>
            newImageDescs[i] ? { ...img, desc: newImageDescs[i] } : img
          ),
        },
      }))
      showToast(t('rne.translateDone'))
    } catch {
      showToast(t('rne.aiTranslateFailed'))
    } finally {
      setAiLoadingIds(prev => { const n = new Set(prev); n.delete(taskId); return n })
      setAiCooldownIds(prev => new Set([...prev, taskId]))
      setTimeout(() => setAiCooldownIds(prev => { const n = new Set(prev); n.delete(taskId); return n }), 3000)
    }
  }, [backupAi, showToast, t])

  async function generateAllDescriptions() {
    if (bulkProgress) return
    const sel = tasks.filter(t => selectedIds.has(t.id))
    for (let i = 0; i < sel.length; i++) {
      setBulkProgress({ current: i + 1, total: sel.length, action: 'generate' })
      const task = sel[i]
      if (!taskJiraDetails[task.id]?.description && !taskJiraDetails[task.id]?.error) {
        await fetchAndSetDetail(task)
      }
      await generateTaskDesc(task.id)
    }
    setBulkProgress(null)
  }

  async function translateAll() {
    if (bulkProgress) return
    const sel = tasks.filter(t => selectedIds.has(t.id))
    for (let i = 0; i < sel.length; i++) {
      setBulkProgress({ current: i + 1, total: sel.length, action: 'translate' })
      await translateTask(sel[i].id)
    }
    setBulkProgress(null)
  }

  return {
    taskEdits, taskJiraDetails,
    aiLoadingIds, aiCooldownIds, bulkProgress, aiBackup,
    seedEditsForSelection, updateEdit, updateBody,
    revertAi, revertAllAi, fetchAndSetDetail,
    generateTaskDesc, translateTask, generateAllDescriptions, translateAll,
  }
}
