#!/bin/sh
set -eu
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

# Finder may propagate the downloaded ZIP's quarantine to every bundled
# executable and library. The user has launched this local package; verify
# each bundled Mach-O before clearing quarantine only on those files.
for file in "$DIR"/bin/* "$DIR"/bin/prism/* "$DIR"/lib/*.dylib; do
    [ -f "$file" ] || continue
    case "$file" in */LICENSE) continue ;; esac
    if /usr/bin/xattr -p com.apple.quarantine "$file" >/dev/null 2>&1; then
        if ! /usr/bin/codesign --verify --strict "$file"; then
            echo "Firma non valida: $file" >&2
            exit 1
        fi
        /usr/bin/xattr -d com.apple.quarantine "$file"
    fi
done

exec "$DIR/bin/usb-ai-rust"
