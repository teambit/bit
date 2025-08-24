# Circular Dependencies Checker

This directory contains scripts to measure and monitor circular dependencies in the Bit repository.

## Quick Start

1. **Set baseline** (run once to establish current state):

   ```bash
   cd scripts/circular-deps-check
   node check-circular-deps.js --baseline --verbose
   ```

2. **Check for regressions** (run in CI/PR):
   ```bash
   node check-circular-deps.js
   ```

## Script: `check-circular-deps.js`

### Usage

```bash
node check-circular-deps.js [OPTIONS]
```

### Options

- `--baseline` - Save current cycle count as the baseline
- `--max-cycles=N` - Set maximum allowed cycles (overrides baseline)
- `--verbose` - Show detailed output including sample cycles
- `--help, -h` - Show help message

### Examples

**Establish baseline:**

```bash
node check-circular-deps.js --baseline --verbose
```

**Check against baseline:**

```bash
node check-circular-deps.js --verbose
```

**Set specific limit:**

```bash
node check-circular-deps.js --max-cycles=500
```

## CI Integration

The circular dependencies check is integrated into the CircleCI `build_and_test` workflow as the `check_circular_dependencies` job.

**Manual CI check:**

```bash
cd scripts/circular-deps-check
./ci-check.sh
```

**CircleCI Integration**:
The check runs automatically on every PR and push to master as part of the build pipeline.

## Files

- `check-circular-deps.js` - Main checker script
- `diff-cycles.js` - Utility to diff two cycle files and show new/removed cycles
- `create-baseline.js` - Helper to create baseline from current state
- `baseline-cycles.json` - Summary baseline (cycles count, components count, timestamp)
- `baseline-cycles-full.json` - Full baseline with complete graph data for diffs
- `ANALYSIS.md` - Detailed analysis and strategy document
- `README.md` - This file

## How It Works

1. Runs `bit graph --json --cycles` to get circular dependency data
2. Counts total circular dependency edges and unique components involved
3. Compares against stored baseline or specified limit
4. **NEW**: If cycles increased, automatically shows which specific circular dependencies were added
5. Returns exit code 0 (success) or 1 (failure) for CI

## New Circular Dependencies Detection

When the check fails (cycles increased), the script will automatically:

1. Compare current graph with `baseline-cycles-full.json`
2. Show exactly which new circular dependencies were introduced
3. Ignore version number changes to focus on structural changes

Example output when new cycles are detected:

```
❌ FAIL: 2070 cycles > 2066 allowed

=== IDENTIFYING NEW CIRCULAR DEPENDENCIES ===
=== NEW Circular Dependencies (4) ===
1. teambit.workspace/install->teambit.new-component/helper
2. teambit.new-component/helper->teambit.workspace/workspace
3. teambit.scope/export->teambit.dependencies/analyzer
4. teambit.dependencies/analyzer->teambit.scope/objects
```

## Baseline File Format

The `baseline-cycles.json` file stores:

```json
{
  "totalCycles": 2056,
  "uniqueComponents": 324,
  "timestamp": "2025-07-25T19:27:53.631Z"
}
```

## Monitoring Progress

Track improvements over time:

```bash
# Check current state
node check-circular-deps.js --verbose

# After making improvements, update baseline
node check-circular-deps.js --baseline --verbose
```

## Exit Codes

- `0` - Success (cycles within limit)
- `1` - Failure (cycles exceed limit or error occurred)
