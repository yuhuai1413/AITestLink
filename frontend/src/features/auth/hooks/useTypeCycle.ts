import { useEffect, useState } from "react";

export function useTypeCycle(items: string[], ms = 2400) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % items.length);
        setVisible(true);
      }, 360);
    }, ms);

    return () => clearInterval(t);
  }, [items.length, ms]);

  return { text: items[idx], visible };
}
