import { handleApi } from "../server/api.mjs"

export default function handler(req, res) {
  return handleApi(req, res)
}
