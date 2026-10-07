export type Box = {
  id: string
  index: number
  total: number
  posicao?: string
  armazemCodigo?: string
  coletada?: boolean
  expedida?: boolean
}

export type ShelfPosition = {
  numero: number
  codigo: string
}

export type Shelf = {
  codigo: string
  posicoes: ShelfPosition[]
}

export type Warehouse = {
  codigo: string
  nome: string
  prateleiras: Shelf[]
}

export type Lot = {
  numero: string
  quantidade: number
  validade: string
  boxes: Box[]
}

export type LotDraft = {
  numero: string
  quantidade: number
  validade: string
  caixas: number
}

export type Product = {
  codigo: string
  nome: string
  unidade: string
  lots: Lot[]
}

export type RecebimentoView = "lista" | "novo" | "lote" | "etiquetas"
