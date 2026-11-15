import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { createClient } from "@libsql/client"

const schema = `
CREATE TABLE IF NOT EXISTS products (
  codigo TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  unidade TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_codigo TEXT NOT NULL REFERENCES products(codigo) ON DELETE CASCADE,
  numero TEXT NOT NULL,
  quantidade REAL NOT NULL,
  validade TEXT NOT NULL DEFAULT '',
  ordem INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS boxes (
  id TEXT PRIMARY KEY,
  lot_id INTEGER NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  total INTEGER NOT NULL,
  posicao TEXT,
  armazem_codigo TEXT,
  coletada INTEGER NOT NULL DEFAULT 0,
  expedida INTEGER NOT NULL DEFAULT 0,
  nota_fiscal TEXT NOT NULL DEFAULT '',
  alocada_em TEXT NOT NULL DEFAULT '',
  enviada_em TEXT NOT NULL DEFAULT '',
  prazo TEXT NOT NULL DEFAULT '',
  cidade TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS warehouses (
  codigo TEXT PRIMARY KEY,
  nome TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shelves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  warehouse_codigo TEXT NOT NULL REFERENCES warehouses(codigo) ON DELETE CASCADE,
  codigo TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shelf_id INTEGER NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  codigo TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  usuario TEXT NOT NULL,
  senha_hash TEXT NOT NULL,
  senha_salt TEXT NOT NULL,
  recebimento INTEGER NOT NULL DEFAULT 0,
  estoque INTEGER NOT NULL DEFAULT 0,
  armazem INTEGER NOT NULL DEFAULT 0,
  coleta INTEGER NOT NULL DEFAULT 0,
  expedicao INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  criado_em TEXT NOT NULL,
  actor TEXT NOT NULL,
  texto TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notas_fiscais (
  nota_fiscal TEXT PRIMARY KEY,
  posicao TEXT NOT NULL DEFAULT '',
  quantidade INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT '',
  observacao_retorno TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS rota_cidades (
  cidade TEXT PRIMARY KEY,
  dias TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rota_motoristas (
  rota INTEGER PRIMARY KEY,
  motorista TEXT NOT NULL DEFAULT '',
  motorista_nome TEXT NOT NULL DEFAULT '',
  confirmada INTEGER NOT NULL DEFAULT 0,
  confirmada_em TEXT NOT NULL DEFAULT ''
);
`

const areas = ["recebimento", "estoque", "armazem", "coleta", "expedicao"]

const missingTurso =
  "Configure TURSO_DATABASE_URL e TURSO_AUTH_TOKEN no painel da Vercel."

export class ApiError extends Error {
  constructor(message, statusCode = 400) {
    super(message)
    this.statusCode = statusCode
  }
}

function envText(name) {
  const value = process.env[name]
  return typeof value === "string" ? value.trim() : ""
}

function localFileUrl() {
  const file = join(process.cwd(), "data", "vps.sqlite")
  mkdirSync(dirname(file), { recursive: true })
  return `file:${file.replace(/\\/g, "/")}`
}

function bind(executor) {
  return {
    raw: executor,
    async get(sql, ...args) {
      const result = await executor.execute({ sql, args })
      return result.rows[0]
    },
    async all(sql, ...args) {
      const result = await executor.execute({ sql, args })
      return result.rows
    },
    async run(sql, ...args) {
      const result = await executor.execute({ sql, args })
      return {
        changes: Number(result.rowsAffected ?? 0),
        lastInsertRowid: Number(result.lastInsertRowid ?? 0),
      }
    },
  }
}

export async function openDatabase() {
  const url = envText("TURSO_DATABASE_URL")
  const authToken = envText("TURSO_AUTH_TOKEN")
  if (process.env.VERCEL && (!url || !authToken)) {
    throw new ApiError(missingTurso, 503)
  }
  if (url && !authToken) throw new ApiError(missingTurso, 503)

  const client = url
    ? createClient({ url, authToken, intMode: "number" })
    : createClient({ url: localFileUrl(), intMode: "number", timeout: 5000 })

  await client.execute("PRAGMA foreign_keys = ON")
  await client.executeMultiple(schema)
  const db = bind(client)
  await ensureUserColumns(db)
  await ensureBoxColumns(db)
  await ensureNotaFiscalColumns(db)
  await withTransaction(db, async (tx) => {
    await tx.run(
      "INSERT INTO meta (key, value) VALUES ('next_box', '1') ON CONFLICT(key) DO NOTHING",
    )
    await ensureAdmin(tx)
    await seedRotaCidades(tx)
    await migrateRotasLimitadas(tx)
    await seedRotaMotoristas(tx)
  })
  await enforceMaxCidadesPorRota(db)
  await refreshCidadeDias(db)
  return db
}

export async function readState(db) {
  const productRows = await db.all(
    "SELECT codigo, nome, unidade FROM products ORDER BY rowid",
  )
  const lotRows = await db.all(
    "SELECT id, product_codigo, numero, quantidade, validade FROM lots ORDER BY ordem, id",
  )
  const boxRows = await db.all(
    `SELECT id, lot_id, idx, total, posicao, armazem_codigo, coletada, expedida,
            nota_fiscal, alocada_em, enviada_em, prazo, cidade
     FROM boxes ORDER BY idx`,
  )
  const warehouseRows = await db.all("SELECT codigo, nome FROM warehouses ORDER BY rowid")
  const shelfRows = await db.all(
    "SELECT id, warehouse_codigo, codigo FROM shelves ORDER BY id",
  )
  const positionRows = await db.all(
    "SELECT shelf_id, numero, codigo FROM positions ORDER BY numero",
  )

  const boxesByLot = new Map()
  for (const box of boxRows) {
    const item = { id: box.id, index: box.idx, total: box.total }
    if (box.posicao) item.posicao = box.posicao
    if (box.armazem_codigo) item.armazemCodigo = box.armazem_codigo
    if (Number(box.coletada)) item.coletada = true
    if (Number(box.expedida)) item.expedida = true
    if (box.nota_fiscal) item.notaFiscal = box.nota_fiscal
    if (box.alocada_em) item.alocadaEm = box.alocada_em
    if (box.enviada_em) item.enviadaEm = box.enviada_em
    if (box.prazo) item.prazo = box.prazo
    if (box.cidade) item.cidade = box.cidade
    const list = boxesByLot.get(box.lot_id) ?? []
    list.push(item)
    boxesByLot.set(box.lot_id, list)
  }

  const lotsByProduct = new Map()
  for (const lot of lotRows) {
    const item = {
      numero: lot.numero,
      quantidade: lot.quantidade,
      validade: lot.validade ?? "",
      boxes: boxesByLot.get(lot.id) ?? [],
    }
    const list = lotsByProduct.get(lot.product_codigo) ?? []
    list.push(item)
    lotsByProduct.set(lot.product_codigo, list)
  }

  const positionsByShelf = new Map()
  for (const position of positionRows) {
    const list = positionsByShelf.get(position.shelf_id) ?? []
    list.push({ numero: position.numero, codigo: position.codigo })
    positionsByShelf.set(position.shelf_id, list)
  }

  const shelvesByWarehouse = new Map()
  for (const shelf of shelfRows) {
    const list = shelvesByWarehouse.get(shelf.warehouse_codigo) ?? []
    list.push({
      codigo: shelf.codigo,
      posicoes: positionsByShelf.get(shelf.id) ?? [],
    })
    shelvesByWarehouse.set(shelf.warehouse_codigo, list)
  }

  return {
    products: productRows.map((product) => ({
      codigo: product.codigo,
      nome: product.nome,
      unidade: product.unidade ?? "",
      lots: lotsByProduct.get(product.codigo) ?? [],
    })),
    warehouses: warehouseRows.map((warehouse) => ({
      codigo: warehouse.codigo,
      nome: warehouse.nome,
      prateleiras: shelvesByWarehouse.get(warehouse.codigo) ?? [],
    })),
  }
}

async function withTransaction(db, run) {
  const tx = await db.raw.transaction("write")
  const bound = bind(tx)
  try {
    const result = await run(bound)
    await tx.commit()
    return result
  } catch (error) {
    try {
      await tx.rollback()
    } catch {
      // The transaction may already be closed.
    }
    throw error
  } finally {
    try {
      tx.close()
    } catch {
      // commit()/rollback() already close the stream on Turso.
    }
  }
}

function text(value) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeNotaFiscal(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s.\-\/_]/g, "")
}

function notaFiscalMatches(stored, term, normalizedTerm) {
  const raw = String(stored || "").trim()
  if (!raw) return false
  const lower = raw.toLowerCase()
  const needle = term.toLowerCase()
  if (lower === needle || lower.includes(needle)) return true
  const normalized = normalizeNotaFiscal(raw)
  return Boolean(normalizedTerm) && (normalized === normalizedTerm || normalized.includes(normalizedTerm))
}

function positiveNumber(value) {
  const amount = typeof value === "number" ? value : Number(String(value).replace(",", "."))
  if (!Number.isFinite(amount) || amount <= 0) return null
  return amount
}

function wholeCount(value) {
  const count = typeof value === "number" ? value : Number(value)
  if (!Number.isInteger(count) || count < 1) return null
  return count
}

function idList(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim())
}

function formatBoxId(sequence) {
  return `CX-${String(sequence).padStart(4, "0")}`
}

function positionCode(prateleira, numero) {
  return `${prateleira}-${String(numero).padStart(2, "0")}`
}

async function requireWarehouse(db, codigo) {
  const warehouse = await db.get(
    "SELECT codigo FROM warehouses WHERE lower(codigo) = lower(?)",
    codigo,
  )
  if (!warehouse) throw new ApiError("Armazém não encontrado.")
  return warehouse.codigo
}

function eventActor(input) {
  const name = text(input?.actor)
  return name || "desconhecido"
}

async function logEvent(db, input, texto) {
  await db.run("INSERT INTO history (criado_em, actor, texto) VALUES (?, ?, ?)", 
    new Date().toISOString(),
    eventActor(input),
    texto,
  )
}

function boxIdsText(boxIds) {
  return idList(boxIds).join(", ")
}

export async function addProduct(db, input) {
  const codigo = text(input.codigo)
  const nome = text(input.nome)
  const unidade = text(input.unidade)
  if (!codigo && !nome) throw new ApiError("Informe o código e o nome.")
  if (!codigo) throw new ApiError("Informe o código.")
  if (!nome) throw new ApiError("Informe o nome.")
  return withTransaction(db, async (tx) => {
    const exists = await tx.get(
      "SELECT 1 AS ok FROM products WHERE lower(codigo) = lower(?)",
      codigo,
    )
    if (exists) throw new ApiError("Este código já existe.")
    await tx.run("INSERT INTO products (codigo, nome, unidade) VALUES (?, ?, ?)", codigo, nome, unidade)
    await logEvent(tx, input, `${eventActor(input)} cadastrou o produto ${codigo}.`)
    return readState(tx)
  })
}

export async function addLot(db, input) {
  const productCodigo = text(input.productCodigo)
  const numero = text(input.numero)
  const quantidade = positiveNumber(input.quantidade)
  const validade = text(input.validade)
  const caixas = wholeCount(input.caixas)
  if (!numero && quantidade === null) {
    throw new ApiError("Informe o número do lote e a quantidade.")
  }
  if (!numero) throw new ApiError("Informe o número do lote.")
  if (quantidade === null) throw new ApiError("Informe uma quantidade maior que zero.")
  if (caixas === null) throw new ApiError("Informe a quantidade de caixas.")

  return withTransaction(db, async (tx) => {
    const product = await tx.get("SELECT codigo FROM products WHERE codigo = ?", productCodigo)
    if (!product) throw new ApiError("Produto não encontrado.")
    const duplicate = await tx.get(
      "SELECT 1 AS ok FROM lots WHERE product_codigo = ? AND lower(numero) = lower(?)",
      product.codigo,
      numero,
    )
    if (duplicate) throw new ApiError("Este lote já foi recebido neste produto.")
    const ordemRow = await tx.get(
      "SELECT COALESCE(MAX(ordem), 0) + 1 AS next FROM lots WHERE product_codigo = ?",
      product.codigo,
    )
    const ordem = Number(ordemRow.next)
    const lot = await tx.run(
      "INSERT INTO lots (product_codigo, numero, quantidade, validade, ordem) VALUES (?, ?, ?, ?, ?)",
      product.codigo,
      numero,
      quantidade,
      validade,
      ordem,
    )
    const lotId = lot.lastInsertRowid
    const meta = await tx.get("SELECT value FROM meta WHERE key = 'next_box'")
    const nextBox = Number(meta.value)
    for (let index = 0; index < caixas; index += 1) {
      await tx.run(
        "INSERT INTO boxes (id, lot_id, idx, total) VALUES (?, ?, ?, ?)",
        formatBoxId(nextBox + index),
        lotId,
        index + 1,
        caixas,
      )
    }
    await tx.run("UPDATE meta SET value = ? WHERE key = 'next_box'", String(nextBox + caixas))
    await logEvent(
      tx,
      input,
      `${eventActor(input)} cadastrou o lote ${numero} do produto ${product.codigo}.`,
    )
    return readState(tx)
  })
}

const adminOnlyDelete = "Somente o ADM01 pode apagar."

export async function deleteProduct(db, input) {
  requireAdmin(input?.actor, adminOnlyDelete)
  const codigo = text(input.codigo)
  if (!codigo) throw new ApiError("Produto não encontrado.")
  return withTransaction(db, async (tx) => {
    const existing = await tx.get(
      "SELECT codigo FROM products WHERE lower(codigo) = lower(?)",
      codigo,
    )
    if (!existing) throw new ApiError("Produto não encontrado.")
    // Explicit child deletes: Turso transaction streams may not enforce CASCADE.
    await tx.run(
      "DELETE FROM boxes WHERE lot_id IN (SELECT id FROM lots WHERE product_codigo = ?)",
      existing.codigo,
    )
    await tx.run("DELETE FROM lots WHERE product_codigo = ?", existing.codigo)
    await tx.run("DELETE FROM products WHERE codigo = ?", existing.codigo)
    const still = await tx.get("SELECT 1 AS ok FROM products WHERE codigo = ?", existing.codigo)
    if (still) throw new ApiError("Não foi possível apagar o produto.")
    await logEvent(tx, input, `${eventActor(input)} apagou o produto ${existing.codigo}.`)
    return readState(tx)
  })
}

export async function deleteLot(db, input) {
  requireAdmin(input?.actor, adminOnlyDelete)
  const productCodigo = text(input.productCodigo)
  const numero = text(input.numero)
  if (!productCodigo || !numero) throw new ApiError("Lote não encontrado.")
  return withTransaction(db, async (tx) => {
    const existing = await tx.get(
      "SELECT id, product_codigo, numero FROM lots WHERE product_codigo = ? AND lower(numero) = lower(?)",
      productCodigo,
      numero,
    )
    if (!existing) throw new ApiError("Lote não encontrado.")
    await tx.run("DELETE FROM boxes WHERE lot_id = ?", existing.id)
    await tx.run("DELETE FROM lots WHERE id = ?", existing.id)
    const still = await tx.get("SELECT 1 AS ok FROM lots WHERE id = ?", existing.id)
    if (still) throw new ApiError("Não foi possível apagar o lote.")
    await logEvent(
      tx,
      input,
      `${eventActor(input)} apagou o lote ${existing.numero} do produto ${existing.product_codigo}.`,
    )
    return readState(tx)
  })
}

async function clearBoxesInWarehouse(db, armazemCodigo) {
  await db.run(
    "UPDATE boxes SET posicao = NULL, armazem_codigo = NULL WHERE lower(armazem_codigo) = lower(?)",
    armazemCodigo,
  )
}

async function clearBoxesAtPositions(db, armazemCodigo, positionCodes) {
  for (const codigo of positionCodes) {
    await db.run(
      `UPDATE boxes
       SET posicao = NULL, armazem_codigo = NULL
       WHERE lower(armazem_codigo) = lower(?) AND lower(posicao) = lower(?)`,
      armazemCodigo,
      codigo,
    )
  }
}

async function warehouseByCode(db, codigo) {
  return db.get("SELECT codigo FROM warehouses WHERE lower(codigo) = lower(?)", codigo)
}

export async function deleteWarehouse(db, input) {
  requireAdmin(input?.actor, adminOnlyDelete)
  const codigo = text(input.codigo)
  if (!codigo) throw new ApiError("Armazém não encontrado.")
  return withTransaction(db, async (tx) => {
    const warehouse = await warehouseByCode(tx, codigo)
    if (!warehouse) throw new ApiError("Armazém não encontrado.")
    await clearBoxesInWarehouse(tx, warehouse.codigo)
    await tx.run(
      `DELETE FROM positions WHERE shelf_id IN (
         SELECT id FROM shelves WHERE warehouse_codigo = ?
       )`,
      warehouse.codigo,
    )
    await tx.run("DELETE FROM shelves WHERE warehouse_codigo = ?", warehouse.codigo)
    await tx.run("DELETE FROM warehouses WHERE codigo = ?", warehouse.codigo)
    const still = await tx.get("SELECT 1 AS ok FROM warehouses WHERE codigo = ?", warehouse.codigo)
    if (still) throw new ApiError("Não foi possível apagar o armazém.")
    await logEvent(tx, input, `${eventActor(input)} apagou o armazém ${warehouse.codigo}.`)
    return readState(tx)
  })
}

export async function deleteShelf(db, input) {
  requireAdmin(input?.actor, adminOnlyDelete)
  const armazemCodigo = text(input.armazemCodigo)
  const prateleira = text(input.prateleira)
  if (!armazemCodigo || !prateleira) throw new ApiError("Prateleira não encontrada.")
  return withTransaction(db, async (tx) => {
    const warehouse = await warehouseByCode(tx, armazemCodigo)
    const shelf = warehouse
      ? await tx.get(
          "SELECT id FROM shelves WHERE warehouse_codigo = ? AND lower(codigo) = lower(?)",
          warehouse.codigo,
          prateleira,
        )
      : undefined
    if (!shelf) throw new ApiError("Prateleira não encontrada.")
    const positions = await tx.all("SELECT codigo FROM positions WHERE shelf_id = ?", shelf.id)
    await clearBoxesAtPositions(
      tx,
      warehouse.codigo,
      positions.map((position) => position.codigo),
    )
    await tx.run("DELETE FROM positions WHERE shelf_id = ?", shelf.id)
    await tx.run("DELETE FROM shelves WHERE id = ?", shelf.id)
    const still = await tx.get("SELECT 1 AS ok FROM shelves WHERE id = ?", shelf.id)
    if (still) throw new ApiError("Não foi possível apagar a prateleira.")
    await logEvent(
      tx,
      input,
      `${eventActor(input)} apagou a prateleira ${prateleira} do armazém ${warehouse.codigo}.`,
    )
    return readState(tx)
  })
}

export async function deletePosition(db, input) {
  requireAdmin(input?.actor, adminOnlyDelete)
  const armazemCodigo = text(input.armazemCodigo)
  const codigo = text(input.codigo)
  if (!armazemCodigo || !codigo) throw new ApiError("Posição não encontrada.")
  return withTransaction(db, async (tx) => {
    const warehouse = await warehouseByCode(tx, armazemCodigo)
    const position = warehouse
      ? await tx.get(
          `SELECT positions.id, positions.codigo
           FROM positions
           JOIN shelves ON shelves.id = positions.shelf_id
           WHERE shelves.warehouse_codigo = ? AND lower(positions.codigo) = lower(?)`,
          warehouse.codigo,
          codigo,
        )
      : undefined
    if (!position) throw new ApiError("Posição não encontrada.")
    await clearBoxesAtPositions(tx, warehouse.codigo, [position.codigo])
    await tx.run("DELETE FROM positions WHERE id = ?", position.id)
    const still = await tx.get("SELECT 1 AS ok FROM positions WHERE id = ?", position.id)
    if (still) throw new ApiError("Não foi possível apagar a posição.")
    await logEvent(
      tx,
      input,
      `${eventActor(input)} apagou a posição ${position.codigo} do armazém ${warehouse.codigo}.`,
    )
    return readState(tx)
  })
}

async function updateBoxes(tx, boxIds, apply) {
  const ids = idList(boxIds)
  if (ids.length === 0) throw new ApiError("Adicione ao menos uma caixa.")
  for (const id of ids) {
    const box = await tx.get("SELECT id FROM boxes WHERE lower(id) = lower(?)", id)
    if (!box) throw new ApiError("Caixa não encontrada.")
    await apply(box.id)
  }
}

export async function setPositions(db, input) {
  const posicao = text(input.posicao)
  const armazemCodigo = text(input.armazemCodigo)
  if (!posicao) throw new ApiError("Informe a posição.")
  return withTransaction(db, async (tx) => {
    const warehouse = armazemCodigo ? await requireWarehouse(tx, armazemCodigo) : null
    await updateBoxes(tx, input.boxIds, (id) =>
      tx.run(
        "UPDATE boxes SET posicao = ?, armazem_codigo = ?, coletada = 0, expedida = 0, nota_fiscal = '' WHERE id = ?",
        posicao,
        warehouse,
        id,
      ),
    )
    const place = warehouse ? `${posicao} do armazém ${warehouse}` : posicao
    await logEvent(
      tx,
      input,
      `${eventActor(input)} registrou as caixas ${boxIdsText(input.boxIds)} na posição ${place}.`,
    )
    return readState(tx)
  })
}

export async function collectBoxes(db, input) {
  return withTransaction(db, async (tx) => {
    await updateBoxes(tx, input.boxIds, async (id) => {
      const eligible = await tx.get(
        "SELECT id FROM boxes WHERE id = ? AND expedida = 0 AND posicao IS NOT NULL AND coletada = 0",
        id,
      )
      if (!eligible) throw new ApiError("Caixa não encontrada.")
      await tx.run(
        "UPDATE boxes SET coletada = 1, posicao = NULL, armazem_codigo = NULL WHERE id = ?",
        id,
      )
    })
    await logEvent(tx, input, `${eventActor(input)} coletou as caixas ${boxIdsText(input.boxIds)}.`)
    return readState(tx)
  })
}

export async function shipBoxes(db, input) {
  const notaFiscal = text(input.notaFiscal)
  const quantidade = wholeCount(input.quantidade)
  const ids = idList(input.boxIds)
  if (!notaFiscal) throw new ApiError("Informe a nota fiscal.")
  if (quantidade === null) throw new ApiError("Informe a quantidade de caixas.")
  if (ids.length === 0) throw new ApiError("Adicione ao menos uma caixa.")
  if (quantidade !== ids.length) {
    throw new ApiError("A quantidade de caixas não confere com a lista.")
  }
  return withTransaction(db, async (tx) => {
    await updateBoxes(tx, ids, async (id) => {
      const eligible = await tx.get(
        `SELECT id FROM boxes
         WHERE id = ? AND expedida = 0
           AND (
             coletada = 1
             OR (posicao IS NOT NULL AND posicao != '')
             OR (nota_fiscal IS NOT NULL AND nota_fiscal != '')
           )`,
        id,
      )
      if (!eligible) throw new ApiError("Caixa não encontrada.")
      await tx.run(
        `UPDATE boxes
         SET expedida = 1, coletada = 1, posicao = '', armazem_codigo = NULL,
             nota_fiscal = ?, enviada_em = ?
         WHERE id = ?`,
        notaFiscal,
        new Date().toISOString(),
        id,
      )
    })
    await upsertNotaFiscal(tx, {
      notaFiscal,
      posicao: "",
      quantidade: ids.length,
      actor: eventActor(input),
    })
    await logEvent(
      tx,
      input,
      `${eventActor(input)} enviou as caixas ${boxIdsText(ids)} na nota fiscal ${notaFiscal}.`,
    )
    return readState(tx)
  })
}

export async function registerNotaFiscal(db, input) {
  const notaFiscal = text(input.notaFiscal)
  const posicao = text(input.posicao)
  const quantidade = wholeCount(input.quantidade) ?? 0
  if (!notaFiscal) throw new ApiError("Informe a nota fiscal.")
  return withTransaction(db, async (tx) => {
    await upsertNotaFiscal(tx, {
      notaFiscal,
      posicao,
      quantidade,
      actor: eventActor(input),
    })
    return lookupNotaFiscal(tx, { notaFiscal })
  })
}

export async function allocateBoxes(db, input) {
  const notaFiscal = text(input.notaFiscal)
  const quantidade = wholeCount(input.quantidade)
  const posicao = text(input.posicao)
  const armazemCodigo = text(input.armazemCodigo)
  const now = new Date()
  const cidade = text(input.cidade)
  if (!notaFiscal) throw new ApiError("Informe a nota fiscal.")
  if (!posicao) throw new ApiError("Informe a posição.")
  const prazo = prazoDeEnvio(cidade, now)
  if (quantidade === null || quantidade < 1) {
    throw new ApiError("Informe a quantidade de caixas.")
  }
  return withTransaction(db, async (tx) => {
    const warehouse = armazemCodigo ? await requireWarehouse(tx, armazemCodigo) : null
    const productCodigo = `NF-${normalizeNotaFiscal(notaFiscal)}`.slice(0, 48) || "NF"
    const productNome = `Nota ${notaFiscal}`
    const existingProduct = await tx.get(
      "SELECT codigo FROM products WHERE lower(codigo) = lower(?)",
      productCodigo,
    )
    if (!existingProduct) {
      await tx.run(
        "INSERT INTO products (codigo, nome, unidade) VALUES (?, ?, ?)",
        productCodigo,
        productNome,
        "CX",
      )
    }
    let lotNumero = notaFiscal
    let suffix = 2
    while (
      await tx.get(
        "SELECT 1 AS ok FROM lots WHERE product_codigo = ? AND lower(numero) = lower(?)",
        productCodigo,
        lotNumero,
      )
    ) {
      lotNumero = `${notaFiscal}-${suffix}`
      suffix += 1
    }
    const ordemRow = await tx.get(
      "SELECT COALESCE(MAX(ordem), 0) + 1 AS next FROM lots WHERE product_codigo = ?",
      productCodigo,
    )
    const lot = await tx.run(
      "INSERT INTO lots (product_codigo, numero, quantidade, validade, ordem) VALUES (?, ?, ?, ?, ?)",
      productCodigo,
      lotNumero,
      quantidade,
      "",
      Number(ordemRow.next),
    )
    const lotId = lot.lastInsertRowid
    const meta = await tx.get("SELECT value FROM meta WHERE key = 'next_box'")
    const nextBox = Number(meta.value)
    const ids = []
    for (let index = 0; index < quantidade; index += 1) {
      const id = formatBoxId(nextBox + index)
      ids.push(id)
      await tx.run(
        `INSERT INTO boxes
         (id, lot_id, idx, total, posicao, armazem_codigo, coletada, expedida, nota_fiscal,
          alocada_em, enviada_em, prazo, cidade)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, '', ?, ?)`,
        id,
        lotId,
        index + 1,
        quantidade,
        posicao,
        warehouse,
        notaFiscal,
        now.toISOString(),
        prazo,
        cidade,
      )
    }
    await tx.run("UPDATE meta SET value = ? WHERE key = 'next_box'", String(nextBox + quantidade))
    await upsertNotaFiscal(tx, {
      notaFiscal,
      posicao,
      quantidade,
      actor: eventActor(input),
    })
    const place = warehouse ? `${posicao} do armazém ${warehouse}` : posicao
    await logEvent(
      tx,
      input,
      `${eventActor(input)} recebeu e alocou as caixas ${boxIdsText(ids)} na nota fiscal ${notaFiscal} na posição ${place} para ${cidade || "sem cidade"} com prazo ${prazo}.`,
    )
    return readState(tx)
  })
}

export async function reallocateBoxes(db, input) {
  const notaFiscal = text(input.notaFiscal)
  const posicao = text(input.posicao)
  const armazemCodigo = text(input.armazemCodigo)
  if (!notaFiscal) throw new ApiError("Informe a nota fiscal.")
  if (!posicao) throw new ApiError("Informe a nova posição.")
  const normalized = normalizeNotaFiscal(notaFiscal)
  return withTransaction(db, async (tx) => {
    const warehouse = armazemCodigo ? await requireWarehouse(tx, armazemCodigo) : null
    const rows = await tx.all(
      `SELECT id, nota_fiscal, expedida
       FROM boxes
       WHERE nota_fiscal IS NOT NULL AND nota_fiscal != ''`,
    )
    const matches = rows.filter(
      (box) =>
        Number(box.expedida) !== 1 &&
        notaFiscalMatches(box.nota_fiscal, notaFiscal, normalized),
    )
    if (matches.length === 0) {
      throw new ApiError("Nenhuma caixa ativa encontrada para esta nota fiscal.")
    }
    const ids = matches.map((box) => box.id)
    for (const id of ids) {
      await tx.run(
        `UPDATE boxes
         SET posicao = ?, armazem_codigo = ?, coletada = 0
         WHERE id = ?`,
        posicao,
        warehouse,
        id,
      )
    }
    await upsertNotaFiscal(tx, {
      notaFiscal: matches[0].nota_fiscal || notaFiscal,
      posicao,
      quantidade: ids.length,
      actor: eventActor(input),
    })
    const place = warehouse ? `${posicao} do armazém ${warehouse}` : posicao
    await logEvent(
      tx,
      input,
      `${eventActor(input)} realocou as caixas ${boxIdsText(ids)} da nota fiscal ${notaFiscal} para a posição ${place}.`,
    )
    return readState(tx)
  })
}

/** Desfaz o envio e reagenda o prazo para a próxima rota da cidade. */
export async function returnNotaFiscal(db, input) {
  const notaFiscal = text(input.notaFiscal)
  const cidadeInformada = text(input.cidade)
  const observacao = text(input.observacao)
  if (!notaFiscal) throw new ApiError("Informe a nota fiscal.")
  if (!observacao) throw new ApiError("Informe o motivo do retorno.")
  const normalized = normalizeNotaFiscal(notaFiscal)
  const now = new Date()
  return withTransaction(db, async (tx) => {
    const rows = await tx.all(
      `SELECT id, nota_fiscal, expedida, cidade, posicao
       FROM boxes
       WHERE nota_fiscal IS NOT NULL AND nota_fiscal != ''`,
    )
    const related = rows.filter((box) =>
      notaFiscalMatches(box.nota_fiscal, notaFiscal, normalized),
    )
    if (related.length === 0) {
      throw new ApiError("Nota fiscal não encontrada.")
    }
    const shipped = related.filter((box) => Number(box.expedida) === 1)
    if (shipped.length === 0) {
      throw new ApiError("Esta nota fiscal não está enviada.")
    }
    const cidadeGravada = shipped
      .map((box) => text(box.cidade))
      .find((value) => Boolean(value))
    const cidade = cidadeInformada || cidadeGravada || ""
    if (!cidade) {
      throw new ApiError("Informe a cidade da rota para reagendar o prazo.")
    }
    const prazo = prazoDeEnvio(cidade, now)
    const ids = shipped.map((box) => box.id)
    const alocadaEm = now.toISOString()
    for (const id of ids) {
      await tx.run(
        `UPDATE boxes
         SET expedida = 0, enviada_em = '', coletada = 0,
             cidade = ?, prazo = ?, alocada_em = ?
         WHERE id = ?`,
        cidade,
        prazo,
        alocadaEm,
        id,
      )
    }
    const nfKey = shipped[0].nota_fiscal || notaFiscal
    await upsertNotaFiscal(tx, {
      notaFiscal: nfKey,
      posicao: text(shipped[0].posicao),
      quantidade: ids.length,
      actor: eventActor(input),
    })
    await tx.run(
      `UPDATE notas_fiscais
       SET observacao_retorno = ?
       WHERE lower(nota_fiscal) = lower(?)`,
      observacao,
      nfKey,
    )
    await logEvent(
      tx,
      input,
      `${eventActor(input)} retornou a nota fiscal ${notaFiscal} ao sistema (${ids.length === 1 ? "1 caixa" : `${ids.length} caixas`}) para ${cidade} com prazo ${prazo}. Motivo: ${observacao}.`,
    )
    return readState(tx)
  })
}

async function upsertNotaFiscal(db, { notaFiscal, posicao, quantidade, actor }) {
  const now = new Date().toISOString()
  const normalized = normalizeNotaFiscal(notaFiscal)
  const rows = await db.all(
    "SELECT nota_fiscal FROM notas_fiscais ORDER BY criado_em DESC",
  )
  const existing =
    rows.find((row) => normalizeNotaFiscal(row.nota_fiscal) === normalized) ||
    rows.find((row) => String(row.nota_fiscal || "").toLowerCase() === notaFiscal.toLowerCase()) ||
    null
  if (existing) {
    await db.run(
      `UPDATE notas_fiscais
       SET nota_fiscal = ?, posicao = ?, quantidade = ?, criado_em = ?, actor = ?
       WHERE lower(nota_fiscal) = lower(?)`,
      notaFiscal,
      posicao || "",
      quantidade,
      now,
      actor || "desconhecido",
      existing.nota_fiscal,
    )
    return
  }
  await db.run(
    `INSERT INTO notas_fiscais (nota_fiscal, posicao, quantidade, criado_em, actor)
     VALUES (?, ?, ?, ?, ?)`,
    notaFiscal,
    posicao || "",
    quantidade,
    now,
    actor || "desconhecido",
  )
}

export async function addWarehouse(db, input) {
  const codigo = text(input.codigo)
  const nome = text(input.nome)
  if (!codigo && !nome) throw new ApiError("Informe o código e o nome.")
  if (!codigo) throw new ApiError("Informe o código.")
  if (!nome) throw new ApiError("Informe o nome.")
  return withTransaction(db, async (tx) => {
    const exists = await tx.get(
      "SELECT 1 AS ok FROM warehouses WHERE lower(codigo) = lower(?)",
      codigo,
    )
    if (exists) throw new ApiError("Este código já existe.")
    await tx.run("INSERT INTO warehouses (codigo, nome) VALUES (?, ?)", codigo, nome)
    await logEvent(tx, input, `${eventActor(input)} cadastrou o armazém ${codigo}.`)
    return readState(tx)
  })
}

async function insertPositions(db, shelfId, prateleira, start, quantidade) {
  for (let offset = 0; offset < quantidade; offset += 1) {
    const numero = start + offset
    await db.run(
      "INSERT INTO positions (shelf_id, numero, codigo) VALUES (?, ?, ?)",
      shelfId,
      numero,
      positionCode(prateleira, numero),
    )
  }
}

export async function addShelf(db, input) {
  const armazemCodigo = text(input.armazemCodigo)
  const prateleira = text(input.prateleira)
  const quantidade = wholeCount(input.quantidade)
  if (!prateleira && quantidade === null) {
    throw new ApiError("Informe a prateleira e a quantidade de posições.")
  }
  if (!prateleira) throw new ApiError("Informe a prateleira.")
  if (quantidade === null) throw new ApiError("Informe a quantidade de posições.")
  return withTransaction(db, async (tx) => {
    const warehouse = await requireWarehouse(tx, armazemCodigo)
    const exists = await tx.get(
      "SELECT 1 AS ok FROM shelves WHERE warehouse_codigo = ? AND lower(codigo) = lower(?)",
      warehouse,
      prateleira,
    )
    if (exists) throw new ApiError("Esta prateleira já existe.")
    const shelf = await tx.run(
      "INSERT INTO shelves (warehouse_codigo, codigo) VALUES (?, ?)",
      warehouse,
      prateleira,
    )
    await insertPositions(tx, shelf.lastInsertRowid, prateleira, 1, quantidade)
    await logEvent(
      tx,
      input,
      `${eventActor(input)} cadastrou a prateleira ${prateleira} no armazém ${warehouse}.`,
    )
    return readState(tx)
  })
}

export async function addShelfPositions(db, input) {
  const armazemCodigo = text(input.armazemCodigo)
  const prateleira = text(input.prateleira)
  const quantidade = wholeCount(input.quantidade)
  if (quantidade === null) throw new ApiError("Informe a quantidade de posições.")
  return withTransaction(db, async (tx) => {
    const warehouse = await requireWarehouse(tx, armazemCodigo)
    const shelf = await tx.get(
      "SELECT id, codigo FROM shelves WHERE warehouse_codigo = ? AND lower(codigo) = lower(?)",
      warehouse,
      prateleira,
    )
    if (!shelf) throw new ApiError("Prateleira não encontrada.")
    const lastRow = await tx.get(
      "SELECT COALESCE(MAX(numero), 0) AS last FROM positions WHERE shelf_id = ?",
      shelf.id,
    )
    await insertPositions(tx, shelf.id, shelf.codigo, Number(lastRow.last) + 1, quantidade)
    await logEvent(
      tx,
      input,
      `${eventActor(input)} adicionou ${quantidade} posições na prateleira ${shelf.codigo} do armazém ${warehouse}.`,
    )
    return readState(tx)
  })
}

function hashPassword(senha) {
  const salt = randomBytes(16).toString("hex")
  const hash = scryptSync(senha, salt, 32).toString("hex")
  return { salt, hash }
}

function passwordMatches(senha, salt, hash) {
  const next = scryptSync(senha, salt, 32)
  const current = Buffer.from(hash, "hex")
  if (next.length !== current.length) return false
  return timingSafeEqual(next, current)
}

async function ensureUserColumns(db) {
  const columns = new Set(
    (await db.all("PRAGMA table_info(users)")).map((column) => column.name),
  )
  for (const area of areas) {
    if (!columns.has(area)) {
      await db.raw.execute(
        `ALTER TABLE users ADD COLUMN ${area} INTEGER NOT NULL DEFAULT 0`,
      )
    }
  }
}

async function ensureBoxColumns(db) {
  const columns = new Set(
    (await db.all("PRAGMA table_info(boxes)")).map((column) => column.name),
  )
  const extras = [
    ["nota_fiscal", "TEXT NOT NULL DEFAULT ''"],
    ["alocada_em", "TEXT NOT NULL DEFAULT ''"],
    ["enviada_em", "TEXT NOT NULL DEFAULT ''"],
    ["prazo", "TEXT NOT NULL DEFAULT ''"],
    ["cidade", "TEXT NOT NULL DEFAULT ''"],
  ]
  for (const [name, definition] of extras) {
    if (!columns.has(name)) {
      await db.raw.execute(`ALTER TABLE boxes ADD COLUMN ${name} ${definition}`)
    }
  }
  await backfillBoxTimes(db)
}

async function ensureNotaFiscalColumns(db) {
  const columns = new Set(
    (await db.all("PRAGMA table_info(notas_fiscais)")).map((column) => column.name),
  )
  if (!columns.has("observacao_retorno")) {
    await db.raw.execute(
      "ALTER TABLE notas_fiscais ADD COLUMN observacao_retorno TEXT NOT NULL DEFAULT ''",
    )
  }
}

async function backfillBoxTimes(db) {
  const done = await db.get("SELECT value FROM meta WHERE key = 'box_times_backfill'")
  if (done?.value === "1") return
  const events = await db.all("SELECT criado_em, texto FROM history ORDER BY id")
  for (const event of events) {
    const ids = String(event.texto || "").match(/CX-\d+/gi) ?? []
    if (ids.length === 0) continue
    const lower = String(event.texto).toLowerCase()
    const day = dateOnly(event.criado_em)
    const shipped = lower.includes("enviou") || lower.includes("expediu")
    const allocated = lower.includes("alocou")
    for (const id of ids) {
      if (allocated) {
        await db.run(
          `UPDATE boxes
           SET alocada_em = CASE WHEN alocada_em = '' THEN ? ELSE alocada_em END,
               prazo = CASE WHEN prazo = '' THEN ? ELSE prazo END
           WHERE upper(id) = ?`,
          event.criado_em,
          day,
          id.toUpperCase(),
        )
      }
      if (shipped) {
        await db.run(
          `UPDATE boxes
           SET enviada_em = CASE WHEN enviada_em = '' THEN ? ELSE enviada_em END
           WHERE upper(id) = ?`,
          event.criado_em,
          id.toUpperCase(),
        )
      }
    }
  }
  await db.run(
    "INSERT INTO meta (key, value) VALUES ('box_times_backfill', '1') ON CONFLICT(key) DO UPDATE SET value = '1'",
  )
}

function dateOnly(value) {
  const raw = text(value)
  if (!raw) return ""
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  if (match) return match[1]
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const MAX_CIDADES_POR_ROTA = 5

const DEFAULT_ROTA_SEED = [
  ["Barueri", [1, 3]],
  ["Campinas", [1, 3]],
  ["Guarulhos", [1, 3]],
  ["Indaiatuba", [1, 3]],
  ["Itapevi", [1, 3]],
  ["Araraquara", [2, 4]],
  ["Cabreúva", [2, 4]],
  ["Capivari", [2, 4]],
  ["Elias Fausto", [2, 4]],
  ["Itupeva", [2, 4]],
  ["Araçoiaba da Serra", [5]],
  ["Bofete", [5]],
  ["Boituva", [5]],
  ["Botucatu", [5]],
  ["Capela do Alto", [5]],
]

/** Runtime map cidade(lower) -> dias — synced from rota_cidades */
let cidadeDias = Object.fromEntries(
  DEFAULT_ROTA_SEED.map(([cidade, dias]) => [cidade.toLowerCase(), dias]),
)

async function seedRotaCidades(tx) {
  const existing = await tx.get("SELECT COUNT(*) AS total FROM rota_cidades")
  if (Number(existing?.total) > 0) return
  for (const [cidade, dias] of DEFAULT_ROTA_SEED) {
    await tx.run(
      "INSERT INTO rota_cidades (cidade, dias) VALUES (?, ?)",
      cidade,
      JSON.stringify(dias),
    )
  }
}

/** Migra para o modelo de 5 rotas × até 5 cidades (reaplica o seed limitado). */
async function migrateRotasLimitadas(tx) {
  const flag = await tx.get("SELECT value FROM meta WHERE key = 'rota_limit_v3'")
  if (flag?.value === "1") return
  await tx.run("DELETE FROM rota_cidades")
  for (const [cidade, dias] of DEFAULT_ROTA_SEED) {
    await tx.run(
      "INSERT INTO rota_cidades (cidade, dias) VALUES (?, ?)",
      cidade,
      JSON.stringify(dias),
    )
  }
  await tx.run(
    "INSERT INTO meta (key, value) VALUES ('rota_limit_v3', '1') ON CONFLICT(key) DO UPDATE SET value = '1'",
  )
}

async function seedRotaMotoristas(tx) {
  for (const rota of [1, 2, 3, 4, 5]) {
    await tx.run(
      `INSERT INTO rota_motoristas (rota, motorista, motorista_nome, confirmada, confirmada_em)
       VALUES (?, '', '', 0, '')
       ON CONFLICT(rota) DO NOTHING`,
      rota,
    )
  }
}

/** Mantém no máximo 5 cidades por rota (dia 1–5). */
async function enforceMaxCidadesPorRota(db) {
  const rows = await db.all("SELECT cidade, dias FROM rota_cidades")
  const byDay = { 1: [], 2: [], 3: [], 4: [], 5: [] }
  for (const row of rows) {
    const cidade = String(row.cidade || "").trim()
    if (!cidade) continue
    for (const rawDia of parseDias(row.dias)) {
      const dia = Number(rawDia)
      if (!byDay[dia]) continue
      byDay[dia].push(cidade)
    }
  }

  const remove = new Map()
  for (const dia of [1, 2, 3, 4, 5]) {
    const sorted = [...new Set(byDay[dia])].sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    )
    for (const cidade of sorted.slice(MAX_CIDADES_POR_ROTA)) {
      const key = cidade.toLowerCase()
      const dias = remove.get(key) ?? new Set()
      dias.add(dia)
      remove.set(key, dias)
    }
  }
  if (remove.size === 0) return

  await withTransaction(db, async (tx) => {
    for (const [key, diasRemover] of remove) {
      const row = await tx.get(
        "SELECT cidade, dias FROM rota_cidades WHERE lower(cidade) = lower(?)",
        key,
      )
      if (!row) continue
      const dias = parseDias(row.dias).filter((dia) => !diasRemover.has(Number(dia)))
      if (dias.length === 0) {
        await tx.run("DELETE FROM rota_cidades WHERE lower(cidade) = lower(?)", key)
      } else {
        await tx.run(
          "UPDATE rota_cidades SET dias = ? WHERE lower(cidade) = lower(?)",
          JSON.stringify(dias),
          key,
        )
      }
    }
  })
}

async function refreshCidadeDias(db) {
  const rows = await db.all("SELECT cidade, dias FROM rota_cidades ORDER BY cidade")
  const next = {}
  for (const row of rows) {
    const dias = parseDias(row.dias)
    if (dias.length === 0) continue
    next[String(row.cidade || "").trim().toLowerCase()] = dias
  }
  cidadeDias = next
}

async function countCidadesNaRota(db, dia, exceptCidade = "") {
  const rows = await db.all("SELECT cidade, dias FROM rota_cidades")
  const except = String(exceptCidade || "").trim().toLowerCase()
  let total = 0
  for (const row of rows) {
    const cidade = String(row.cidade || "").trim()
    if (!cidade) continue
    if (except && cidade.toLowerCase() === except) continue
    if (parseDias(row.dias).includes(dia)) total += 1
  }
  return total
}

function parseDias(raw) {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw
    if (!Array.isArray(value)) return []
    return value
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6)
  } catch {
    return []
  }
}

function normalizeDias(input) {
  const list = Array.isArray(input) ? input : []
  const dias = [
    ...new Set(
      list
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item >= 1 && item <= 5),
    ),
  ].sort((a, b) => a - b)
  return dias
}

const ROTA_META = {
  1: { titulo: "Rota 1", diaSemana: "Segunda-feira" },
  2: { titulo: "Rota 2", diaSemana: "Terça-feira" },
  3: { titulo: "Rota 3", diaSemana: "Quarta-feira" },
  4: { titulo: "Rota 4", diaSemana: "Quinta-feira" },
  5: { titulo: "Rota 5", diaSemana: "Sexta-feira" },
}

async function loadRotaMotoristas(db) {
  const rows = await db.all(
    `SELECT rota, motorista, motorista_nome, confirmada, confirmada_em
     FROM rota_motoristas
     ORDER BY rota`,
  )
  const byRota = new Map(
    rows.map((row) => [
      Number(row.rota),
      {
        motorista: String(row.motorista || "").trim(),
        motoristaNome: String(row.motorista_nome || "").trim(),
        confirmada: Number(row.confirmada) === 1,
        confirmadaEm: String(row.confirmada_em || "").trim(),
      },
    ]),
  )
  return byRota
}

export async function listRoutes(db) {
  await refreshCidadeDias(db)
  const rows = await db.all("SELECT cidade, dias FROM rota_cidades ORDER BY cidade")
  const cidades = rows
    .map((row) => ({
      cidade: String(row.cidade || "").trim(),
      dias: parseDias(row.dias),
    }))
    .filter((item) => item.cidade && item.dias.length > 0)
    .sort((a, b) => a.cidade.localeCompare(b.cidade, "pt-BR"))

  const motoristas = await loadRotaMotoristas(db)
  const rotas = [1, 2, 3, 4, 5].map((dia) => {
    const motorista = motoristas.get(dia) ?? {
      motorista: "",
      motoristaNome: "",
      confirmada: false,
      confirmadaEm: "",
    }
    return {
      id: `rota${dia}`,
      titulo: ROTA_META[dia].titulo,
      diaSemana: ROTA_META[dia].diaSemana,
      dias: [dia],
      cidades: cidades
        .filter((item) => item.dias.includes(dia))
        .map((item) => item.cidade)
        .sort((a, b) => a.localeCompare(b, "pt-BR"))
        .slice(0, MAX_CIDADES_POR_ROTA),
      motorista: motorista.motorista,
      motoristaNome: motorista.motoristaNome,
      confirmada: motorista.confirmada,
      confirmadaEm: motorista.confirmadaEm,
    }
  })

  return { cidades, rotas }
}

export async function listRouteDrivers(db) {
  const users = await db.all(
    `SELECT nome, usuario, recebimento, estoque, armazem, coleta, expedicao
     FROM users
     ORDER BY rowid`,
  )
  return {
    drivers: users
      .filter((user) => {
        const flags = areaFlags(user)
        return flags.expedicao || isAdmin(user.usuario)
      })
      .map((user) => ({
        nome: user.nome,
        usuario: user.usuario,
      })),
  }
}

export async function setRouteDriver(db, input) {
  const rota = Number(input.rota)
  const motorista = text(input.motorista)
  if (!Number.isInteger(rota) || rota < 1 || rota > 5) {
    throw new ApiError("Informe uma rota válida.")
  }
  if (!motorista) throw new ApiError("Selecione o motorista.")

  const user = await db.get(
    "SELECT nome, usuario, expedicao FROM users WHERE lower(usuario) = lower(?)",
    motorista,
  )
  if (!user) throw new ApiError("Motorista não encontrado.")
  if (!isAdmin(user.usuario) && !enabled(user.expedicao)) {
    throw new ApiError("O usuário precisa ter acesso à Expedição.")
  }

  await withTransaction(db, async (tx) => {
    await tx.run(
      `INSERT INTO rota_motoristas (rota, motorista, motorista_nome, confirmada, confirmada_em)
       VALUES (?, ?, ?, 0, '')
       ON CONFLICT(rota) DO UPDATE SET
         motorista = excluded.motorista,
         motorista_nome = excluded.motorista_nome,
         confirmada = 0,
         confirmada_em = ''`,
      rota,
      user.usuario,
      user.nome,
    )
    await logEvent(
      tx,
      input,
      `${eventActor(input)} definiu ${user.nome} (${user.usuario}) como motorista da ${ROTA_META[rota].titulo}.`,
    )
  })
  return listRoutes(db)
}

export async function confirmRoute(db, input) {
  const rota = Number(input.rota)
  if (!Number.isInteger(rota) || rota < 1 || rota > 5) {
    throw new ApiError("Informe uma rota válida.")
  }

  const row = await db.get(
    "SELECT rota, motorista, motorista_nome FROM rota_motoristas WHERE rota = ?",
    rota,
  )
  const motorista = text(row?.motorista)
  if (!motorista) {
    throw new ApiError("Selecione o motorista antes de confirmar a rota.")
  }

  const cidadesNaRota = await countCidadesNaRota(db, rota)
  if (cidadesNaRota === 0) {
    throw new ApiError("Adicione ao menos uma cidade antes de confirmar a rota.")
  }

  const agora = new Date().toISOString()
  await withTransaction(db, async (tx) => {
    await tx.run(
      `UPDATE rota_motoristas
       SET confirmada = 1, confirmada_em = ?
       WHERE rota = ?`,
      agora,
      rota,
    )
    await logEvent(
      tx,
      input,
      `${eventActor(input)} confirmou a ${ROTA_META[rota].titulo} para o motorista ${row.motorista_nome || motorista}.`,
    )
  })
  return listRoutes(db)
}

export async function listMyRoutes(db, actor) {
  const usuario = text(actor)
  if (!usuario) throw new ApiError("Informe o usuário.")
  const { rotas } = await listRoutes(db)
  return {
    rotas: rotas.filter(
      (rota) =>
        rota.confirmada &&
        String(rota.motorista || "").toLowerCase() === usuario.toLowerCase(),
    ),
  }
}

async function boxesAtPosition(db, posicao, armazemCodigo) {
  const position = text(posicao)
  if (!position) throw new ApiError("Informe a posição.")
  const warehouse = text(armazemCodigo)
  const rows = await db.all(
    `SELECT b.id, b.nota_fiscal, b.posicao, b.armazem_codigo, b.cidade, b.prazo, b.expedida
     FROM boxes b
     WHERE b.expedida = 0
       AND b.posicao IS NOT NULL AND b.posicao != ''
       AND lower(b.posicao) = lower(?)
       AND b.nota_fiscal IS NOT NULL AND b.nota_fiscal != ''
     ORDER BY b.nota_fiscal, b.id`,
    position,
  )
  if (!warehouse) return rows
  return rows.filter(
    (box) =>
      !box.armazem_codigo ||
      String(box.armazem_codigo).toLowerCase() === warehouse.toLowerCase(),
  )
}

export async function listPositionNotes(db, input) {
  const posicao = text(input.posicao)
  const armazemCodigo = text(input.armazemCodigo)
  const rows = await boxesAtPosition(db, posicao, armazemCodigo)
  const byNota = new Map()
  for (const box of rows) {
    const notaFiscal = String(box.nota_fiscal || "").trim()
    if (!notaFiscal) continue
    const key = normalizeNotaFiscal(notaFiscal) || notaFiscal.toLowerCase()
    let group = byNota.get(key)
    if (!group) {
      group = {
        notaFiscal,
        quantidade: 0,
        boxIds: [],
        cidade: text(box.cidade) || "",
        prazo: text(box.prazo) || "",
      }
      byNota.set(key, group)
    }
    group.quantidade += 1
    group.boxIds.push(box.id)
    if (!group.cidade && box.cidade) group.cidade = text(box.cidade)
    if (!group.prazo && box.prazo) group.prazo = text(box.prazo)
  }
  return {
    posicao,
    armazemCodigo: armazemCodigo || null,
    notas: [...byNota.values()],
  }
}

export async function shipPositionBoxes(db, input) {
  const posicao = text(input.posicao)
  const armazemCodigo = text(input.armazemCodigo)
  const rows = await boxesAtPosition(db, posicao, armazemCodigo)
  if (rows.length === 0) {
    throw new ApiError("Nenhuma nota fiscal pendente nesta posição.")
  }
  return withTransaction(db, async (tx) => {
    const byNota = new Map()
    for (const box of rows) {
      const notaFiscal = String(box.nota_fiscal || "").trim()
      if (!notaFiscal) continue
      const key = normalizeNotaFiscal(notaFiscal) || notaFiscal.toLowerCase()
      let group = byNota.get(key)
      if (!group) {
        group = { notaFiscal, ids: [] }
        byNota.set(key, group)
      }
      group.ids.push(box.id)
    }
    const now = new Date().toISOString()
    const actor = eventActor(input)
    const allIds = []
    const notasText = []
    for (const group of byNota.values()) {
      for (const id of group.ids) {
        const eligible = await tx.get(
          `SELECT id FROM boxes
           WHERE id = ? AND expedida = 0
             AND posicao IS NOT NULL AND posicao != ''
             AND lower(posicao) = lower(?)`,
          id,
          posicao,
        )
        if (!eligible) throw new ApiError("Caixa não encontrada.")
        await tx.run(
          `UPDATE boxes
           SET expedida = 1, coletada = 1, posicao = '', armazem_codigo = NULL,
               nota_fiscal = ?, enviada_em = ?
           WHERE id = ?`,
          group.notaFiscal,
          now,
          id,
        )
        allIds.push(id)
      }
      await upsertNotaFiscal(tx, {
        notaFiscal: group.notaFiscal,
        posicao: "",
        quantidade: group.ids.length,
        actor,
      })
      notasText.push(
        `${group.notaFiscal} (${group.ids.length} ${group.ids.length === 1 ? "caixa" : "caixas"})`,
      )
    }
    const place = armazemCodigo ? `${posicao} do armazém ${armazemCodigo}` : posicao
    await logEvent(
      tx,
      input,
      `${actor} iniciou a rota e enviou as caixas ${boxIdsText(allIds)} da posição ${place}: ${notasText.join(", ")}.`,
    )
    return readState(tx)
  })
}

export async function saveRouteCity(db, input) {
  const cidade = text(input.cidade)
  const dias = normalizeDias(input.dias)
  if (!cidade) throw new ApiError("Informe a cidade.")
  if (dias.length === 0) throw new ApiError("Informe ao menos uma rota.")

  const existing = await db.get(
    "SELECT cidade, dias FROM rota_cidades WHERE lower(cidade) = lower(?)",
    cidade,
  )
  const diasAtuais = existing ? parseDias(existing.dias) : []

  for (const dia of dias) {
    if (diasAtuais.includes(dia)) continue
    const total = await countCidadesNaRota(db, dia, cidade)
    if (total >= MAX_CIDADES_POR_ROTA) {
      throw new ApiError(
        `${ROTA_META[dia].titulo} já tem ${MAX_CIDADES_POR_ROTA} cidades.`,
      )
    }
  }

  await withTransaction(db, async (tx) => {
    if (existing) {
      await tx.run(
        "UPDATE rota_cidades SET cidade = ?, dias = ? WHERE lower(cidade) = lower(?)",
        cidade,
        JSON.stringify(dias),
        cidade,
      )
    } else {
      await tx.run(
        "INSERT INTO rota_cidades (cidade, dias) VALUES (?, ?)",
        cidade,
        JSON.stringify(dias),
      )
    }
    await logEvent(
      tx,
      input,
      `${eventActor(input)} definiu ${cidade} nas rotas ${dias.map((d) => ROTA_META[d].titulo).join(", ")}.`,
    )
  })
  return listRoutes(db)
}

export async function removeRouteCityDay(db, input) {
  const cidade = text(input.cidade)
  const dia = Number(input.dia)
  if (!cidade) throw new ApiError("Informe a cidade.")
  if (!Number.isInteger(dia) || dia < 1 || dia > 5) {
    throw new ApiError("Informe uma rota válida.")
  }
  await withTransaction(db, async (tx) => {
    const row = await tx.get(
      "SELECT cidade, dias FROM rota_cidades WHERE lower(cidade) = lower(?)",
      cidade,
    )
    if (!row) throw new ApiError("Cidade não encontrada na rota.")
    const dias = parseDias(row.dias).filter((item) => item !== dia)
    if (dias.length === 0) {
      await tx.run("DELETE FROM rota_cidades WHERE lower(cidade) = lower(?)", cidade)
    } else {
      await tx.run(
        "UPDATE rota_cidades SET dias = ? WHERE lower(cidade) = lower(?)",
        JSON.stringify(dias),
        cidade,
      )
    }
    await logEvent(
      tx,
      input,
      `${eventActor(input)} removeu ${row.cidade} da ${ROTA_META[dia].titulo}.`,
    )
  })
  return listRoutes(db)
}

function isoDay(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function prazoDaCidade(cidade, from = new Date()) {
  const dias = cidadeDias[String(cidade || "").trim().toLowerCase()]
  if (!dias) return ""
  const start = new Date(from)
  if (Number.isNaN(start.getTime())) return ""
  start.setHours(12, 0, 0, 0)
  // Próximo dia de rota depois da entrada (se entrar no dia de saída, vai para a próxima data).
  for (let offset = 1; offset <= 8; offset += 1) {
    const day = new Date(start)
    day.setDate(start.getDate() + offset)
    if (dias.includes(day.getDay())) return isoDay(day)
  }
  return ""
}

function prazoDeEnvio(cidade, from = new Date()) {
  const rota = prazoDaCidade(cidade, from)
  if (rota) return rota
  const day = new Date(from)
  if (Number.isNaN(day.getTime())) return isoDay(new Date())
  day.setHours(12, 0, 0, 0)
  day.setDate(day.getDate() + 7)
  return isoDay(day)
}

async function ensureAdmin(db) {
  const existing = await db.get("SELECT 1 AS ok FROM users WHERE lower(usuario) = 'adm01'")
  if (existing) return
  const password = hashPassword("123vps123")
  await db.run(
    `INSERT INTO users (
      nome, usuario, senha_hash, senha_salt,
      recebimento, estoque, armazem, coleta, expedicao
    ) VALUES (?, 'ADM01', ?, ?, 1, 1, 1, 1, 1)`,
    "Administrador",
    password.hash,
    password.salt,
  )
}

function isAdmin(actor) {
  return text(actor).toLowerCase() === "adm01"
}

function requireAdmin(actor, message) {
  if (!isAdmin(actor)) throw new ApiError(message)
}

function enabled(value) {
  return Number(value) === 1
}

function areaFlags(row) {
  const admin = isAdmin(row.usuario)
  return {
    recebimento: admin || enabled(row.recebimento),
    estoque: admin || enabled(row.estoque),
    armazem: admin || enabled(row.armazem),
    coleta: admin || enabled(row.coleta),
    expedicao: admin || enabled(row.expedicao),
    usuarios: admin,
  }
}

function flag(value) {
  return value ? 1 : 0
}

export async function listUsers(db, input) {
  requireAdmin(input?.actor, "Somente o ADM01 pode cadastrar usuários.")
  const users = await db.all(
    "SELECT nome, usuario, recebimento, estoque, armazem, coleta, expedicao FROM users ORDER BY rowid",
  )
  return {
    users: users.map((user) => ({
      nome: user.nome,
      usuario: user.usuario,
      areas: areaFlags(user),
    })),
  }
}

export async function registerUser(db, input) {
  requireAdmin(input?.actor, "Somente o ADM01 pode cadastrar usuários.")
  const nome = text(input.nome)
  const usuario = text(input.usuario)
  const senha = text(input.senha)
  if (!nome && !usuario && !senha) {
    throw new ApiError("Informe o nome, o usuário e a senha.")
  }
  if (!nome) throw new ApiError("Informe o nome.")
  if (!usuario) throw new ApiError("Informe o usuário.")
  if (!senha) throw new ApiError("Informe a senha.")
  if (isAdmin(usuario)) throw new ApiError("Este usuário já existe.")
  return withTransaction(db, async (tx) => {
    const exists = await tx.get(
      "SELECT 1 AS ok FROM users WHERE lower(usuario) = lower(?)",
      usuario,
    )
    if (exists) throw new ApiError("Este usuário já existe.")
    const password = hashPassword(senha)
    await tx.run(
      "INSERT INTO users (nome, usuario, senha_hash, senha_salt) VALUES (?, ?, ?, ?)",
      nome,
      usuario,
      password.hash,
      password.salt,
    )
    await logEvent(tx, input, `${eventActor(input)} cadastrou o usuário ${usuario}.`)
    return listUsers(tx, { actor: "ADM01" })
  })
}

export async function setUserAreas(db, input) {
  requireAdmin(input?.actor, "Somente o ADM01 pode alterar permissões.")
  const usuario = text(input.usuario)
  if (!usuario) throw new ApiError("Usuário não encontrado.")
  if (isAdmin(usuario)) throw new ApiError("O ADM01 já tem acesso a todas as áreas.")
  return withTransaction(db, async (tx) => {
    const current = await tx.get(
      "SELECT usuario, recebimento, estoque, armazem, coleta, expedicao FROM users WHERE lower(usuario) = lower(?)",
      usuario,
    )
    if (!current) throw new ApiError("Usuário não encontrado.")
    const next = {
      recebimento: flag(input.recebimento),
      estoque: flag(input.estoque),
      armazem: flag(input.armazem),
      coleta: flag(input.coleta),
      expedicao: flag(input.expedicao),
    }
    await tx.run(
      `UPDATE users
       SET recebimento = ?, estoque = ?, armazem = ?, coleta = ?, expedicao = ?
       WHERE usuario = ?`,
      next.recebimento,
      next.estoque,
      next.armazem,
      next.coleta,
      next.expedicao,
      current.usuario,
    )
    const labels = {
      recebimento: "Recebimento",
      estoque: "Estoque",
      armazem: "Armazém",
      coleta: "Coleta",
      expedicao: "Expedição",
    }
    for (const area of areas) {
      const before = enabled(current[area])
      const after = next[area] === 1
      if (before === after) continue
      const texto = after
        ? `${eventActor(input)} marcou a permissão de ${labels[area]} para o usuário ${current.usuario}.`
        : `${eventActor(input)} tirou a permissão de ${labels[area]} do usuário ${current.usuario}.`
      await logEvent(tx, input, texto)
    }
    return listUsers(tx, { actor: "ADM01" })
  })
}

export async function removeUser(db, input) {
  requireAdmin(input?.actor, "Somente o ADM01 pode remover usuários.")
  const usuario = text(input.usuario)
  if (!usuario) throw new ApiError("Usuário não encontrado.")
  if (isAdmin(usuario)) throw new ApiError("O usuário ADM01 não pode ser removido.")
  return withTransaction(db, async (tx) => {
    const existing = await tx.get(
      "SELECT usuario FROM users WHERE lower(usuario) = lower(?)",
      usuario,
    )
    if (!existing) throw new ApiError("Usuário não encontrado.")
    await tx.run("DELETE FROM users WHERE usuario = ?", existing.usuario)
    const still = await tx.get("SELECT 1 AS ok FROM users WHERE usuario = ?", existing.usuario)
    if (still) throw new ApiError("Não foi possível remover o usuário.")
    await logEvent(tx, input, `${eventActor(input)} removeu o usuário ${existing.usuario}.`)
    return listUsers(tx, { actor: "ADM01" })
  })
}

export async function listHistory(db, actor) {
  requireAdmin(actor, "Somente o ADM01 pode ver o histórico.")
  const events = await db.all("SELECT criado_em, actor, texto FROM history ORDER BY id DESC")
  return {
    events: events.map((event) => ({
      criadoEm: event.criado_em,
      actor: event.actor,
      texto: event.texto,
    })),
  }
}

export async function lookupNotaFiscal(db, input) {
  const term = text(input.notaFiscal)
  if (!term) throw new ApiError("Informe a nota fiscal.")
  const needle = term.toLowerCase()
  const normalizedTerm = normalizeNotaFiscal(term)

  const allNotas = await db.all(
    `SELECT nota_fiscal, posicao, quantidade, criado_em, actor, observacao_retorno
     FROM notas_fiscais
     ORDER BY criado_em DESC`,
  )
  const notaRow =
    allNotas.find((row) => normalizeNotaFiscal(row.nota_fiscal) === normalizedTerm) ||
    allNotas.find((row) => notaFiscalMatches(row.nota_fiscal, term, normalizedTerm)) ||
    null

  const notaKey = notaRow?.nota_fiscal ?? term

  let boxes = await db.all(
    `SELECT b.id, b.posicao, b.armazem_codigo, b.coletada, b.expedida, b.nota_fiscal, p.nome AS produto
     FROM boxes b
     JOIN lots l ON l.id = b.lot_id
     JOIN products p ON p.codigo = l.product_codigo
     WHERE b.nota_fiscal IS NOT NULL AND b.nota_fiscal != ''
     ORDER BY b.id`,
  )
  boxes = boxes.filter((box) =>
    notaFiscalMatches(box.nota_fiscal, term, normalizedTerm) ||
    notaFiscalMatches(box.nota_fiscal, notaKey, normalizeNotaFiscal(notaKey)),
  )

  const events = await db.all(
    "SELECT criado_em, actor, texto FROM history ORDER BY id DESC",
  )

  const shipEvents = events.filter((event) => {
    if (typeof event.texto !== "string") return false
    const lower = event.texto.toLowerCase()
    if (!lower.includes("nota fiscal")) return false
    const nfInText = event.texto.match(/nota fiscal\s+(.+?)\.?$/i)?.[1]?.trim()
    if (nfInText && notaFiscalMatches(nfInText, term, normalizedTerm)) return true
    return lower.includes(needle) || (normalizedTerm && normalizeNotaFiscal(event.texto).includes(normalizedTerm))
  })

  if (boxes.length === 0) {
    const ids = new Set()
    for (const event of shipEvents) {
      for (const id of event.texto.match(/CX-\d+/gi) ?? []) {
        ids.add(id.toUpperCase())
      }
    }
    if (ids.size > 0) {
      const list = [...ids]
      const placeholders = list.map(() => "?").join(", ")
      boxes = await db.all(
        `SELECT b.id, b.posicao, b.armazem_codigo, b.coletada, b.expedida, b.nota_fiscal, p.nome AS produto
         FROM boxes b
         JOIN lots l ON l.id = b.lot_id
         JOIN products p ON p.codigo = l.product_codigo
         WHERE upper(b.id) IN (${placeholders})
         ORDER BY b.id`,
        ...list,
      )
    }
  }

  const historyHit = shipEvents[0] || null
  if (!notaRow && boxes.length === 0 && !historyHit) {
    throw new ApiError("Nota fiscal não encontrada.")
  }

  const resolvedNota =
    boxes.find((box) => box.nota_fiscal)?.nota_fiscal ||
    notaRow?.nota_fiscal ||
    historyHit?.texto?.match(/nota fiscal\s+(.+?)\.?$/i)?.[1]?.trim() ||
    notaKey

  const allShipped =
    boxes.length > 0 && boxes.every((box) => Number(box.expedida) === 1)
  const currentPosicao =
    allShipped || !notaRow?.posicao ? null : notaRow.posicao

  const observacaoRetorno = text(notaRow?.observacao_retorno) || null

  return {
    notaFiscal: resolvedNota,
    posicao: currentPosicao,
    quantidade: notaRow?.quantidade ?? boxes.length,
    expedidaPor: notaRow?.actor || historyHit?.actor || null,
    expedidaEm: notaRow?.criado_em || historyHit?.criado_em || null,
    observacaoRetorno,
    items: boxes.map((box) => {
      const placeEvent = events.find(
        (event) =>
          typeof event.texto === "string" &&
          event.texto.includes(box.id) &&
          (event.texto.includes("posição") || event.texto.includes("alocou")),
      )
      const posicaoNoHistorico = placeEvent
        ? positionFromHistoryText(placeEvent.texto)
        : null
      const shipped = Number(box.expedida) === 1
      let ondeEsta = "Sem posição"
      if (shipped) ondeEsta = "Enviada"
      else if (box.coletada) ondeEsta = "Coletada"
      else if (box.posicao) {
        ondeEsta = box.armazem_codigo
          ? `${box.posicao} · ${box.armazem_codigo}`
          : box.posicao
      }
      return {
        id: box.id,
        produto: box.produto,
        ondeEsta,
        posicao: shipped
          ? posicaoNoHistorico
          : box.posicao || posicaoNoHistorico || notaRow?.posicao || null,
        salvaPor: placeEvent?.actor ?? null,
        salvaEm: placeEvent?.criado_em ?? null,
      }
    }),
  }
}

function positionFromHistoryText(texto) {
  const match = String(texto).match(/na posição\s+(.+?)\.?$/i)
  return match?.[1]?.trim() || null
}

export async function loginUser(db, input) {
  const usuario = text(input.usuario)
  const senha = text(input.senha)
  if (!usuario && !senha) throw new ApiError("Informe o usuário e a senha.")
  if (!usuario) throw new ApiError("Informe o usuário.")
  if (!senha) throw new ApiError("Informe a senha.")
  const row = await db.get(
    `SELECT nome, usuario, senha_hash, senha_salt, recebimento, estoque, armazem, coleta, expedicao
     FROM users WHERE lower(usuario) = lower(?)`,
    usuario,
  )
  if (!row || !passwordMatches(senha, row.senha_salt, row.senha_hash)) {
    throw new ApiError("Usuário ou senha inválidos.")
  }
  return { nome: row.nome, usuario: row.usuario, areas: areaFlags(row) }
}

export async function userStatus(db) {
  const row = await db.get("SELECT COUNT(*) AS total FROM users")
  return { hasUsers: Number(row?.total ?? 0) > 0 }
}
