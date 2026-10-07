import { useEffect, useState } from "react"
import { company } from "../config"
import { useSession } from "../session"
import { Logo } from "./Logo"

const DURATION_MS = 2000

export function LoadingScreen() {
  const { completeLoading } = useSession()
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const started = performance.now()
    let frame = 0

    const tick = (now: number) => {
      const next = Math.min(100, ((now - started) / DURATION_MS) * 100)
      setProgress(next)
      if (next < 100) {
        frame = requestAnimationFrame(tick)
      }
    }

    frame = requestAnimationFrame(tick)
    const timer = window.setTimeout(completeLoading, DURATION_MS)

    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [completeLoading])

  useEffect(() => {
    document.title = `${company.name} — ${company.subtitle}`
  }, [])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 text-neutral-800">
      <Logo className="h-32 w-auto sm:h-40" />
      <div className="mt-10 w-56">
        <div
          className="h-1.5 overflow-hidden rounded-full bg-neutral-200"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          aria-label="Carregando"
        >
          <div
            className="h-full rounded-full bg-[#2e7d32]"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-3 text-center text-sm text-neutral-500">Carregando…</p>
      </div>
    </div>
  )
}
