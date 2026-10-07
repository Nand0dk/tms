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
  expedida INTEGER NOT NULL DEFAULT 0
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
  await withTransaction(db, async (tx) => {
    await tx.run(
      "INSERT INTO meta (key, value) VALUES ('next_box', '1') ON CONFLICT(key) DO NOTHING",
    )
    await ensureAdmin(tx)
  })
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
    "SELECT id, lot_id, idx, total, posicao, armazem_codigo, coletada, expedida FROM boxes ORDER BY idx",
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
    tx.close()
  }
}

function text(value) {
  return typeof value === "string" ? value.trim() : ""
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
    const result = await tx.run("DELETE FROM products WHERE lower(codigo) = lower(?)", codigo)
    if (result.changes === 0) throw new ApiError("Produto não encontrado.")
    await logEvent(tx, input, `${eventActor(input)} apagou o produto ${codigo}.`)
    return readState(tx)
  })
}

export async function deleteLot(db, input) {
  requireAdmin(input?.actor, adminOnlyDelete)
  const productCodigo = text(input.productCodigo)
  const numero = text(input.numero)
  if (!productCodigo || !numero) throw new ApiError("Lote não encontrado.")
  return withTransaction(db, async (tx) => {
    const result = await tx.run(
      "DELETE FROM lots WHERE product_codigo = ? AND lower(numero) = lower(?)",
      productCodigo,
      numero,
    )
    if (result.changes === 0) throw new ApiError("Lote não encontrado.")
    await logEvent(
      tx,
      input,
      `${eventActor(input)} apagou o lote ${numero} do produto ${productCodigo}.`,
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
    await tx.run("DELETE FROM warehouses WHERE codigo = ?", warehouse.codigo)
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
    await tx.run("DELETE FROM shelves WHERE id = ?", shelf.id)
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
    await logEvent(
      tx,
      input,
      `${eventActor(input)} apagou a posição ${position.codigo} do armazém ${warehouse.codigo}.`,
    )
    return readState(tx)
  })
}

async function updateBoxes(boxIds, apply) {
  const ids = idList(boxIds)
  if (ids.length === 0) throw new ApiError("Adicione ao menos uma caixa.")
  let changed = 0
  for (const id of ids) {
    changed += (await apply(id)).changes
  }
  if (changed !== ids.length) throw new ApiError("Caixa não encontrada.")
}

export async function setPositions(db, input) {
  const posicao = text(input.posicao)
  const armazemCodigo = text(input.armazemCodigo)
  if (!posicao) throw new ApiError("Informe a posição.")
  return withTransaction(db, async (tx) => {
    const warehouse = armazemCodigo ? await requireWarehouse(tx, armazemCodigo) : null
    await updateBoxes(input.boxIds, (id) =>
      tx.run(
        "UPDATE boxes SET posicao = ?, armazem_codigo = ?, coletada = 0, expedida = 0 WHERE lower(id) = lower(?)",
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
    await updateBoxes(input.boxIds, (id) =>
      tx.run(
        "UPDATE boxes SET coletada = 1, posicao = NULL, armazem_codigo = NULL WHERE lower(id) = lower(?) AND expedida = 0 AND posicao IS NOT NULL AND coletada = 0",
        id,
      ),
    )
    await logEvent(tx, input, `${eventActor(input)} coletou as caixas ${boxIdsText(input.boxIds)}.`)
    return readState(tx)
  })
}

export async function shipBoxes(db, input) {
  return withTransaction(db, async (tx) => {
    await updateBoxes(input.boxIds, (id) =>
      tx.run(
        "UPDATE boxes SET expedida = 1, coletada = 1 WHERE lower(id) = lower(?) AND coletada = 1 AND expedida = 0",
        id,
      ),
    )
    await logEvent(tx, input, `${eventActor(input)} expediu as caixas ${boxIdsText(input.boxIds)}.`)
    return readState(tx)
  })
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
    const result = await tx.run(
      `UPDATE users
       SET recebimento = ?, estoque = ?, armazem = ?, coleta = ?, expedicao = ?
       WHERE lower(usuario) = lower(?)`,
      next.recebimento,
      next.estoque,
      next.armazem,
      next.coleta,
      next.expedicao,
      usuario,
    )
    if (result.changes === 0) throw new ApiError("Usuário não encontrado.")
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
    const result = await tx.run("DELETE FROM users WHERE lower(usuario) = lower(?)", usuario)
    if (result.changes === 0) throw new ApiError("Usuário não encontrado.")
    await logEvent(tx, input, `${eventActor(input)} removeu o usuário ${usuario}.`)
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
