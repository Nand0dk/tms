import { useState, type FormEvent } from "react"
import { BackButton } from "../recebimento/BackButton"
import { Field } from "../recebimento/Field"
import { boxIdFromSearch } from "../recebimento/format"
import { ShelfReader } from "../recebimento/ShelfReader"
import type { Product, Warehouse } from "../recebimento/types"

type PendingBox = {
  id: string
  produto: string
  detalhe: string
}

export function ColetaScreen({
  products,
  warehouses,
  onCollect,
  onBack,
}: {
  products: Product[]
  warehouses: Warehouse[]
  onCollect: (boxIds: string[]) => void | Promise<void>
  onBack: () => void
}) {
  const [caixa, setCaixa] = useState("")
  const [pending, setPending] = useState<PendingBox[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const collected = collectedBoxes(products)

  function addBox(code: string) {
    const found = locateBox(products, resolveBoxId(code))
    if (!found) {
      setError("Caixa não encontrada.")
      setSaved(null)
      return
    }
    if (found.box.expedida) {
      setError("Esta caixa já foi expedida.")
      setCaixa("")
      setSaved(null)
      return
    }
    if (found.box.coletada) {
      setError("Esta caixa já foi coletada.")
      setCaixa("")
      setSaved(null)
      return
    }
    if (!found.box.posicao) {
      setError("Esta caixa ainda não está em uma posição.")
      setCaixa("")
      setSaved(null)
      return
    }
    if (pending.some((item) => item.id.toLowerCase() === found.box.id.toLowerCase())) {
      setError("Esta caixa já está na lista.")
      setCaixa("")
      return
    }
    const warehouse = warehouses.find(
      (item) => item.codigo.toLowerCase() === found.box.armazemCodigo?.toLowerCase(),
    )
    setPending((current) => [
      ...current,
      {
        id: found.box.id,
        produto: found.produto,
        detalhe: [found.box.posicao, warehouse?.nome].filter(Boolean).join(" · "),
      },
    ])
    setCaixa("")
    setError(null)
    setSaved(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = [...pending]
    const typed = resolveBoxId(caixa)
    if (typed) {
      const found = locateBox(products, typed)
      if (!found) {
        setError("Caixa não encontrada.")
        setSaved(null)
        return
      }
      if (found.box.expedida) {
        setError("Esta caixa já foi expedida.")
        setSaved(null)
        return
      }
      if (found.box.coletada) {
        setError("Esta caixa já foi coletada.")
        setSaved(null)
        return
      }
      if (!found.box.posicao) {
        setError("Esta caixa ainda não está em uma posição.")
        setSaved(null)
        return
      }
      if (!next.some((item) => item.id.toLowerCase() === found.box.id.toLowerCase())) {
        const warehouse = warehouses.find(
          (item) =>
            item.codigo.toLowerCase() === found.box.armazemCodigo?.toLowerCase(),
        )
        next.push({
          id: found.box.id,
          produto: found.produto,
          detalhe: [found.box.posicao, warehouse?.nome].filter(Boolean).join(" · "),
        })
      }
    }
    if (next.length === 0) {
      setError("Adicione ao menos uma caixa.")
      setSaved(null)
      return
    }
    try {
      await onCollect(next.map((item) => item.id))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar.")
      setSaved(null)
      return
    }
    setPending([])
    setCaixa("")
    setError(null)
    setSaved(
      next.length === 1
        ? `${next[0].id} coletada.`
        : `${next.length} caixas coletadas.`,
    )
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={handleSubmit}
      noValidate
    >
      <header className="flex items-center px-1 pt-4 pb-2">
        <BackButton onClick={onBack} label="Início" />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h1 className="text-2xl font-semibold tracking-tight">Coleta</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Leia as caixas que serão retiradas da posição.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <Field
            id="caixa-coleta"
            label="Caixa"
            value={caixa}
            placeholder="CX-0001 ou o QR"
            onChange={(value) => {
              setCaixa(value)
              setError(null)
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (!caixa.trim()) {
                setError("Informe a caixa.")
                return
              }
              addBox(caixa)
            }}
            className="rounded-xl border border-[#1f6b28] px-3 py-2.5 text-sm font-medium text-[#1f6b28]"
          >
            Adicionar caixa
          </button>
          <ShelfReader
            label="Ler códigos das caixas"
            continuous
            onRead={addBox}
          />
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {saved ? <p className="mt-3 text-sm text-[#1f6b28]">{saved}</p> : null}
        {pending.length > 0 ? (
          <div className="mt-4">
            <p className="text-sm font-medium text-neutral-800">
              {pending.length === 1
                ? "1 caixa para coletar"
                : `${pending.length} caixas para coletar`}
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {pending.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 text-sm text-neutral-700"
                >
                  <span>
                    {item.id} · {item.produto}
                    {item.detalhe ? ` · ${item.detalhe}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPending((current) =>
                        current.filter((box) => box.id !== item.id),
                      )
                    }
                    className="text-xs font-medium text-red-700"
                  >
                    Tirar
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="mt-5 flex gap-2">
          <button
            type="submit"
            className="flex-1 rounded-xl bg-[#1f6b28] px-3 py-2.5 text-sm font-semibold text-white"
          >
            Coletar
          </button>
        </div>
        <div className="mt-6">
          <p className="text-sm font-medium text-neutral-800">Coletadas</p>
          {collected.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">Nenhuma caixa coletada.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {collected.map((item) => (
                <li key={item.id} className="text-sm text-neutral-700">
                  {item.id} · {item.produto}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </form>
  )
}

function resolveBoxId(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ""
  return boxIdFromSearch(trimmed) ?? trimmed
}

function locateBox(products: Product[], boxId: string) {
  const wanted = boxId.toLowerCase()
  for (const product of products) {
    for (const lot of product.lots) {
      const box = lot.boxes.find((item) => item.id.toLowerCase() === wanted)
      if (box) return { box, produto: product.nome }
    }
  }
  return null
}

function collectedBoxes(products: Product[]) {
  return products.flatMap((product) =>
    product.lots.flatMap((lot) =>
      lot.boxes
        .filter((box) => box.coletada && !box.expedida)
        .map((box) => ({ id: box.id, produto: product.nome })),
    ),
  )
}
