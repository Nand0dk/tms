import { useState, type FormEvent } from "react"
import { lookupNotaFiscal, type NotaFiscalLookup } from "../data/api"
import { BackButton } from "../recebimento/BackButton"
import { Field } from "../recebimento/Field"
import { positionFromSearch } from "../recebimento/format"
import { ShelfReader } from "../recebimento/ShelfReader"
import type { Product } from "../recebimento/types"

type PendingBox = {
  id: string
  produto: string
  posicao: string
}

type ExpeditionDraft = {
  notaFiscal: string
  quantidade: number
  posicao: string
  boxes: PendingBox[]
}

type ExpedicaoView = "menu" | "alocar" | "expedir" | "buscar"

export function ExpedicaoScreen({
  products,
  onAllocate,
  onShip,
  onBack,
}: {
  products: Product[]
  onAllocate: (
    notaFiscal: string,
    quantidade: number,
    posicao: string,
    armazemCodigo?: string,
  ) => void | Promise<void>
  onShip: (
    boxIds: string[],
    notaFiscal: string,
    quantidade: number,
    posicao?: string,
  ) => void | Promise<void>
  onBack: () => void
}) {
  const [view, setView] = useState<ExpedicaoView>("menu")
  const [draft, setDraft] = useState<ExpeditionDraft | null>(null)
  const [notaLookup, setNotaLookup] = useState<NotaFiscalLookup | null>(null)

  if (notaLookup) {
    return (
      <NotaFiscalHistorico data={notaLookup} onBack={() => setNotaLookup(null)} />
    )
  }

  if (draft) {
    return (
      <ExpedirPage
        draft={draft}
        products={products}
        onBack={() => setDraft(null)}
        onShip={onShip}
        onDone={() => {
          setDraft(null)
          setView("menu")
        }}
      />
    )
  }

  if (view === "buscar") {
    return (
      <BuscarNotaFiscal
        onBack={() => setView("menu")}
        onFound={setNotaLookup}
      />
    )
  }

  if (view === "alocar") {
    return (
      <AlocarForm
        onBack={() => setView("menu")}
        onAllocate={onAllocate}
        onDone={() => setView("menu")}
      />
    )
  }

  if (view === "expedir") {
    return (
      <ExpedirForm
        products={products}
        onBack={() => setView("menu")}
        onContinue={setDraft}
      />
    )
  }

  return (
    <ExpedicaoMenu
      products={products}
      onBack={onBack}
      onAlocar={() => setView("alocar")}
      onExpedir={() => setView("expedir")}
      onBuscar={() => setView("buscar")}
    />
  )
}

function ExpedicaoMenu({
  products,
  onBack,
  onAlocar,
  onExpedir,
  onBuscar,
}: {
  products: Product[]
  onBack: () => void
  onAlocar: () => void
  onExpedir: () => void
  onBuscar: () => void
}) {
  const shipped = shippedBoxes(products)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center px-1 pt-4 pb-2">
        <BackButton onClick={onBack} label="Início" />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h1 className="text-2xl font-semibold tracking-tight">Expedição</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Alocar caixas, enviar ou consultar uma nota fiscal.
        </p>
        <div className="mt-5 flex flex-col gap-3">
          <button
            type="button"
            onClick={onAlocar}
            className="w-full rounded-xl bg-[#1f6b28] px-3 py-3 text-sm font-semibold text-white"
          >
            Alocar
          </button>
          <button
            type="button"
            onClick={onExpedir}
            className="w-full rounded-xl border border-[#1f6b28] px-3 py-3 text-sm font-medium text-[#1f6b28]"
          >
            Enviar
          </button>
          <button
            type="button"
            onClick={onBuscar}
            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm font-medium text-neutral-800"
          >
            Buscar nota fiscal
          </button>
        </div>
        <div className="mt-8">
          <p className="text-sm font-medium text-neutral-800">Enviadas</p>
          {shipped.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">Nenhuma caixa enviada.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {shipped.map((item) => (
                <li key={item.id} className="text-sm text-neutral-700">
                  {item.id} · {item.produto}
                  {item.notaFiscal ? ` · NF ${item.notaFiscal}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function BuscarNotaFiscal({
  onBack,
  onFound,
}: {
  onBack: () => void
  onFound: (data: NotaFiscalLookup) => void
}) {
  const [notaFiscal, setNotaFiscal] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const invoice = notaFiscal.trim()
    if (!invoice) {
      setError("Informe a nota fiscal.")
      return
    }
    setSearching(true)
    setError(null)
    try {
      onFound(await lookupNotaFiscal(invoice))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível buscar.")
    }
    setSearching(false)
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => void handleSearch(event)}
      noValidate
    >
      <header className="flex items-center px-1 pt-4 pb-2">
        <BackButton onClick={onBack} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h1 className="text-2xl font-semibold tracking-tight">Buscar nota fiscal</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Informe o número da NF para ver onde as caixas estão e quem posicionou.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <Field
            id="buscar-nota-fiscal"
            label="Nota fiscal"
            value={notaFiscal}
            placeholder="Número da NF"
            onChange={(value) => {
              setNotaFiscal(value)
              setError(null)
            }}
          />
          <button
            type="submit"
            disabled={searching}
            className="w-full rounded-xl bg-[#1f6b28] px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {searching ? "Buscando…" : "Buscar"}
          </button>
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  )
}

function AlocarForm({
  onBack,
  onAllocate,
  onDone,
}: {
  onBack: () => void
  onAllocate: (
    notaFiscal: string,
    quantidade: number,
    posicao: string,
    armazemCodigo?: string,
  ) => void | Promise<void>
  onDone: () => void
}) {
  const [notaFiscal, setNotaFiscal] = useState("")
  const [quantidade, setQuantidade] = useState("")
  const [posicao, setPosicao] = useState("")
  const [armazemCodigo, setArmazemCodigo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  function loadFromShelf(code: string) {
    const parsed = positionFromSearch(code.trim())
    const position = parsed?.codigo || code.trim()
    if (!position) {
      setError("Informe a posição.")
      return
    }
    setPosicao(position)
    setArmazemCodigo(parsed?.armazem ?? "")
    setError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saved) {
      onDone()
      return
    }
    const invoice = notaFiscal.trim()
    const count = Number(quantidade.trim())
    const parsed = positionFromSearch(posicao.trim())
    const position = parsed?.codigo || posicao.trim()
    const warehouse = armazemCodigo.trim() || parsed?.armazem || undefined
    if (!invoice) {
      setError("Informe a nota fiscal.")
      return
    }
    if (!position) {
      setError("Informe a posição.")
      return
    }
    if (!Number.isInteger(count) || count < 1) {
      setError("Informe a quantidade de caixas.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onAllocate(invoice, count, position, warehouse)
      setSaved(
        count === 1
          ? `1 caixa alocada na nota ${invoice} em ${position}.`
          : `${count} caixas alocadas na nota ${invoice} em ${position}.`,
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível alocar.")
    }
    setSaving(false)
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
    >
      <header className="flex items-center px-1 pt-4 pb-2">
        <BackButton onClick={saved ? onDone : onBack} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h1 className="text-2xl font-semibold tracking-tight">Alocar</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Receba as caixas aqui: informe a nota, a quantidade e a posição para
          salvar direto.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <Field
            id="alocar-nota-fiscal"
            label="Nota fiscal"
            value={notaFiscal}
            placeholder="Número da NF"
            onChange={(value) => {
              setNotaFiscal(value)
              setError(null)
            }}
          />
          <Field
            id="alocar-quantidade"
            label="Quantidade de caixas"
            value={quantidade}
            placeholder="ex.: 3"
            inputMode="numeric"
            onChange={(value) => {
              setQuantidade(value)
              setError(null)
            }}
          />
          <Field
            id="alocar-posicao"
            label="Posição"
            value={posicao}
            placeholder="ex.: A-01"
            onChange={(value) => {
              setPosicao(value)
              setArmazemCodigo("")
              setError(null)
            }}
          />
          {!saved ? (
            <ShelfReader label="Ler código da prateleira" onRead={loadFromShelf} />
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {saved ? <p className="mt-3 text-sm text-[#1f6b28]">{saved}</p> : null}
        <div className="mt-5">
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-[#1f6b28] px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saved
              ? "Voltar à expedição"
              : saving
                ? "Salvando…"
                : "Salvar alocação"}
          </button>
        </div>
      </div>
    </form>
  )
}

function ExpedirForm({
  products,
  onBack,
  onContinue,
}: {
  products: Product[]
  onBack: () => void
  onContinue: (draft: ExpeditionDraft) => void
}) {
  const [notaFiscal, setNotaFiscal] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const invoice = notaFiscal.trim()
    if (!invoice) {
      setError("Informe a nota fiscal.")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await lookupNotaFiscal(invoice)
      const allocated = boxesForNota(products, data.notaFiscal)
      if (allocated.length === 0) {
        setError("Nenhuma caixa alocada nesta nota fiscal.")
        setLoading(false)
        return
      }
      onContinue({
        notaFiscal: data.notaFiscal,
        quantidade: allocated.length,
        posicao: data.posicao || allocated[0]?.posicao || "",
        boxes: allocated,
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível carregar a nota.")
    }
    setLoading(false)
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
    >
      <header className="flex items-center px-1 pt-4 pb-2">
        <BackButton onClick={onBack} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h1 className="text-2xl font-semibold tracking-tight">Enviar</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Informe a nota fiscal já alocada para confirmar a saída.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <Field
            id="expedir-nota-fiscal"
            label="Nota fiscal"
            value={notaFiscal}
            placeholder="Número da NF"
            onChange={(value) => {
              setNotaFiscal(value)
              setError(null)
            }}
          />
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="mt-5">
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#1f6b28] px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Carregando…" : "Continuar"}
          </button>
        </div>
      </div>
    </form>
  )
}

function NotaFiscalHistorico({
  data,
  onBack,
}: {
  data: NotaFiscalLookup
  onBack: () => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center px-1 pt-4 pb-2">
        <BackButton onClick={onBack} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h1 className="text-2xl font-semibold tracking-tight">Histórico da nota</h1>
        <div className="mt-3 rounded-xl bg-white px-3 py-3 shadow-sm ring-1 ring-black/5">
          <p className="text-sm text-neutral-600">Nota fiscal</p>
          <p className="text-base font-semibold">{data.notaFiscal}</p>
          {data.posicao ? (
            <>
              <p className="mt-2 text-sm text-neutral-600">Posição</p>
              <p className="text-sm font-semibold">{data.posicao}</p>
            </>
          ) : null}
          <p className="mt-2 text-sm text-neutral-600">Quantidade</p>
          <p className="text-sm font-semibold">{data.quantidade}</p>
          {data.expedidaPor ? (
            <p className="mt-2 text-sm text-neutral-700">
              Registrada por {data.expedidaPor}
              {data.expedidaEm ? ` · ${formatDateTime(data.expedidaEm)}` : ""}
            </p>
          ) : null}
        </div>
        <ul className="mt-4 flex flex-col gap-2">
          {data.items.length === 0 ? (
            <li className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-6 text-center text-sm text-neutral-500">
              Nota encontrada. Nenhuma caixa vinculada ainda.
            </li>
          ) : (
            data.items.map((item) => (
              <li
                key={item.id}
                className="rounded-xl bg-white px-3 py-3 shadow-sm ring-1 ring-black/5"
              >
                <p className="text-sm font-semibold">
                  {item.id} · {item.produto}
                </p>
                <p className="mt-1 text-sm text-neutral-700">
                  Onde está: {item.ondeEsta}
                </p>
                {item.posicao && item.ondeEsta !== item.posicao ? (
                  <p className="mt-0.5 text-sm text-neutral-700">
                    Posição no histórico: {item.posicao}
                  </p>
                ) : null}
                <p className="mt-0.5 text-sm text-neutral-700">
                  Quem salvou na posição:{" "}
                  {item.salvaPor
                    ? `${item.salvaPor}${item.salvaEm ? ` · ${formatDateTime(item.salvaEm)}` : ""}`
                    : "Não registrado"}
                </p>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}

function formatDateTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString("pt-BR")
}

function ExpedirPage({
  draft,
  products,
  onBack,
  onShip,
  onDone,
}: {
  draft: ExpeditionDraft
  products: Product[]
  onBack: () => void
  onShip: (
    boxIds: string[],
    notaFiscal: string,
    quantidade: number,
    posicao?: string,
  ) => void | Promise<void>
  onDone: () => void
}) {
  const [boxes, setBoxes] = useState(draft.boxes)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  async function confirmShip() {
    if (boxes.length === 0) {
      setError("Nenhuma caixa para enviar.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onShip(
        boxes.map((item) => item.id),
        draft.notaFiscal,
        boxes.length,
        draft.posicao,
      )
      setSaved(
        boxes.length === 1
          ? `${boxes[0].id} enviada na nota ${draft.notaFiscal}.`
          : `${boxes.length} caixas enviadas na nota ${draft.notaFiscal}.`,
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar.")
      setSaving(false)
      return
    }
    setSaving(false)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center px-1 pt-4 pb-2">
        <BackButton onClick={saved ? onDone : onBack} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h1 className="text-2xl font-semibold tracking-tight">Confirmar envio</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Confira os dados e confirme para registrar a saída.
        </p>
        <div className="mt-4 rounded-xl bg-white px-3 py-3 shadow-sm ring-1 ring-black/5">
          <p className="text-sm text-neutral-600">Nota fiscal</p>
          <p className="text-base font-semibold">{draft.notaFiscal}</p>
          {draft.posicao ? (
            <>
              <p className="mt-2 text-sm text-neutral-600">Posição</p>
              <p className="text-base font-semibold">{draft.posicao}</p>
            </>
          ) : null}
          <p className="mt-2 text-sm text-neutral-600">Quantidade</p>
          <p className="text-base font-semibold">{boxes.length}</p>
        </div>
        <div className="mt-4">
          <p className="text-sm font-medium text-neutral-800">
            {boxes.length === 1 ? "1 caixa" : `${boxes.length} caixas`}
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {boxes.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 text-sm text-neutral-700"
              >
                <span>
                  {item.id} · {item.produto}
                </span>
                {!saved ? (
                  <button
                    type="button"
                    onClick={() =>
                      setBoxes((current) => current.filter((box) => box.id !== item.id))
                    }
                    className="text-xs font-medium text-red-700"
                  >
                    Tirar
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {saved ? <p className="mt-3 text-sm text-[#1f6b28]">{saved}</p> : null}
        <div className="mt-5 flex gap-2">
          {saved ? (
            <button
              type="button"
              onClick={onDone}
              className="w-full rounded-xl bg-[#1f6b28] px-3 py-2.5 text-sm font-semibold text-white"
            >
              Voltar à expedição
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onBack}
                className="flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm font-medium text-neutral-700"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void confirmShip()}
                className="flex-1 rounded-xl bg-[#1f6b28] px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Salvando…" : "Confirmar envio"}
              </button>
            </>
          )}
        </div>
        {saved ? (
          <p className="mt-4 text-sm text-neutral-500">
            {shippedBoxes(products).length} caixa(s) já enviadas no sistema.
          </p>
        ) : null}
      </div>
    </div>
  )
}

function boxesForNota(products: Product[], notaFiscal: string) {
  const wanted = notaFiscal.trim().toLowerCase()
  const normalized = wanted.replace(/[\s.\-\/_]/g, "")
  return products.flatMap((product) =>
    product.lots.flatMap((lot) =>
      lot.boxes
        .filter((box) => {
          if (box.expedida) return false
          const nf = (box.notaFiscal ?? "").trim().toLowerCase()
          if (!nf) return false
          if (nf === wanted || nf.includes(wanted)) return true
          const boxNorm = nf.replace(/[\s.\-\/_]/g, "")
          return Boolean(normalized) && (boxNorm === normalized || boxNorm.includes(normalized))
        })
        .map((box) => ({
          id: box.id,
          produto: product.nome,
          posicao: box.posicao ?? "",
        })),
    ),
  )
}

function shippedBoxes(products: Product[]) {
  return products.flatMap((product) =>
    product.lots.flatMap((lot) =>
      lot.boxes
        .filter((box) => box.expedida)
        .map((box) => ({
          id: box.id,
          produto: product.nome,
          notaFiscal: box.notaFiscal ?? "",
        })),
    ),
  )
}
