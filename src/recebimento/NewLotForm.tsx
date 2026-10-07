import { useState, type FormEvent } from "react"
import { BackButton } from "./BackButton"
import { Field } from "./Field"
import { lotError, parseBoxes, parseQuantity } from "./format"
import type { LotDraft, Product } from "./types"

export function NewLotForm({
  product,
  onBack,
  onSave,
}: {
  product: Product
  onBack: () => void
  onSave: (draft: LotDraft) => void | Promise<void>
}) {
  const [numero, setNumero] = useState("")
  const [quantidade, setQuantidade] = useState("")
  const [caixas, setCaixas] = useState("")
  const [validade, setValidade] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = lotError(numero, quantidade, caixas, product)
    if (message) {
      setError(message)
      return
    }
    const amount = parseQuantity(quantidade)
    const boxCount = parseBoxes(caixas)
    if (amount === null || boxCount === null) return
    try {
      await onSave({
        numero: numero.trim(),
        quantidade: amount,
        validade: validade.trim(),
        caixas: boxCount,
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar.")
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center px-1 pt-4 pb-2">
        <BackButton onClick={onBack} />
      </header>

      <form
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-[max(2rem,env(safe-area-inset-bottom))]"
        onSubmit={handleSubmit}
        noValidate
      >
        <h1 className="text-2xl font-semibold tracking-tight">Novo lote</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {product.codigo} · {product.nome}
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <Field
            id="numero-lote"
            label="Número do lote"
            value={numero}
            onChange={(value) => {
              setNumero(value)
              setError(null)
            }}
          />
          <Field
            id="quantidade"
            label="Quantidade"
            value={quantidade}
            inputMode="decimal"
            onChange={(value) => {
              setQuantidade(value)
              setError(null)
            }}
          />
          <Field
            id="caixas"
            label="Caixas"
            value={caixas}
            inputMode="numeric"
            onChange={(value) => {
              setCaixas(value)
              setError(null)
            }}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="validade" className="text-sm font-medium text-neutral-800">
              Validade
            </label>
            <input
              id="validade"
              name="validade"
              type="date"
              value={validade}
              onChange={(event) => setValidade(event.target.value)}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-base outline-none focus:border-[#2e7d32] focus:ring-2 focus:ring-[#2e7d32]/20 md:py-2 md:text-sm"
            />
          </div>
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
            Cancelar
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
