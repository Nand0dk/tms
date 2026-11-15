export const MAX_CIDADES_POR_ROTA = 5
export const TOTAL_ROTAS = 5

const CIDADES_ROTA_1_3 = sorted([
  "Barueri",
  "Campinas",
  "Guarulhos",
  "Indaiatuba",
  "Itapevi",
])

const CIDADES_ROTA_2_4 = sorted([
  "Araraquara",
  "Cabreúva",
  "Capivari",
  "Elias Fausto",
  "Itupeva",
])

const CIDADES_ROTA_5 = sorted([
  "Araçoiaba da Serra",
  "Bofete",
  "Boituva",
  "Botucatu",
  "Capela do Alto",
])

/** Cidades na lista sem dia de rota fixo — prazo padrão de +7 dias. */
const CIDADES_PRAZO_PADRAO = sorted(["Sorocaba"])

export const DIAS_ROTA = [
  { id: "rota1", titulo: "Rota 1", diaSemana: "Segunda-feira", dia: 1 },
  { id: "rota2", titulo: "Rota 2", diaSemana: "Terça-feira", dia: 2 },
  { id: "rota3", titulo: "Rota 3", diaSemana: "Quarta-feira", dia: 3 },
  { id: "rota4", titulo: "Rota 4", diaSemana: "Quinta-feira", dia: 4 },
  { id: "rota5", titulo: "Rota 5", diaSemana: "Sexta-feira", dia: 5 },
] as const

export type RotaDia = {
  id: string
  titulo: string
  diaSemana: string
  dias: number[]
  cidades: string[]
}

export type CidadeRota = {
  cidade: string
  dias: number[]
  titulo: string
}

export const DEFAULT_ROTAS: RotaDia[] = [
  {
    id: "rota1",
    titulo: "Rota 1",
    diaSemana: "Segunda-feira",
    dias: [1],
    cidades: CIDADES_ROTA_1_3,
  },
  {
    id: "rota2",
    titulo: "Rota 2",
    diaSemana: "Terça-feira",
    dias: [2],
    cidades: CIDADES_ROTA_2_4,
  },
  {
    id: "rota3",
    titulo: "Rota 3",
    diaSemana: "Quarta-feira",
    dias: [3],
    cidades: CIDADES_ROTA_1_3,
  },
  {
    id: "rota4",
    titulo: "Rota 4",
    diaSemana: "Quinta-feira",
    dias: [4],
    cidades: CIDADES_ROTA_2_4,
  },
  {
    id: "rota5",
    titulo: "Rota 5",
    diaSemana: "Sexta-feira",
    dias: [5],
    cidades: CIDADES_ROTA_5,
  },
]

let activeRotas: RotaDia[] = DEFAULT_ROTAS
export const CIDADES: CidadeRota[] = mergeCidades(DEFAULT_ROTAS, CIDADES_PRAZO_PADRAO)

/** @deprecated use getRotas() — kept for compatibility */
export const ROTAS = DEFAULT_ROTAS

export function getRotas() {
  return activeRotas
}

export function getCidades() {
  return CIDADES
}

export function applyRoutes(entries: { cidade: string; dias: number[] }[]) {
  const byDay = new Map<number, string[]>()
  for (const meta of DIAS_ROTA) byDay.set(meta.dia, [])

  for (const entry of entries) {
    const nome = entry.cidade.trim()
    if (!nome) continue
    for (const rawDia of entry.dias) {
      const dia = Number(rawDia)
      if (!byDay.has(dia)) continue
      const list = byDay.get(dia)!
      if (!list.some((item) => item.toLowerCase() === nome.toLowerCase())) {
        list.push(nome)
      }
    }
  }

  activeRotas = DIAS_ROTA.map((meta) => ({
    id: meta.id,
    titulo: meta.titulo,
    diaSemana: meta.diaSemana,
    dias: [meta.dia],
    cidades: sorted(byDay.get(meta.dia) ?? []).slice(0, MAX_CIDADES_POR_ROTA),
  }))

  const extras = CIDADES_PRAZO_PADRAO.filter(
    (cidade) =>
      !entries.some((entry) => entry.cidade.toLowerCase() === cidade.toLowerCase()),
  )
  const next = mergeCidades(activeRotas, extras)
  CIDADES.splice(0, CIDADES.length, ...next)
}

export function rotaDaCidade(cidade: string) {
  const wanted = cidade.trim().toLowerCase()
  const item = CIDADES.find((entry) => entry.cidade.toLowerCase() === wanted) ?? null
  if (!item || item.dias.length === 0) return null
  return item
}

/**
 * Próximo dia de rota DEPOIS da data de entrada (não conta o próprio dia).
 * Se a NF entra no dia de saída, o prazo vai para a próxima data dessa rota.
 */
export function proximoPrazo(cidade: string, from = new Date()) {
  const rota = rotaDaCidade(cidade)
  if (!rota) return ""
  const start = atNoon(from)
  for (let offset = 1; offset <= 8; offset += 1) {
    const day = new Date(start)
    day.setDate(start.getDate() + offset)
    if (rota.dias.includes(day.getDay())) return toIsoDay(day)
  }
  return ""
}

export function prazoDeEnvio(cidade: string, from = new Date()) {
  const rota = proximoPrazo(cidade, from)
  if (rota) return rota
  const day = atNoon(from)
  day.setDate(day.getDate() + 7)
  return toIsoDay(day)
}

/** Prazo efetivo para exibição/atraso — corrige NFs antigas gravadas no mesmo dia da rota. */
export function prazoEfetivo(
  cidade: string,
  prazoGravado?: string | null,
  alocadaEm?: string | null,
) {
  const from = alocadaEm ? new Date(alocadaEm) : new Date()
  const allocatedDay = toIsoDay(atNoon(alocadaEm ? new Date(alocadaEm) : from))
  const stored = normalizeIsoDay(prazoGravado)
  const computed = prazoDeEnvio(cidade, from)
  if (stored && allocatedDay && stored === allocatedDay) return computed || stored
  if (stored && allocatedDay && stored > allocatedDay) return stored
  return stored || computed
}

export function isAtrasada(
  cidade: string,
  prazoGravado: string | null | undefined,
  alocadaEm: string | null | undefined,
  today = toIsoDay(atNoon(new Date())),
) {
  const due = prazoEfetivo(cidade, prazoGravado, alocadaEm)
  return Boolean(due) && due <= today
}

function normalizeIsoDay(value?: string | null) {
  if (!value) return ""
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1] ?? ""
}

export function formatPrazo(iso: string) {
  const [year, month, day] = iso.split("-")
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}

function sorted(cidades: string[]) {
  return [...cidades].sort((a, b) => a.localeCompare(b, "pt-BR"))
}

function mergeCidades(rotas: RotaDia[], extras: string[] = []) {
  const byName = new Map<string, { cidade: string; dias: number[]; titulos: string[] }>()
  for (const rota of rotas) {
    for (const cidade of rota.cidades) {
      const existing = byName.get(cidade.toLowerCase())
      if (!existing) {
        byName.set(cidade.toLowerCase(), {
          cidade,
          dias: [...rota.dias],
          titulos: [rota.titulo],
        })
        continue
      }
      for (const dia of rota.dias) {
        if (!existing.dias.includes(dia)) existing.dias.push(dia)
      }
      if (!existing.titulos.includes(rota.titulo)) existing.titulos.push(rota.titulo)
    }
  }
  for (const cidade of extras) {
    const key = cidade.toLowerCase()
    if (byName.has(key)) continue
    byName.set(key, {
      cidade,
      dias: [],
      titulos: ["7 dias"],
    })
  }
  return [...byName.values()]
    .map((item) => ({
      cidade: item.cidade,
      dias: item.dias.sort((a, b) => a - b),
      titulo: item.titulos.join(" / "),
    }))
    .sort((a, b) => a.cidade.localeCompare(b.cidade, "pt-BR"))
}

function atNoon(from: Date) {
  const start = new Date(from)
  if (Number.isNaN(start.getTime())) {
    const now = new Date()
    now.setHours(12, 0, 0, 0)
    return now
  }
  start.setHours(12, 0, 0, 0)
  return start
}

function toIsoDay(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
