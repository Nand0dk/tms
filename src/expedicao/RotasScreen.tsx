import { BackButton } from "../recebimento/BackButton"
import { ROTAS } from "./rotas"

export function RotasScreen({ onBack }: { onBack: () => void }) {
  const hoje = new Date().getDay()

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <header className="flex items-center px-1 pt-4 pb-2">
        <BackButton onClick={onBack} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Cidades</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Cidades que saem em cada dia da semana.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ROTAS.map((rota) => {
            const hojeNestaRota = rota.dias.includes(hoje)
            return (
              <section
                key={rota.id}
                className={`min-w-0 rounded-xl bg-white px-3 py-3 shadow-sm ring-1 ${
                  hojeNestaRota ? "ring-[#1f6b28]" : "ring-black/5"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-semibold">{rota.titulo}</h2>
                  {hojeNestaRota ? (
                    <span className="rounded-full bg-[#1f6b28] px-2 py-0.5 text-[11px] font-medium text-white">
                      Hoje
                    </span>
                  ) : null}
                </div>
                <ul className="mt-2 flex flex-col gap-1">
                  {rota.cidades.map((cidade) => (
                    <li key={cidade} className="text-sm text-neutral-700">
                      {cidade}
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
