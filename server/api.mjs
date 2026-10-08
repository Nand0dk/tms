import {
  addLot,
  addProduct,
  addShelf,
  addShelfPositions,
  addWarehouse,
  ApiError,
  collectBoxes,
  deleteLot,
  deletePosition,
  deleteProduct,
  deleteShelf,
  deleteWarehouse,
  listHistory,
  listUsers,
  loginUser,
  openDatabase,
  readState,
  registerUser,
  removeUser,
  setPositions,
  setUserAreas,
  shipBoxes,
  userStatus,
} from "./db.mjs"

let middleware

function send(res, status, body) {
  res.statusCode = status
  res.setHeader("content-type", "application/json; charset=utf-8")
  res.end(JSON.stringify(body))
}

function readBody(req) {
  if (Buffer.isBuffer(req.body)) {
    return parseJson(req.body.toString("utf8"))
  }
  if (typeof req.body === "string") return parseJson(req.body)
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body)
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on("data", (chunk) => {
      size += chunk.length
      if (size > 1_000_000) {
        reject(new ApiError("Dados grandes demais.", 413))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => {
      parseJson(Buffer.concat(chunks).toString("utf8")).then(resolve, reject)
    })
    req.on("error", reject)
  })
}

function normalizePath(pathname) {
  let path = pathname || "/"
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1)
  while (path.startsWith("/api/api/")) path = `/api/${path.slice("/api/api/".length)}`
  return path
}

function requestPath(req) {
  const url = new URL(req.url ?? "/", "http://local")
  let pathname = normalizePath(url.pathname)
  if (!pathname.startsWith("/api")) {
    const path = req.query?.path
    const parts = (Array.isArray(path) ? path : typeof path === "string" ? [path] : [])
      .flatMap((part) => String(part).split("/"))
      .filter(Boolean)
    if (parts.length > 0) pathname = normalizePath(`/api/${parts.join("/")}`)
  }
  return pathname
}

function queryValue(req, name) {
  const url = new URL(req.url ?? "/", "http://local")
  const fromUrl = url.searchParams.get(name)
  if (fromUrl) return fromUrl
  const value = req.query?.[name]
  return typeof value === "string" ? value : null
}

async function handle(db, req, pathname) {
  if (req.method === "GET" && pathname === "/api/state") return readState(db)
  if (req.method === "GET" && pathname === "/api/users/status") return userStatus(db)
  if (req.method === "GET" && pathname === "/api/history") {
    return listHistory(db, queryValue(req, "actor"))
  }
  if (req.method !== "POST") throw new ApiError("Não encontrado.", 404)
  const body = await readBody(req)
  if (pathname === "/api/products") return addProduct(db, body)
  if (pathname === "/api/lots") return addLot(db, body)
  if (pathname === "/api/products/delete") return deleteProduct(db, body)
  if (pathname === "/api/lots/delete") return deleteLot(db, body)
  if (pathname === "/api/positions") return setPositions(db, body)
  if (pathname === "/api/collections") return collectBoxes(db, body)
  if (pathname === "/api/shipments") return shipBoxes(db, body)
  if (pathname === "/api/warehouses/delete") return deleteWarehouse(db, body)
  if (pathname === "/api/warehouses") return addWarehouse(db, body)
  if (pathname === "/api/shelves/delete") return deleteShelf(db, body)
  if (pathname === "/api/shelves") return addShelf(db, body)
  if (pathname === "/api/shelves/positions") return addShelfPositions(db, body)
  if (pathname === "/api/positions/delete") return deletePosition(db, body)
  if (pathname === "/api/users/list") return listUsers(db, body)
  if (pathname === "/api/users/permissions") return setUserAreas(db, body)
  if (pathname === "/api/users/delete") return removeUser(db, body)
  if (pathname === "/api/users") return registerUser(db, body)
  if (pathname === "/api/login") return loginUser(db, body)
  throw new ApiError("Não encontrado.", 404)
}

function parseJson(text) {
  if (!text) return Promise.resolve({})
  try {
    return Promise.resolve(JSON.parse(text))
  } catch {
    return Promise.reject(new ApiError("Dados inválidos."))
  }
}

let database

function openCachedDatabase() {
  if (!database) {
    database = openDatabase().catch((error) => {
      database = undefined
      throw error
    })
  }
  return database
}

export function handleApi(req, res) {
  const pathname = requestPath(req)
  openCachedDatabase()
    .then((db) => handle(db, req, pathname))
    .then(
      (body) => send(res, 200, body),
      (error) => {
        const status = error instanceof ApiError ? error.statusCode : 500
        send(res, status, {
          error:
            status === 500
              ? "Não foi possível acessar o banco de dados."
              : error.message,
        })
      },
    )
}

export function createApiMiddleware() {
  if (middleware) return middleware
  middleware = (req, res, next) => {
    const pathname = new URL(req.url ?? "/", "http://local").pathname
    if (!pathname.startsWith("/api/")) {
      next()
      return
    }
    handleApi(req, res)
  }
  return middleware
}
