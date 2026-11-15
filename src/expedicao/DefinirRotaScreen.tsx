import { useEffect, useMemo, useState, type FormEvent } from "react"
import {
  confirmRoute,
  loadRouteDrivers,
  loadRoutes,
  removeRouteCityDay,
  saveRouteCity,
  saveRouteDriver,
  type RouteDriver,
  type RouteInfo,
  type RouteCity,
} from "../data/api"
import { BackButton } from "../recebimento/BackButton"
import { Field } from "../recebimento/Field"
import { applyRoutes, DIAS_ROTA, MAX_CIDADES_POR_ROTA } from "./rotas"

export function DefinirRotaScreen({
  actor,
  onBack,
}: {
  actor: string
  onBack: () => void
}) {
  const [cidades, setCidades] = useState<RouteCity[]>([])
  const [rotas, setRotas] = useState<RouteInfo[]>([])
  const [drivers, setDrivers] = useState<RouteDriver[]>([])
  const [rotaNumero, setRotaNumero] = useState(1)
  const [novaCidade, setNovaCidade] = useState("")
  const [motorista, setMotorista] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  function applyPayload(data: { cidades: RouteCity[]; rotas: RouteInfo[] }) {
    setCidades(data.cidades)
    setRotas(data.rotas)
    applyRoutes(data.cidades)
    const atual = data.rotas.find((item) => item.dias.includes(rotaNumero))
    setMotorista(atual?.motorista ?? "")
  }

  async function refresh() {
    const routesResult = await loadRoutes().then(
      (data) => ({ ok: true as const, data }),
      (caught: unknown) => ({ ok: false as const, caught }),
    )
    const driversResult = await loadRouteDrivers().then(
      (data) => ({ ok: true as const, data }),
      (caught: unknown) => ({ ok: false as const, caught }),
    )

    if (routesResult.ok) {
      applyPayload(routesResult.data)
    }
    if (driversResult.ok) {
      setDrivers(driversResult.data.drivers)
    }

    if (!routesResult.ok && !driversResult.ok) {
      throw routesResult.caught instanceof Error
        ? routesResult.caught
        : new Error("Não foi possível carregar as rotas.")
    }
    if (!routesResult.ok) {
      throw routesResult.caught instanceof Error
        ? routesResult.caught
        : new Error("Não foi possível carregar as rotas.")
    }
    if (!driversResult.ok) {
      setError(
        driversResult.caught instanceof Error
          ? driversResult.caught.message
          : "Não foi possível carregar os motoristas.",
      )
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    refresh()
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Não foi possível carregar as rotas.",
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const atual = rotas.find((item) => item.dias.includes(rotaNumero))
    setMotorista(atual?.motorista ?? "")
  }, [rotaNumero, rotas])

  const meta = DIAS_ROTA.find((item) => item.dia === rotaNumero) ?? DIAS_ROTA[0]
  const rotaAtual = rotas.find((item) => item.dias.includes(rotaNumero))

  const listaDaRota = useMemo(() => {
    return cidades
      .filter((item) => item.dias.includes(rotaNumero))
      .map((item) => item.cidade)
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .slice(0, MAX_CIDADES_POR_ROTA)
  }, [cidades, rotaNumero])

  const lotada = listaDaRota.length >= MAX_CIDADES_POR_ROTA
  const vagas = Math.max(0, MAX_CIDADES_POR_ROTA - listaDaRota.length)
  const driverBusy = saving || loading

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    const nome = novaCidade.trim()
    if (!nome) {
      setError("Informe o nome da cidade.")
      return
    }
    if (lotada) {
      setError(`A ${meta.titulo} já tem ${MAX_CIDADES_POR_ROTA} cidades.`)
      return
    }
    if (
      listaDaRota.some((cidade) => cidade.toLowerCase() === nome.toLowerCase())
    ) {
      setError("Esta cidade já está nesta rota.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const existing = cidades.find(
        (item) => item.cidade.toLowerCase() === nome.toLowerCase(),
      )
      const dias = existing
        ? Array.from(new Set([...existing.dias, rotaNumero])).sort()
        : [rotaNumero]
      const data = await saveRouteCity(actor, nome, dias)
      applyPayload(data)
      setNovaCidade("")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar.")
    }
    setSaving(false)
  }

  async function handleRemove(cidade: string) {
    setSaving(true)
    setError(null)
    try {
      const data = await removeRouteCityDay(actor, cidade, rotaNumero)
      applyPayload(data)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível remover.")
    }
    setSaving(false)
  }

  async function handleSaveDriver() {
    if (!motorista) {
      setError("Selecione o motorista.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const data = await saveRouteDriver(actor, rotaNumero, motorista)
      applyPayload(data)
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível salvar o motorista.",
      )
    }
    setSaving(false)
  }

  async function handleConfirm() {
    if (!motorista) {
      setError("Selecione o motorista antes de confirmar a rota.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (motorista !== (rotaAtual?.motorista ?? "")) {
        await saveRouteDriver(actor, rotaNumero, motorista)
      }
      const data = await confirmRoute(actor, rotaNumero)
      applyPayload(data)
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível confirmar a rota.",
      )
    }
    setSaving(false)
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <header className="flex items-center px-1 pt-4 pb-2">
        <BackButton onClick={onBack} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h1 className="screen-title">Definir rotas</h1>
        <p className="mt-1 text-sm text-neutral-600">
          São 5 rotas. Em cada uma: até {MAX_CIDADES_POR_ROTA} cidades e 1 motorista.
        </p>

        <div className="mt-4 grid grid-cols-5 gap-2">
          {DIAS_ROTA.map((item) => {
            const selected = rotaNumero === item.dia
            const info = rotas.find((rota) => rota.dias.includes(item.dia))
            const count = cidades.filter((entry) =>
              entry.dias.includes(item.dia),
            ).length
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setRotaNumero(item.dia)
                  setError(null)
                  setNovaCidade("")
                }}
                className={`rounded-xl px-1 py-2 text-center ${
                  selected
                    ? "bg-[#1f6b28] text-white"
                    : "border border-neutral-300 bg-white text-neutral-800"
                }`}
              >
                <span className="block text-sm font-semibold">{item.titulo}</span>
                <span
                  className={`mt-0.5 block text-[10px] ${
                    selected ? "text-white/80" : "text-neutral-500"
                  }`}
                >
                  {Math.min(count, MAX_CIDADES_POR_ROTA)}/{MAX_CIDADES_POR_ROTA}
                  {info?.confirmada ? " · ok" : ""}
                </span>
              </button>
            )
          })}
        </div>

        <section className="mt-5 rounded-xl bg-white px-3 py-3 shadow-sm ring-1 ring-black/5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">{meta.titulo}</h2>
              <p className="text-xs text-neutral-500">{meta.diaSemana}</p>
            </div>
            <span className="shrink-0 text-xs text-neutral-500">
              {listaDaRota.length}/{MAX_CIDADES_POR_ROTA} cidades
            </span>
          </div>

          {loading ? (
            <p className="mt-3 text-sm text-neutral-500">Carregando…</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5">
              {Array.from({ length: MAX_CIDADES_POR_ROTA }, (_, index) => {
                const cidade = listaDaRota[index]
                return (
                  <li
                    key={`${meta.id}-slot-${index}`}
                    className="flex min-h-10 items-center justify-between gap-2 rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-2.5 py-2"
                  >
                    {cidade ? (
                      <>
                        <span className="min-w-0 truncate text-sm text-neutral-800">
                          {index + 1}. {cidade}
                        </span>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleRemove(cidade)}
                          className="shrink-0 text-xs font-semibold text-red-700 disabled:opacity-60"
                        >
                          Remover
                        </button>
                      </>
                    ) : (
                      <span className="text-sm text-neutral-400">
                        {index + 1}. Vaga livre
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {lotada ? (
            <p className="mt-3 text-xs text-neutral-600">
              Limite de {MAX_CIDADES_POR_ROTA} cidades atingido. Remova uma cidade para
              adicionar outra — o motorista pode ser definido normalmente.
            </p>
          ) : null}
        </section>

        <section className="mt-5 rounded-xl bg-white px-3 py-3 shadow-sm ring-1 ring-black/5">
          <h2 className="text-base font-semibold">Motorista</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Um motorista por rota. Independe do limite de cidades. Ao confirmar, a rota
            aparece no perfil dele.
          </p>
          <label
            className="mt-3 block text-sm font-medium text-neutral-800"
            htmlFor="rota-motorista"
          >
            Selecionar motorista
          </label>
          <select
            id="rota-motorista"
            value={motorista}
            disabled={driverBusy}
            onChange={(event) => {
              setMotorista(event.target.value)
              setError(null)
            }}
            className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none focus:border-[#1f6b28] disabled:opacity-60"
          >
            <option value="">Escolha o motorista</option>
            {drivers.map((driver) => (
              <option key={driver.usuario} value={driver.usuario}>
                {driver.nome} ({driver.usuario})
              </option>
            ))}
          </select>

          {!loading && drivers.length === 0 ? (
            <p className="mt-2 text-xs text-amber-800">
              Nenhum perfil cadastrado. Crie usuários em Usuários para escolher o
              motorista.
            </p>
          ) : null}

          {rotaAtual?.confirmada ? (
            <p className="mt-2 text-xs font-medium text-[#1f6b28]">
              Rota confirmada
              {rotaAtual.motoristaNome
                ? ` · ${rotaAtual.motoristaNome}`
                : rotaAtual.motorista
                  ? ` · ${rotaAtual.motorista}`
                  : ""}
            </p>
          ) : null}

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={driverBusy || !motorista}
              onClick={() => void handleSaveDriver()}
              className="w-full rounded-xl border border-[#1f6b28] px-3 py-2.5 text-sm font-semibold text-[#1f6b28] disabled:opacity-60"
            >
              Salvar motorista
            </button>
            <button
              type="button"
              disabled={driverBusy || !motorista}
              onClick={() => void handleConfirm()}
              className="w-full rounded-xl bg-[#1f6b28] px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {rotaAtual?.confirmada ? "Reconfirmar rota" : "Confirmar rota"}
            </button>
          </div>
        </section>

        {!lotada ? (
          <form
            className="mt-5 flex flex-col gap-3"
            onSubmit={(event) => void handleAdd(event)}
          >
            <Field
              id="rota-cidade"
              label={`Adicionar cidade · ${vagas} ${vagas === 1 ? "vaga" : "vagas"}`}
              value={novaCidade}
              placeholder="ex.: Sorocaba"
              onChange={(value) => {
                setNovaCidade(value)
                setError(null)
              }}
            />
            <button
              type="submit"
              disabled={saving || loading}
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm font-semibold text-neutral-800 disabled:opacity-60"
            >
              {saving ? "Salvando…" : `Adicionar à ${meta.titulo}`}
            </button>
          </form>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
