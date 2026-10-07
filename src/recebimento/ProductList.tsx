import { useMemo, useState } from "react"
import { BackButton } from "./BackButton"
import { formatLot, latestLot } from "./format"
import type { Product } from "./types"

export function ProductList({
  products,
  onBack,
  onAdd,
  onReceive,
  onPrint,
  onDeleteProduct,
  onDeleteLot,
  canDelete,
}: {
  products: Product[]
  onBack: () => void
  onAdd: () => void
  onReceive: (codigo: string) => void
  onPrint: (codigo: string, numero: string) => void
  onDeleteProduct: (codigo: string) => void | Promise<void>
  onDeleteLot: (codigo: string, numero: string) => void | Promise<void>
  canDelete: boolean
}) {
  const [query, setQuery] = useState("")
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return products
    return products.filter(
      (product) =>
        product.nome.toLowerCase().includes(term) ||
        product.codigo.toLowerCase().includes(term),
    )
  }, [products, query])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-2 px-1 pt-4 pb-2">
        <BackButton onClick={onBack} label="Início" />
        <button
          type="button"
          onClick={onAdd}
          aria-label="Adicionar novo produto"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1f6b28] text-2xl leading-none font-medium text-white shadow-md shadow-black/20"
        >
          +
        </button>
      </header>

      <div className="px-4">
        <h1 className="text-2xl font-semibold tracking-tight">Recebimento</h1>
        <label htmlFor="pesquisar-produto" className="sr-only">
          Pesquisar produto
        </label>
        <input
          id="pesquisar-produto"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Pesquisar produto"
          className="mt-3 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-base outline-none placeholder:text-neutral-400 focus:border-[#2e7d32] focus:ring-2 focus:ring-[#2e7d32]/20 md:py-2 md:text-sm"
        />
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {products.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-500">
            Nenhum produto ainda.
          </p>
        ) : filtered.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-500">
            Nenhum produto encontrado.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((product) => {
              const lot = latestLot(product)
              return (
                <li
                  key={product.codigo}
                  className="rounded-xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-black/5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">
                        {product.nome}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {product.codigo}
                        {product.unidade ? ` · ${product.unidade}` : ""}
                      </p>
                    </div>
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() =>
                          confirmDelete(
                            `Apagar o produto ${product.codigo}?`,
                            () => onDeleteProduct(product.codigo),
                          )
                        }
                        className="shrink-0 text-xs font-medium text-red-700"
                      >
                        Apagar produto
                      </button>
                    ) : null}
                  </div>
                  {lot ? (
                    <div className="mt-2 border-t border-neutral-100 pt-2">
                      <p className="text-xs text-neutral-700">
                        {formatLot(lot, product.unidade)}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                        <button
                          type="button"
                          onClick={() => onPrint(product.codigo, lot.numero)}
                          className="text-xs font-medium text-[#1f6b28]"
                        >
                          Imprimir etiquetas
                        </button>
                        {canDelete ? (
                          <button
                            type="button"
                            onClick={() =>
                              confirmDelete(
                                `Apagar o lote ${lot.numero}?`,
                                () => onDeleteLot(product.codigo, lot.numero),
                              )
                            }
                            className="text-xs font-medium text-red-700"
                          >
                            Apagar lote
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onReceive(product.codigo)}
                    className="mt-2 text-sm font-medium text-[#1f6b28]"
                  >
                    Receber lote
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function confirmDelete(message: string, action: () => void | Promise<void>) {
  if (!window.confirm(message)) return
  void Promise.resolve(action()).catch((caught: unknown) => {
    window.alert(
      caught instanceof Error ? caught.message : "Não foi possível apagar.",
    )
  })
}
