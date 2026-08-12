import { useState, useRef, useCallback } from 'react'
import { GROUP_CONFIG, groupKeyOf, orderGroups } from '../../lib/renderReleaseNoteHtml.js'

// Section domain: per-task section overrides, custom section labels, and
// drag-and-drop ordering of tasks within/between sections.
export function useSections({ tasks, selectedIds }) {
  // section overrides: { [taskId]: customPrefix } and { [prefix]: customLabel }
  const [sectionOverrides, setSectionOverrides] = useState({})
  const [sectionLabels, setSectionLabels] = useState({})
  const [editingSection, setEditingSection] = useState(null) // prefix being renamed
  const [editingSectionValue, setEditingSectionValue] = useState('')
  const [dragOverPrefix, setDragOverPrefix] = useState(null)
  const [dragOverTaskId, setDragOverTaskId] = useState(null) // task id to insert before
  const [sectionTaskOrders, setSectionTaskOrders] = useState({}) // { [prefix]: [id,...] }
  const dragTaskId = useRef(null)
  const dragFromPrefix = useRef(null)
  // Ref ogledala za stabilan applyDrop (B1 — ulazi u React.memo kartice)
  const stateRef = useRef({})
  stateRef.current = { tasks, selectedIds, sectionOverrides }

  function buildGroups(taskList) {
    const groups = {}
    for (const task of taskList) {
      const prefix = sectionOverrides[task.id] || groupKeyOf(task)
      if (!groups[prefix]) groups[prefix] = []
      groups[prefix].push(task)
    }
    // Apply explicit ordering within each section
    for (const prefix of Object.keys(groups)) {
      const order = sectionTaskOrders[prefix]
      if (order?.length) {
        groups[prefix].sort((a, b) => {
          const ia = order.indexOf(a.id)
          const ib = order.indexOf(b.id)
          if (ia === -1 && ib === -1) return 0
          if (ia === -1) return 1
          if (ib === -1) return -1
          return ia - ib
        })
      }
    }
    const groupOrder = orderGroups(groups)
    return { groups, groupOrder }
  }

  const applyDrop = useCallback((toPrefix, beforeTaskId) => {
    const fromTaskId = dragTaskId.current
    if (!fromTaskId) return
    const fromPrefix = dragFromPrefix.current
    dragTaskId.current = null
    dragFromPrefix.current = null
    setDragOverPrefix(null)
    setDragOverTaskId(null)

    const { tasks: curTasks, selectedIds: curSelected, sectionOverrides: curOverrides } = stateRef.current

    // Move to new section if needed
    if (fromPrefix !== toPrefix) {
      setSectionOverrides(prev => ({ ...prev, [fromTaskId]: toPrefix }))
    }

    // Reorder: build new order for both affected sections using current groups snapshot
    setSectionTaskOrders(prev => {
      const selTasks = curTasks.filter(t => curSelected.has(t.id))
      // Compute which section each task belongs to (applying pending cross-section move)
      const snap = {}
      for (const task of selTasks) {
        const p = (fromPrefix !== toPrefix && task.id === fromTaskId)
          ? toPrefix
          : (curOverrides[task.id] || groupKeyOf(task))
        if (!snap[p]) snap[p] = []
        snap[p].push(task.id)
      }
      // Apply existing explicit orders
      for (const p of Object.keys(snap)) {
        const order = prev[p]
        if (order?.length) snap[p].sort((a, b) => { const ia = order.indexOf(a); const ib = order.indexOf(b); if (ia === -1 && ib === -1) return 0; if (ia === -1) return 1; if (ib === -1) return -1; return ia - ib })
      }

      const toList = snap[toPrefix] ? [...snap[toPrefix]] : []
      // Remove dragged task from list (it may already be there or not)
      const filtered = toList.filter(id => id !== fromTaskId)
      if (beforeTaskId) {
        const idx = filtered.indexOf(beforeTaskId)
        if (idx !== -1) filtered.splice(idx, 0, fromTaskId)
        else filtered.push(fromTaskId)
      } else {
        filtered.push(fromTaskId)
      }

      const result = { ...prev, [toPrefix]: filtered }
      if (fromPrefix !== toPrefix) {
        const fromList = (snap[fromPrefix] || []).filter(id => id !== fromTaskId)
        result[fromPrefix] = fromList
      }
      return result
    })
  }, [])

  function getSectionLabel(prefix) {
    return sectionLabels[prefix] || GROUP_CONFIG[prefix]?.label || prefix
  }

  return {
    sectionOverrides, sectionLabels, setSectionLabels,
    editingSection, setEditingSection, editingSectionValue, setEditingSectionValue,
    dragOverPrefix, setDragOverPrefix, dragOverTaskId, setDragOverTaskId,
    dragTaskId, dragFromPrefix,
    buildGroups, applyDrop, getSectionLabel,
  }
}
