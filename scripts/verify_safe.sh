#!/usr/bin/env bash
set -Eeuo pipefail

APP_PORT=3000
SMOKE_PATHS=("/" "/api/health")
DEV_BOOT_WAIT=4

echo "== Super Juampy • Verificación Segura (WSL) =="
echo "Fecha: $(date -Is)"
echo "Node: $(node -v) | npm: $(npm -v)"
echo

# 1️⃣ Git limpio
echo "> Git status"
git status --porcelain || true
echo

# 2️⃣ Manager (npm/pnpm)
PM="npm"
[ -f pnpm-lock.yaml ] && PM="pnpm"
echo "> Package manager: $PM"

# 3️⃣ Variables de entorno
echo -e "\n> Variables mínimas (.env.local)"
if [ -f .env.local ]; then
  grep -E 'NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE' .env.local || true
else
  echo "⚠️ Falta archivo .env.local"
fi

# 4️⃣ Instalar dependencias
echo -e "\n> Instalando dependencias..."
if [ "$PM" = "pnpm" ]; then
  corepack enable >/dev/null 2>&1 || true
  pnpm install --frozen-lockfile
else
  npm ci
fi

# 5️⃣ Lint y Typecheck
echo -e "\n> Lint"
npm run lint || true

echo -e "\n> Typecheck"
npm run typecheck || npx tsc --noEmit

# 6️⃣ Build
echo -e "\n> Build de producción"
npm run build

# 7️⃣ Levantar dev temporal
echo -e "\n> Iniciando servidor temporal..."
( npm run dev >/tmp/sj_dev.log 2>&1 & echo $! > /tmp/sj_dev.pid )
sleep $DEV_BOOT_WAIT

if ss -ltn | grep -q ":${APP_PORT}"; then
  echo "✅ Servidor escuchando en puerto ${APP_PORT}"
else
  echo "❌ No se detecta servidor en puerto ${APP_PORT}"
  tail -n 30 /tmp/sj_dev.log
  exit 1
fi

# 8️⃣ Health check
echo -e "\n> Probando endpoints"
for p in "${SMOKE_PATHS[@]}"; do
  echo "GET http://localhost:${APP_PORT}${p}"
  curl -sS "http://localhost:${APP_PORT}${p}" || true
  echo -e "\n"
done

# 9️⃣ Apagar servidor
if [ -f /tmp/sj_dev.pid ]; then
  kill "$(cat /tmp/sj_dev.pid)" >/dev/null 2>&1 || true
  rm -f /tmp/sj_dev.pid
fi

echo -e "\n✅ Verificación completa (sin errores críticos)"
