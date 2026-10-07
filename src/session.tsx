import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { AreaAccess, UserAccount } from "./data/api"

type Phase = "loading" | "login" | "app"

type Session = {
  phase: Phase
  username: string | null
  areas: AreaAccess | null
  completeLoading: () => void
  login: (account: UserAccount) => void
  logout: () => void
}

const SessionContext = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading")
  const [username, setUsername] = useState<string | null>(null)
  const [areas, setAreas] = useState<AreaAccess | null>(null)

  const completeLoading = useCallback(() => {
    setPhase((current) => (current === "loading" ? "login" : current))
  }, [])

  const login = useCallback((account: UserAccount) => {
    setUsername(account.usuario)
    setAreas(account.areas)
    setPhase("app")
  }, [])

  const logout = useCallback(() => {
    setUsername(null)
    setAreas(null)
    setPhase("login")
  }, [])

  const value = useMemo(
    () => ({ phase, username, areas, completeLoading, login, logout }),
    [phase, username, areas, completeLoading, login, logout],
  )

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  )
}

export function useSession() {
  const session = useContext(SessionContext)
  if (!session) {
    throw new Error("useSession deve ser usado dentro de SessionProvider")
  }
  return session
}
