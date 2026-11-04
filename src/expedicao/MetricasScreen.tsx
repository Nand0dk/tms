import { useEffect, useMemo, useState } from "react"
import { BackButton } from "../recebimento/BackButton"
import type { Box, Product } from "../recebimento/types"
import { formatPrazo, prazoDeEnvio } from "./rotas"

const DAYS = 7
const MONTHS = 12

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
        <h1 className="screen-title">Métricas</h1>
        <p className="mt-0.5 text-xs text-neutral-600 sm:text-sm lg:text-base">
          Envios por nota fiscal · {todayLabel}
        </p>

        {metrics.atrasadas.length > 0 ? (
          <div className="sticky top-0 z-10 -mx-1 bg-[#f4f6f3] px-1 pt-2">
            <AtrasoAlert notas={metrics.atrasadas} />
          </div>
        ) : null}

        <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:gap-2 lg:mt-4 lg:grid-cols-4 lg:gap-3">
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
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-neutral-800">Transportadoras</p>
              <p className="text-[11px] text-neutral-500">Prazo</p>
            </div>
            <p className="mt-0.5 text-[11px] text-neutral-500">
              Notas alocadas como transportadora
            </p>
            {metrics.transportadoras.total === 0 ? (
              <p className="mt-3 text-sm text-neutral-500">
                Nenhuma nota de transportadora ainda.
              </p>
            ) : (
              <TransportadorasChart data={metrics.transportadoras} />
            )}
          </section>

          <section className="rounded-xl bg-white px-2.5 py-2.5 shadow-sm ring-1 ring-black/5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-neutral-800">Volume mensal</p>
              <p className="text-[11px] text-neutral-500">{MONTHS} meses</p>
            </div>
            <LineChart months={metrics.volumeMensal} compact />
          </section>
        </div>

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

type AtrasoNota = {
  notaFiscal: string
  cidade: string
  prazo: string
  volumes: number
}

function AtrasoAlert({ notas }: { notas: AtrasoNota[] }) {
  const [open, setOpen] = useState(false)
  const titulo =
    notas.length === 1
      ? "1 nota atrasada precisa ser enviada"
      : `${notas.length} notas atrasadas precisam ser enviadas`
  const subtitulo =
    notas.length === 1
      ? "O prazo já passou e a nota ainda não saiu."
      : "O prazo já passou e as notas ainda não saíram."

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        role="alert"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex w-full items-start gap-2 rounded-xl bg-[#fff7ed] px-2.5 py-2 text-left shadow-sm ring-1 ring-[#c2410c]/50 transition active:bg-[#ffedd5]"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[#c2410c]">{titulo}</span>
          <span className="mt-0.5 block text-[11px] text-neutral-600">{subtitulo}</span>
          <span className="mt-1 block text-[11px] font-medium text-[#c2410c]/80">
            Toque para ver detalhes
          </span>
        </span>
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#c2410c]"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5">
            <path
              d="M9 5l7 7-7 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          role="presentation"
        >
          <button
            type="button"
            aria-label="Fechar"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="atraso-panel-title"
            className="relative z-10 flex max-h-[min(85vh,36rem)] w-full max-w-lg flex-col rounded-t-2xl bg-[#fff7ed] shadow-xl ring-1 ring-[#c2410c]/30 sm:rounded-2xl"
          >
            <div className="flex items-start gap-2 border-b border-[#c2410c]/15 px-2.5 py-2 sm:px-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Voltar"
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#c2410c] hover:bg-[#c2410c]/10"
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
                  id="atraso-panel-title"
                  className="text-sm font-semibold text-[#c2410c]"
                >
                  {titulo}
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-600">{subtitulo}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#c2410c] hover:bg-[#c2410c]/10"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6 6 18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2.5 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-3">
              {notas.map((nota) => (
                <li
                  key={nota.notaFiscal}
                  className="rounded-xl bg-white px-2.5 py-2 shadow-sm ring-1 ring-[#c2410c]/15"
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
          </div>
        </div>
      ) : null}
    </>
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

function TransportadorasChart({
  data,
}: {
  data: {
    total: number
    prazo: number
    enviadasNoPrazo: number
    atrasadas: number
  }
}) {
  const rows = [
    { label: "Total", value: data.total, color: "bg-neutral-700" },
    { label: "No prazo", value: data.prazo, color: "bg-[#2563eb]" },
    { label: "Enviadas no prazo", value: data.enviadasNoPrazo, color: "bg-[#1f6b28]" },
    { label: "Atrasadas", value: data.atrasadas, color: "bg-[#c2410c]" },
  ]
  const max = Math.max(1, data.total)

  return (
    <div className="mt-2.5 flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-1.5">
        {rows.map((row) => (
          <div key={row.label} className="rounded-lg bg-neutral-50 px-2 py-1.5 text-center">
            <p
              className={`text-base font-semibold tabular-nums ${
                row.label === "Atrasadas" && row.value > 0 ? "text-[#c2410c]" : "text-neutral-900"
              }`}
            >
              {row.value}
            </p>
            <p className="text-[10px] leading-tight text-neutral-500">{row.label}</p>
          </div>
        ))}
      </div>
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => {
          const width = Math.max(row.value > 0 ? 8 : 0, (row.value / max) * 100)
          return (
            <li key={row.label} className="flex items-center gap-2">
              <span className="w-24 shrink-0 truncate text-[10px] text-neutral-600">
                {row.label}
              </span>
              <div className="h-2 min-w-0 flex-1 rounded-full bg-neutral-100">
                <div
                  className={`h-full rounded-full ${row.color}`}
                  style={{ width: `${width}%` }}
                />
              </div>
              <span className="w-5 shrink-0 text-right text-[11px] font-semibold tabular-nums text-neutral-800">
                {row.value}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function LineChart({
  months,
  compact = false,
}: {
  months: { month: string; label: string; count: number }[]
  compact?: boolean
}) {
  const width = 280
  const height = compact ? 96 : 140
  const padX = 8
  const padTop = compact ? 12 : 16
  const padBottom = compact ? 18 : 28
  const chartW = width - padX * 2
  const chartH = height - padTop - padBottom
  const max = Math.max(1, ...months.map((month) => month.count))
  const points = months.map((month, index) => {
    const x =
      months.length === 1
        ? padX + chartW / 2
        : padX + (index / (months.length - 1)) * chartW
    const y = padTop + chartH - (month.count / max) * chartH
    return { ...month, x, y }
  })
  const line = points.map((point) => `${point.x},${point.y}`).join(" ")
  const area =
    points.length > 0
      ? `M ${points[0].x} ${padTop + chartH} L ${points
          .map((point) => `${point.x} ${point.y}`)
          .join(" L ")} L ${points[points.length - 1].x} ${padTop + chartH} Z`
      : ""
  const labelStep = compact ? 2 : 1

  return (
    <div className="mt-1.5 w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={`w-full ${compact ? "h-24" : "h-36 sm:h-40"}`}
        role="img"
        aria-label="Volume de envios por mês"
      >
        {[0.5, 1].map((step) => {
          const y = padTop + chartH - step * chartH
          return (
            <line
              key={step}
              x1={padX}
              y1={y}
              x2={padX + chartW}
              y2={y}
              stroke="#e5e7eb"
              strokeWidth="1"
            />
          )
        })}
        {area ? <path d={area} fill="#1f6b28" fillOpacity="0.12" /> : null}
        <polyline
          fill="none"
          stroke="#1f6b28"
          strokeWidth={compact ? 2 : 2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={line}
        />
        {points.map((point, index) => {
          const showLabel = index % labelStep === 0 || index === points.length - 1
          return (
            <g key={point.month}>
              <circle cx={point.x} cy={point.y} r={compact ? 2.5 : 3.5} fill="#1f6b28" />
              {!compact || point.count > 0 ? (
                <text
                  x={point.x}
                  y={Math.max(10, point.y - 6)}
                  textAnchor="middle"
                  className="fill-neutral-700"
                  fontSize={compact ? "8" : "9"}
                  fontWeight="600"
                >
                  {point.count}
                </text>
              ) : null}
              {showLabel ? (
                <text
                  x={point.x}
                  y={height - 4}
                  textAnchor="middle"
                  className="fill-neutral-500"
                  fontSize={compact ? "7" : "9"}
                >
                  {point.label}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
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

  const transportadoras = notas.filter((nota) => isTransportadora(nota.cidade))
  const transportadorasEnviadas = transportadoras.filter((nota) => nota.enviada)
  const transportadorasPendentes = transportadoras.filter((nota) => !nota.enviada)
  const transportadorasNoPrazo = transportadorasEnviadas.filter((nota) => nota.onTime).length
  const transportadorasAtrasadas =
    transportadorasPendentes.filter((nota) => nota.atrasada).length +
    transportadorasEnviadas.filter((nota) => !nota.onTime).length
  const transportadorasPrazo = transportadorasPendentes.filter((nota) => !nota.atrasada).length

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
    volumeMensal: lastMonths(MONTHS, today).map((month) => ({
      month: month.key,
      label: month.label,
      count: enviadas.filter((nota) => yearMonth(nota.enviadaEm) === month.key).length,
    })),
    transportadoras: {
      total: transportadoras.length,
      prazo: transportadorasPrazo,
      enviadasNoPrazo: transportadorasNoPrazo,
      atrasadas: transportadorasAtrasadas,
    },
  }
}

function isTransportadora(cidade: string) {
  return cidade.trim().toLowerCase() === "transportadora"
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

function yearMonth(value?: string) {
  const day = localDate(value)
  return day ? day.slice(0, 7) : ""
}

function lastMonths(count: number, today: string) {
  const [yearText, monthText] = today.split("-")
  const year = Number(yearText)
  const month = Number(monthText)
  return Array.from({ length: count }, (_, index) => {
    const offset = count - 1 - index
    const date = new Date(year, month - 1 - offset, 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    return { key, label: formatMonthLabel(date) }
  })
}

const MONTH_LABELS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
]

function formatMonthLabel(date: Date) {
  const label = MONTH_LABELS[date.getMonth()] ?? ""
  const year = String(date.getFullYear()).slice(2)
  return `${label}/${year}`
}
