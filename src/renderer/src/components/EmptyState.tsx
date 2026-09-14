export default function EmptyState({
  title,
  description
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <p className="font-display text-lg font-semibold text-primary">{title}</p>
      <p className="max-w-sm text-sm text-muted">{description}</p>
    </div>
  )
}
