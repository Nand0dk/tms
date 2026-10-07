import { createPortal } from "react-dom"
import { QRCodeSVG } from "qrcode.react"
import { BackButton } from "../recebimento/BackButton"
import { formatPositionNumber, positionPayload } from "../recebimento/format"
import type { ShelfPosition, Warehouse } from "../recebimento/types"

export function PositionLabels({
  warehouse,
  prateleira,
  positions,
  onBack,
}: {
  warehouse: Warehouse
  prateleira: string
  positions: ShelfPosition[]
  onBack: () => void
}) {
  return createPortal(
    <div className="label-sheet fixed inset-0 z-50 overflow-auto bg-neutral-200">
      <div className="no-print sticky top-0 flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <BackButton onClick={onBack} />
        <h1 className="text-base font-semibold text-neutral-900">Etiquetas</h1>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-full bg-[#1f6b28] px-3 py-1.5 text-sm font-semibold text-white"
        >
          Imprimir
        </button>
      </div>
      <div className="flex flex-col items-center gap-4 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {positions.map((position) => {
          const numero = formatPositionNumber(position.numero)
          const payload = positionPayload(position.codigo, prateleira, warehouse.codigo)
          return (
            <article
              key={position.codigo}
              className="label flex h-auto min-h-36 w-full max-w-[100mm] items-center justify-between gap-3 border border-black bg-white px-3 py-2 text-black sm:h-[60mm]"
              data-position={position.codigo}
              data-payload={payload}
            >
              <div className="min-w-0">
                <p className="text-[10px] tracking-wide uppercase">Armazém</p>
                <p className="truncate text-sm leading-tight font-semibold">
                  {warehouse.nome}
                </p>
                <p className="mt-1 text-[10px] tracking-wide uppercase">Prateleira</p>
                <p className="text-sm font-semibold">{prateleira}</p>
                <p className="mt-1 text-[10px] tracking-wide uppercase">Posição</p>
                <p className="text-2xl leading-none font-semibold">{numero}</p>
                <p className="mt-1 text-xs">{position.codigo}</p>
              </div>
              <QRCodeSVG
                value={payload}
                size={112}
                aria-label={`QR da posição ${numero}`}
              />
            </article>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}
