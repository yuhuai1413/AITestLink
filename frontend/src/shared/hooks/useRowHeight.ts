import { useState, useCallback, useRef } from "react";

/**
 * 计算表格行高度的 Hook
 * 用于确保表格行高一致
 */
export function useRowHeight(defaultHeight = 44) {
  const [rowHeight, setRowHeight] = useState(defaultHeight);
  const measured = useRef(false);

  const measureRow = useCallback((el: HTMLTableRowElement | null) => {
    if (el && !measured.current) {
      const height = el.getBoundingClientRect().height;
      if (height > 0) {
        setRowHeight(height);
        measured.current = true;
      }
    }
  }, []);

  return { rowHeight, measureRow };
}
