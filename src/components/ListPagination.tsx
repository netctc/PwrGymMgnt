import { Button } from './ui/button';

type ListPaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  locale?: string;
  pageSizeOptions?: number[];
};

export default function ListPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  locale = 'en',
  pageSizeOptions = [10, 25, 50],
}: ListPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const first = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const last = Math.min(total, safePage * pageSize);
  const ar = locale === 'ar';

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-500">
        {ar ? `عرض ${first}–${last} من ${total}` : `Showing ${first}–${last} of ${total}`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          {ar ? 'عدد الصفوف' : 'Rows'}
          <select
            className="h-9 rounded-md border border-slate-200 bg-white px-2"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <Button type="button" size="sm" variant="outline" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)}>
          {ar ? 'السابق' : 'Previous'}
        </Button>
        <span className="min-w-20 text-center text-sm text-slate-600">
          {safePage} / {totalPages}
        </span>
        <Button type="button" size="sm" variant="outline" disabled={safePage >= totalPages} onClick={() => onPageChange(safePage + 1)}>
          {ar ? 'التالي' : 'Next'}
        </Button>
      </div>
    </div>
  );
}
