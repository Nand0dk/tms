import { useEffect, useState, type ReactNode } from "react"
import { company } from "../config"
import { Logo } from "./Logo"
import { ArmazemScreen } from "../armazem/ArmazemScreen"
import { ColetaScreen } from "../coleta/ColetaScreen"
import {
  loadData,
  removeLot,
  removePosition,
  removeProduct,
  removeShelf,
  removeWarehouse,
  saveCollection,
  saveLot,
  savePositions,
  saveProduct,
  saveShelf,
  saveShelfPositions,
  saveShipment,
  saveWarehouse,
  type AppData,
} from "../data/api"
import { ExpedicaoScreen } from "../expedicao/ExpedicaoScreen"
import { EstoqueScreen } from "../estoque/EstoqueScreen"
import { RecebimentoScreen } from "../recebimento/RecebimentoScreen"
import type { LotDraft, Product, Warehouse } from "../recebimento/types"
import type { AreaAccess } from "../data/api"
import { useSession } from "../session"
import { HistoricoScreen } from "../historico/HistoricoScreen"
import { UsuariosScreen } from "../usuarios/UsuariosScreen"

type Screen =
  | "home"
  | "recebimento"
  | "estoque"
  | "armazem"
  | "coleta"
  | "expedicao"
  | "usuarios"
  | "historico"

function RecebimentoIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8" aria-hidden="true">
      <path
        d="M8 18.5 24 10l16 8.5v15.2c0 1.2-.7 2.3-1.8 2.8L24 44 9.8 36.5A3.1 3.1 0 0 1 8 33.7V18.5Z"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M24 24v20M8.5 19 24 27.5 39.5 19"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M24 6v8M20 10l4 4 4-4"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function PhoneHome() {
  const { username, areas, logout } = useSession()
  const actor = username ?? ""
  const admin = actor.toLowerCase() === "adm01"
  const [screen, setScreen] = useState<Screen>("home")
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  function apply(data: AppData) {
    setProducts(data.products)
    setWarehouses(data.warehouses)
  }

  useEffect(() => {
    document.title = `${company.name} — ${company.subtitle}`
    let cancelled = false
    loadData()
      .then((data) => {
        if (cancelled) return
        apply(data)
        setReady(true)
      })
      .catch(() => {
        if (cancelled) return
        setLoadError("Não foi possível carregar o banco de dados.")
      })
    return () => {
      cancelled = true
    }
  }, [])

  function addProduct(product: Product) {
    return saveProduct(actor, product).then(apply)
  }

  function addLot(codigo: string, draft: LotDraft) {
    return saveLot(actor, codigo, draft).then(apply)
  }

  function addShelf(armazemCodigo: string, prateleira: string, quantidade: number) {
    return saveShelf(actor, armazemCodigo, prateleira, quantidade).then(apply)
  }

  function addShelfPositions(
    armazemCodigo: string,
    prateleira: string,
    quantidade: number,
  ) {
    return saveShelfPositions(actor, armazemCodigo, prateleira, quantidade).then(apply)
  }

  function setPosition(boxId: string | string[], posicao: string, armazemCodigo?: string) {
    const boxIds = Array.isArray(boxId) ? boxId : [boxId]
    return savePositions(actor, boxIds, posicao, armazemCodigo).then(apply)
  }

  function collectBoxes(boxIds: string[]) {
    return saveCollection(actor, boxIds).then(apply)
  }

  function shipBoxes(boxIds: string[]) {
    return saveShipment(actor, boxIds).then(apply)
  }

  function deleteProduct(codigo: string) {
    return removeProduct(actor, codigo).then(apply)
  }

  function deleteLot(codigo: string, numero: string) {
    return removeLot(actor, codigo, numero).then(apply)
  }

  function deleteWarehouse(codigo: string) {
    return removeWarehouse(actor, codigo).then(apply)
  }

  function deleteShelf(armazemCodigo: string, prateleira: string) {
    return removeShelf(actor, armazemCodigo, prateleira).then(apply)
  }

  function deletePosition(armazemCodigo: string, codigo: string) {
    return removePosition(actor, armazemCodigo, codigo).then(apply)
  }

  return (
    <div className="app-chrome flex min-h-dvh flex-col bg-[#f4f6f3] text-neutral-900">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
          <div className="flex min-w-0 items-center gap-2">
            <Logo className="h-9 w-auto shrink-0" decorative />
            <span className="truncate text-base font-semibold">{company.name}</span>
          </div>
          <button
            type="button"
            onClick={logout}
            className="shrink-0 rounded-full border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
          >
            Sair
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {!ready ? (
          <p className="px-1 pt-8 text-sm text-neutral-600">
            {loadError ?? "Carregando dados…"}
          </p>
        ) : !canOpen(areas, screen, admin) || screen === "home" ? (
          <HomeScreen
            username={username}
            areas={areas}
            admin={admin}
            onOpenRecebimento={() => setScreen("recebimento")}
            onOpenEstoque={() => setScreen("estoque")}
            onOpenArmazem={() => setScreen("armazem")}
            onOpenColeta={() => setScreen("coleta")}
            onOpenExpedicao={() => setScreen("expedicao")}
            onOpenUsuarios={() => setScreen("usuarios")}
            onOpenHistorico={() => setScreen("historico")}
          />
        ) : screen === "recebimento" ? (
          <RecebimentoScreen
            products={products}
            onAddProduct={addProduct}
            onAddLot={addLot}
            onDeleteProduct={deleteProduct}
            onDeleteLot={deleteLot}
            canDelete={admin}
            onBack={() => setScreen("home")}
          />
        ) : screen === "estoque" ? (
          <EstoqueScreen
            products={products}
            warehouses={warehouses}
            onSetPosition={setPosition}
            onBack={() => setScreen("home")}
          />
        ) : screen === "armazem" ? (
          <ArmazemScreen
            products={products}
            warehouses={warehouses}
            onAdd={(warehouse) => saveWarehouse(actor, warehouse).then(apply)}
            onAddShelf={addShelf}
            onAddPositions={addShelfPositions}
            onSetPosition={setPosition}
            onDeleteWarehouse={deleteWarehouse}
            onDeleteShelf={deleteShelf}
            onDeletePosition={deletePosition}
            canDelete={admin}
            onBack={() => setScreen("home")}
          />
        ) : screen === "coleta" ? (
          <ColetaScreen
            products={products}
            warehouses={warehouses}
            onCollect={collectBoxes}
            onBack={() => setScreen("home")}
          />
        ) : screen === "expedicao" ? (
          <ExpedicaoScreen
            products={products}
            onShip={shipBoxes}
            onBack={() => setScreen("home")}
          />
        ) : screen === "historico" ? (
          <HistoricoScreen actor={actor} onBack={() => setScreen("home")} />
        ) : (
          <UsuariosScreen actor={actor} onBack={() => setScreen("home")} />
        )}
      </div>
    </div>
  )
}

function HomeScreen({
  username,
  areas,
  onOpenRecebimento,
  onOpenEstoque,
  onOpenArmazem,
  onOpenColeta,
  onOpenExpedicao,
  onOpenUsuarios,
  onOpenHistorico,
  admin,
}: {
  username: string | null
  areas: AreaAccess | null
  admin: boolean
  onOpenRecebimento: () => void
  onOpenEstoque: () => void
  onOpenArmazem: () => void
  onOpenColeta: () => void
  onOpenExpedicao: () => void
  onOpenUsuarios: () => void
  onOpenHistorico: () => void
}) {
  const greeting = username ? `Olá, ${username}` : "Olá"
  const cards = [
    areas?.recebimento
      ? {
          title: "Recebimento",
          description: "Produtos, lotes e etiquetas",
          icon: <RecebimentoIcon />,
          onClick: onOpenRecebimento,
        }
      : null,
    areas?.estoque
      ? {
          title: "Estoque",
          description: "Saldo, caixas e posição",
          icon: <EstoqueIcon />,
          onClick: onOpenEstoque,
        }
      : null,
    areas?.armazem
      ? {
          title: "Armazém",
          description: "Cadastro e posição das caixas",
          icon: <ArmazemIcon />,
          onClick: onOpenArmazem,
        }
      : null,
    areas?.coleta
      ? {
          title: "Coleta",
          description: "Retirar caixas da posição",
          icon: <ColetaIcon />,
          onClick: onOpenColeta,
        }
      : null,
    areas?.expedicao
      ? {
          title: "Expedição",
          description: "Enviar caixas coletadas",
          icon: <ExpedicaoIcon />,
          onClick: onOpenExpedicao,
        }
      : null,
    areas?.usuarios
      ? {
          title: "Usuários",
          description: "Cadastrar quem acessa o sistema",
          icon: <UsuariosIcon />,
          onClick: onOpenUsuarios,
        }
      : null,
    admin
      ? {
          title: "Histórico",
          description: "Quem adicionou ou removeu",
          icon: <HistoricoIcon />,
          onClick: onOpenHistorico,
        }
      : null,
  ].filter((card) => card !== null)

  return (
    <div className="py-6">
      <p className="text-sm text-neutral-500">{greeting}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Início</h1>

      {cards.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-500">
          Nenhuma área liberada. Peça ao ADM01.
        </p>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <AreaCard
              key={card.title}
              title={card.title}
              description={card.description}
              icon={card.icon}
              onClick={card.onClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function canOpen(areas: AreaAccess | null, screen: Screen, admin: boolean) {
  if (screen === "home") return true
  if (screen === "historico") return admin
  if (!areas) return false
  return areas[screen]
}

function HistoricoIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8" aria-hidden="true">
      <path
        d="M10 12h28M10 24h28M10 36h18"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function AreaCard({
  title,
  description,
  icon,
  onClick,
}: {
  title: string
  description: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-2xl bg-white px-4 py-4 text-left shadow-sm ring-1 ring-black/5 hover:bg-neutral-50"
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6abf3a] to-[#1f6b28]">
        {icon}
      </span>
      <span>
        <span className="block text-base font-semibold">{title}</span>
        <span className="mt-0.5 block text-sm text-neutral-500">{description}</span>
      </span>
    </button>
  )
}

function UsuariosIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8" aria-hidden="true">
      <path
        d="M24 24a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
      />
      <path
        d="M10 40c1.8-6 6.4-9 14-9s12.2 3 14 9"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function EstoqueIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8" aria-hidden="true">
      <path
        d="M8 18h32M8 28h32M8 38h32M14 10v32M24 10v32M34 10v32"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ExpedicaoIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8" aria-hidden="true">
      <path
        d="M8 30h18M30 22l8 8-8 8"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 14h16v10H10V14Z"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ColetaIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8" aria-hidden="true">
      <path
        d="M10 16h20l8 8v16H10V16Z"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M10 24h28M24 24v16M18 12l6-4 6 4"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ArmazemIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8" aria-hidden="true">
      <path
        d="M6 20 24 8l18 12v20H6V20Z"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M20 40V26h8v14"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}
