import { verifySession, SessionPayload } from "./jwt";

export type { SessionPayload };

export async function getSessionFromRequest(req: Request): Promise<SessionPayload | null> {
  const header = req.headers.get("cookie") ?? "";
  const match = /(?:^|;)\s*sj_pos_auth=([^;]+)/.exec(header);
  const token = match ? decodeURIComponent(match[1]) : null;
  if (!token) return null;
  return verifySession(token);
}

export function isSupervisor(session: SessionPayload): boolean {
  return session.role === "supervisor";
}

/** Devuelve 401 si no hay sesión, 403 si hay sesión pero el rol no alcanza. */
export function unauthorized(reason = "No autorizado") {
  return Response.json({ error: reason }, { status: 401 });
}

export function forbidden(reason = "Acceso denegado") {
  return Response.json({ error: reason }, { status: 403 });
}
