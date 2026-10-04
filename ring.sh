#!/bin/zsh
# Звонок владельца в живую редакцию: ring.sh "текст сообщения"
# Кладёт звонок в очередь calls/; режиссёр подхватывает его, когда в редакции есть зрители:
# звонит телефон стола A, трубку берёт ближайший, текст становится фактом для того, кто ответил.
# Structured owner awards; ordinary phone text never transfers money.
if [[ "$1" == "--bonus" || "$1" == "--bonus-status" ]]; then
  BONUS_DIR="$(cd "$(dirname "$0")" && pwd)"
  BONUS_MODE="$1"; shift
  if [[ "$BONUS_MODE" == "--bonus-status" ]]; then
    exec node "$BONUS_DIR/bonus.mjs" --status "$@"
  fi
  exec node "$BONUS_DIR/bonus.mjs" "$@"
fi
D="$(cd "$(dirname "$0")" && pwd)/calls"; mkdir -p "$D"
[ -z "$*" ] && { echo "нужен текст: ring.sh \"текст\""; exit 1; }
T="$D/.tmp-$$"; /usr/bin/python3 -c 'import json,sys,time; print(json.dumps({"text": sys.argv[1][:500], "at": int(time.time()*1000)}, ensure_ascii=False))' "$*" > "$T" && mv "$T" "$D/$(date +%s)-$$.json" && echo "звонок в очереди: $(ls "$D"/*.json | wc -l | tr -d ' ') шт."
