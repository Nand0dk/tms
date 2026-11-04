const CIDADES_SEGUNDA_QUARTA = sorted([
  "Barueri",
  "Campinas",
  "Guarulhos",
  "Indaiatuba",
  "Itapevi",
  "Itu",
  "Mauá",
  "Salto",
  "São Paulo",
  "Vinhedo",
])

const CIDADES_TERCA_QUINTA = sorted([
  "Araraquara",
  "Cabreúva",
  "Capivari",
  "Elias Fausto",
  "Itupeva",
  "Ituverava",
  "Jundiaí",
  "Limeira",
  "Sumaré",
  "São Joaquim da Barra",
])

const CIDADES_SEXTA = sorted([
  "Araçoiaba da Serra",
  "Bofete",
  "Boituva",
  "Botucatu",
  "Capela do Alto",
  "Cesário Lange",
  "Itapetininga",
  "Jumirim",
  "Lençóis Paulista",
  "São Manuel",
  "Tietê",
])

/** Cidades na lista sem dia de rota fixo — prazo padrão de +7 dias. */
const CIDADES_PRAZO_PADRAO = sorted(["Sorocaba"])

export const ROTAS = [
  {
    id: "seg",
    titulo: "Segunda-feira",
    dias: [1],
    cidades: CIDADES_SEGUNDA_QUARTA,
  },
  {
    id: "ter",
    titulo: "Terça-feira",
    dias: [2],
    cidades: CIDADES_TERCA_QUINTA,
  },
  {
    id: "qua",
    titulo: "Quarta-feira",
    dias: [3],
    cidades: CIDADES_SEGUNDA_QUARTA,
  },
  {
    id: "qui",
    titulo: "Quinta-feira",
    dias: [4],
    cidades: CIDADES_TERCA_QUINTA,
  },
  {
    id: "sex",
    titulo: "Sexta-feira",
    dias: [5],
    cidades: CIDADES_SEXTA,
  },
]

export const CIDADES = mergeCidades(ROTAS, CIDADES_PRAZO_PADRAO)

export function rotaDaCidade(cidade: string) {
  const wanted = cidade.trim().toLowerCase()
  const item = CIDADES.find((entry) => entry.cidade.toLowerCase() === wanted) ?? null
  // Cidades sem dia de rota fixo usam o prazo padrão (+7), não uma rota semanal.
  if (!item || item.dias.length === 0) return null
  return item
}

export function proximoPrazo(cidade: string, from = new Date()) {
  const rota = rotaDaCidade(cidade)
  if (!rota) return ""
  const start = atNoon(from)
  for (let offset = 0; offset < 8; offset += 1) {
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

export function formatPrazo(iso: string) {
  const [year, month, day] = iso.split("-")
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}

function sorted(cidades: string[]) {
  return [...cidades].sort((a, b) => a.localeCompare(b, "pt-BR"))
}

function mergeCidades(rotas: typeof ROTAS, extras: string[] = []) {
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
      dias: item.dias,
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
