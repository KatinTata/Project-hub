import AdminAiView from './AdminAiView.jsx'
import ClientAiView from './ClientAiView.jsx'

// AI Usage: admini vide agregatni dashboard, klijenti samo svoju potrošnju.
export default function AiUsagePage(props) {
  const isAdminUser = props.user?.role === 'admin' || props.user?.role === 'super_admin'
  return isAdminUser ? <AdminAiView {...props} /> : <ClientAiView {...props} />
}
