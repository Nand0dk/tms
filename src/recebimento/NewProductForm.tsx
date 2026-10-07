import { useState, type FormEvent } from "react"
import { BackButton } from "./BackButton"
import { Field } from "./Field"
import { productError } from "./format"
import type { Product } from "./types"

export function NewProductForm({
  products,
  onBack,
  onSave,
}: {
  products: Product[]
  onBack: () => void
  onSave: (product: Product) => void | Promise<void>
}) {
  const [codigo, setCodigo] = useState("")
  const [nome, setNome] = useState("")
  const [unidade, setUnidade] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = productError(codigo, nome, products)
    if (message) {
      setError(message)
      return
    }
    try {
      await onSave({
        codigo: codigo.trim(),
        nome: nome.trim(),
        unidade: unidade.trim(),
        lots: [],
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
        <h1 className="text-2xl font-semibold tracking-tight">Novo produto</h1>

        <div className="mt-4 flex flex-col gap-3">
          <Field
            id="codigo"
            label="Código"
            value={codigo}
            onChange={(value) => {
              setCodigo(value)
              setError(null)
            }}
          />
          <Field
            id="nome"
            label="Nome"
            value={nome}
            onChange={(value) => {
              setNome(value)
              setError(null)
            }}
          />
          <Field
            id="unidade"
            label="Unidade"
            value={unidade}
            onChange={setUnidade}
            placeholder="ex.: un, cx, kg"
          />
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
