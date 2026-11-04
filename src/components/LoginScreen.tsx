import { useEffect, useState, type FormEvent } from "react"
import { company } from "../config"
import { loginUser } from "../data/api"
import { useSession } from "../session"
import { Logo } from "./Logo"

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
  const [usuario, setUsuario] = useState("")
  const [senha, setSenha] = useState("")
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
      login(account)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível entrar.")
    }
  }

  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-[#f4f6f3]">
      <div className="flex flex-1 items-center justify-center px-3 py-8 sm:px-6 sm:py-10">
        <div className="w-full max-w-sm">
          <div className="flex justify-center">
            <Logo className="h-20 w-auto sm:h-24" />
          </div>
          <p className="mt-4 text-center text-sm text-neutral-600">Acesso ao sistema</p>

          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="usuario" className="text-sm font-medium text-neutral-800">
                Usuário
              </label>
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
                className="rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-base text-neutral-900 outline-none focus:border-[#2e7d32] focus:ring-2 focus:ring-[#2e7d32]/20"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="senha" className="text-sm font-medium text-neutral-800">
                Senha
              </label>
              <input
                id="senha"
                name="senha"
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(event) => {
                  setSenha(event.target.value)
                  setError(null)
                }}
                className="rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-base text-neutral-900 outline-none focus:border-[#2e7d32] focus:ring-2 focus:ring-[#2e7d32]/20"
              />
            </div>

            {error ? (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className="mt-1 rounded-md bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2e7d32]"
            >
              Entrar
            </button>
          </form>
        </div>
      </div>

      <footer className="flex justify-center px-3 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-4">
        <img
          src="/logo-proxy.png"
          alt="PROXY — Soluções inteligentes e conectadas"
          className="h-auto max-h-12 w-auto max-w-[min(13rem,70vw)] object-contain sm:max-h-16"
          draggable={false}
        />
      </footer>
    </div>
  )
}
