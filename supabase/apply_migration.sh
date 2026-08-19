#!/usr/bin/env bash
# ============================================================================
#  apply_migration.sh — SmartPOS: migración "SEGURIDAD Y STAFF (2026-08-18)"
#
#  Aplica los bloques SQL de migración contra la Management API de Supabase
#  (HTTPS + PAT). NO usa el puerto 5432 (bloqueado por firewall). NUNCA
#  imprime el PAT en pantalla.
#
#  Bloques aplicados en orden (idempotentes):
#    01 DDL        -> active_sessions, staff_invites, índices, enable RLS
#    02 Funciones  -> RPCs session_register/session_unregister/staff_list/
#                     staff_invite/handle_staff_register/staff_accept_invite/
#                     staff_update_role/staff_remove/my_session_info
#    03 Policies   -> RLS endurecida (profiles_manage*, active_sessions_own,
#                     staff_invites_tenant)
#
#  Uso:  ./apply_migration.sh
#  Para correr contra otro proyecto, editar PROJECT_ID o exportarlo:
#    PROJECT_ID=xxx ./apply_migration.sh
# ============================================================================
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-qtjcgbcqdhaubmdhqgxe}"
PAT_FILE="${PAT_FILE:-$HOME/.config/mrcom/supabase-pat.key}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/migrations"

if [[ ! -f "$PAT_FILE" ]]; then
  echo "ERROR: no se encontró el PAT en $PAT_FILE" >&2
  exit 1
fi

# Lee el PAT desde archivo y lo normaliza (sin saltos de línea finales).
# Se guarda en variable y se pasa a curl; nunca se imprime.
PAT="$(tr -d '\r\n' < "$PAT_FILE")"
if [[ -z "$PAT" ]]; then
  echo "ERROR: el archivo PAT está vacío" >&2
  exit 1
fi

ENDPOINT="https://api.supabase.com/v1/projects/${PROJECT_ID}/database/query"

apply_block() {
  local label="$1"
  local sql_file="$2"
  local body tmp code
  body="$(mktemp)"
  tmp="$(mktemp)"

  # Arma el JSON del body con python3 (escapa \n, comillas, etc.) para el
  # endpoint query de la Management API: {"query": "<SQL completo>"}
  python3 - "$sql_file" > "$body" <<'PY'
import json, sys
sql_path = sys.argv[1]
with open(sql_path, 'r', encoding='utf-8') as f:
    payload = {'query': f.read()}
sys.stdout.write(json.dumps(payload))
PY

  code="$(curl -s -o "$tmp" -w '%{http_code}' -X POST "$ENDPOINT" \
    -H "Authorization: Bearer $PAT" \
    -H "Content-Type: application/json" \
    --data @"$body")"

  if [[ "$code" == "200" || "$code" == "201" ]]; then
    echo "[OK] $label"
  else
    echo "[ERROR] $label (HTTP $code):" >&2
    cat "$tmp" >&2
    rm -f "$body" "$tmp"
    exit 1
  fi

  rm -f "$body" "$tmp"
}

echo "== SmartPOS: aplicando migración SEGURIDAD Y STAFF (2026-08-18) =="
apply_block "01 DDL — active_sessions / staff_invites" \
  "$MIGRATIONS_DIR/2026-08-18_01_ddl.sql"
apply_block "02 Funciones / RPCs" \
  "$MIGRATIONS_DIR/2026-08-18_02_functions.sql"
apply_block "03 Policies RLS" \
  "$MIGRATIONS_DIR/2026-08-18_03_policies.sql"
echo "== Migración aplicada correctamente =="
echo "Verificación sugerida (desde el cliente, con sesión autenticada):"
echo "  POST /rest/v1/rpc/my_session_info   (debe responder jsonb con ip/last_seen_at)"
