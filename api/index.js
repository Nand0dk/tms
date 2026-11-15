import { handleApi } from "../server/api.mjs"

export default async function handler(req, res) {
  // Keep serverless instances warmer between bursts when the platform allows.
  res.setHeader("cache-control", "no-store")
  await handleApi(req, res)
}
