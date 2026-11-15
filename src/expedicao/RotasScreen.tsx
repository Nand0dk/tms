import { BackButton } from "../recebimento/BackButton"
import { getRotas } from "./rotas"

export function RotasScreen({ onBack }: { onBack: () => void }) {
  const rotas = getRotas()

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <header className="flex items-center px-1 pt-4 pb-2">
        <BackButton onClick={onBack} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h1 className="screen-title">Cidades</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Até 5 cidades em cada uma das 5 rotas de saída.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 lg:gap-4 xl:grid-cols-5">
          {rotas.map((rota) => (
            <section
              key={rota.id}
              className="min-w-0 rounded-xl bg-white px-3 py-3 shadow-sm ring-1 ring-black/5"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold">{rota.titulo}</h2>
                <span className="text-xs text-neutral-500">
                  {rota.cidades.length}/5
                </span>
              </div>
              <ul className="mt-2 flex flex-col gap-1">
                {rota.cidades.length === 0 ? (
                  <li className="text-sm text-neutral-500">Sem cidades</li>
                ) : (
                  rota.cidades.map((cidade) => (
                    <li key={cidade} className="text-sm text-neutral-700">
                      {cidade}
                    </li>
                  ))
                )}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
