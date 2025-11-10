#!/usr/bin/env bash
set -Eeuo pipefail
echo "== Sync de variables de entorno =="

TMP_USED=$(mktemp)
TMP_DECL=$(mktemp)

grep -Rho --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git "process\.env\.[A-Za-z0-9_]\+" . \
 | sed 's/.*process\.env\.//' | sort -u > "$TMP_USED"

touch "$TMP_DECL"
for f in .env.local .env.example; do
  [ -f "$f" ] && grep -E '^[A-Za-z0-9_]+=' "$f" | cut -d= -f1 | sort -u >> "$TMP_DECL"
done
sort -u -o "$TMP_DECL" "$TMP_DECL"

echo -e "\n> Faltantes (usadas pero no declaradas):"
comm -23 "$TMP_USED" "$TMP_DECL" | sed 's/^/  - /' || true

echo -e "\n> Sobrantes (declaradas pero no usadas):"
comm -13 "$TMP_USED" "$TMP_DECL" | sed 's/^/  - /' || true

rm -f "$TMP_USED" "$TMP_DECL"
echo -e "\nListo ✅"
