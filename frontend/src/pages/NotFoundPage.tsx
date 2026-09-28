import { CompassIcon } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/StatusViews'
import { useNavigate } from '../app/router'

export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <EmptyState
      icon={<CompassIcon className="h-5 w-5" />}
      title="Page not found"
      description="That page doesn’t exist, or you don’t have a link to it anymore."
      action={
        <Button variant="primary" onClick={() => navigate('/')}>
          Go home
        </Button>
      }
    />
  )
}
