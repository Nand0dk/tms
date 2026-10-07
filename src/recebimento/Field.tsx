export function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  type = "text",
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  inputMode?: "decimal" | "numeric" | "text"
  type?: "text" | "password"
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-neutral-800">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-base outline-none placeholder:text-neutral-400 focus:border-[#2e7d32] focus:ring-2 focus:ring-[#2e7d32]/20 md:py-2 md:text-sm"
      />
    </div>
  )
}
