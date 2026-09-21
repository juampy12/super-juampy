"use client";

import type { Store } from "@/lib/analytics/types";

interface Props {
  stores: Store[];
  value: string;
  onChange: (storeId: string) => void;
}

export function StorePicker({ stores, value, onChange }: Props) {
  return (
    <label className="picker">
      <span>Local</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <style jsx>{`
        .picker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: var(--muted, #6b7280);
        }
        select {
          padding: 8px 12px;
          border-radius: 10px;
          border: 1px solid var(--border, #e5e7eb);
          background: var(--card, #fff);
          color: var(--fg, #111827);
          font-size: 14px;
        }
        select:focus {
          outline: none;
          border-color: #1a5fa8;
          box-shadow: 0 0 0 3px rgba(26, 95, 168, 0.18);
        }
      `}</style>
    </label>
  );
}
