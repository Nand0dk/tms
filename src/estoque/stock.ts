import type { Box, Product } from "../recebimento/types"

export type StockBox = Box & {
  lote: string
}

export function productBalance(product: Product) {
  return product.lots.reduce((sum, lot) => sum + lot.quantidade, 0)
}

export function productBoxes(product: Product): StockBox[] {
  return product.lots.flatMap((lot) =>
    lot.boxes.map((box) => ({ ...box, lote: lot.numero })),
  )
}

export function boxIdFromQuery(term: string) {
  const parts = term.split("|").map((part) => part.trim())
  if (parts.length >= 3 && parts[0].toUpperCase() === "VPS" && parts[1].toUpperCase() === "BOX") {
    return parts[2]
  }
  return null
}

export function matchingBoxes(product: Product, term: string): StockBox[] | null {
  const query = term.trim().toLowerCase()
  if (!query) return productBoxes(product)

  const byProduct =
    product.nome.toLowerCase().includes(query) ||
    product.codigo.toLowerCase().includes(query)
  if (byProduct) return productBoxes(product)

  const scanned = boxIdFromQuery(term)?.toLowerCase()
  const boxes = productBoxes(product).filter(
    (box) =>
      box.lote.toLowerCase().includes(query) ||
      box.id.toLowerCase() === query ||
      box.id.toLowerCase() === scanned,
  )
  return boxes.length > 0 ? boxes : null
}

export function findBox(products: Product[], boxId: string) {
  for (const product of products) {
    const box = productBoxes(product).find(
      (item) => item.id.toLowerCase() === boxId.toLowerCase(),
    )
    if (box) return { product, box }
  }
  return null
}
