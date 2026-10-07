import { useEffect, useState } from "react"
import { loadHistory, type HistoryEvent } from "../data/api"
import { BackButton } from "../recebimento/BackButton"

export function HistoricoScreen({
  actor,
  onBack,
}: {
  actor: string
  onBack: () => void
}) {
  const [events, setEvents] = useState<HistoryEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadHistory(actor)
      .then((data) => {
        if (!cancelled) setEvents(data.events)
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : "Não foi possível carregar o histórico.",
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [actor])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center px-1 pt-4 pb-2">
        <BackButton onClick={onBack} label="Início" />
      </header>
      <div className="px-1">
        <h1 className="text-2xl font-semibold tracking-tight">Histórico</h1>
        <p className="mt-1 text-sm text-neutral-600">Quem adicionou ou removeu.</p>
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-1 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : events.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-500">
            Nenhum registro ainda.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.map((event) => (
              <li
                key={`${event.criadoEm}-${event.texto}`}
                className="rounded-xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-black/5"
              >
                <p className="text-xs text-neutral-500">{formatWhen(event.criadoEm)}</p>
                <p className="mt-1 text-sm text-neutral-800">{event.texto}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function formatWhen(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
}
