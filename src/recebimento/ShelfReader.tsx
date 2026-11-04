import { useEffect, useRef, useState } from "react"
import { BrowserMultiFormatReader } from "@zxing/browser"

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean }
type TorchConstraintSet = MediaTrackConstraintSet & { torch?: boolean }

async function setTorch(track: MediaStreamTrack | null, on: boolean) {
  if (!track || track.readyState !== "live") return
  try {
    const caps = track.getCapabilities?.() as TorchCapabilities | undefined
    if (!caps?.torch) return
    await track.applyConstraints({
      advanced: [{ torch: on } as TorchConstraintSet],
    })
  } catch {
    // Desktop / unsupported devices — ignore
  }
}

function getVideoTrack(video: HTMLVideoElement | null): MediaStreamTrack | null {
  const stream = video?.srcObject
  if (!(stream instanceof MediaStream)) return null
  return stream.getVideoTracks()[0] ?? null
}

export function ShelfReader({
  onRead,
  label = "Ler código da prateleira",
  continuous = false,
}: {
  onRead: (code: string) => void
  label?: string
  continuous?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const onReadRef = useRef(onRead)
  const continuousRef = useRef(continuous)
  onReadRef.current = onRead
  continuousRef.current = continuous

  useEffect(() => {
    if (!open) return
    const video = videoRef.current
    if (!video) return

    let stopped = false
    let controls: { stop: () => void } | null = null
    let videoTrack: MediaStreamTrack | null = null
    let lastText = ""
    let lastAt = 0
    const reader = new BrowserMultiFormatReader()

    const stopCamera = () => {
      const track = videoTrack
      videoTrack = null
      void setTorch(track, false).finally(() => {
        controls?.stop()
        track?.stop()
        if (video.srcObject instanceof MediaStream) {
          for (const t of video.srcObject.getTracks()) t.stop()
          video.srcObject = null
        }
      })
    }

    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        video,
        (result) => {
          if (stopped || !result) return
          const text = result.getText().trim()
          if (!text) return
          const now = Date.now()
          if (text === lastText && now - lastAt < 1500) return
          lastText = text
          lastAt = now
          onReadRef.current(text)
          if (continuousRef.current) return
          stopped = true
          stopCamera()
          setOpen(false)
        },
      )
      .then((next) => {
        controls = next
        if (stopped) {
          stopCamera()
          return
        }
        videoTrack = getVideoTrack(video)
        void setTorch(videoTrack, true)
      })
      .catch(() => {
        if (!stopped) {
          setError("Não foi possível abrir a câmera. Permita o uso da câmera ou digite o código.")
          setOpen(false)
        }
      })

    return () => {
      stopped = true
      stopCamera()
    }
  }, [open])

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
        className="rounded-xl border border-[#1f6b28] px-3 py-2.5 text-sm font-medium text-[#1f6b28]"
      >
        {label}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {open ? (
        <div className="overflow-hidden rounded-xl bg-black">
          <video
            ref={videoRef}
            className="aspect-[4/3] w-full object-cover"
            muted
            playsInline
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full bg-white px-3 py-2 text-sm font-medium text-neutral-800"
          >
            Fechar câmera
          </button>
        </div>
      ) : null}
    </div>
  )
}
