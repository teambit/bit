#!/bin/bash

# Script to filter out uninteresting commits from release notes
# Reads from stdin, outputs filtered commits to stdout
# Usage: cat commits.txt | ./filter-commits.sh

# Patterns to exclude (case-insensitive grep patterns)
# Note: dependency update commits are kept as they are included in Internal section
EXCLUDE_PATTERNS=(
    "bump teambit version"
    "\[skip ci\]"
    "Merge branch.*into master"
    "^ci:"
    "^ci("
    "update circleci"
    "circle ci"
    "circleci config"
    "update circle"
)

# Build grep exclude pattern
GREP_PATTERN=""
for pattern in "${EXCLUDE_PATTERNS[@]}"; do
    if [ -z "$GREP_PATTERN" ]; then
        GREP_PATTERN="$pattern"
    else
        GREP_PATTERN="$GREP_PATTERN|$pattern"
    fi
done

# Filter commits
grep -viE "$GREP_PATTERN"
