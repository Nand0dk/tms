import { useEffect, useMemo, useState, type FormEvent } from "react"
import { createPortal } from "react-dom"
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
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerDraft, setPickerDraft] = useState("")
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

  useEffect(() => {
    if (!pickerOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [pickerOpen])

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

  const motoristaLabel = useMemo(() => {
    if (!motorista) return ""
    const found = drivers.find(
      (driver) => driver.usuario.toLowerCase() === motorista.toLowerCase(),
    )
    if (found) return `${found.nome} (${found.usuario})`
    if (rotaAtual?.motoristaNome) {
      return `${rotaAtual.motoristaNome} (${motorista})`
    }
    return motorista
  }, [drivers, motorista, rotaAtual?.motoristaNome])

  function openDriverPicker() {
    setPickerDraft(motorista)
    setPickerOpen(true)
    setError(null)
  }

  function confirmDriverPicker() {
    setMotorista(pickerDraft)
    setPickerOpen(false)
    setError(null)
  }

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
            <h2 className="text-base font-semibold">{meta.titulo}</h2>
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

          <p className="mt-3 text-sm font-medium text-neutral-800">Selecionar motorista</p>
          <button
            type="button"
            disabled={driverBusy}
            onClick={openDriverPicker}
            className="mt-1.5 flex w-full items-center justify-between gap-2 rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-left text-sm outline-none focus:border-[#1f6b28] disabled:opacity-60"
          >
            <span className={motorista ? "text-neutral-900" : "text-neutral-400"}>
              {motorista ? motoristaLabel : "Toque para escolher o perfil"}
            </span>
            <span className="shrink-0 text-neutral-400" aria-hidden="true">
              ▾
            </span>
          </button>

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

      {pickerOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center sm:p-4"
              role="presentation"
            >
              <button
                type="button"
                aria-label="Fechar"
                className="absolute inset-0 bg-black/45"
                onClick={() => setPickerOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="motorista-picker-title"
                className="relative z-[201] flex max-h-[min(85dvh,36rem)] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl ring-1 ring-black/10 sm:rounded-2xl"
              >
                <div className="flex items-start gap-2 border-b border-neutral-100 px-2.5 py-2 sm:px-3">
                  <button
                    type="button"
                    onClick={() => setPickerOpen(false)}
                    aria-label="Voltar"
                    className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                      <path
                        d="M15 5 8 12l7 7"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <div className="min-w-0 flex-1 pt-1.5 pb-1">
                    <p
                      id="motorista-picker-title"
                      className="text-sm font-semibold text-neutral-900"
                    >
                      Escolher motorista
                    </p>
                    <p className="mt-0.5 text-[11px] text-neutral-500">
                      {meta.titulo} · toque em um perfil
                    </p>
                  </div>
                </div>

                <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain divide-y divide-neutral-100">
                  {drivers.length === 0 ? (
                    <li className="px-4 py-8 text-center text-sm text-neutral-500">
                      Nenhum perfil cadastrado.
                    </li>
                  ) : (
                    drivers.map((driver) => {
                      const selected =
                        pickerDraft.toLowerCase() === driver.usuario.toLowerCase()
                      return (
                        <li key={driver.usuario}>
                          <button
                            type="button"
                            onClick={() => setPickerDraft(driver.usuario)}
                            className={`flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition ${
                              selected ? "bg-[#1f6b28]/8" : "hover:bg-neutral-50"
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-neutral-900">
                                {driver.nome}
                              </span>
                              <span className="mt-0.5 block text-xs text-neutral-500">
                                {driver.usuario}
                              </span>
                            </span>
                            {selected ? (
                              <span className="shrink-0 text-xs font-semibold text-[#1f6b28]">
                                Selecionado
                              </span>
                            ) : null}
                          </button>
                        </li>
                      )
                    })
                  )}
                </ul>

                <div className="border-t border-neutral-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  <button
                    type="button"
                    disabled={!pickerDraft}
                    onClick={confirmDriverPicker}
                    className="w-full rounded-xl bg-[#1f6b28] px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Confirmar seleção
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
