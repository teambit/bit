#!/bin/bash

# CI script for checking circular dependencies
# This script is designed to be run in CI environments

set -e

echo "=== Circular Dependencies CI Check ==="
echo "Repository: $(pwd)"
echo "Commit: ${GITHUB_SHA:-${CIRCLE_SHA1:-$(git rev-parse HEAD)}}"
echo "Branch: ${GITHUB_REF_NAME:-${CIRCLE_BRANCH:-$(git branch --show-current)}}"
echo ""

# Change to script directory
cd "$(dirname "$0")"

# Check if baseline exists
if [ ! -f "baseline-cycles.json" ]; then
    echo "❌ Error: No baseline found!"
    echo "Run 'node check-circular-deps.js --baseline' to establish a baseline"
    exit 1
fi

# Show baseline info
echo "Current baseline:"
node -e "
const baseline = require('./baseline-cycles.json');
console.log(\`  Cycles: \${baseline.totalCycles}\`);
console.log(\`  Components: \${baseline.uniqueComponents}\`);
console.log(\`  Created: \${baseline.timestamp}\`);
"
echo ""

# Run the check
echo "Running circular dependencies check..."
node check-circular-deps.js

echo "✅ Circular dependencies check passed!"