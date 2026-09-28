import { AppShell } from './app/AppShell'
import { CurrentUserProvider } from './app/CurrentUser'
import { DataVersionProvider } from './app/DataVersion'
import { RouterProvider, useLocation } from './app/router'
import { ToastProvider } from './components/ui/ToastProvider'
import CalendarPage from './pages/CalendarPage'
import CandidatesPage from './pages/CandidatesPage'
import HomePage from './pages/HomePage'
import JobsPage from './pages/JobsPage'
import NotFoundPage from './pages/NotFoundPage'
import SettingsPage from './pages/SettingsPage'
import TeamPage from './pages/TeamPage'

const ROUTES: { path: string; Page: () => React.JSX.Element }[] = [
  { path: '/', Page: HomePage },
  { path: '/candidates', Page: CandidatesPage },
  { path: '/jobs', Page: JobsPage },
  { path: '/calendar', Page: CalendarPage },
  { path: '/team', Page: TeamPage },
  { path: '/settings', Page: SettingsPage },
]

function Routes() {
  const { pathname } = useLocation()
  const match = ROUTES.find((r) => r.path === pathname)
  const Page = match?.Page ?? NotFoundPage
  return <Page />
}

function AppRoot() {
  return (
    <RouterProvider>
      <CurrentUserProvider>
        <DataVersionProvider>
          <AppShell>
            <Routes />
          </AppShell>
        </DataVersionProvider>
      </CurrentUserProvider>
    </RouterProvider>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppRoot />
    </ToastProvider>
  )
}
