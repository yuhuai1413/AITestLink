import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

interface GlassStyle {
  top: number;
  height: number;
  opacity: number;
}

export function useNavHighlight<ID extends string | number>(
  activeId: ID | null,
  deps?: unknown[],
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef<Map<ID, HTMLElement>>(new Map());
  const [style, setStyle] = useState<GlassStyle>({ top: 0, height: 0, opacity: 0 });
  const rafRef = useRef<number>(0);

  const register = useCallback((id: ID) => (el: HTMLElement | null) => {
    if (el) itemsRef.current.set(id, el);
    else itemsRef.current.delete(id);
  }, []);

  const recalc = useCallback(() => {
    if (!activeId) {
      setStyle((s) => ({ ...s, opacity: 0 }));
      return;
    }

    const container = containerRef.current;
    const item = itemsRef.current.get(activeId);
    if (!container || !item) return;

    const cRect = container.getBoundingClientRect();
    const iRect = item.getBoundingClientRect();

    setStyle({
      top: iRect.top - cRect.top,
      height: iRect.height,
      opacity: 1,
    });
  }, [activeId]);

  // 依赖变化时立即 + 延迟重算
  useLayoutEffect(() => {
    recalc();
    const t1 = requestAnimationFrame(() => {
      recalc();
      const t2 = requestAnimationFrame(() => recalc());
      rafRef.current = t2;
    });
    rafRef.current = t1;
    return () => cancelAnimationFrame(rafRef.current);
  }, [recalc, ...(deps ?? [])]);

  // 监听容器尺寸变化，自动重算（延迟确保布局稳定）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let timer: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(recalc);
      }, 350);
    });
    ro.observe(container);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [recalc]);

  return { containerRef, register, style, recalc };
}
