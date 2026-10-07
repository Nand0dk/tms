import { useMemo, useState, type FormEvent } from "react"
import { BackButton } from "../recebimento/BackButton"
import { Field } from "../recebimento/Field"
import { boxIdFromSearch, positionFromSearch, productBalance } from "../recebimento/format"
import { ShelfReader } from "../recebimento/ShelfReader"
import type { Box, Product, Warehouse } from "../recebimento/types"

export function EstoqueScreen({
  products,
  warehouses,
  onSetPosition,
  onBack,
}: {
  products: Product[]
  warehouses: Warehouse[]
  onSetPosition: (boxId: string, posicao: string, armazemCodigo?: string) => void
  onBack: () => void
}) {
  const [query, setQuery] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = findBox(products, editingId)

  if (editing) {
    return (
      <PositionForm
        box={editing.box}
        product={editing.product}
        lote={editing.lote}
        warehouses={warehouses}
        onBack={() => setEditingId(null)}
        onSave={async (posicao, armazemCodigo) => {
          await onSetPosition(editing.box.id, posicao, armazemCodigo)
          setEditingId(null)
        }}
      />
    )
  }

  return (
    <StockList
      products={products}
      warehouses={warehouses}
      query={query}
      onQuery={setQuery}
      onBack={onBack}
      onEdit={setEditingId}
    />
  )
}

function StockList({
  products,
  warehouses,
  query,
  onQuery,
  onBack,
  onEdit,
}: {
  products: Product[]
  warehouses: Warehouse[]
  query: string
  onQuery: (value: string) => void
  onBack: () => void
  onEdit: (boxId: string) => void
}) {
  const filtered = useMemo(
    () => filterStock(products, query),
    [products, query],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center px-1 pt-4 pb-2">
        <BackButton onClick={onBack} label="Início" />
      </header>
      <div className="px-1">
        <h1 className="text-2xl font-semibold tracking-tight">Estoque</h1>
        <label htmlFor="pesquisar-estoque" className="sr-only">
          Pesquisar estoque
        </label>
        <input
          id="pesquisar-estoque"
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Produto, código, caixa ou QR"
          className="mt-3 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-base outline-none placeholder:text-neutral-400 focus:border-[#2e7d32] focus:ring-2 focus:ring-[#2e7d32]/20 md:py-2 md:text-sm"
        />
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-1 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {products.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-500">
            Nenhum produto ainda.
          </p>
        ) : filtered.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-500">
            Nenhum resultado encontrado.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {filtered.map(({ product, boxes }) => (
              <li
                key={product.codigo}
                className="rounded-xl bg-white px-3 py-3 shadow-sm ring-1 ring-black/5"
              >
                <p className="text-sm font-semibold">{product.nome}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {product.codigo}
                  {" · saldo "}
                  {productBalance(product).toLocaleString("pt-BR")}
                  {product.unidade ? ` ${product.unidade}` : ""}
                </p>
                {boxes.length === 0 ? (
                  <p className="mt-2 text-xs text-neutral-500">Nenhuma caixa.</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-2 border-t border-neutral-100 pt-2">
                    {boxes.map((box) => (
                      <li key={box.id} className="text-sm">
                        <p>
                          {box.id} · lote {box.lote}
                          {box.expedida
                            ? " · Expedida"
                            : box.coletada
                              ? " · Coletada"
                              : box.posicao
                                ? ` · ${box.posicao}`
                                : ""}
                          {!box.coletada && !box.expedida && warehouseName(warehouses, box.armazemCodigo)
                            ? ` · ${warehouseName(warehouses, box.armazemCodigo)}`
                            : ""}
                        </p>
                        {box.coletada || box.expedida ? null : (
                          <button
                            type="button"
                            onClick={() => onEdit(box.id)}
                            className="mt-0.5 text-xs font-medium text-[#1f6b28]"
                          >
                            {box.posicao ? "Alterar posição" : "Definir posição"}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function PositionForm({
  box,
  product,
  lote,
  warehouses,
  onBack,
  onSave,
}: {
  box: Box
  product: Product
  lote: string
  warehouses: Warehouse[]
  onBack: () => void
  onSave: (posicao: string, armazemCodigo?: string) => void | Promise<void>
}) {
  const [posicao, setPosicao] = useState(box.posicao ?? "")
  const [armazemCodigo, setArmazemCodigo] = useState(box.armazemCodigo ?? "")
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = positionFromSearch(posicao.trim())
    const position = parsed?.codigo ?? posicao.trim()
    const fromQr = parsed?.armazem
      ? warehouses.find(
          (warehouse) =>
            warehouse.codigo.toLowerCase() === parsed.armazem?.toLowerCase(),
        )?.codigo
      : undefined
    const warehouseCode = fromQr ?? armazemCodigo
    if (!position) {
      setError("Informe a posição.")
      return
    }
    if (warehouses.length > 0 && !warehouseCode) {
      setError("Selecione o armazém.")
      return
    }
    try {
      await onSave(position, warehouseCode || undefined)
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
        <h1 className="text-2xl font-semibold tracking-tight">
          {box.posicao ? "Alterar posição" : "Definir posição"}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          {product.codigo} · {product.nome} · {box.id} · lote {lote}
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <Field
            id="posicao"
            label="Posição"
            value={posicao}
            placeholder="ex.: A-01"
            onChange={(value) => {
              setPosicao(value)
              setError(null)
            }}
          />
          <ShelfReader
            onRead={(code) => {
              const parsed = positionFromSearch(code)
              setPosicao(parsed?.codigo ?? code)
              if (parsed?.armazem) {
                const match = warehouses.find(
                  (warehouse) =>
                    warehouse.codigo.toLowerCase() === parsed.armazem?.toLowerCase(),
                )
                if (match) setArmazemCodigo(match.codigo)
              }
              setError(null)
            }}
          />
          {warehouses.length > 0 ? (
            <div className="flex flex-col gap-1">
              <label htmlFor="armazem" className="text-sm font-medium text-neutral-800">
                Armazém
              </label>
              <select
                id="armazem"
                value={armazemCodigo}
                onChange={(event) => {
                  setArmazemCodigo(event.target.value)
                  setError(null)
                }}
                className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-base outline-none focus:border-[#2e7d32] focus:ring-2 focus:ring-[#2e7d32]/20 md:py-2 md:text-sm"
              >
                <option value="">Selecione</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.codigo} value={warehouse.codigo}>
                    {warehouse.codigo} · {warehouse.nome}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">
              O armazém pode ser escolhido depois que um for cadastrado em Armazém.
            </p>
          )}
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

function filterStock(products: Product[], query: string) {
  const term = query.trim().toLowerCase()
  const fromQr = boxIdFromSearch(query.trim())
  const boxTerm = (fromQr ?? query.trim()).toLowerCase()

  return products.flatMap((product) => {
    const boxes = product.lots.flatMap((lot) =>
      lot.boxes.map((box) => ({ ...box, lote: lot.numero })),
    )
    if (!term) return [{ product, boxes }]
    const productMatch =
      product.nome.toLowerCase().includes(term) ||
      product.codigo.toLowerCase().includes(term)
    if (productMatch) return [{ product, boxes }]
    const matched = boxes.filter((box) => box.id.toLowerCase() === boxTerm)
    if (matched.length === 0) return []
    return [{ product, boxes: matched }]
  })
}

function findBox(products: Product[], boxId: string | null) {
  if (!boxId) return null
  for (const product of products) {
    for (const lot of product.lots) {
      const box = lot.boxes.find((item) => item.id === boxId)
      if (box) return { product, lote: lot.numero, box }
    }
  }
  return null
}

function warehouseName(warehouses: Warehouse[], codigo?: string) {
  if (!codigo) return ""
  return warehouses.find(
    (warehouse) => warehouse.codigo.toLowerCase() === codigo.toLowerCase(),
  )?.nome
}
