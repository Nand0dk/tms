import type { Lot, Product } from "./types"

export function parseQuantity(value: string) {
  const normalized = value.trim().replace(",", ".")
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const amount = Number(normalized)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return amount
}

export function parseBoxes(value: string) {
  if (!/^[1-9]\d*$/.test(value.trim())) return null
  return Number(value.trim())
}

export function productError(codigo: string, nome: string, products: Product[]) {
  const code = codigo.trim()
  const name = nome.trim()
  if (!code && !name) return "Informe o código e o nome."
  if (!code) return "Informe o código."
  if (!name) return "Informe o nome."
  const exists = products.some(
    (product) => product.codigo.toLowerCase() === code.toLowerCase(),
  )
  if (exists) return "Este código já existe."
  return null
}

export function lotError(
  numero: string,
  quantidade: string,
  caixas: string,
  product: Product,
) {
  const number = numero.trim()
  const amount = parseQuantity(quantidade)
  if (!number && !quantidade.trim()) {
    return "Informe o número do lote e a quantidade."
  }
  if (!number) return "Informe o número do lote."
  if (amount === null) return "Informe uma quantidade maior que zero."
  if (parseBoxes(caixas) === null) return "Informe a quantidade de caixas."
  const exists = product.lots.some(
    (lot) => lot.numero.toLowerCase() === number.toLowerCase(),
  )
  if (exists) return "Este lote já foi recebido neste produto."
  return null
}

export function formatBoxId(sequence: number) {
  return `CX-${String(sequence).padStart(4, "0")}`
}

export function boxPayload(boxId: string, lot: string, productCode: string) {
  return `VPS|BOX|${boxId}|LOT|${lot}|PROD|${productCode}`
}

export function formatPositionNumber(numero: number) {
  return String(numero).padStart(2, "0")
}

export function positionCode(prateleira: string, numero: number) {
  return `${prateleira}-${formatPositionNumber(numero)}`
}

export function positionPayload(codigo: string, prateleira: string, armazem: string) {
  return `VPS|POS|${codigo}|SHELF|${prateleira}|WH|${armazem}`
}

export function positionFromSearch(term: string) {
  const parts = term.split("|").map((part) => part.trim())
  if (
    parts.length >= 3 &&
    parts[0].toUpperCase() === "VPS" &&
    parts[1].toUpperCase() === "POS" &&
    parts[2]
  ) {
    const prateleira = parts[3]?.toUpperCase() === "SHELF" ? parts[4] : undefined
    const armazem = parts[5]?.toUpperCase() === "WH" ? parts[6] : undefined
    return { codigo: parts[2], prateleira, armazem }
  }
  return null
}

export function formatLot(lot: Lot, unidade: string) {
  const amount = lot.quantidade.toLocaleString("pt-BR")
  const unit = unidade ? ` ${unidade}` : ""
  const validity = lot.validade ? ` · val. ${formatDate(lot.validade)}` : ""
  return `Lote ${lot.numero} · ${amount}${unit}${validity}`
}

export function formatDate(iso: string) {
  const [year, month, day] = iso.split("-")
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}

export function latestLot(product: Product) {
  return product.lots[product.lots.length - 1]
}

export function productBalance(product: Product) {
  return product.lots.reduce((sum, lot) => sum + lot.quantidade, 0)
}

export function boxIdFromSearch(term: string) {
  const parts = term.split("|").map((part) => part.trim())
  if (
    parts.length >= 3 &&
    parts[0].toUpperCase() === "VPS" &&
    parts[1].toUpperCase() === "BOX" &&
    parts[2]
  ) {
    return parts[2]
  }
  return null
}
