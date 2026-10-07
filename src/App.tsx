import { LoadingScreen } from "./components/LoadingScreen"
import { LoginScreen } from "./components/LoginScreen"
import { PhoneHome } from "./components/PhoneHome"
import { SessionProvider, useSession } from "./session"

export default function App() {
  return (
    <SessionProvider>
      <AppGate />
    </SessionProvider>
  )
}

function AppGate() {
  const { phase } = useSession()

  if (phase === "loading") {
    return <LoadingScreen />
  }

  if (phase === "login") {
    return <LoginScreen />
  }

  return <PhoneHome />
}
