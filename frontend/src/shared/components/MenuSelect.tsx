import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const MENU_SELECT_OPEN_EVENT = "aitestlink:menu-select-open";
const MENU_SELECT_CLOSE_ANIMATION_MS = 180;

export interface MenuSelectOption<T extends string> {
  value: T;
  label: string;
}

interface MenuSelectProps<T extends string> {
  value: T;
  options: MenuSelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  size?: "default" | "compact";
  required?: boolean;
}

export function MenuSelect<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "请选择",
  className = "",
  size = "default",
  required = false,
}: MenuSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [renderMenu, setRenderMenu] = useState(false);
  const [closing, setClosing] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(`menu-select-${Math.random().toString(36).slice(2)}`);
  const closeTimerRef = useRef<number | null>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (open) {
      setRenderMenu(true);
      setClosing(false);
      return;
    }

    if (renderMenu) {
      setClosing(true);
      setActiveIndex(null);
      closeTimerRef.current = window.setTimeout(() => {
        setRenderMenu(false);
        setClosing(false);
        closeTimerRef.current = null;
      }, MENU_SELECT_CLOSE_ANIMATION_MS);
    }

    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [open, renderMenu]);

  useEffect(() => {
    const closeOtherMenus = (event: Event) => {
      const currentId = (event as CustomEvent<string>).detail;
      if (currentId !== idRef.current) setOpen(false);
    };
    window.addEventListener(MENU_SELECT_OPEN_EVENT, closeOtherMenus);
    return () => window.removeEventListener(MENU_SELECT_OPEN_EVENT, closeOtherMenus);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  return (
    <div className={`menu-select menu-select--${size}${className ? ` ${className}` : ""}`} ref={rootRef}>
      <button
        className={open ? "menu-select__trigger menu-select__trigger--open" : "menu-select__trigger"}
        type="button"
        disabled={disabled}
        aria-required={required}
        onClick={(event) => {
          event.stopPropagation();
          if (!disabled) {
            setOpen((current) => {
              if (!current) {
                window.dispatchEvent(new CustomEvent(MENU_SELECT_OPEN_EVENT, { detail: idRef.current }));
              }
              return !current;
            });
          }
        }}
      >
        <span>{selected?.label || placeholder}</span>
        <ChevronDown size={15} className={open ? "menu-select__chevron menu-select__chevron--open" : "menu-select__chevron"} />
      </button>
      {renderMenu ? (
        <div
          className={closing ? "menu-select__menu menu-select__menu--closing" : "menu-select__menu"}
          onClick={(event) => event.stopPropagation()}
          onMouseLeave={() => setActiveIndex(null)}
        >
          <span
            className={activeIndex === null ? "menu-select__hover menu-select__hover--hidden" : "menu-select__hover"}
            style={activeIndex === null ? undefined : { transform: `translateY(${activeIndex * 34}px)` }}
          />
          {options.map((option, index) => (
            <button
              key={option.value}
              className={option.value === value ? "menu-select__item menu-select__item--active" : "menu-select__item"}
              type="button"
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
