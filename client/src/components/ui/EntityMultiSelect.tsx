import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, X } from "lucide-react";
import type { Entity } from "../../lib/api";

interface Props {
  entities: Entity[];
  value: number[];          // selected entity IDs (empty = all)
  onChange: (ids: number[]) => void;
  className?: string;
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
        checked
          ? "bg-brand-500 border-brand-500"
          : "border-[var(--border)] bg-[var(--surface)]"
      }`}
    >
      {checked && <Check size={9} className="text-white" strokeWidth={3} />}
    </span>
  );
}

export function EntityMultiSelect({ entities, value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const toggle = (id: number) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const label =
    value.length === 0
      ? "All entities"
      : value.length === 1
        ? (entities.find((e) => e.id === value[0])?.name ?? "1 entity")
        : `${value.length} entities`;

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input flex items-center justify-between gap-2 min-w-[160px] text-left cursor-pointer"
      >
        <span className="truncate text-sm">{label}</span>
        <div className="flex items-center gap-1 shrink-0">
          {value.length > 0 && (
            <span
              role="button"
              aria-label="Clear selection"
              className="w-4 h-4 rounded-full hover:bg-[var(--border)] flex items-center justify-center text-[var(--text-muted)] transition-colors"
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
            >
              <X size={10} />
            </span>
          )}
          <ChevronDown
            size={13}
            className={`text-[var(--text-muted)] transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 min-w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl py-1.5 max-h-64 overflow-y-auto">
          {/* All option */}
          <button
            type="button"
            onClick={() => { onChange([]); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[var(--bg)] transition-colors"
          >
            <Checkbox checked={value.length === 0} />
            <span className={value.length === 0 ? "font-medium text-brand-500" : "text-[var(--text)]"}>
              All entities
            </span>
          </button>
          {entities.length > 0 && <div className="border-t border-[var(--border)] my-1" />}
          {entities.map((e) => {
            const checked = value.includes(e.id);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => toggle(e.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[var(--bg)] transition-colors"
              >
                <Checkbox checked={checked} />
                <span className={checked ? "font-medium text-brand-500" : "text-[var(--text)]"}>
                  {e.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
