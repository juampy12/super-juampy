export type AuditEntry = {
  action: string;
  at?: string;
  by?: string;
  role?: string;
  store?: string;
  register?: string;
  reason?: string;
};

export type ParsedAuditNotes = {
  entries: AuditEntry[];
  legacy: string[];
};

export function shortId(value?: string | null) {
  if (!value || value === "-") return "-";
  return value.length > 8 ? value.slice(0, 8) : value;
}

export function formatAuditDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function parseAuditNotes(notes?: string | null): ParsedAuditNotes {
  const entries: AuditEntry[] = [];
  const legacy: string[] = [];

  for (const rawLine of String(notes ?? "").split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = /^\[AUDITORIA\s+([^\]]+)\]\s*(.*)$/.exec(line);
    if (!match) {
      legacy.push(line);
      continue;
    }

    const [, action, rest] = match;
    const reasonMarker = " reason=";
    const reasonIndex = rest.indexOf(reasonMarker);
    const kvPart = reasonIndex >= 0 ? rest.slice(0, reasonIndex) : rest;
    const reason = reasonIndex >= 0 ? rest.slice(reasonIndex + reasonMarker.length).trim() : undefined;
    const entry: AuditEntry = { action };

    for (const token of kvPart.split(/\s+/)) {
      const eq = token.indexOf("=");
      if (eq <= 0) continue;
      const key = token.slice(0, eq);
      const value = token.slice(eq + 1);
      if (key === "at") entry.at = value;
      if (key === "by") entry.by = value;
      if (key === "role") entry.role = value;
      if (key === "store") entry.store = value;
      if (key === "register") entry.register = value;
    }
    if (reason) entry.reason = reason;
    entries.push(entry);
  }

  return { entries, legacy };
}

export function auditActionLabel(action: string) {
  const normalized = action.toLowerCase();
  if (normalized.includes("reemplazo")) return "Reemplazo";
  if (normalized.includes("cierre")) return "Cierre";
  return action;
}
