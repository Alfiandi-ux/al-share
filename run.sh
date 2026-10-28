#!/data/data/com.termux/files/usr/bin/bash
# Al-share launcher script
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
python3 "$DIR/alshare.py" "$@"
