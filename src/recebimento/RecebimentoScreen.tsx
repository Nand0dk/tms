import { useState } from "react"
import { LabelSheet } from "./LabelSheet"
import { NewLotForm } from "./NewLotForm"
import { NewProductForm } from "./NewProductForm"
import { ProductList } from "./ProductList"
import type { LotDraft, Product, RecebimentoView } from "./types"

export function RecebimentoScreen({
  products,
  onAddProduct,
  onAddLot,
  onDeleteProduct,
  onDeleteLot,
  canDelete,
  onBack,
}: {
  products: Product[]
  onAddProduct: (product: Product) => void
  onAddLot: (codigo: string, draft: LotDraft) => void
  onDeleteProduct: (codigo: string) => void | Promise<void>
  onDeleteLot: (codigo: string, numero: string) => void | Promise<void>
  canDelete: boolean
  onBack: () => void
}) {
  const [view, setView] = useState<RecebimentoView>("lista")
  const [lotCode, setLotCode] = useState<string | null>(null)
  const [printLotNumero, setPrintLotNumero] = useState<string | null>(null)
  const lotProduct = products.find((product) => product.codigo === lotCode)
  const printLot = lotProduct?.lots.find(
    (lot) => lot.numero.toLowerCase() === printLotNumero?.toLowerCase(),
  )

  function openLabels(codigo: string, numero: string) {
    setLotCode(codigo)
    setPrintLotNumero(numero)
    setView("etiquetas")
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f4f6f3] text-neutral-900">
      {view === "novo" ? (
        <NewProductForm
          products={products}
          onBack={() => setView("lista")}
          onSave={async (product) => {
            await onAddProduct(product)
            setView("lista")
          }}
        />
      ) : view === "lote" && lotProduct ? (
        <NewLotForm
          product={lotProduct}
          onBack={() => setView("lista")}
          onSave={async (draft) => {
            await onAddLot(lotProduct.codigo, draft)
            openLabels(lotProduct.codigo, draft.numero)
          }}
        />
      ) : (
        <ProductList
          products={products}
          onBack={onBack}
          onAdd={() => setView("novo")}
          onReceive={(codigo) => {
            setLotCode(codigo)
            setView("lote")
          }}
          onPrint={openLabels}
          onDeleteProduct={onDeleteProduct}
          onDeleteLot={onDeleteLot}
          canDelete={canDelete}
        />
      )}
      {view === "etiquetas" && lotProduct && printLot ? (
        <LabelSheet
          product={lotProduct}
          lot={printLot}
          onBack={() => setView("lista")}
        />
      ) : null}
    </div>
  )
}
