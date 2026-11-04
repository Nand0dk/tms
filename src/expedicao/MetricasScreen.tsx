import { useMemo } from "react"
import { BackButton } from "../recebimento/BackButton"
import type { Box, Product } from "../recebimento/types"
import { formatPrazo, prazoDeEnvio } from "./rotas"

const DAYS = 7

type NotaMetric = {
  notaFiscal: string
  cidade: string
  prazo: string
  alocadaEm: string
  enviadaEm: string
  volumes: number
  enviada: boolean
  onTime: boolean
  atrasada: boolean
}

export function MetricasScreen({
  products,
  onBack,
}: {
  products: Product[]
  onBack: () => void
}) {
  const metrics = useMemo(() => buildMetrics(products), [products])
  const todayLabel = formatDayLabel(metrics.today)

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <header className="flex items-center px-1 pt-3 pb-1">
        <BackButton onClick={onBack} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Métricas</h1>
        <p className="mt-0.5 text-xs text-neutral-600 sm:text-sm">
          Envios por nota fiscal · {todayLabel}
        </p>

        {metrics.atrasadas.length > 0 ? (
          <div className="sticky top-0 z-10 -mx-1 bg-[#f4f6f3] px-1 pt-2">
            <AtrasoAlert notas={metrics.atrasadas} />
          </div>
        ) : null}

        <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:gap-2 lg:grid-cols-4">
          <KpiCard
            label="Enviadas hoje"
            value={metrics.enviadasHoje}
            hint="notas"
            tone="green"
          />
          <KpiCard
            label="Alocadas hoje"
            value={metrics.alocadasHoje}
            hint="notas"
            tone="blue"
          />
          <KpiCard
            label="No prazo"
            value={`${metrics.pctNoPrazo}%`}
            hint={`${metrics.noPrazo} NF`}
            tone="green"
          />
          <KpiCard
            label="Fora do prazo"
            value={`${metrics.pctForaPrazo}%`}
            hint={`${metrics.foraPrazo} NF`}
            tone="red"
          />
        </div>

        <section className="mt-2.5 rounded-xl bg-white px-2.5 py-2.5 shadow-sm ring-1 ring-black/5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-neutral-800">Volume de envios</p>
            <p className="text-[11px] text-neutral-500">Notas · últimos {DAYS} dias</p>
          </div>
          <BarChart days={metrics.volume} today={metrics.today} />
        </section>

        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
          <section className="rounded-xl bg-white px-2.5 py-2.5 shadow-sm ring-1 ring-black/5">
            <p className="text-sm font-medium text-neutral-800">Prazo de envio</p>
            <p className="text-[11px] text-neutral-500">Notas enviadas no prazo certo e errado</p>
            {metrics.enviadas === 0 ? (
              <p className="mt-3 text-sm text-neutral-500">Nenhuma nota enviada ainda.</p>
            ) : (
              <div className="mt-3 flex items-center gap-3">
                <Donut noPrazo={metrics.pctNoPrazo} />
                <ul className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
                  <li className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#1f6b28]" />
                      No prazo
                    </span>
                    <span className="font-semibold tabular-nums">{metrics.pctNoPrazo}%</span>
                  </li>
                  <li className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#c2410c]" />
                      Fora do prazo
                    </span>
                    <span className="font-semibold tabular-nums">{metrics.pctForaPrazo}%</span>
                  </li>
                  <li className="text-[11px] text-neutral-500">
                    {metrics.enviadas} nota(s) enviada(s)
                  </li>
                </ul>
              </div>
            )}
          </section>

          <section className="rounded-xl bg-white px-2.5 py-2.5 shadow-sm ring-1 ring-black/5">
            <p className="text-sm font-medium text-neutral-800">Status atual</p>
            <div className="mt-2 grid grid-cols-3 gap-1 text-center">
              <StatusCell label="Pendentes" value={metrics.pendentes} />
              <StatusCell label="Atrasadas" value={metrics.atrasadasPendentes} warn />
              <StatusCell label="Enviadas" value={metrics.enviadas} />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function AtrasoAlert({
  notas,
}: {
  notas: { notaFiscal: string; cidade: string; prazo: string; volumes: number }[]
}) {
  const titulo =
    notas.length === 1
      ? "1 nota atrasada precisa ser enviada"
      : `${notas.length} notas atrasadas precisam ser enviadas`
  return (
    <section
      role="alert"
      className="rounded-xl bg-[#fff7ed] px-2.5 py-2 shadow-sm ring-1 ring-[#c2410c]/50"
    >
      <p className="text-sm font-semibold text-[#c2410c]">{titulo}</p>
      <p className="mt-0.5 text-[11px] text-neutral-600">
        {notas.length === 1
          ? "O prazo já passou e a nota ainda não saiu."
          : "O prazo já passou e as notas ainda não saíram."}
      </p>
      <ul className="mt-2 flex max-h-28 flex-col gap-1.5 overflow-y-auto">
        {notas.map((nota) => (
          <li
            key={nota.notaFiscal}
            className="rounded-lg bg-white px-2 py-1.5 ring-1 ring-[#c2410c]/15"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-neutral-800">
                NF {nota.notaFiscal}
              </span>
              <span className="shrink-0 text-[11px] font-medium text-[#c2410c]">
                {formatPrazo(nota.prazo)}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-neutral-600">
              {nota.cidade} · {nota.volumes}{" "}
              {nota.volumes === 1 ? "volume" : "volumes"}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function KpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string | number
  hint?: string
  tone: "green" | "blue" | "red"
}) {
  const color =
    tone === "green"
      ? "text-[#1f6b28] border-[#1f6b28]"
      : tone === "blue"
        ? "text-[#2563eb] border-[#2563eb]"
        : "text-[#c2410c] border-[#c2410c]"
  return (
    <div className={`rounded-xl border-l-[3px] bg-white px-2.5 py-2 shadow-sm ring-1 ring-black/5 ${color}`}>
      <p className={`text-xl font-semibold tracking-tight tabular-nums sm:text-2xl ${color}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] leading-tight text-neutral-600">{label}</p>
      {hint ? <p className="text-[11px] text-neutral-400">{hint}</p> : null}
    </div>
  )
}

function StatusCell({
  label,
  value,
  warn,
}: {
  label: string
  value: number
  warn?: boolean
}) {
  return (
    <div className="rounded-lg bg-neutral-50 px-1 py-2">
      <p className={`text-lg font-semibold tabular-nums sm:text-xl ${warn && value > 0 ? "text-[#c2410c]" : "text-neutral-900"}`}>
        {value}
      </p>
      <p className="text-[11px] text-neutral-500">{label}</p>
    </div>
  )
}

function BarChart({
  days,
  today,
}: {
  days: { date: string; label: string; count: number }[]
  today: string
}) {
  const max = Math.max(1, ...days.map((day) => day.count))
  return (
    <div className="mt-2 flex h-28 items-end gap-1 sm:h-32 sm:gap-1.5">
      {days.map((day) => {
        const filled = day.count > 0
        const height = filled ? Math.max(14, (day.count / max) * 100) : 0
        const isToday = day.date === today
        return (
          <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
            <span className="text-[10px] font-semibold tabular-nums text-neutral-700">
              {day.count}
            </span>
            <div className="flex h-[4.75rem] w-full items-end justify-center rounded-md bg-neutral-100 sm:h-[5.5rem]">
              <div
                className={`w-[72%] rounded-t-sm ${
                  filled ? (isToday ? "bg-[#2e7d32]" : "bg-[#1f6b28]") : "bg-transparent"
                }`}
                style={{ height: `${height}%` }}
              />
            </div>
            <span className={`text-[10px] tabular-nums ${isToday ? "font-semibold text-[#1f6b28]" : "text-neutral-500"}`}>
              {day.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Donut({ noPrazo }: { noPrazo: number }) {
  const gradient = `conic-gradient(#1f6b28 0 ${noPrazo}%, #c2410c ${noPrazo}% 100%)`
  return (
    <div
      className="relative h-[5.25rem] w-[5.25rem] shrink-0 rounded-full sm:h-24 sm:w-24"
      style={{ background: gradient }}
      aria-hidden="true"
    >
      <div className="absolute inset-[20%] flex items-center justify-center rounded-full bg-white text-sm font-semibold tabular-nums">
        {noPrazo}%
      </div>
    </div>
  )
}

function buildMetrics(products: Product[]) {
  const today = localDate()
  const notas = groupByNota(allBoxes(products), today)
  const enviadas = notas.filter((nota) => nota.enviada)
  const pendentes = notas.filter((nota) => !nota.enviada)
  const noPrazo = enviadas.filter((nota) => nota.onTime).length
  const foraPrazo = enviadas.length - noPrazo
  const pctNoPrazo = percent(noPrazo, enviadas.length)
  const pctForaPrazo = enviadas.length === 0 ? 0 : 100 - pctNoPrazo
  const atrasadas = pendentes
    .filter((nota) => nota.atrasada)
    .map((nota) => ({
      notaFiscal: nota.notaFiscal,
      cidade: nota.cidade,
      prazo: nota.prazo,
      volumes: nota.volumes,
    }))
    .sort((a, b) => a.prazo.localeCompare(b.prazo) || a.notaFiscal.localeCompare(b.notaFiscal))

  return {
    today,
    enviadas: enviadas.length,
    pendentes: pendentes.length,
    atrasadas,
    atrasadasPendentes: atrasadas.length,
    enviadasHoje: enviadas.filter((nota) => localDate(nota.enviadaEm) === today).length,
    alocadasHoje: notas.filter((nota) => localDate(nota.alocadaEm) === today).length,
    noPrazo,
    foraPrazo,
    pctNoPrazo,
    pctForaPrazo,
    volume: lastDays(DAYS, today).map((date) => ({
      date,
      label: formatShortDay(date),
      count: enviadas.filter((nota) => localDate(nota.enviadaEm) === date).length,
    })),
  }
}

function groupByNota(boxes: Box[], today: string): NotaMetric[] {
  const groups = new Map<string, Box[]>()
  for (const box of boxes) {
    const nf = (box.notaFiscal ?? "").trim()
    if (!nf) continue
    const key = nf.toLowerCase()
    const list = groups.get(key) ?? []
    list.push(box)
    groups.set(key, list)
  }

  return [...groups.entries()].map(([, list]) => {
    const first = list[0]
    const notaFiscal = (first.notaFiscal ?? "").trim()
    const enviada = list.every((box) => box.expedida)
    const prazo = earliest(
      list.map((box) => deadline(box)).filter(Boolean),
    )
    const alocadaEm = earliest(
      list.map((box) => box.alocadaEm).filter(Boolean) as string[],
    )
    const enviadaEm = enviada
      ? latest(list.map((box) => box.enviadaEm).filter(Boolean) as string[])
      : ""
    const sentDay = localDate(enviadaEm)
    const due = prazo
    const onTime = !enviada || !sentDay || !due || sentDay <= due
    const atrasada = !enviada && Boolean(due) && due < today
    return {
      notaFiscal,
      cidade: first.cidade?.trim() || "sem cidade",
      prazo,
      alocadaEm,
      enviadaEm,
      volumes: list.length,
      enviada,
      onTime,
      atrasada,
    }
  })
}

function allBoxes(products: Product[]) {
  return products.flatMap((product) => product.lots.flatMap((lot) => lot.boxes))
}

function deadline(box: Box) {
  if (box.prazo) return localDate(box.prazo)
  const from = box.alocadaEm ? new Date(box.alocadaEm) : new Date()
  return prazoDeEnvio(box.cidade ?? "", from)
}

function earliest(values: string[]) {
  const days = values.map((value) => localDate(value)).filter(Boolean).sort()
  return days[0] ?? ""
}

function latest(values: string[]) {
  const sorted = [...values].filter(Boolean).sort()
  return sorted[sorted.length - 1] ?? ""
}

function percent(part: number, total: number) {
  if (total === 0) return 0
  return Math.round((part / total) * 100)
}

function localDate(value?: string) {
  if (!value) {
    const now = new Date()
    return toIsoDay(now)
  }
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
  if (match && value.length <= 10) return match[1]
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return match?.[1] ?? ""
  return toIsoDay(date)
}

function toIsoDay(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function lastDays(count: number, today: string) {
  const start = new Date(`${today}T12:00:00`)
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() - (count - 1 - index))
    return toIsoDay(date)
  })
}

function formatShortDay(iso: string) {
  const [, month, day] = iso.split("-")
  return `${day}/${month}`
}

function formatDayLabel(iso: string) {
  const [year, month, day] = iso.split("-")
  return `${day}/${month}/${year}`
}
