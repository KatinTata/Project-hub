import { Navigate } from 'react-router-dom'
import AdminAiView from './AdminAiView.jsx'
import ClientAiView from './ClientAiView.jsx'

// AI Usage: super admin sees the aggregate dashboard, clients only their own spend.
// Plain admins have no access (the server returns 403 as well).
export default function AiUsagePage(props) {
  const role = props.user?.role
  if (role === 'super_admin') return <AdminAiView {...props} />
  if (role === 'admin') return <Navigate to="/" replace />
  return <ClientAiView {...props} />
}
