interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

const buttonClass = "rounded-md border border-line bg-card px-3 py-1.5 disabled:opacity-40";

export function Pagination({ page, totalPages, total, onPageChange }: PaginationProps) {
  return (
    <div className="flex items-center justify-between text-sm text-slate-600">
      <span>
        Wyniki: {total} · strona {page} z {totalPages}
      </span>
      <div className="flex gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className={buttonClass}>
          Poprzednia
        </button>
        <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className={buttonClass}>
          Następna
        </button>
      </div>
    </div>
  );
}
