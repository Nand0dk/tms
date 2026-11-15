import { useEffect, useMemo, useState, type ReactNode } from "react"
import { company } from "../config"
import { ArmazemScreen } from "../armazem/ArmazemScreen"
import { ColetaScreen } from "../coleta/ColetaScreen"
import {
  loadData,
  loadHistory,
  loadMyRoutes,
  loadPositionNotes,
  lookupNotaFiscal,
  removeLot,
  removePosition,
  removeProduct,
  removeShelf,
  removeWarehouse,
  saveAllocation,
  saveCollection,
  saveLot,
  savePositions,
  saveProduct,
  saveReallocation,
  saveReturn,
  saveShelf,
  saveShelfPositions,
  saveShipment,
  saveWarehouse,
  shipPosition,
  type AppData,
  type HistoryEvent,
  type NotaFiscalLookup,
  type PositionNote,
  type RouteInfo,
} from "../data/api"
import { positionFromSearch } from "../recebimento/format"
import { ShelfReader } from "../recebimento/ShelfReader"
import { ExpedicaoScreen, NotaFiscalHistorico } from "../expedicao/ExpedicaoScreen"
import { formatPrazo, prazoEfetivo } from "../expedicao/rotas"
import { EstoqueScreen } from "../estoque/EstoqueScreen"
import { RecebimentoScreen } from "../recebimento/RecebimentoScreen"
import type { LotDraft, Product, Warehouse } from "../recebimento/types"
import type { AreaAccess } from "../data/api"
import { useSession } from "../session"
import { HistoricoScreen } from "../historico/HistoricoScreen"
import { BackButton } from "../recebimento/BackButton"
import { Logo } from "./Logo"
import { UsuariosScreen } from "../usuarios/UsuariosScreen"

type Screen =
  | "home"
  | "recebimento"
  | "estoque"
  | "armazem"
  | "coleta"
  | "expedicao"
  | "rota"
  | "usuarios"
  | "historico"

type Tab = "inicio" | "resumo" | "notificacoes" | "mais"

function RecebimentoIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8 lg:h-9 lg:w-9" aria-hidden="true">
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
  const [tab, setTab] = useState<Tab>("inicio")
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const lateNotas = useMemo(() => lateInvoiceAlerts(products), [products])

  function goHome() {
    setScreen("home")
    setTab("inicio")
  }

  function openArea(next: Screen) {
    setScreen(next)
    setTab("inicio")
  }

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

  function allocateBoxes(
    notaFiscal: string,
    quantidade: number,
    posicao: string,
    armazemCodigo?: string,
    cidade?: string,
  ) {
    return saveAllocation(
      actor,
      notaFiscal,
      quantidade,
      posicao,
      armazemCodigo,
      cidade,
    ).then(apply)
  }

  function reallocateBoxes(
    notaFiscal: string,
    posicao: string,
    armazemCodigo?: string,
  ) {
    return saveReallocation(actor, notaFiscal, posicao, armazemCodigo).then(apply)
  }

  function shipBoxes(
    boxIds: string[],
    notaFiscal: string,
    quantidade: number,
    posicao?: string,
  ) {
    return saveShipment(actor, boxIds, notaFiscal, quantidade, posicao).then(apply)
  }

  function returnBoxes(notaFiscal: string, cidade?: string, observacao?: string) {
    return saveReturn(actor, notaFiscal, cidade, observacao).then(apply)
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

  const inArea = ready && canOpen(areas, screen, admin) && screen !== "home"
  const showChromeHome = ready && (!inArea || tab !== "inicio")

  return (
    <div className="app-chrome flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden bg-[var(--vps-surface)] text-[var(--vps-ink)]">
      {showChromeHome && (tab === "inicio" || tab === "resumo" || tab === "notificacoes" || tab === "mais") ? (
        <header className="app-header-curve shrink-0 bg-gradient-to-b from-[var(--vps-ink)] via-[var(--vps-ink-soft)] to-[#1a2920] text-white shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
          <div className="mx-auto grid w-full max-w-[1920px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-4 pt-[max(0.95rem,env(safe-area-inset-top))] pb-5 sm:gap-3 sm:px-6 lg:px-10">
            {tab === "resumo" ? (
              <>
                <div className="justify-self-start">
                  <button
                    type="button"
                    onClick={() => setTab("mais")}
                    className="rounded-full bg-white/5 p-2 text-white/90 ring-1 ring-white/10 hover:bg-white/10"
                    aria-label="Menu"
                  >
                    <MenuGlyph />
                  </button>
                </div>
                <Logo className="h-6 w-auto max-w-[5.75rem] sm:h-7 sm:max-w-[6.5rem]" decorative />
                <div className="justify-self-end">
                  <button
                    type="button"
                    onClick={() => setTab("notificacoes")}
                    className="relative rounded-full bg-white/5 p-2 text-white/90 ring-1 ring-white/10 hover:bg-white/10"
                    aria-label="Notificações"
                  >
                    <BellGlyph />
                    {lateNotas.length > 0 ? (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[9px] font-bold leading-none">
                        {lateNotas.length > 9 ? "9+" : lateNotas.length}
                      </span>
                    ) : null}
                  </button>
                </div>
              </>
            ) : tab === "inicio" ? (
              <>
                <div className="min-w-0 justify-self-start">
                  <p className="truncate text-sm font-medium text-white/65">
                    {username ? `Olá, ${username}` : "Olá"}
                  </p>
                  <h1 className="mt-0.5 truncate text-[1.75rem] font-bold tracking-tight sm:text-3xl">
                    Início
                  </h1>
                </div>
                <span aria-hidden="true" />
                <div className="justify-self-end">
                  <button
                    type="button"
                    onClick={() => setTab("mais")}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--vps-green)] to-[var(--vps-green-deep)] text-white shadow-[0_10px_24px_rgba(31,143,58,0.45)] ring-2 ring-white/15"
                    aria-label="Conta"
                  >
                    <UserAvatarGlyph />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="min-w-0 justify-self-start">
                  <p className="truncate text-sm font-medium text-white/65">{company.name}</p>
                  <h1 className="mt-0.5 truncate text-xl font-bold tracking-tight sm:text-2xl">
                    {tab === "notificacoes" ? "Notificações" : "Mais"}
                  </h1>
                </div>
                <span aria-hidden="true" />
                <div className="justify-self-end">
                  <Logo className="h-6 w-auto max-w-[5.5rem] opacity-95 sm:h-7 sm:max-w-[6.25rem]" decorative />
                </div>
              </>
            )}
          </div>
        </header>
      ) : null}

      <div className="mx-auto flex w-full min-w-0 max-w-[1920px] min-h-0 flex-1 flex-col overflow-hidden px-3 sm:px-5 lg:px-8 xl:px-10 [&>*]:min-h-0">
        {!ready ? (
          <p className="px-1 pt-8 text-sm text-neutral-600">
            {loadError ?? "Carregando dados…"}
          </p>
        ) : tab === "resumo" ? (
          <ResumoScreen
            products={products}
            actor={actor}
            onOpenHistorico={() => openArea("historico")}
          />
        ) : tab === "notificacoes" ? (
          <NotificacoesScreen notes={lateNotas} />
        ) : tab === "mais" ? (
          <MaisScreen
            username={username}
            admin={admin}
            areas={areas}
            onLogout={logout}
            onOpenUsuarios={() => openArea("usuarios")}
            onOpenHistorico={() => openArea("historico")}
            onOpenRecebimento={() => openArea("recebimento")}
            onOpenColeta={() => openArea("coleta")}
          />
        ) : !canOpen(areas, screen, admin) || screen === "home" ? (
          <HomeScreen
            areas={areas}
            admin={admin}
            onOpenRecebimento={() => openArea("recebimento")}
            onOpenEstoque={() => openArea("estoque")}
            onOpenArmazem={() => openArea("armazem")}
            onOpenColeta={() => openArea("coleta")}
            onOpenExpedicao={() => openArea("expedicao")}
            onOpenRota={() => openArea("rota")}
            onOpenUsuarios={() => openArea("usuarios")}
            onOpenHistorico={() => openArea("historico")}
          />
        ) : screen === "rota" ? (
          <MinhaRotaScreen
            actor={actor}
            onBack={goHome}
            onShipped={apply}
          />
        ) : screen === "recebimento" ? (
          <RecebimentoScreen
            products={products}
            onAddProduct={addProduct}
            onAddLot={addLot}
            onDeleteProduct={deleteProduct}
            onDeleteLot={deleteLot}
            canDelete={admin}
            onBack={goHome}
          />
        ) : screen === "estoque" ? (
          <EstoqueScreen
            products={products}
            warehouses={warehouses}
            onSetPosition={setPosition}
            onBack={goHome}
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
            onBack={goHome}
          />
        ) : screen === "coleta" ? (
          <ColetaScreen
            products={products}
            warehouses={warehouses}
            onCollect={collectBoxes}
            onBack={goHome}
          />
        ) : screen === "expedicao" ? (
          <ExpedicaoScreen
            products={products}
            actor={actor}
            onAllocate={allocateBoxes}
            onReallocate={reallocateBoxes}
            onShip={shipBoxes}
            onReturn={returnBoxes}
            onBack={goHome}
          />
        ) : screen === "historico" ? (
          <HistoricoScreen actor={actor} onBack={goHome} />
        ) : (
          <UsuariosScreen actor={actor} onBack={goHome} />
        )}
      </div>

      {ready ? (
        <BottomNav
          tab={inArea && tab === "inicio" ? "inicio" : tab}
          alertCount={lateNotas.length}
          onChange={(next) => {
            setTab(next)
            if (next === "inicio") setScreen("home")
          }}
        />
      ) : null}
    </div>
  )
}

function HomeScreen({
  areas,
  onOpenRecebimento,
  onOpenEstoque,
  onOpenArmazem,
  onOpenColeta,
  onOpenExpedicao,
  onOpenRota,
  onOpenUsuarios,
  onOpenHistorico,
  admin,
}: {
  areas: AreaAccess | null
  admin: boolean
  onOpenRecebimento: () => void
  onOpenEstoque: () => void
  onOpenArmazem: () => void
  onOpenColeta: () => void
  onOpenExpedicao: () => void
  onOpenRota: () => void
  onOpenUsuarios: () => void
  onOpenHistorico: () => void
}) {
  const cards = [
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
    areas?.expedicao
      ? {
          title: "Expedição",
          description: "Enviar caixas coletadas",
          icon: <ExpedicaoIcon />,
          onClick: onOpenExpedicao,
        }
      : null,
    areas?.rota
      ? {
          title: "Rota",
          description: "Sua rota confirmada",
          icon: <RotaIcon />,
          onClick: onOpenRota,
        }
      : null,
    areas?.recebimento
      ? {
          title: "Recebimento",
          description: "Produtos, lotes e etiquetas",
          icon: <RecebimentoIcon />,
          onClick: onOpenRecebimento,
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
    <div className="min-h-0 flex-1 overflow-y-auto py-4 pb-28 sm:py-5">
      <div className="promo-banner relative z-0 flex min-h-[7.5rem] items-center gap-3 overflow-hidden px-5 py-5 sm:min-h-[8.5rem] sm:gap-4 sm:px-6">
        <div className="relative z-10 min-w-0 flex-1 pr-1">
          <p className="text-lg font-bold leading-snug tracking-tight sm:text-xl">
            Sua operação sempre em movimento!
          </p>
          <p className="mt-1.5 text-xs text-white/80 sm:text-sm">
            Estoque, armazém e expedição no ritmo da VPS.
          </p>
        </div>
        <TruckArt className="relative z-10 h-16 w-24 shrink-0 text-white/95 sm:h-20 sm:w-28" />
      </div>

      {cards.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-500">
          Nenhuma área liberada. Peça ao ADM01.
        </p>
      ) : (
        <div className="sheet-vps mt-4 divide-y divide-neutral-100 sm:mt-5">
          {cards.map((card) => (
            <AreaCard
              key={card.title}
              title={card.title}
              description={card.description}
              icon={card.icon}
              onClick={card.onClick}
              flat
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

function MinhaRotaScreen({
  actor,
  onBack,
  onShipped,
}: {
  actor: string
  onBack: () => void
  onShipped: (data: AppData) => void
}) {
  const [rotas, setRotas] = useState<RouteInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<RouteInfo | null>(null)
  const [step, setStep] = useState<"list" | "detail" | "scan" | "confirm">("list")
  const [posicao, setPosicao] = useState("")
  const [armazemCodigo, setArmazemCodigo] = useState<string | undefined>()
  const [notas, setNotas] = useState<PositionNote[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    if (!actor) {
      setRotas([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    loadMyRoutes(actor)
      .then((data) => {
        if (!cancelled) setRotas(data.rotas)
      })
      .catch(() => {
        if (!cancelled) setRotas([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [actor])

  function openRota(rota: RouteInfo) {
    setSelected(rota)
    setStep("detail")
    setPosicao("")
    setArmazemCodigo(undefined)
    setNotas([])
    setError(null)
    setSaved(null)
  }

  function backFromFlow() {
    if (step === "confirm" && !saved) {
      setStep("scan")
      setNotas([])
      setError(null)
      return
    }
    if (step === "scan" || step === "confirm") {
      setStep("detail")
      setPosicao("")
      setArmazemCodigo(undefined)
      setNotas([])
      setError(null)
      setSaved(null)
      return
    }
    if (step === "detail") {
      setSelected(null)
      setStep("list")
      setError(null)
      setSaved(null)
      return
    }
    onBack()
  }

  async function handlePositionRead(code: string) {
    const parsed = positionFromSearch(code.trim())
    const position = parsed?.codigo || code.trim()
    if (!position) {
      setError("Posição inválida. Leia o QR da prateleira/posição.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const data = await loadPositionNotes(position, parsed?.armazem)
      setPosicao(data.posicao)
      setArmazemCodigo(data.armazemCodigo || parsed?.armazem || undefined)
      setNotas(data.notas)
      if (data.notas.length === 0) {
        setError("Nenhuma nota fiscal pendente nesta posição.")
        setStep("scan")
      } else {
        setStep("confirm")
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível carregar as notas desta posição.",
      )
    }
    setBusy(false)
  }

  async function confirmShip() {
    if (!posicao) {
      setError("Posição não definida.")
      return
    }
    if (notas.length === 0) {
      setError("Nenhuma nota fiscal para enviar.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const state = await shipPosition(actor, posicao, armazemCodigo)
      onShipped(state)
      const total = notas.reduce((sum, nota) => sum + nota.quantidade, 0)
      setSaved(
        notas.length === 1
          ? `1 nota enviada (${total} ${total === 1 ? "caixa" : "caixas"}) da posição ${posicao}.`
          : `${notas.length} notas enviadas (${total} caixas) da posição ${posicao}.`,
      )
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível confirmar o envio.",
      )
    }
    setBusy(false)
  }

  if (step === "scan" && selected) {
    return (
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
        <header className="flex items-center px-1 pt-4 pb-2">
          <BackButton onClick={backFromFlow} />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <h1 className="screen-title">Iniciar a rota</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Leia o QR code da posição para listar as notas fiscais.
          </p>
          <p className="mt-2 text-sm font-medium text-neutral-800">
            {selected.titulo}
          </p>
          <div className="mt-4">
            <ShelfReader
              label="Ler QR da posição"
              onRead={(code) => {
                void handlePositionRead(code)
              }}
            />
          </div>
          {busy ? (
            <p className="mt-3 text-sm text-neutral-500">Buscando notas…</p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  if (step === "confirm" && selected) {
    return (
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
        <header className="flex items-center px-1 pt-4 pb-2">
          <BackButton onClick={saved ? () => {
            setStep("detail")
            setPosicao("")
            setArmazemCodigo(undefined)
            setNotas([])
            setError(null)
            setSaved(null)
          } : backFromFlow} />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <h1 className="screen-title">Notas na posição</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Posição <span className="font-semibold text-neutral-800">{posicao}</span>
            {armazemCodigo ? ` · armazém ${armazemCodigo}` : ""}. Confirme o envio.
          </p>
          {notas.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-500">
              Nenhuma nota fiscal nesta posição.
            </p>
          ) : (
            <ul className="sheet-vps mt-4 divide-y divide-neutral-100">
              {notas.map((nota) => (
                <li key={nota.notaFiscal} className="px-4 py-3.5">
                  <p className="text-base font-semibold text-neutral-900">
                    NF {nota.notaFiscal}
                  </p>
                  <p className="mt-1 text-sm text-neutral-700">
                    {nota.quantidade}{" "}
                    {nota.quantidade === 1 ? "caixa" : "caixas"}
                    {nota.cidade ? ` · ${nota.cidade}` : ""}
                    {nota.prazo ? ` · prazo ${formatPrazo(nota.prazo)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {error ? (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {saved ? (
            <p className="mt-3 text-sm text-[#1f6b28]">{saved}</p>
          ) : null}
          <div className="mt-5">
            <button
              type="button"
              disabled={busy || Boolean(saved) || notas.length === 0}
              onClick={() => void confirmShip()}
              className="w-full rounded-xl bg-[#1f6b28] px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saved ? "Enviado" : busy ? "Confirmando…" : "Confirmar"}
            </button>
          </div>
          {saved ? (
            <button
              type="button"
              onClick={() => {
                setStep("scan")
                setPosicao("")
                setArmazemCodigo(undefined)
                setNotas([])
                setError(null)
                setSaved(null)
              }}
              className="mt-3 w-full rounded-xl border border-[#1f6b28] px-3 py-2.5 text-sm font-medium text-[#1f6b28]"
            >
              Ler outra posição
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  if (step === "detail" && selected) {
    return (
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
        <header className="flex items-center px-1 pt-4 pb-2">
          <BackButton onClick={backFromFlow} />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <h1 className="screen-title">{selected.titulo}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {selected.cidades.length > 0
              ? `${selected.cidades.length} ${selected.cidades.length === 1 ? "cidade" : "cidades"}`
              : "Sem cidades"}
          </p>
          <div className="mt-4 rounded-2xl bg-white px-4 py-3.5 shadow-sm ring-1 ring-black/5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-neutral-500">Status</p>
              <span className="rounded-full bg-[#1f6b28] px-2 py-0.5 text-[11px] font-medium text-white">
                Confirmada
              </span>
            </div>
            <p className="mt-3 text-sm text-neutral-500">Cidades</p>
            <p className="mt-0.5 text-sm font-semibold text-neutral-900">
              {selected.cidades.length > 0
                ? selected.cidades.join(" · ")
                : "Sem cidades"}
            </p>
          </div>
          <div className="mt-5">
            <button
              type="button"
              onClick={() => {
                setStep("scan")
                setPosicao("")
                setArmazemCodigo(undefined)
                setNotas([])
                setError(null)
                setSaved(null)
              }}
              className="w-full rounded-xl bg-[#1f6b28] px-3 py-2.5 text-sm font-semibold text-white"
            >
              Iniciar a rota
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <header className="flex items-center px-1 pt-4 pb-2">
        <BackButton onClick={onBack} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h1 className="screen-title">Rota</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Rotas confirmadas para este motorista. Toque para iniciar.
        </p>
        {loading ? (
          <p className="mt-6 text-sm text-neutral-500">Carregando…</p>
        ) : rotas.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-500">
            Nenhuma rota atribuída.
          </p>
        ) : (
          <ul className="sheet-vps mt-4 divide-y divide-neutral-100">
            {rotas.map((rota) => (
              <li key={rota.id}>
                <button
                  type="button"
                  onClick={() => openRota(rota)}
                  className="flex w-full flex-col px-4 py-3.5 text-left transition hover:bg-neutral-50"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-base font-semibold text-neutral-900">
                      {rota.titulo}
                    </span>
                    <span className="rounded-full bg-[#1f6b28] px-2 py-0.5 text-[11px] font-medium text-white">
                      Confirmada
                    </span>
                  </span>
                  <span className="mt-2 text-sm text-neutral-700">
                    {rota.cidades.length > 0
                      ? rota.cidades.join(" · ")
                      : "Sem cidades"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function HistoricoIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8 lg:h-9 lg:w-9" aria-hidden="true">
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
  flat = false,
}: {
  title: string
  description: string
  icon: ReactNode
  onClick: () => void
  flat?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full min-w-0 items-center gap-3.5 px-4 py-4 text-left transition hover:bg-neutral-50 sm:gap-4 sm:px-5 sm:py-[1.15rem] ${
        flat ? "bg-transparent shadow-none" : "card-vps"
      }`}
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--vps-green)] to-[var(--vps-green-deep)] shadow-[0_8px_18px_rgba(31,143,58,0.28)] sm:h-14 sm:w-14">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[1.05rem] font-bold tracking-tight text-neutral-900">
          {title}
        </span>
        <span className="mt-0.5 block text-sm leading-snug text-neutral-500">
          {description}
        </span>
      </span>
      <ChevronGlyph />
    </button>
  )
}

function BottomNav({
  tab,
  alertCount,
  onChange,
}: {
  tab: Tab
  alertCount: number
  onChange: (tab: Tab) => void
}) {
  const items: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: "inicio", label: "Início", icon: <HomeNavGlyph /> },
    { id: "resumo", label: "Resumo", icon: <ChartNavGlyph /> },
    { id: "notificacoes", label: "Notificações", icon: <BellGlyph /> },
    { id: "mais", label: "Mais", icon: <MoreNavGlyph /> },
  ]
  return (
    <nav className="no-print relative z-30 shrink-0 border-t border-black/5 bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.06)]">
      <div className="mx-auto grid w-full max-w-[1920px] grid-cols-4 gap-1 px-2 pt-2.5 pb-[max(0.7rem,env(safe-area-inset-bottom))]">
        {items.map((item) => {
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={`relative flex flex-col items-center gap-1 rounded-2xl px-1 py-1.5 text-[11px] font-semibold transition ${
                active ? "text-[var(--vps-green-mid)]" : "text-neutral-400"
              }`}
            >
              <span
                className={`relative flex h-9 w-9 items-center justify-center rounded-xl ${
                  active ? "bg-green-50" : ""
                }`}
              >
                {item.icon}
                {item.id === "notificacoes" && alertCount > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[9px] font-bold text-white">
                    {alertCount > 9 ? "9+" : alertCount}
                  </span>
                ) : null}
              </span>
              {item.label}
              {active ? <span className="nav-active-dot" /> : <span className="h-1" />}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function ResumoScreen({
  products,
  actor,
  onOpenHistorico,
}: {
  products: Product[]
  actor: string
  onOpenHistorico: () => void
}) {
  const stats = useMemo(() => operationStats(products), [products])
  const [events, setEvents] = useState<HistoryEvent[]>([])

  useEffect(() => {
    let cancelled = false
    loadHistory(actor)
      .then((data) => {
        if (!cancelled) setEvents(data.events.slice(0, 6))
      })
      .catch(() => {
        if (!cancelled) setEvents([])
      })
    return () => {
      cancelled = true
    }
  }, [actor])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-4 pb-28">
      <h2 className="text-[1.35rem] font-bold tracking-tight sm:text-2xl">
        Resumo da Operação
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        Acompanhe os principais indicadores
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2.5 sm:gap-3">
        <KpiTile
          value={formatCompact(stats.estoque)}
          label="Caixas em Estoque"
          icon={<BoxMini />}
        />
        <KpiTile value={stats.coletas} label="Coletas Hoje" icon={<TruckMini />} />
        <KpiTile value={`${stats.ok}%`} label="Expedições OK" icon={<CheckMini />} />
      </div>

      <div className="mt-6 flex items-center justify-between gap-2">
        <h3 className="text-base font-bold tracking-tight">Atividades Recentes</h3>
        <button
          type="button"
          onClick={onOpenHistorico}
          className="text-sm font-semibold text-[var(--vps-green-mid)]"
        >
          Ver todas →
        </button>
      </div>
      {events.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-6 text-center text-sm text-neutral-500">
          Nenhuma atividade recente.
        </p>
      ) : (
        <ul className="sheet-vps mt-3 divide-y divide-neutral-100">
          {events.map((event) => (
            <li
              key={`${event.criadoEm}-${event.texto}`}
              className="flex items-start gap-3 px-4 py-3.5"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-50 text-[var(--vps-green-mid)]">
                <ActivityIcon texto={event.texto} />
              </span>
              <span className="min-w-0">
                <p className="text-xs font-semibold text-neutral-400">
                  {formatClock(event.criadoEm)}
                </p>
                <p className="mt-0.5 text-sm font-medium leading-snug text-neutral-800">
                  {event.texto}
                </p>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="promo-banner-dark relative z-0 mt-5 flex items-center gap-3 overflow-hidden px-5 py-5">
        <p className="relative z-10 min-w-0 flex-1 pr-1 text-sm font-bold leading-snug sm:text-base">
          Juntos por uma logística ainda mais eficiente!
        </p>
        <TruckArt className="relative z-10 h-12 w-20 shrink-0 text-[var(--vps-green)] sm:h-14 sm:w-24" />
      </div>
    </div>
  )
}

function NotificacoesScreen({
  notes,
}: {
  notes: { notaFiscal: string; cidade: string; prazo: string; volumes: number }[]
  onOpenExpedicao?: () => void
}) {
  const [detail, setDetail] = useState<NotaFiscalLookup | null>(null)
  const [loadingNf, setLoadingNf] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function openNota(notaFiscal: string) {
    setLoadingNf(notaFiscal)
    setError(null)
    try {
      setDetail(await lookupNotaFiscal(notaFiscal))
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível abrir a nota fiscal.",
      )
    }
    setLoadingNf(null)
  }

  if (detail) {
    return (
      <NotaFiscalHistorico data={detail} onBack={() => setDetail(null)} />
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-4 pb-28">
      <p className="text-sm text-neutral-500">
        Toque numa NF atrasada para ver as informações da nota.
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notes.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-500">
          Nenhuma notificação no momento.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {notes.map((nota) => (
            <li key={nota.notaFiscal}>
              <button
                type="button"
                disabled={loadingNf === nota.notaFiscal}
                onClick={() => void openNota(nota.notaFiscal)}
                className="card-vps flex w-full flex-col items-start gap-1 px-3.5 py-3 text-left disabled:opacity-60"
              >
                <span className="text-sm font-semibold text-[#c2410c]">
                  NF {nota.notaFiscal} atrasada
                </span>
                <span className="text-xs text-neutral-600">
                  {nota.cidade} · prazo {formatPrazo(nota.prazo)} · {nota.volumes}{" "}
                  {nota.volumes === 1 ? "volume" : "volumes"}
                  {loadingNf === nota.notaFiscal ? " · abrindo…" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function MaisScreen({
  username,
  admin,
  areas,
  onLogout,
  onOpenUsuarios,
  onOpenHistorico,
  onOpenRecebimento,
  onOpenColeta,
}: {
  username: string | null
  admin: boolean
  areas: AreaAccess | null
  onLogout: () => void
  onOpenUsuarios: () => void
  onOpenHistorico: () => void
  onOpenRecebimento: () => void
  onOpenColeta: () => void
}) {
  const [minhasRotas, setMinhasRotas] = useState<RouteInfo[]>([])
  const [rotasLoading, setRotasLoading] = useState(Boolean(username))

  useEffect(() => {
    if (!username || !areas?.rota) {
      setMinhasRotas([])
      setRotasLoading(false)
      return
    }
    let cancelled = false
    setRotasLoading(true)
    loadMyRoutes(username)
      .then((data) => {
        if (!cancelled) setMinhasRotas(data.rotas)
      })
      .catch(() => {
        if (!cancelled) setMinhasRotas([])
      })
      .finally(() => {
        if (!cancelled) setRotasLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [username, areas?.rota])

  const extras = [
    areas?.recebimento
      ? {
          title: "Recebimento",
          description: "Produtos, lotes e etiquetas",
          icon: <RecebimentoIcon />,
          onClick: onOpenRecebimento,
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
  ].filter((item) => item !== null)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-4 pb-28">
      <p className="text-sm text-neutral-500">
        Conta {username ? `· ${username}` : ""} · {company.name}
      </p>

      {areas?.rota ? (
        <section className="sheet-vps mt-4 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-900">Minhas rotas</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Rotas confirmadas para este motorista.
          </p>
          {rotasLoading ? (
            <p className="mt-3 text-sm text-neutral-500">Carregando…</p>
          ) : minhasRotas.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">
              Nenhuma rota confirmada ainda.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {minhasRotas.map((rota) => (
                <li
                  key={rota.id}
                  className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-neutral-900">{rota.titulo}</p>
                    <span className="text-[11px] font-medium text-[#1f6b28]">Confirmada</span>
                  </div>
                  <p className="mt-1.5 text-sm text-neutral-700">
                    {rota.cidades.length > 0
                      ? rota.cidades.join(" · ")
                      : "Sem cidades"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {extras.length > 0 ? (
        <div className="sheet-vps mt-4 divide-y divide-neutral-100">
          {extras.map((item) => (
            <AreaCard
              key={item.title}
              title={item.title}
              description={item.description}
              icon={item.icon}
              onClick={item.onClick}
              flat
            />
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={onLogout}
        className="mt-4 w-full rounded-2xl border border-red-200 bg-white px-4 py-3.5 text-sm font-bold text-red-700 shadow-sm"
      >
        Sair da conta
      </button>
    </div>
  )
}

function KpiTile({
  value,
  label,
  icon,
}: {
  value: string | number
  label: string
  icon: ReactNode
}) {
  return (
    <div className="card-vps flex min-h-[7.25rem] flex-col justify-between gap-2 px-3 py-3.5 sm:px-3.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-50 text-[var(--vps-green-mid)]">
        {icon}
      </span>
      <div>
        <p className="text-xl font-bold tabular-nums tracking-tight sm:text-2xl">{value}</p>
        <p className="mt-1 text-[10px] leading-tight text-neutral-500 sm:text-xs">{label}</p>
      </div>
    </div>
  )
}

function formatCompact(value: number) {
  return value.toLocaleString("pt-BR")
}

function ActivityIcon({ texto }: { texto: string }) {
  const lower = texto.toLowerCase()
  if (lower.includes("posição") || lower.includes("posicao") || lower.includes("armazém") || lower.includes("armazem")) {
    return <PinMini />
  }
  if (lower.includes("entrada") || lower.includes("recebeu") || lower.includes("alocou")) {
    return <PlusMini />
  }
  return <CheckMini />
}

function lateInvoiceAlerts(products: Product[]) {
  const today = localIsoDay()
  const groups = new Map<
    string,
    { notaFiscal: string; cidade: string; prazo: string; volumes: number }
  >()
  for (const product of products) {
    for (const lot of product.lots) {
      for (const box of lot.boxes) {
        if (box.expedida) continue
        const notaFiscal = (box.notaFiscal ?? "").trim()
        if (!notaFiscal) continue
        const prazo = prazoEfetivo(box.cidade ?? "", box.prazo, box.alocadaEm)
        if (!prazo || prazo > today) continue
        const key = notaFiscal.toLowerCase()
        const existing = groups.get(key)
        if (!existing) {
          groups.set(key, {
            notaFiscal,
            cidade: (box.cidade ?? "").trim() || "sem cidade",
            prazo,
            volumes: 1,
          })
        } else {
          existing.volumes += 1
          if (prazo < existing.prazo) existing.prazo = prazo
        }
      }
    }
  }
  return [...groups.values()].sort((a, b) => a.prazo.localeCompare(b.prazo))
}

function operationStats(products: Product[]) {
  const today = localIsoDay()
  let estoque = 0
  let coletas = 0
  let enviadas = 0
  let onTime = 0
  for (const product of products) {
    for (const lot of product.lots) {
      for (const box of lot.boxes) {
        if (!box.expedida) {
          estoque += 1
          if (box.coletada) coletas += 1
          continue
        }
        enviadas += 1
        const sent = localIsoDay(box.enviadaEm)
        const due = prazoEfetivo(box.cidade ?? "", box.prazo, box.alocadaEm)
        if (!sent || !due || sent <= due) onTime += 1
        if (sent === today) {
          /* count shipped today already in enviadas */
        }
      }
    }
  }
  const ok = enviadas === 0 ? 100 : Math.round((onTime / enviadas) * 100)
  return { estoque, coletas, ok }
}

function localIsoDay(value?: string) {
  if (!value) {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  }
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
  if (match && value.length <= 10) return match[1]
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return match?.[1] ?? ""
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function formatClock(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

function ChevronGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden="true">
      <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function TruckArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 64" className={className} aria-hidden="true" fill="none">
      <path
        d="M8 40h62l10-16h22v16h10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="28" cy="48" r="8" stroke="currentColor" strokeWidth="3" />
      <circle cx="86" cy="48" r="8" stroke="currentColor" strokeWidth="3" />
      <path d="M8 40V22h48v18" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  )
}

function MenuGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function BellGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="M6 16h12l-1.2-2.2a6 6 0 0 1-.8-3V9a4 4 0 1 0-8 0v1.8c0 1.1-.3 2.1-.8 3L6 16Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 18a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function UserAvatarGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <path
        d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function HomeNavGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path d="M4 11 12 4l8 7v9H4v-9Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function ChartNavGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path d="M5 19V9M12 19V5M19 19v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function MoreNavGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <circle cx="6" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="18" cy="12" r="1.6" fill="currentColor" />
    </svg>
  )
}

function BoxMini() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path d="M4 8 12 4l8 4v8l-8 4-8-4V8Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 8l8 4 8-4M12 12v8" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function TruckMini() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path d="M3 7h10v8H3V7Zm10 3h4l3 3v2h-7v-5Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="7" cy="17" r="1.5" fill="currentColor" />
      <circle cx="17" cy="17" r="1.5" fill="currentColor" />
    </svg>
  )
}

function CheckMini() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path d="M5 12.5 10 17l9-10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function PinMini() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="11" r="2" fill="currentColor" />
    </svg>
  )
}

function PlusMini() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path d="M12 6v12M6 12h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function UsuariosIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8 lg:h-9 lg:w-9" aria-hidden="true">
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
    <svg viewBox="0 0 48 48" className="h-8 w-8 lg:h-9 lg:w-9" aria-hidden="true">
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
    <svg viewBox="0 0 48 48" className="h-8 w-8 lg:h-9 lg:w-9" aria-hidden="true">
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

function RotaIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8 lg:h-9 lg:w-9" aria-hidden="true">
      <path
        d="M12 36c4-8 8-12 12-12s8 4 12 12"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="18" r="6" fill="none" stroke="white" strokeWidth="2.4" />
      <path
        d="M24 12v2M18 18h-2M32 18h2"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ColetaIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8 lg:h-9 lg:w-9" aria-hidden="true">
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
    <svg viewBox="0 0 48 48" className="h-8 w-8 lg:h-9 lg:w-9" aria-hidden="true">
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
