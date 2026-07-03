const BASE = '/api'

function getToken() {
  return localStorage.getItem('jt_token')
}

let redirectingToLogin = false

async function request(method, path, body) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  // Handle expired/missing token before touching the body
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (!redirectingToLogin) {
      redirectingToLogin = true
      localStorage.removeItem('jt_token')
      window.location.href = '/login'
    }
    return
  }

  // Only parse JSON if the response actually is JSON
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) {
    if (!res.ok) throw new Error(`Server error ${res.status}`)
    return
  }

  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || 'Greška servera')
  return data
}

export const api = {
  // Auth
  login: (body) => request('POST', '/auth/login', body),
  me: () => request('GET', '/auth/me'),
  updateJiraConfig: (body) => request('PUT', '/auth/jira-config', body),
  testJiraConnection: (body) => request('POST', '/auth/jira-test', body),
  updateAiConfig: (body) => request('PUT', '/auth/ai-config', body),
  changePassword: (body) => request('PUT', '/auth/password', body),
  deleteAccount: () => request('DELETE', '/auth/account'),

  // Projects
  getProjects: () => request('GET', '/projects'),
  addProject: (body) => request('POST', '/projects', body),
  updateProject: (id, body) => request('PUT', `/projects/${id}`, body),
  archiveProject: (id) => request('DELETE', `/projects/${id}`),
  getArchivedProjects: () => request('GET', '/projects/archived'),
  restoreProject: (id) => request('PUT', `/projects/${id}/restore`),
  permanentDeleteProject: (id) => request('DELETE', `/projects/${id}/permanent`),
  reorderProjects: (ids) => request('PUT', '/projects/reorder', { ids }),

  // Jira
  getEpic: (key) => request('GET', `/jira/epic/${key}`),
  getTasks: (project) => request('POST', '/jira/tasks', {
    filterType: project.filterType || 'epic',
    epicKey: project.epicKey,
    jql: project.filterJql,
    projectId: project.id,
  }),
  testJql: (jql) => request('POST', '/jira/test-jql', { jql }),
  previewJql: (jql) => request('POST', '/jira/test-jql', { jql }),
  getJqlFields: () => request('GET', '/jira/jql-fields'),
  getJqlSuggestions: (fieldName, fieldValue) => request('GET', `/jira/jql-suggestions?fieldName=${encodeURIComponent(fieldName)}&fieldValue=${encodeURIComponent(fieldValue || '')}`),

  // Messages
  getMessages: (projectId) => request('GET', `/messages/${projectId}`),
  sendMessage: (projectId, body) => request('POST', `/messages/${projectId}`, body),
  getUnreadCount: () => request('GET', '/messages/unread-count'),
  getRecentUnread: () => request('GET', '/messages/recent-unread'),
  markAllRead: () => request('PUT', '/messages/read-all'),
  getProjectClients: (projectId) => request('GET', `/messages/${projectId}/clients`),
  getTaskInfo: (key) => request('GET', `/jira/task-info/${key}`),
  getChangelog: (key) => request('GET', `/jira/changelog/${key}`),

  // Release Notes
  getReleaseNoteSections: () => request('GET', '/release-notes/sections'),
  createReleaseNoteSection: (name) => request('POST', '/release-notes/sections', { name }),
  deleteReleaseNoteSection: (id) => request('DELETE', `/release-notes/sections/${id}`),
  getReleaseNotesList: () => request('GET', '/release-notes/list'),
  getClientReleaseNotes: () => request('GET', '/release-notes/client-list'),
  getReleaseNoteDetail: (id) => request('GET', `/release-notes/${id}/detail`),
  getReleaseNoteClients: (id) => request('GET', `/release-notes/${id}/clients`),
  setReleaseNoteClients: (id, clientIds) => request('PUT', `/release-notes/${id}/clients`, { clientIds }),
  markReleaseNoteReleased: (id) => request('PUT', `/release-notes/${id}/release`),
  deleteReleaseNote: (id) => request('DELETE', `/release-notes/${id}`),

  // Documents
  getDocumentSections: () => request('GET', '/documents/sections'),
  createDocumentSection: (name) => request('POST', '/documents/sections', { name }),
  renameDocumentSection: (id, name) => request('PUT', `/documents/sections/${id}`, { name }),
  deleteDocumentSection: (id) => request('DELETE', `/documents/sections/${id}`),
  getDocuments: () => request('GET', '/documents'),
  deleteDocument: (id) => request('DELETE', `/documents/${id}`),

  // Stack team size (capacity planning)
  getStackPeople: (projectId) => request('GET', `/projects/${projectId}/stack-people`),
  setStackPeople: (projectId, people) => request('PUT', `/projects/${projectId}/stack-people`, { people }),

  // Snapshots (history / trends)
  saveSnapshot: (projectId, payload) => request('POST', `/projects/${projectId}/snapshot`, { payload }),
  getSnapshots: (projectId) => request('GET', `/projects/${projectId}/snapshots`),

  // Team roster (named people per stack)
  getTeam: (projectId) => request('GET', `/projects/${projectId}/team`),
  addTeamMember: (projectId, name, stack) => request('POST', `/projects/${projectId}/team`, { name, stack }),
  removeTeamMember: (projectId, memberId) => request('DELETE', `/projects/${projectId}/team/${memberId}`),

  // Billable
  getBillableTasks: (projectId) => request('GET', `/projects/${projectId}/billable`),
  setBillableTask: (projectId, taskKey, billable) => request('PUT', `/projects/${projectId}/billable`, { taskKey, billable }),

  // Phases
  getPhases: (projectId) => request('GET', `/phases/${projectId}`),
  createPhase: (projectId, body) => request('POST', `/phases/${projectId}`, body),
  updatePhase: (phaseId, body) => request('PUT', `/phases/${phaseId}`, body),
  deletePhase: (phaseId) => request('DELETE', `/phases/${phaseId}`),
  assignTaskToPhase: (projectId, body) => request('POST', `/phases/${projectId}/assign`, body),
  reorderPhases: (projectId, phases) => request('POST', `/phases/${projectId}/reorder`, { phases }),

  // Users (admin only)
  getUsers: () => request('GET', '/users'),
  importUsers: (rows) => request('POST', '/users/import', { rows }),
  createUser: (body) => request('POST', '/users', body),
  updateUser: (id, body) => request('PUT', `/users/${id}`, body),
  deleteUser: (id) => request('DELETE', `/users/${id}`),
  getUserProjects: (id) => request('GET', `/users/${id}/projects`),
  assignProject: (userId, projectId) => request('POST', `/users/${userId}/projects`, { projectId }),
  unassignProject: (userId, projectId) => request('DELETE', `/users/${userId}/projects/${projectId}`),

  // Reports — binary download (xlsx), handled outside the JSON `request` helper
  exportProjectExcel: async (projectId, payload) => {
    const token = getToken()
    const res = await fetch(`${BASE}/reports/${projectId}/excel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      let msg = `Greška pri exportu (${res.status})`
      try { msg = (await res.json())?.error || msg } catch {}
      throw new Error(msg)
    }
    const blob = await res.blob()
    const cd = res.headers.get('content-disposition') || ''
    const m = cd.match(/filename="?([^"]+)"?/)
    const filename = m ? m[1] : 'report.xlsx'
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },

  // App settings — working-calendar config (PUT is super_admin only)
  getAppSettings: () => request('GET', '/settings'),
  updateAppSettings: (body) => request('PUT', '/settings', body),

  // Organizations (super admin only for write)
  getOrganizations: () => request('GET', '/organizations'),
  createOrganization: (name) => request('POST', '/organizations', { name }),
  updateOrganization: (id, name) => request('PUT', `/organizations/${id}`, { name }),
  deleteOrganization: (id) => request('DELETE', `/organizations/${id}`),
}
