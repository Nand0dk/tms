import { company } from "../config"

type LogoProps = {
  className?: string
  decorative?: boolean
}

export function Logo({ className = "h-28 w-auto", decorative = false }: LogoProps) {
  return (
    <img
      src={company.logoSrc}
      alt={decorative ? "" : company.name}
      className={`block max-w-full object-contain object-center ${className}`}
      draggable={false}
    />
  )
}
