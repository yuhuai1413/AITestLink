import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MenuSelect } from "./MenuSelect";

interface DataPanelProps {
  toolbar?: ReactNode;
  search?: ReactNode;
  children: ReactNode;
  total?: number;
  pageSize?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export function DataPanel({
  toolbar,
  search,
  children,
  total = 0,
  pageSize = 10,
  currentPage: controlledPage,
  onPageChange,
  onPageSizeChange,
}: DataPanelProps) {
  const [internalPage, setInternalPage] = useState(1);
  const currentPage = controlledPage ?? internalPage;
  const totalPages = Math.ceil(total / pageSize);

  const handlePageChange = (page: number) => {
    if (onPageChange) {
      onPageChange(page);
    } else {
      setInternalPage(page);
    }
  };

  const handlePageSizeChange = (size: number) => {
    if (onPageSizeChange) {
      onPageSizeChange(size);
    }
    handlePageChange(1);
  };

  return (
    <div className="data-panel">
      {search && <div className="data-panel__search">{search}</div>}
      {toolbar && <div className="data-panel__toolbar">{toolbar}</div>}
      <div className="data-panel__content">{children}</div>
      {total > 0 && (
        <div className="data-panel__pagination">
          <span className="pagination__info">
            共 {total} 条
          </span>
          <MenuSelect
            className="pagination__menu-select"
            size="compact"
            value={String(pageSize)}
            options={[10, 20, 50, 100].map((size) => ({ value: String(size), label: `${size}条/页` }))}
            onChange={(value) => handlePageSizeChange(Number(value))}
          />
          <div className="pagination__buttons">
            <button
              className="pagination__btn"
              type="button"
              disabled={currentPage === 1}
              onClick={() => handlePageChange(currentPage - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((page) => {
                if (totalPages <= 7) return true;
                if (page === 1 || page === totalPages) return true;
                if (Math.abs(page - currentPage) <= 1) return true;
                return false;
              })
              .reduce<(number | "ellipsis")[]>((acc, page, idx, arr) => {
                if (idx > 0) {
                  const prev = arr[idx - 1];
                  if (page - prev > 1) acc.push("ellipsis");
                }
                acc.push(page);
                return acc;
              }, [])
              .map((item, idx) =>
                item === "ellipsis" ? (
                  <span key={`ellipsis-${idx}`} className="pagination__ellipsis">...</span>
                ) : (
                  <button
                    key={item}
                    className={`pagination__btn ${currentPage === item ? "pagination__btn--active" : ""}`}
                    type="button"
                    onClick={() => handlePageChange(item)}
                  >
                    {item}
                  </button>
                )
              )}
            <button
              className="pagination__btn"
              type="button"
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => handlePageChange(currentPage + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="pagination__goto">
            <span>前往</span>
            <input
              type="number"
              className="pagination__goto-input"
              min={1}
              max={totalPages}
              defaultValue={currentPage}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = Number((e.target as HTMLInputElement).value);
                  if (val >= 1 && val <= totalPages) {
                    handlePageChange(val);
                  }
                }
              }}
            />
            <span>页</span>
          </div>
        </div>
      )}
    </div>
  );
}
