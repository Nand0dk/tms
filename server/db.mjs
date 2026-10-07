import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { DatabaseSync } from "node:sqlite"

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

export class ApiError extends Error {
  constructor(message, statusCode = 400) {
    super(message)
    this.statusCode = statusCode
  }
}

export function openDatabase(file = join(process.cwd(), "data", "vps.sqlite")) {
  mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec("PRAGMA foreign_keys = ON")
  db.exec(schema)
  db.prepare(
    "INSERT INTO meta (key, value) VALUES ('next_box', '1') ON CONFLICT(key) DO NOTHING",
  ).run()
  ensureUserColumns(db)
  ensureAdmin(db)
  return db
}

export function readState(db) {
  const productRows = db
    .prepare("SELECT codigo, nome, unidade FROM products ORDER BY rowid")
    .all()
  const lotRows = db
    .prepare(
      "SELECT id, product_codigo, numero, quantidade, validade FROM lots ORDER BY ordem, id",
    )
    .all()
  const boxRows = db
    .prepare(
      "SELECT id, lot_id, idx, total, posicao, armazem_codigo, coletada, expedida FROM boxes ORDER BY idx",
    )
    .all()
  const warehouseRows = db
    .prepare("SELECT codigo, nome FROM warehouses ORDER BY rowid")
    .all()
  const shelfRows = db
    .prepare("SELECT id, warehouse_codigo, codigo FROM shelves ORDER BY id")
    .all()
  const positionRows = db
    .prepare("SELECT shelf_id, numero, codigo FROM positions ORDER BY numero")
    .all()

  const boxesByLot = new Map()
  for (const box of boxRows) {
    const item = { id: box.id, index: box.idx, total: box.total }
    if (box.posicao) item.posicao = box.posicao
    if (box.armazem_codigo) item.armazemCodigo = box.armazem_codigo
    if (box.coletada) item.coletada = true
    if (box.expedida) item.expedida = true
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

function withTransaction(db, run) {
  db.exec("BEGIN")
  try {
    const result = run()
    db.exec("COMMIT")
    return result
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
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

function requireWarehouse(db, codigo) {
  const warehouse = db
    .prepare("SELECT codigo FROM warehouses WHERE lower(codigo) = lower(?)")
    .get(codigo)
  if (!warehouse) throw new ApiError("Armazém não encontrado.")
  return warehouse.codigo
}

function eventActor(input) {
  const name = text(input?.actor)
  return name || "desconhecido"
}

function logEvent(db, input, texto) {
  db.prepare("INSERT INTO history (criado_em, actor, texto) VALUES (?, ?, ?)").run(
    new Date().toISOString(),
    eventActor(input),
    texto,
  )
}

function boxIdsText(boxIds) {
  return idList(boxIds).join(", ")
}

export function addProduct(db, input) {
  const codigo = text(input.codigo)
  const nome = text(input.nome)
  const unidade = text(input.unidade)
  if (!codigo && !nome) throw new ApiError("Informe o código e o nome.")
  if (!codigo) throw new ApiError("Informe o código.")
  if (!nome) throw new ApiError("Informe o nome.")
  return withTransaction(db, () => {
    const exists = db
      .prepare("SELECT 1 AS ok FROM products WHERE lower(codigo) = lower(?)")
      .get(codigo)
    if (exists) throw new ApiError("Este código já existe.")
    db.prepare("INSERT INTO products (codigo, nome, unidade) VALUES (?, ?, ?)").run(
      codigo,
      nome,
      unidade,
    )
    logEvent(db, input, `${eventActor(input)} cadastrou o produto ${codigo}.`)
    return readState(db)
  })
}

export function addLot(db, input) {
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

  return withTransaction(db, () => {
    const product = db
      .prepare("SELECT codigo FROM products WHERE codigo = ?")
      .get(productCodigo)
    if (!product) throw new ApiError("Produto não encontrado.")
    const duplicate = db
      .prepare(
        "SELECT 1 AS ok FROM lots WHERE product_codigo = ? AND lower(numero) = lower(?)",
      )
      .get(product.codigo, numero)
    if (duplicate) throw new ApiError("Este lote já foi recebido neste produto.")
    const ordem =
      db
        .prepare(
          "SELECT COALESCE(MAX(ordem), 0) + 1 AS next FROM lots WHERE product_codigo = ?",
        )
        .get(product.codigo).next
    const lot = db
      .prepare(
        "INSERT INTO lots (product_codigo, numero, quantidade, validade, ordem) VALUES (?, ?, ?, ?, ?)",
      )
      .run(product.codigo, numero, quantidade, validade, ordem)
    const lotId = Number(lot.lastInsertRowid)
    const nextBox = Number(
      db.prepare("SELECT value FROM meta WHERE key = 'next_box'").get().value,
    )
    const insertBox = db.prepare(
      "INSERT INTO boxes (id, lot_id, idx, total) VALUES (?, ?, ?, ?)",
    )
    for (let index = 0; index < caixas; index += 1) {
      insertBox.run(formatBoxId(nextBox + index), lotId, index + 1, caixas)
    }
    db.prepare("UPDATE meta SET value = ? WHERE key = 'next_box'").run(
      String(nextBox + caixas),
    )
    logEvent(
      db,
      input,
      `${eventActor(input)} cadastrou o lote ${numero} do produto ${product.codigo}.`,
    )
    return readState(db)
  })
}

const adminOnlyDelete = "Somente o ADM01 pode apagar."

export function deleteProduct(db, input) {
  requireAdmin(input?.actor, adminOnlyDelete)
  const codigo = text(input.codigo)
  if (!codigo) throw new ApiError("Produto não encontrado.")
  return withTransaction(db, () => {
    const result = db
      .prepare("DELETE FROM products WHERE lower(codigo) = lower(?)")
      .run(codigo)
    if (result.changes === 0) throw new ApiError("Produto não encontrado.")
    logEvent(db, input, `${eventActor(input)} apagou o produto ${codigo}.`)
    return readState(db)
  })
}

export function deleteLot(db, input) {
  requireAdmin(input?.actor, adminOnlyDelete)
  const productCodigo = text(input.productCodigo)
  const numero = text(input.numero)
  if (!productCodigo || !numero) throw new ApiError("Lote não encontrado.")
  return withTransaction(db, () => {
    const result = db
      .prepare(
        "DELETE FROM lots WHERE product_codigo = ? AND lower(numero) = lower(?)",
      )
      .run(productCodigo, numero)
    if (result.changes === 0) throw new ApiError("Lote não encontrado.")
    logEvent(
      db,
      input,
      `${eventActor(input)} apagou o lote ${numero} do produto ${productCodigo}.`,
    )
    return readState(db)
  })
}

function clearBoxesInWarehouse(db, armazemCodigo) {
  db.prepare(
    "UPDATE boxes SET posicao = NULL, armazem_codigo = NULL WHERE lower(armazem_codigo) = lower(?)",
  ).run(armazemCodigo)
}

function clearBoxesAtPositions(db, armazemCodigo, positionCodes) {
  const statement = db.prepare(
    `UPDATE boxes
     SET posicao = NULL, armazem_codigo = NULL
     WHERE lower(armazem_codigo) = lower(?) AND lower(posicao) = lower(?)`,
  )
  for (const codigo of positionCodes) statement.run(armazemCodigo, codigo)
}

function warehouseByCode(db, codigo) {
  return db
    .prepare("SELECT codigo FROM warehouses WHERE lower(codigo) = lower(?)")
    .get(codigo)
}

export function deleteWarehouse(db, input) {
  requireAdmin(input?.actor, adminOnlyDelete)
  const codigo = text(input.codigo)
  if (!codigo) throw new ApiError("Armazém não encontrado.")
  return withTransaction(db, () => {
    const warehouse = warehouseByCode(db, codigo)
    if (!warehouse) throw new ApiError("Armazém não encontrado.")
    clearBoxesInWarehouse(db, warehouse.codigo)
    db.prepare("DELETE FROM warehouses WHERE codigo = ?").run(warehouse.codigo)
    logEvent(db, input, `${eventActor(input)} apagou o armazém ${warehouse.codigo}.`)
    return readState(db)
  })
}

export function deleteShelf(db, input) {
  requireAdmin(input?.actor, adminOnlyDelete)
  const armazemCodigo = text(input.armazemCodigo)
  const prateleira = text(input.prateleira)
  if (!armazemCodigo || !prateleira) throw new ApiError("Prateleira não encontrada.")
  return withTransaction(db, () => {
    const warehouse = warehouseByCode(db, armazemCodigo)
    const shelf = warehouse
      ? db
          .prepare(
            "SELECT id FROM shelves WHERE warehouse_codigo = ? AND lower(codigo) = lower(?)",
          )
          .get(warehouse.codigo, prateleira)
      : undefined
    if (!shelf) throw new ApiError("Prateleira não encontrada.")
    const positions = db
      .prepare("SELECT codigo FROM positions WHERE shelf_id = ?")
      .all(shelf.id)
    clearBoxesAtPositions(
      db,
      warehouse.codigo,
      positions.map((position) => position.codigo),
    )
    db.prepare("DELETE FROM shelves WHERE id = ?").run(shelf.id)
    logEvent(
      db,
      input,
      `${eventActor(input)} apagou a prateleira ${prateleira} do armazém ${warehouse.codigo}.`,
    )
    return readState(db)
  })
}

export function deletePosition(db, input) {
  requireAdmin(input?.actor, adminOnlyDelete)
  const armazemCodigo = text(input.armazemCodigo)
  const codigo = text(input.codigo)
  if (!armazemCodigo || !codigo) throw new ApiError("Posição não encontrada.")
  return withTransaction(db, () => {
    const warehouse = warehouseByCode(db, armazemCodigo)
    const position = warehouse
      ? db
          .prepare(
            `SELECT positions.id, positions.codigo
             FROM positions
             JOIN shelves ON shelves.id = positions.shelf_id
             WHERE shelves.warehouse_codigo = ? AND lower(positions.codigo) = lower(?)`,
          )
          .get(warehouse.codigo, codigo)
      : undefined
    if (!position) throw new ApiError("Posição não encontrada.")
    clearBoxesAtPositions(db, warehouse.codigo, [position.codigo])
    db.prepare("DELETE FROM positions WHERE id = ?").run(position.id)
    logEvent(
      db,
      input,
      `${eventActor(input)} apagou a posição ${position.codigo} do armazém ${warehouse.codigo}.`,
    )
    return readState(db)
  })
}

function updateBoxes(db, boxIds, apply) {
  const ids = idList(boxIds)
  if (ids.length === 0) throw new ApiError("Adicione ao menos uma caixa.")
  let changed = 0
  for (const id of ids) {
    changed += apply(id).changes
  }
  if (changed !== ids.length) throw new ApiError("Caixa não encontrada.")
}

export function setPositions(db, input) {
  const posicao = text(input.posicao)
  const armazemCodigo = text(input.armazemCodigo)
  if (!posicao) throw new ApiError("Informe a posição.")
  return withTransaction(db, () => {
    const warehouse = armazemCodigo ? requireWarehouse(db, armazemCodigo) : null
    const statement = db.prepare(
      "UPDATE boxes SET posicao = ?, armazem_codigo = ?, coletada = 0, expedida = 0 WHERE lower(id) = lower(?)",
    )
    updateBoxes(db, input.boxIds, (id) => statement.run(posicao, warehouse, id))
    const place = warehouse ? `${posicao} do armazém ${warehouse}` : posicao
    logEvent(
      db,
      input,
      `${eventActor(input)} registrou as caixas ${boxIdsText(input.boxIds)} na posição ${place}.`,
    )
    return readState(db)
  })
}

export function collectBoxes(db, input) {
  return withTransaction(db, () => {
    const statement = db.prepare(
      "UPDATE boxes SET coletada = 1, posicao = NULL, armazem_codigo = NULL WHERE lower(id) = lower(?) AND expedida = 0 AND posicao IS NOT NULL AND coletada = 0",
    )
    updateBoxes(db, input.boxIds, (id) => statement.run(id))
    logEvent(db, input, `${eventActor(input)} coletou as caixas ${boxIdsText(input.boxIds)}.`)
    return readState(db)
  })
}

export function shipBoxes(db, input) {
  return withTransaction(db, () => {
    const statement = db.prepare(
      "UPDATE boxes SET expedida = 1, coletada = 1 WHERE lower(id) = lower(?) AND coletada = 1 AND expedida = 0",
    )
    updateBoxes(db, input.boxIds, (id) => statement.run(id))
    logEvent(db, input, `${eventActor(input)} expediu as caixas ${boxIdsText(input.boxIds)}.`)
    return readState(db)
  })
}

export function addWarehouse(db, input) {
  const codigo = text(input.codigo)
  const nome = text(input.nome)
  if (!codigo && !nome) throw new ApiError("Informe o código e o nome.")
  if (!codigo) throw new ApiError("Informe o código.")
  if (!nome) throw new ApiError("Informe o nome.")
  return withTransaction(db, () => {
    const exists = db
      .prepare("SELECT 1 AS ok FROM warehouses WHERE lower(codigo) = lower(?)")
      .get(codigo)
    if (exists) throw new ApiError("Este código já existe.")
    db.prepare("INSERT INTO warehouses (codigo, nome) VALUES (?, ?)").run(codigo, nome)
    logEvent(db, input, `${eventActor(input)} cadastrou o armazém ${codigo}.`)
    return readState(db)
  })
}

function insertPositions(db, shelfId, prateleira, start, quantidade) {
  const insert = db.prepare(
    "INSERT INTO positions (shelf_id, numero, codigo) VALUES (?, ?, ?)",
  )
  for (let offset = 0; offset < quantidade; offset += 1) {
    const numero = start + offset
    insert.run(shelfId, numero, positionCode(prateleira, numero))
  }
}

export function addShelf(db, input) {
  const armazemCodigo = text(input.armazemCodigo)
  const prateleira = text(input.prateleira)
  const quantidade = wholeCount(input.quantidade)
  if (!prateleira && quantidade === null) {
    throw new ApiError("Informe a prateleira e a quantidade de posições.")
  }
  if (!prateleira) throw new ApiError("Informe a prateleira.")
  if (quantidade === null) throw new ApiError("Informe a quantidade de posições.")
  return withTransaction(db, () => {
    const warehouse = requireWarehouse(db, armazemCodigo)
    const exists = db
      .prepare(
        "SELECT 1 AS ok FROM shelves WHERE warehouse_codigo = ? AND lower(codigo) = lower(?)",
      )
      .get(warehouse, prateleira)
    if (exists) throw new ApiError("Esta prateleira já existe.")
    const shelf = db
      .prepare("INSERT INTO shelves (warehouse_codigo, codigo) VALUES (?, ?)")
      .run(warehouse, prateleira)
    insertPositions(db, Number(shelf.lastInsertRowid), prateleira, 1, quantidade)
    logEvent(
      db,
      input,
      `${eventActor(input)} cadastrou a prateleira ${prateleira} no armazém ${warehouse}.`,
    )
    return readState(db)
  })
}

export function addShelfPositions(db, input) {
  const armazemCodigo = text(input.armazemCodigo)
  const prateleira = text(input.prateleira)
  const quantidade = wholeCount(input.quantidade)
  if (quantidade === null) throw new ApiError("Informe a quantidade de posições.")
  return withTransaction(db, () => {
    const warehouse = requireWarehouse(db, armazemCodigo)
    const shelf = db
      .prepare(
        "SELECT id, codigo FROM shelves WHERE warehouse_codigo = ? AND lower(codigo) = lower(?)",
      )
      .get(warehouse, prateleira)
    if (!shelf) throw new ApiError("Prateleira não encontrada.")
    const last = db
      .prepare("SELECT COALESCE(MAX(numero), 0) AS last FROM positions WHERE shelf_id = ?")
      .get(shelf.id).last
    insertPositions(db, shelf.id, shelf.codigo, last + 1, quantidade)
    logEvent(
      db,
      input,
      `${eventActor(input)} adicionou ${quantidade} posições na prateleira ${shelf.codigo} do armazém ${warehouse}.`,
    )
    return readState(db)
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

const areas = ["recebimento", "estoque", "armazem", "coleta", "expedicao"]

function ensureUserColumns(db) {
  const columns = new Set(db.prepare("PRAGMA table_info(users)").all().map((column) => column.name))
  for (const area of areas) {
    if (!columns.has(area)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${area} INTEGER NOT NULL DEFAULT 0`)
    }
  }
}

function ensureAdmin(db) {
  const existing = db
    .prepare("SELECT 1 AS ok FROM users WHERE lower(usuario) = 'adm01'")
    .get()
  if (existing) return
  const password = hashPassword("123vps123")
  db.prepare(
    `INSERT INTO users (
      nome, usuario, senha_hash, senha_salt,
      recebimento, estoque, armazem, coleta, expedicao
    ) VALUES (?, 'ADM01', ?, ?, 1, 1, 1, 1, 1)`,
  ).run("Administrador", password.hash, password.salt)
}

function isAdmin(actor) {
  return text(actor).toLowerCase() === "adm01"
}

function requireAdmin(actor, message) {
  if (!isAdmin(actor)) throw new ApiError(message)
}

function areaFlags(row) {
  const admin = isAdmin(row.usuario)
  return {
    recebimento: admin || row.recebimento === 1,
    estoque: admin || row.estoque === 1,
    armazem: admin || row.armazem === 1,
    coleta: admin || row.coleta === 1,
    expedicao: admin || row.expedicao === 1,
    usuarios: admin,
  }
}

function flag(value) {
  return value ? 1 : 0
}

export function listUsers(db, input) {
  requireAdmin(input?.actor, "Somente o ADM01 pode cadastrar usuários.")
  const users = db
    .prepare(
      "SELECT nome, usuario, recebimento, estoque, armazem, coleta, expedicao FROM users ORDER BY rowid",
    )
    .all()
  return {
    users: users.map((user) => ({
      nome: user.nome,
      usuario: user.usuario,
      areas: areaFlags(user),
    })),
  }
}

export function registerUser(db, input) {
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
  return withTransaction(db, () => {
    const exists = db
      .prepare("SELECT 1 AS ok FROM users WHERE lower(usuario) = lower(?)")
      .get(usuario)
    if (exists) throw new ApiError("Este usuário já existe.")
    const password = hashPassword(senha)
    db.prepare(
      "INSERT INTO users (nome, usuario, senha_hash, senha_salt) VALUES (?, ?, ?, ?)",
    ).run(nome, usuario, password.hash, password.salt)
    logEvent(db, input, `${eventActor(input)} cadastrou o usuário ${usuario}.`)
    return listUsers(db, { actor: "ADM01" })
  })
}

export function setUserAreas(db, input) {
  requireAdmin(input?.actor, "Somente o ADM01 pode alterar permissões.")
  const usuario = text(input.usuario)
  if (!usuario) throw new ApiError("Usuário não encontrado.")
  if (isAdmin(usuario)) throw new ApiError("O ADM01 já tem acesso a todas as áreas.")
  return withTransaction(db, () => {
    const current = db
      .prepare(
        "SELECT usuario, recebimento, estoque, armazem, coleta, expedicao FROM users WHERE lower(usuario) = lower(?)",
      )
      .get(usuario)
    if (!current) throw new ApiError("Usuário não encontrado.")
    const next = {
      recebimento: flag(input.recebimento),
      estoque: flag(input.estoque),
      armazem: flag(input.armazem),
      coleta: flag(input.coleta),
      expedicao: flag(input.expedicao),
    }
    const result = db
      .prepare(
        `UPDATE users
         SET recebimento = ?, estoque = ?, armazem = ?, coleta = ?, expedicao = ?
         WHERE lower(usuario) = lower(?)`,
      )
      .run(
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
      const before = current[area] === 1
      const after = next[area] === 1
      if (before === after) continue
      const texto = after
        ? `${eventActor(input)} marcou a permissão de ${labels[area]} para o usuário ${current.usuario}.`
        : `${eventActor(input)} tirou a permissão de ${labels[area]} do usuário ${current.usuario}.`
      logEvent(db, input, texto)
    }
    return listUsers(db, { actor: "ADM01" })
  })
}

export function removeUser(db, input) {
  requireAdmin(input?.actor, "Somente o ADM01 pode remover usuários.")
  const usuario = text(input.usuario)
  if (!usuario) throw new ApiError("Usuário não encontrado.")
  if (isAdmin(usuario)) throw new ApiError("O usuário ADM01 não pode ser removido.")
  return withTransaction(db, () => {
    const result = db
      .prepare("DELETE FROM users WHERE lower(usuario) = lower(?)")
      .run(usuario)
    if (result.changes === 0) throw new ApiError("Usuário não encontrado.")
    logEvent(db, input, `${eventActor(input)} removeu o usuário ${usuario}.`)
    return listUsers(db, { actor: "ADM01" })
  })
}

export function listHistory(db, actor) {
  requireAdmin(actor, "Somente o ADM01 pode ver o histórico.")
  const events = db
    .prepare("SELECT criado_em, actor, texto FROM history ORDER BY id DESC")
    .all()
  return {
    events: events.map((event) => ({
      criadoEm: event.criado_em,
      actor: event.actor,
      texto: event.texto,
    })),
  }
}

export function loginUser(db, input) {
  const usuario = text(input.usuario)
  const senha = text(input.senha)
  if (!usuario && !senha) throw new ApiError("Informe o usuário e a senha.")
  if (!usuario) throw new ApiError("Informe o usuário.")
  if (!senha) throw new ApiError("Informe a senha.")
  const row = db
    .prepare(
      `SELECT nome, usuario, senha_hash, senha_salt, recebimento, estoque, armazem, coleta, expedicao
       FROM users WHERE lower(usuario) = lower(?)`,
    )
    .get(usuario)
  if (!row || !passwordMatches(senha, row.senha_salt, row.senha_hash)) {
    throw new ApiError("Usuário ou senha inválidos.")
  }
  return { nome: row.nome, usuario: row.usuario, areas: areaFlags(row) }
}
