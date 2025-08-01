#!/bin/bash

# CI script for checking circular dependencies
# This script is designed to be run in CI environments

set -e

echo "=== Workspace Cycle Monitoring CI Check ==="
echo "Repository: $(pwd)"
echo "Commit: ${GITHUB_SHA:-${CIRCLE_SHA1:-$(git rev-parse HEAD)}}"
echo "Branch: ${GITHUB_REF_NAME:-${CIRCLE_BRANCH:-$(git branch --show-current)}}"
echo ""

# Change to script directory
cd "$(dirname "$0")"

# Check if workspace cycle baseline exists
if [ ! -f "workspace-cycle-baseline.json" ]; then
    echo "❌ Error: No workspace cycle baseline found!"
    echo "Run 'node monitor-workspace-cycle.js --baseline' to establish a baseline"
    exit 1
fi

# Show baseline info
echo "Current workspace cycle baseline:"
node -e "
const baseline = require('./workspace-cycle-baseline.json');
console.log(\`  Components: \${baseline.count}\`);
console.log(\`  Created: \${baseline.timestamp}\`);
"
echo ""

# Run the workspace cycle check
echo "Running workspace cycle monitoring..."
node monitor-workspace-cycle.js

echo "✅ Workspace cycle monitoring check passed!"