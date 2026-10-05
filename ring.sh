#!/bin/zsh
# Звонок владельца в живую редакцию: ring.sh "текст сообщения"
# Кладёт звонок в очередь calls/; режиссёр подхватывает его, когда в редакции есть зрители:
# звонит телефон стола A, трубку берёт ближайший, текст становится фактом для того, кто ответил.
# Structured owner awards; ordinary phone text never transfers money.
CALL_NODE="$(command -v node)"
if [[ ! -x "$CALL_NODE" ]]; then
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
    if [[ -x "$candidate" ]]; then CALL_NODE="$candidate"; break; fi
  done
fi
if [[ ! -x "$CALL_NODE" ]]; then print -u2 'node unavailable'; exit 1; fi
if [[ "$1" == "--bonus" || "$1" == "--bonus-status" ]]; then
  BONUS_DIR="$(cd "$(dirname "$0")" && pwd)"
  BONUS_MODE="$1"; shift
  if [[ "$BONUS_MODE" == "--bonus-status" ]]; then
    exec "$CALL_NODE" "$BONUS_DIR/bonus.mjs" --status "$@"
  fi
  exec "$CALL_NODE" "$BONUS_DIR/bonus.mjs" "$@"
fi
# ring.sh --to reporter "текст" selects a recipient; plain text keeps proximity selection.
CALL_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$CALL_NODE" "$CALL_DIR/call.mjs" "$@"
