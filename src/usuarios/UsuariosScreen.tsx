import { useEffect, useState, type FormEvent } from "react"
import { loadUsers, removeUser, saveUser, saveUserAreas, type UserAccount } from "../data/api"
import { BackButton } from "../recebimento/BackButton"
import { Field } from "../recebimento/Field"

const areaOptions = [
  ["recebimento", "Recebimento"],
  ["estoque", "Estoque"],
  ["armazem", "Armazém"],
  ["coleta", "Coleta"],
  ["expedicao", "Expedição"],
] as const

export function UsuariosScreen({
  actor,
  onBack,
}: {
  actor: string
  onBack: () => void
}) {
  const [users, setUsers] = useState<UserAccount[]>([])
  const [creating, setCreating] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadUsers(actor)
      .then((data) => {
        if (!cancelled) setUsers(data.users)
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setLoadError(
            caught instanceof Error ? caught.message : "Não foi possível carregar os usuários.",
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [actor])

  async function remove(user: UserAccount) {
    const confirmed = window.confirm(`Remover o usuário ${user.usuario}?`)
    if (!confirmed) return
    try {
      const data = await removeUser(actor, user.usuario)
      setUsers(data.users)
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível remover o usuário.")
    }
  }

  async function toggle(user: UserAccount, area: (typeof areaOptions)[number][0]) {
    const next = {
      recebimento: user.areas.recebimento,
      estoque: user.areas.estoque,
      armazem: user.areas.armazem,
      coleta: user.areas.coleta,
      expedicao: user.areas.expedicao,
    }
    next[area] = !next[area]
    try {
      const data = await saveUserAreas(actor, user.usuario, next)
      setUsers(data.users)
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar.")
    }
  }

  if (creating) {
    return (
      <NewUserForm
        onBack={() => setCreating(false)}
        onSave={async (user) => {
          const data = await saveUser(actor, user)
          setUsers(data.users)
          setCreating(false)
        }}
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-2 px-1 pt-4 pb-2">
        <BackButton onClick={onBack} label="Início" />
        <button
          type="button"
          onClick={() => setCreating(true)}
          aria-label="Cadastrar usuário"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1f6b28] text-2xl leading-none font-medium text-white shadow-md shadow-black/20"
        >
          +
        </button>
      </header>
      <div className="px-1">
        <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Cadastre usuários e libere o acesso de cada área.
        </p>
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-1 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {loadError ? (
          <p className="text-sm text-red-700">{loadError}</p>
        ) : users.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-500">
            Nenhum usuário ainda.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {users.map((user) => (
              <li
                key={user.usuario}
                className="rounded-xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-black/5"
              >
                <p className="text-sm font-semibold">{user.nome}</p>
                <p className="mt-0.5 text-xs text-neutral-500">{user.usuario}</p>
                {user.areas.usuarios ? (
                  <p className="mt-2 text-xs text-neutral-600">Acesso a todas as áreas.</p>
                ) : (
                  <div className="mt-2 flex flex-col gap-2">
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {areaOptions.map(([key, label]) => (
                        <label key={key} className="flex items-center gap-1.5 text-xs text-neutral-700">
                          <input
                            type="checkbox"
                            checked={user.areas[key]}
                            onChange={() => void toggle(user, key)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => void remove(user)}
                      className="self-start text-xs font-medium text-red-700"
                    >
                      Remover
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function NewUserForm({
  onBack,
  onSave,
}: {
  onBack: () => void
  onSave: (user: { nome: string; usuario: string; senha: string }) => void | Promise<void>
}) {
  const [nome, setNome] = useState("")
  const [usuario, setUsuario] = useState("")
  const [senha, setSenha] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = userError(nome, usuario, senha)
    if (message) {
      setError(message)
      return
    }
    try {
      await onSave({
        nome: nome.trim(),
        usuario: usuario.trim(),
        senha: senha.trim(),
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar.")
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center px-1 pt-4 pb-2">
        <BackButton onClick={onBack} />
      </header>
      <form className="flex flex-col px-1 pb-8" onSubmit={handleSubmit} noValidate>
        <h1 className="text-2xl font-semibold tracking-tight">Novo usuário</h1>
        <div className="mt-4 flex flex-col gap-3">
          <Field
            id="nome-usuario"
            label="Nome"
            value={nome}
            onChange={(value) => {
              setNome(value)
              setError(null)
            }}
          />
          <Field
            id="login-usuario"
            label="Usuário"
            value={usuario}
            onChange={(value) => {
              setUsuario(value)
              setError(null)
            }}
          />
          <Field
            id="senha-usuario"
            label="Senha"
            type="password"
            value={senha}
            onChange={(value) => {
              setSenha(value)
              setError(null)
            }}
          />
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm font-medium text-neutral-700"
          >
            Voltar
          </button>
          <button
            type="submit"
            className="flex-1 rounded-xl bg-[#1f6b28] px-3 py-2.5 text-sm font-semibold text-white"
          >
            Salvar
          </button>
        </div>
      </form>
    </div>
  )
}

function userError(nome: string, usuario: string, senha: string) {
  const name = nome.trim()
  const user = usuario.trim()
  const password = senha.trim()
  if (!name && !user && !password) return "Informe o nome, o usuário e a senha."
  if (!name) return "Informe o nome."
  if (!user) return "Informe o usuário."
  if (!password) return "Informe a senha."
  return null
}
