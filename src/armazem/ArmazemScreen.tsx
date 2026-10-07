import { useMemo, useState, type FormEvent } from "react"
import { BackButton } from "../recebimento/BackButton"
import { Field } from "../recebimento/Field"
import {
  boxIdFromSearch,
  formatPositionNumber,
  parseBoxes,
  positionFromSearch,
} from "../recebimento/format"
import { ShelfReader } from "../recebimento/ShelfReader"
import type { Product, Warehouse } from "../recebimento/types"
import { PositionLabels } from "./PositionLabels"

export function ArmazemScreen({
  products,
  warehouses,
  onAdd,
  onAddShelf,
  onAddPositions,
  onSetPosition,
  onDeleteWarehouse,
  onDeleteShelf,
  onDeletePosition,
  canDelete,
  onBack,
}: {
  products: Product[]
  warehouses: Warehouse[]
  onAdd: (warehouse: Warehouse) => void
  onAddShelf: (armazemCodigo: string, prateleira: string, quantidade: number) => void
  onAddPositions: (armazemCodigo: string, prateleira: string, quantidade: number) => void
  onSetPosition: (boxId: string | string[], posicao: string, armazemCodigo?: string) => void
  onDeleteWarehouse: (codigo: string) => void | Promise<void>
  onDeleteShelf: (armazemCodigo: string, prateleira: string) => void | Promise<void>
  onDeletePosition: (armazemCodigo: string, codigo: string) => void | Promise<void>
  canDelete: boolean
  onBack: () => void
}) {
  const [creating, setCreating] = useState(false)
  const [registerCodigo, setRegisterCodigo] = useState<string | null>(null)
  const [shelfWarehouse, setShelfWarehouse] = useState<string | null>(null)
  const [more, setMore] = useState<{ warehouse: string; shelf: string } | null>(null)
  const [labels, setLabels] = useState<{
    warehouse: string
    shelf: string
    from?: number
  } | null>(null)
  const registering = warehouses.find(
    (warehouse) => warehouse.codigo === registerCodigo,
  )
  const shelving = warehouses.find((warehouse) => warehouse.codigo === shelfWarehouse)
  const adding = more
    ? warehouses.find((warehouse) => warehouse.codigo === more.warehouse)
    : undefined
  const addingShelf = adding?.prateleiras?.find(
    (shelf) => shelf.codigo === more?.shelf,
  )
  const labelWarehouse = labels
    ? warehouses.find((warehouse) => warehouse.codigo === labels.warehouse)
    : undefined
  const labelShelf = labelWarehouse?.prateleiras?.find(
    (shelf) => shelf.codigo === labels?.shelf,
  )
  const labelPositions =
    labelShelf?.posicoes.filter(
      (position) => labels?.from === undefined || position.numero >= labels.from,
    ) ?? []
  const labelSheet =
    labelWarehouse && labelShelf && labelPositions.length > 0 ? (
      <PositionLabels
        warehouse={labelWarehouse}
        prateleira={labelShelf.codigo}
        positions={labelPositions}
        onBack={() => setLabels(null)}
      />
    ) : null

  if (creating) {
    return (
      <NewWarehouseForm
        warehouses={warehouses}
        onBack={() => setCreating(false)}
        onSave={async (warehouse) => {
          await onAdd(warehouse)
          setCreating(false)
        }}
      />
    )
  }

  if (registering) {
    return (
      <RegisterBoxForm
        warehouse={registering}
        products={products}
        onBack={() => setRegisterCodigo(null)}
        onSave={(boxIds, posicao) => {
          onSetPosition(boxIds, posicao, registering.codigo)
        }}
      />
    )
  }

  if (shelving) {
    return (
      <>
        <NewShelfForm
          warehouse={shelving}
          onBack={() => setShelfWarehouse(null)}
        onSave={async (prateleira, quantidade) => {
          await onAddShelf(shelving.codigo, prateleira, quantidade)
          setShelfWarehouse(null)
          setLabels({ warehouse: shelving.codigo, shelf: prateleira })
        }}
        />
        {labelSheet}
      </>
    )
  }

  if (adding && addingShelf && more) {
    const start = addingShelf.posicoes.length + 1
    return (
      <>
        <AddPositionsForm
          warehouse={adding}
          prateleira={addingShelf.codigo}
          onBack={() => setMore(null)}
        onSave={async (quantidade) => {
          await onAddPositions(adding.codigo, addingShelf.codigo, quantidade)
          setMore(null)
          setLabels({
            warehouse: adding.codigo,
            shelf: addingShelf.codigo,
            from: start,
          })
        }}
        />
        {labelSheet}
      </>
    )
  }

  return (
    <>
      <WarehouseList
        products={products}
        warehouses={warehouses}
        onBack={onBack}
        onAdd={() => setCreating(true)}
        onRegister={setRegisterCodigo}
        onNewShelf={setShelfWarehouse}
        onAddPositions={(warehouse, shelf) => setMore({ warehouse, shelf })}
        onPrint={(warehouse, shelf) => setLabels({ warehouse, shelf })}
        onDeleteWarehouse={onDeleteWarehouse}
        onDeleteShelf={onDeleteShelf}
        onDeletePosition={onDeletePosition}
        canDelete={canDelete}
      />
      {labelSheet}
    </>
  )
}

function WarehouseList({
  products,
  warehouses,
  onBack,
  onAdd,
  onRegister,
  onNewShelf,
  onAddPositions,
  onPrint,
  onDeleteWarehouse,
  onDeleteShelf,
  onDeletePosition,
  canDelete,
}: {
  products: Product[]
  warehouses: Warehouse[]
  onBack: () => void
  onAdd: () => void
  onRegister: (codigo: string) => void
  onNewShelf: (codigo: string) => void
  onAddPositions: (armazemCodigo: string, prateleira: string) => void
  onPrint: (armazemCodigo: string, prateleira: string) => void
  onDeleteWarehouse: (codigo: string) => void | Promise<void>
  onDeleteShelf: (armazemCodigo: string, prateleira: string) => void | Promise<void>
  onDeletePosition: (armazemCodigo: string, codigo: string) => void | Promise<void>
  canDelete: boolean
}) {
  const [query, setQuery] = useState("")
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return warehouses
    return warehouses.filter(
      (warehouse) =>
        warehouse.nome.toLowerCase().includes(term) ||
        warehouse.codigo.toLowerCase().includes(term),
    )
  }, [warehouses, query])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-2 px-1 pt-4 pb-2">
        <BackButton onClick={onBack} label="Início" />
        <button
          type="button"
          onClick={onAdd}
          aria-label="Adicionar novo armazém"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1f6b28] text-2xl leading-none font-medium text-white shadow-md shadow-black/20"
        >
          +
        </button>
      </header>
      <div className="px-1">
        <h1 className="text-2xl font-semibold tracking-tight">Armazém</h1>
        <label htmlFor="pesquisar-armazem" className="sr-only">
          Pesquisar armazém
        </label>
        <input
          id="pesquisar-armazem"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nome ou código"
          className="mt-3 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-base outline-none placeholder:text-neutral-400 focus:border-[#2e7d32] focus:ring-2 focus:ring-[#2e7d32]/20 md:py-2 md:text-sm"
        />
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-1 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {warehouses.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-500">
            Nenhum armazém ainda.
          </p>
        ) : filtered.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-500">
            Nenhum armazém encontrado.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((warehouse) => (
              <li
                key={warehouse.codigo}
                className="rounded-xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-black/5"
              >
                <p className="text-sm font-semibold">{warehouse.nome}</p>
                <p className="mt-0.5 text-xs text-neutral-500">{warehouse.codigo}</p>
                <ShelfList
                  warehouse={warehouse}
                  onAddPositions={onAddPositions}
                  onPrint={onPrint}
                  onDeleteShelf={onDeleteShelf}
                  onDeletePosition={onDeletePosition}
                  canDelete={canDelete}
                />
                <WarehouseBoxes products={products} codigo={warehouse.codigo} />
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  <button
                    type="button"
                    onClick={() => onNewShelf(warehouse.codigo)}
                    className="text-sm font-medium text-[#1f6b28]"
                  >
                    Nova prateleira
                  </button>
                  <button
                    type="button"
                    onClick={() => onRegister(warehouse.codigo)}
                    className="text-sm font-medium text-[#1f6b28]"
                  >
                    Registrar caixa
                  </button>
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={() =>
                        confirmDelete(
                          `Apagar o armazém ${warehouse.codigo}?`,
                          () => onDeleteWarehouse(warehouse.codigo),
                        )
                      }
                      className="text-sm font-medium text-red-700"
                    >
                      Apagar armazém
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ShelfList({
  warehouse,
  onAddPositions,
  onPrint,
  onDeleteShelf,
  onDeletePosition,
  canDelete,
}: {
  warehouse: Warehouse
  onAddPositions: (armazemCodigo: string, prateleira: string) => void
  onPrint: (armazemCodigo: string, prateleira: string) => void
  onDeleteShelf: (armazemCodigo: string, prateleira: string) => void | Promise<void>
  onDeletePosition: (armazemCodigo: string, codigo: string) => void | Promise<void>
  canDelete: boolean
}) {
  const shelves = warehouse.prateleiras ?? []
  if (shelves.length === 0) return null

  return (
    <ul className="mt-2 flex flex-col gap-2 border-t border-neutral-100 pt-2">
      {shelves.map((shelf) => (
        <li key={shelf.codigo}>
          <p className="text-sm font-medium">Prateleira {shelf.codigo}</p>
          <ul className="mt-1 flex flex-wrap gap-1">
            {shelf.posicoes.map((position) => (
              <li
                key={position.codigo}
                className="flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700"
              >
                {formatPositionNumber(position.numero)}
                {canDelete ? (
                  <button
                    type="button"
                    onClick={() =>
                      confirmDelete(
                        `Apagar a posição ${position.codigo}?`,
                        () => onDeletePosition(warehouse.codigo, position.codigo),
                      )
                    }
                    className="font-medium text-red-700"
                  >
                    Apagar
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={() => onPrint(warehouse.codigo, shelf.codigo)}
              className="text-xs font-medium text-[#1f6b28]"
            >
              Imprimir etiquetas
            </button>
            <button
              type="button"
              onClick={() => onAddPositions(warehouse.codigo, shelf.codigo)}
              className="text-xs font-medium text-[#1f6b28]"
            >
              Adicionar posições
            </button>
            {canDelete ? (
              <button
                type="button"
                onClick={() =>
                  confirmDelete(
                    `Apagar a prateleira ${shelf.codigo}?`,
                    () => onDeleteShelf(warehouse.codigo, shelf.codigo),
                  )
                }
                className="text-xs font-medium text-red-700"
              >
                Apagar prateleira
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
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

function WarehouseBoxes({
  products,
  codigo,
}: {
  products: Product[]
  codigo: string
}) {
  const boxes = boxesInWarehouse(products, codigo)
  if (boxes.length === 0) {
    return (
      <p className="mt-2 text-xs text-neutral-500">Nenhuma caixa registrada.</p>
    )
  }

  return (
    <ul className="mt-2 flex flex-col gap-1 border-t border-neutral-100 pt-2">
      {boxes.map((box) => (
        <li key={box.id} className="text-xs text-neutral-700">
          {box.id} · {box.produto} · {box.posicao}
        </li>
      ))}
    </ul>
  )
}

function RegisterBoxForm({
  warehouse,
  products,
  onBack,
  onSave,
}: {
  warehouse: Warehouse
  products: Product[]
  onBack: () => void
  onSave: (boxIds: string[], posicao: string) => void | Promise<void>
}) {
  const [caixa, setCaixa] = useState("")
  const [posicao, setPosicao] = useState("")
  const [pending, setPending] = useState<{ id: string; produto: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  function addBox(code: string) {
    const found = findBox(products, resolveBoxId(code))
    if (!found) {
      setError("Caixa não encontrada. Receba o lote antes de registrar.")
      setSaved(null)
      return false
    }
    if (pending.some((item) => item.id.toLowerCase() === found.id.toLowerCase())) {
      setError("Esta caixa já está na lista.")
      setCaixa("")
      return false
    }
    const product = productOfBox(products, found.id)
    setPending((current) => [...current, { id: found.id, produto: product }])
    setCaixa("")
    setError(null)
    setSaved(null)
    return true
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const position = resolvePosition(posicao)
    const typed = resolveBoxId(caixa)
    const next = [...pending]
    if (typed) {
      const found = findBox(products, typed)
      if (!found) {
        setError("Caixa não encontrada. Receba o lote antes de registrar.")
        setSaved(null)
        return
      }
      if (!next.some((item) => item.id.toLowerCase() === found.id.toLowerCase())) {
        next.push({ id: found.id, produto: productOfBox(products, found.id) })
      }
    }
    if (!position && next.length === 0) {
      setError("Informe a posição e ao menos uma caixa.")
      setSaved(null)
      return
    }
    if (!position) {
      setError("Informe a posição.")
      setSaved(null)
      return
    }
    if (next.length === 0) {
      setError("Adicione ao menos uma caixa.")
      setSaved(null)
      return
    }
    try {
      await onSave(next.map((item) => item.id), position)
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
        ? `${next[0].id} registrada em ${position}.`
        : `${next.length} caixas registradas em ${position}.`,
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center px-1 pt-4 pb-2">
        <BackButton onClick={onBack} />
      </header>
      <form
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1 pb-[max(2rem,env(safe-area-inset-bottom))]"
        onSubmit={handleSubmit}
        noValidate
      >
        <h1 className="text-2xl font-semibold tracking-tight">Registrar caixas</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {warehouse.codigo} · {warehouse.nome}
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <Field
            id="caixa-armazem"
            label="Caixa"
            value={caixa}
            placeholder="CX-0001 ou o QR"
            onChange={(value) => {
              setCaixa(value)
              setError(null)
              setSaved(null)
            }}
          />
          <Field
            id="posicao-armazem"
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
              setPosicao(resolvePosition(code))
              setError(null)
            }}
          />
          <ShelfReader
            label="Ler códigos das caixas"
            continuous
            onRead={(code) => addBox(code)}
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
          {pending.length > 0 ? (
            <div>
              <p className="text-sm font-medium text-neutral-800">
                {pending.length === 1
                  ? "1 caixa nesta posição"
                  : `${pending.length} caixas nesta posição`}
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {pending.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 text-sm text-neutral-700"
                  >
                    <span>
                      {item.id} · {item.produto}
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
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {saved ? <p className="mt-3 text-sm text-[#1f6b28]">{saved}</p> : null}
        <BoxesAtPosition
          products={products}
          codigo={warehouse.codigo}
          posicao={posicao.trim()}
        />
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
            Registrar
          </button>
        </div>
      </form>
    </div>
  )
}

function BoxesAtPosition({
  products,
  codigo,
  posicao,
}: {
  products: Product[]
  codigo: string
  posicao: string
}) {
  if (!posicao) return null
  const boxes = boxesInWarehouse(products, codigo).filter(
    (box) => box.posicao.toLowerCase() === posicao.toLowerCase(),
  )
  if (boxes.length === 0) return null
  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-neutral-800">
        Caixas em {posicao}
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {boxes.map((box) => (
          <li key={box.id} className="text-sm text-neutral-700">
            {box.id} · {box.produto}
          </li>
        ))}
      </ul>
    </div>
  )
}

function boxesInWarehouse(products: Product[], codigo: string) {
  return products.flatMap((product) =>
    product.lots.flatMap((lot) =>
      lot.boxes
        .filter(
          (box) =>
            box.armazemCodigo?.toLowerCase() === codigo.toLowerCase() &&
            box.posicao,
        )
        .map((box) => ({
          id: box.id,
          produto: product.nome,
          posicao: box.posicao ?? "",
        })),
    ),
  )
}

function resolvePosition(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ""
  return positionFromSearch(trimmed)?.codigo ?? trimmed
}

function resolveBoxId(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ""
  return boxIdFromSearch(trimmed) ?? trimmed
}

function productOfBox(products: Product[], boxId: string) {
  const wanted = boxId.toLowerCase()
  for (const product of products) {
    for (const lot of product.lots) {
      if (lot.boxes.some((box) => box.id.toLowerCase() === wanted)) {
        return product.nome
      }
    }
  }
  return ""
}

function findBox(products: Product[], boxId: string) {
  const wanted = boxId.toLowerCase()
  for (const product of products) {
    for (const lot of product.lots) {
      const box = lot.boxes.find((item) => item.id.toLowerCase() === wanted)
      if (box) return box
    }
  }
  return null
}

function warehouseError(codigo: string, nome: string, warehouses: Warehouse[]) {
  const code = codigo.trim()
  const name = nome.trim()
  if (!code && !name) return "Informe o código e o nome."
  if (!code) return "Informe o código."
  if (!name) return "Informe o nome."
  const exists = warehouses.some(
    (warehouse) => warehouse.codigo.toLowerCase() === code.toLowerCase(),
  )
  if (exists) return "Este código já existe."
  return null
}

function NewWarehouseForm({
  warehouses,
  onBack,
  onSave,
}: {
  warehouses: Warehouse[]
  onBack: () => void
  onSave: (warehouse: Warehouse) => void | Promise<void>
}) {
  const [codigo, setCodigo] = useState("")
  const [nome, setNome] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = warehouseError(codigo, nome, warehouses)
    if (message) {
      setError(message)
      return
    }
    try {
      await onSave({ codigo: codigo.trim(), nome: nome.trim(), prateleiras: [] })
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
        <h1 className="text-2xl font-semibold tracking-tight">Novo armazém</h1>
        <div className="mt-4 flex flex-col gap-3">
          <Field
            id="codigo-armazem"
            label="Código"
            value={codigo}
            onChange={(value) => {
              setCodigo(value)
              setError(null)
            }}
          />
          <Field
            id="nome-armazem"
            label="Nome"
            value={nome}
            onChange={(value) => {
              setNome(value)
              setError(null)
            }}
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

function NewShelfForm({
  warehouse,
  onBack,
  onSave,
}: {
  warehouse: Warehouse
  onBack: () => void
  onSave: (prateleira: string, quantidade: number) => void | Promise<void>
}) {
  const [codigo, setCodigo] = useState("")
  const [quantidade, setQuantidade] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = shelfError(codigo, quantidade, warehouse)
    if (message) {
      setError(message)
      return
    }
    const count = parseBoxes(quantidade)
    if (count === null) return
    try {
      await onSave(codigo.trim(), count)
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
        <h1 className="text-2xl font-semibold tracking-tight">Nova prateleira</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {warehouse.codigo} · {warehouse.nome}
        </p>
        <p className="mt-2 text-sm text-neutral-600">
          Cada posição imprime o número e o QR.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <Field
            id="codigo-prateleira"
            label="Prateleira"
            value={codigo}
            placeholder="ex.: A"
            onChange={(value) => {
              setCodigo(value)
              setError(null)
            }}
          />
          <Field
            id="quantidade-posicoes"
            label="Posições"
            value={quantidade}
            placeholder="ex.: 5"
            inputMode="numeric"
            onChange={(value) => {
              setQuantidade(value)
              setError(null)
            }}
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

function AddPositionsForm({
  warehouse,
  prateleira,
  onBack,
  onSave,
}: {
  warehouse: Warehouse
  prateleira: string
  onBack: () => void
  onSave: (quantidade: number) => void | Promise<void>
}) {
  const [quantidade, setQuantidade] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const count = parseBoxes(quantidade)
    if (count === null) {
      setError("Informe a quantidade de posições.")
      return
    }
    try {
      await onSave(count)
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
        <h1 className="text-2xl font-semibold tracking-tight">Adicionar posições</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {warehouse.codigo} · Prateleira {prateleira}
        </p>
        <div className="mt-4">
          <Field
            id="mais-posicoes"
            label="Posições"
            value={quantidade}
            placeholder="ex.: 3"
            inputMode="numeric"
            onChange={(value) => {
              setQuantidade(value)
              setError(null)
            }}
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

function shelfError(codigo: string, quantidade: string, warehouse: Warehouse) {
  const code = codigo.trim()
  const count = parseBoxes(quantidade)
  if (!code && !quantidade.trim()) {
    return "Informe a prateleira e a quantidade de posições."
  }
  if (!code) return "Informe a prateleira."
  if (count === null) return "Informe a quantidade de posições."
  const exists = (warehouse.prateleiras ?? []).some(
    (shelf) => shelf.codigo.toLowerCase() === code.toLowerCase(),
  )
  if (exists) return "Esta prateleira já existe."
  return null
}
