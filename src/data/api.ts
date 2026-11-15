import type { Product, Warehouse } from "../recebimento/types"

export type AppData = {
  products: Product[]
  warehouses: Warehouse[]
}

export type AreaAccess = {
  recebimento: boolean
  estoque: boolean
  armazem: boolean
  coleta: boolean
  expedicao: boolean
  usuarios: boolean
}

export type UserAccount = {
  nome: string
  usuario: string
  areas: AreaAccess
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = (await response.json()) as T & { error?: string }
  if (!response.ok) {
    throw new Error(data.error || "Não foi possível salvar no banco de dados.")
  }
  return data
}

async function send(path: string, body?: unknown) {
  return request<AppData>(path, body)
}

export function loadData() {
  return send("/api/state")
}

export function saveProduct(
  actor: string,
  product: Pick<Product, "codigo" | "nome" | "unidade">,
) {
  return send("/api/products", { actor, ...product })
}

export function saveLot(
  actor: string,
  productCodigo: string,
  draft: { numero: string; quantidade: number; validade: string; caixas: number },
) {
  return send("/api/lots", { actor, productCodigo, ...draft })
}

export function removeProduct(actor: string, codigo: string) {
  return send("/api/products/delete", { actor, codigo })
}

export function removeLot(actor: string, productCodigo: string, numero: string) {
  return send("/api/lots/delete", { actor, productCodigo, numero })
}

export function removeWarehouse(actor: string, codigo: string) {
  return send("/api/warehouses/delete", { actor, codigo })
}

export function removeShelf(actor: string, armazemCodigo: string, prateleira: string) {
  return send("/api/shelves/delete", { actor, armazemCodigo, prateleira })
}

export function removePosition(actor: string, armazemCodigo: string, codigo: string) {
  return send("/api/positions/delete", { actor, armazemCodigo, codigo })
}

export function savePositions(
  actor: string,
  boxIds: string[],
  posicao: string,
  armazemCodigo?: string,
) {
  return send("/api/positions", { actor, boxIds, posicao, armazemCodigo })
}

export function saveCollection(actor: string, boxIds: string[]) {
  return send("/api/collections", { actor, boxIds })
}

export function saveShipment(
  actor: string,
  boxIds: string[],
  notaFiscal: string,
  quantidade: number,
  posicao?: string,
) {
  return send("/api/shipments", { actor, boxIds, notaFiscal, quantidade, posicao })
}

export function saveAllocation(
  actor: string,
  notaFiscal: string,
  quantidade: number,
  posicao: string,
  armazemCodigo?: string,
  cidade?: string,
  boxIds: string[] = [],
) {
  return send("/api/allocations", {
    actor,
    boxIds,
    notaFiscal,
    quantidade,
    posicao,
    armazemCodigo,
    cidade,
  })
}

export function saveReallocation(
  actor: string,
  notaFiscal: string,
  posicao: string,
  armazemCodigo?: string,
) {
  return send("/api/reallocations", {
    actor,
    notaFiscal,
    posicao,
    armazemCodigo,
  })
}

export function saveReturn(
  actor: string,
  notaFiscal: string,
  cidade?: string,
  observacao?: string,
) {
  return send("/api/returns", {
    actor,
    notaFiscal,
    cidade,
    observacao,
  })
}

export function saveWarehouse(actor: string, warehouse: Pick<Warehouse, "codigo" | "nome">) {
  return send("/api/warehouses", { actor, ...warehouse })
}

export function saveShelf(
  actor: string,
  armazemCodigo: string,
  prateleira: string,
  quantidade: number,
) {
  return send("/api/shelves", { actor, armazemCodigo, prateleira, quantidade })
}

export function saveShelfPositions(
  actor: string,
  armazemCodigo: string,
  prateleira: string,
  quantidade: number,
) {
  return send("/api/shelves/positions", { actor, armazemCodigo, prateleira, quantidade })
}

export type HistoryEvent = {
  criadoEm: string
  actor: string
  texto: string
}

export function loadHistory(actor: string) {
  return request<{ events: HistoryEvent[] }>(
    `/api/history?actor=${encodeURIComponent(actor)}`,
  )
}

export type NotaFiscalLookupItem = {
  id: string
  produto: string
  ondeEsta: string
  posicao: string | null
  salvaPor: string | null
  salvaEm: string | null
}

export type NotaFiscalLookup = {
  notaFiscal: string
  posicao: string | null
  quantidade: number
  expedidaPor: string | null
  expedidaEm: string | null
  observacaoRetorno?: string | null
  items: NotaFiscalLookupItem[]
}

export function lookupNotaFiscal(notaFiscal: string) {
  return request<NotaFiscalLookup>("/api/nota-fiscal", { notaFiscal })
}

export function registerNotaFiscal(
  actor: string,
  notaFiscal: string,
  quantidade: number,
  posicao?: string,
) {
  return request<NotaFiscalLookup>("/api/nota-fiscal/register", {
    actor,
    notaFiscal,
    quantidade,
    posicao,
  })
}

export function loadUsers(actor: string) {
  return request<{ users: UserAccount[] }>("/api/users/list", { actor })
}

export function saveUser(actor: string, user: { nome: string; usuario: string; senha: string }) {
  return request<{ users: UserAccount[] }>("/api/users", { actor, ...user })
}

export function saveUserAreas(
  actor: string,
  usuario: string,
  areas: Omit<AreaAccess, "usuarios">,
) {
  return request<{ users: UserAccount[] }>("/api/users/permissions", {
    actor,
    usuario,
    ...areas,
  })
}

export function removeUser(actor: string, usuario: string) {
  return request<{ users: UserAccount[] }>("/api/users/delete", { actor, usuario })
}

export function loginUser(usuario: string, senha: string) {
  return request<UserAccount>("/api/login", { usuario, senha })
}

export type RouteCity = {
  cidade: string
  dias: number[]
}

export type RouteInfo = {
  id: string
  titulo: string
  diaSemana: string
  dias: number[]
  cidades: string[]
  motorista: string
  motoristaNome: string
  confirmada: boolean
  confirmadaEm: string
}

export type RoutesPayload = {
  cidades: RouteCity[]
  rotas: RouteInfo[]
}

export type RouteDriver = {
  nome: string
  usuario: string
}

export function loadRoutes() {
  return request<RoutesPayload>("/api/routes")
}

export function saveRouteCity(actor: string, cidade: string, dias: number[]) {
  return request<RoutesPayload>("/api/routes", { actor, cidade, dias })
}

export function removeRouteCityDay(actor: string, cidade: string, dia: number) {
  return request<RoutesPayload>("/api/routes/remove", { actor, cidade, dia })
}

export function loadRouteDrivers() {
  return request<{ drivers: RouteDriver[] }>("/api/routes/drivers")
}

export function saveRouteDriver(actor: string, rota: number, motorista: string) {
  return request<RoutesPayload>("/api/routes/driver", { actor, rota, motorista })
}

export function confirmRoute(actor: string, rota: number) {
  return request<RoutesPayload>("/api/routes/confirm", { actor, rota })
}

export function loadMyRoutes(actor: string) {
  return request<{ rotas: RouteInfo[] }>(
    `/api/routes/mine?actor=${encodeURIComponent(actor)}`,
  )
}

export type PositionNote = {
  notaFiscal: string
  quantidade: number
  boxIds: string[]
  cidade: string
  prazo: string
}

export type PositionNotesPayload = {
  posicao: string
  armazemCodigo: string | null
  notas: PositionNote[]
}

export function loadPositionNotes(posicao: string, armazemCodigo?: string) {
  return request<PositionNotesPayload>("/api/routes/position-notes", {
    posicao,
    armazemCodigo,
  })
}

export function shipPosition(
  actor: string,
  posicao: string,
  armazemCodigo?: string,
) {
  return send("/api/routes/ship-position", { actor, posicao, armazemCodigo })
}
