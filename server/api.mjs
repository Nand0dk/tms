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
} from "./db.mjs"

let middleware

function send(res, status, body) {
  res.statusCode = status
  res.setHeader("content-type", "application/json; charset=utf-8")
  res.end(JSON.stringify(body))
}

function readBody(req) {
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
      const text = Buffer.concat(chunks).toString("utf8")
      if (!text) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(text))
      } catch {
        reject(new ApiError("Dados inválidos."))
      }
    })
    req.on("error", reject)
  })
}

async function handle(db, req, pathname) {
  if (req.method === "GET" && pathname === "/api/state") return readState(db)
  if (req.method === "GET" && pathname === "/api/history") {
    const actor = new URL(req.url ?? "/", "http://local").searchParams.get("actor")
    return listHistory(db, actor)
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

export function createApiMiddleware() {
  if (middleware) return middleware
  const db = openDatabase()
  middleware = (req, res, next) => {
    const pathname = new URL(req.url ?? "/", "http://local").pathname
    if (!pathname.startsWith("/api/")) {
      next()
      return
    }
    handle(db, req, pathname).then(
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
  return middleware
}
