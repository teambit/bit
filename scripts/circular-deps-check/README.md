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
- `baseline-cycles.json` - Stored baseline (created when you run `--baseline`)
- `README.md` - This file

## How It Works

1. Runs `bit graph --json --cycles` to get circular dependency data
2. Counts total circular dependency edges and unique components involved
3. Compares against stored baseline or specified limit
4. Returns exit code 0 (success) or 1 (failure) for CI

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
