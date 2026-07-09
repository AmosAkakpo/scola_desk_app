// Numbered pagination with ellipsis for large page counts. Renders nothing
// when there's only one page (or none), so callers can drop it in unconditionally.
export default function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null

  const pages = []
  const maxButtons = 7
  if (totalPages <= maxButtons) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (page > 3) pages.push('…')
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i)
    if (page < totalPages - 2) pages.push('…')
    pages.push(totalPages)
  }

  return (
    <div className="flex items-center justify-center gap-1 mt-4">
      <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}
        className="px-3 py-1.5 border border-steel-200 rounded-lg text-sm text-steel-600 hover:bg-steel-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
        Précédent
      </button>
      {pages.map((p, i) => p === '…' ? (
        <span key={`ellipsis-${i}`} className="px-2 text-steel-400 text-sm">…</span>
      ) : (
        <button key={p} onClick={() => onPageChange(p)}
          className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
            p === page ? 'bg-brand text-white' : 'text-steel-600 hover:bg-steel-50 border border-steel-200'
          }`}>
          {p}
        </button>
      ))}
      <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
        className="px-3 py-1.5 border border-steel-200 rounded-lg text-sm text-steel-600 hover:bg-steel-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
        Suivant
      </button>
    </div>
  )
}
