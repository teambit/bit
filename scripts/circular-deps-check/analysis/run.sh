#!/usr/bin/env bash
# Diagnose circular dependencies between workspace components.
# Usage: scripts/circular-deps-check/analysis/run.sh [bit-binary]   (default: bit)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
BIT="${1:-bit}"
export OUT_DIR="${OUT_DIR:-$HERE/out}"
mkdir -p "$OUT_DIR"
cd "$REPO"
echo "> bit deps circular (ground truth)"
"$BIT" deps circular --json > "$OUT_DIR/bit-circular.json" 2>/dev/null
echo "> core aspects"
node -e '
const fs=require("fs"); const t=fs.readFileSync("scopes/harmony/bit/manifests.ts","utf8");
const imp={}; for (const m of t.matchAll(/import\s*\{([^}]+)\}\s*from\s*["\x27](@teambit\/[^"\x27]+)["\x27]/g)) m[1].split(",").map(s=>s.trim()).filter(Boolean).forEach(n=>imp[n]=m[2]);
const used=[...t.slice(t.indexOf("manifestsMap")).matchAll(/\[(\w+)\.id\]/g)].map(m=>m[1]);
fs.writeFileSync(process.env.OUT_DIR+"/core-pkgs.json", JSON.stringify([...new Set(used.map(u=>imp[u]).filter(Boolean)),"@teambit/bit","@teambit/config"]));'
node "$HERE/analyze.js" "$REPO" "$OUT_DIR/edges.json"
node "$HERE/di.js" "$REPO"
node "$HERE/views.js"
node "$HERE/iter.js" full > "$OUT_DIR/cuts.txt"
head -1 "$OUT_DIR/cuts.txt"
node "$HERE/phases.js" | sed -n '1,5p'
echo "full cut list: $OUT_DIR/cuts.txt"
