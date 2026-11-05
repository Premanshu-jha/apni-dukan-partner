export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 pt-8 pb-4 text-center">
      <img src="/icon.svg" alt="" className="h-16 w-16" />
      <p className="text-2xl font-bold">Apni Dukan <span className="text-brand">Partner</span></p>
      {subtitle && <p className="max-w-xs text-muted">{subtitle}</p>}
    </div>
  )
}
