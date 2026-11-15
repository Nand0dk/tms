import { useEffect, useState, type FormEvent } from "react"
import { company } from "../config"
import { loginUser } from "../data/api"
import { useSession } from "../session"
import { Logo } from "./Logo"

const REMEMBER_KEY = "tms.remember.usuario"

function loginError(usuario: string, senha: string) {
  const user = usuario.trim()
  const password = senha.trim()
  if (!user && !password) return "Informe o usuário e a senha."
  if (!user) return "Informe o usuário."
  if (!password) return "Informe a senha."
  return null
}

export function LoginScreen() {
  const { login } = useSession()
  const [usuario, setUsuario] = useState(() => localStorage.getItem(REMEMBER_KEY) ?? "")
  const [senha, setSenha] = useState("")
  const [lembrar, setLembrar] = useState(() => Boolean(localStorage.getItem(REMEMBER_KEY)))
  const [showSenha, setShowSenha] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = `${company.name} — ${company.subtitle}`
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = loginError(usuario, senha)
    if (message) {
      setError(message)
      return
    }
    try {
      const account = await loginUser(usuario, senha)
      if (lembrar) localStorage.setItem(REMEMBER_KEY, account.usuario)
      else localStorage.removeItem(REMEMBER_KEY)
      login(account)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível entrar.")
    }
  }

  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-[var(--vps-ink)] text-white">
      <div className="relative flex min-h-[42vh] flex-col items-center justify-end px-5 pb-8 pt-[max(2rem,env(safe-area-inset-top))] sm:min-h-[46vh]">
        <img
          src="/login-hero.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/65 to-[var(--vps-ink)]" />
        <div className="relative z-10 flex w-full max-w-md flex-col items-center text-center">
          <Logo className="h-16 w-auto drop-shadow-lg sm:h-20" />
          <h1 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">
            Bem-vindo ao TMS VPS Brasil
          </h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/75">
            Acompanhe, organize e otimize toda a operação logística da sua empresa em um só lugar.
          </p>
        </div>
      </div>

      <div className="relative z-10 -mt-4 flex flex-1 flex-col rounded-t-[1.75rem] bg-[var(--vps-surface)] px-5 pt-6 text-[var(--vps-ink)] sm:px-8">
        <form
          className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4"
          onSubmit={handleSubmit}
          noValidate
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-neutral-700">Usuário</span>
            <span className="flex items-center gap-2 rounded-2xl bg-white px-3 py-3 shadow-sm ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-[var(--vps-green)]/40">
              <UserGlyph />
              <input
                id="usuario"
                name="usuario"
                type="text"
                autoComplete="username"
                autoFocus
                value={usuario}
                onChange={(event) => {
                  setUsuario(event.target.value)
                  setError(null)
                }}
                placeholder="Seu usuário"
                className="w-full border-0 bg-transparent text-base outline-none placeholder:text-neutral-400"
              />
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-neutral-700">Senha</span>
            <span className="flex items-center gap-2 rounded-2xl bg-white px-3 py-3 shadow-sm ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-[var(--vps-green)]/40">
              <LockGlyph />
              <input
                id="senha"
                name="senha"
                type={showSenha ? "text" : "password"}
                autoComplete="current-password"
                value={senha}
                onChange={(event) => {
                  setSenha(event.target.value)
                  setError(null)
                }}
                placeholder="Sua senha"
                className="w-full border-0 bg-transparent text-base outline-none placeholder:text-neutral-400"
              />
              <button
                type="button"
                onClick={() => setShowSenha((value) => !value)}
                className="shrink-0 text-xs font-medium text-neutral-500"
                aria-label={showSenha ? "Ocultar senha" : "Mostrar senha"}
              >
                {showSenha ? "Ocultar" : "Ver"}
              </button>
            </span>
          </label>

          <div className="flex items-center justify-between gap-3 text-sm">
            <label className="flex items-center gap-2 text-neutral-700">
              <input
                type="checkbox"
                checked={lembrar}
                onChange={(event) => setLembrar(event.target.checked)}
                className="h-4 w-4 rounded border-neutral-300 accent-[var(--vps-green-mid)]"
              />
              Lembrar meu acesso
            </label>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn-vps mt-1 flex w-full items-center justify-center gap-2 px-4 py-3.5 text-sm sm:text-base">
            <span aria-hidden="true">→</span>
            Entrar
          </button>
        </form>

        <footer className="mx-auto flex w-full max-w-md justify-center py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <img
            src="/logo-proxy.png"
            alt="PROXY — Soluções inteligentes e conectadas"
            className="h-auto max-h-12 w-auto max-w-[12rem] object-contain opacity-90"
            draggable={false}
          />
        </footer>
      </div>
    </div>
  )
}

function UserGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-[var(--vps-green-mid)]" aria-hidden="true">
      <path
        d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function LockGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-[var(--vps-green-mid)]" aria-hidden="true">
      <path
        d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6v-9Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}
