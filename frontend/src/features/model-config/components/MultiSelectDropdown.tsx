import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, X } from "lucide-react";
import { StatusPill } from "../../../shared/components/StatusPill";


// 多选下拉框组件
// lockedValues: 不可取消的值（单个编辑时锁定该配置固有的节点）
export function MultiSelectDropdown({
  options,
  value,
  onChange,
  lockedValues = [],
  placeholder = "请选择",
}: {
  options: { label: string; value: string; color: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  lockedValues?: string[];
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (val: string) => {
    if (value.includes(val)) {
      // 锁定的值不可取消
      if (lockedValues.includes(val)) return;
      onChange(value.filter((v) => v !== val));
    } else {
      onChange([...value, val]);
    }
  };

  const selectedLabels = options.filter((o) => value.includes(o.value));

  const inputStyle: CSSProperties = {
    width: "100%",
    minHeight: 38,
    border: `1px solid ${isFocused ? "var(--blue)" : "var(--line)"}`,
    borderRadius: "var(--radius-l4)",
    background: "var(--surface)",
    cursor: "pointer",
    padding: "0 32px 0 12px",
    fontSize: 14,
    outline: isFocused ? "2px solid var(--blue)" : "none",
    outlineOffset: isFocused ? "-1px" : "auto",
    transition: "border-color 0.15s, outline 0.15s",
  };

  const dropdownStyle: CSSProperties = {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 4,
    background: "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: "var(--radius-l4)",
    boxShadow: "0 10px 40px rgba(15, 23, 42, 0.12)",
    zIndex: 1000,
    maxHeight: 220,
    overflowY: "auto",
    padding: "4px 0",
  };

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <div
        onClick={() => { setIsOpen(!isOpen); setIsFocused(!isOpen); }}
        style={inputStyle}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, minHeight: 38, alignItems: "center" }}>
          {selectedLabels.length === 0 ? (
            <span style={{ color: "var(--muted)", fontSize: 14 }}>{placeholder}</span>
          ) : (
            selectedLabels.map((item) => {
              const isLocked = lockedValues.includes(item.value);
              return (
                <StatusPill key={item.value} tone={item.color as any} className="multi-select-tag">
                  {item.label}
                  {!isLocked && (
                    <span
                      onClick={(e) => { e.stopPropagation(); toggleOption(item.value); }}
                      style={{ marginLeft: 4, cursor: "pointer", display: "flex", alignItems: "center", opacity: 0.7 }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                    >
                      <X size={12} />
                    </span>
                  )}
                </StatusPill>
              );
            })
          )}
        </div>
        <ChevronDown
          size={16}
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--muted)",
            pointerEvents: "none",
            transition: "transform 0.15s",
          }}
        />
      </div>
      {isOpen && (
        <div style={dropdownStyle} onMouseDown={(e) => e.stopPropagation()}>
          {options.map((opt, index) => {
            const isLocked = lockedValues.includes(opt.value);
            const isSelected = value.includes(opt.value);
            return (
              <div
                key={opt.value}
                onClick={() => toggleOption(opt.value)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  cursor: isLocked ? "default" : "pointer",
                  opacity: isLocked ? 0.7 : 1,
                  background: isSelected ? "var(--blue-soft)" : "transparent",
                  transition: "background 0.1s",
                  borderBottom: index < options.length - 1 ? "1px solid var(--line)" : "none",
                }}
                onMouseEnter={(e) => { if (!isLocked && !isSelected) e.currentTarget.style.background = "var(--surface-soft)"; }}
                onMouseLeave={(e) => { if (!isLocked) e.currentTarget.style.background = isSelected ? "var(--blue-soft)" : "transparent"; }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  readOnly
                  tabIndex={-1}
                  style={{ cursor: isLocked ? "default" : "pointer", width: 15, height: 15, accentColor: "var(--blue)" }}
                />
                <StatusPill tone={opt.color as any}>{opt.label}</StatusPill>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

