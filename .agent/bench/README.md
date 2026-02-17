# Bench — Baseline vs Optimized Results

This folder is the canonical record of performance comparisons.
No improvement claim is valid unless it appears in results.csv with supporting logs.

---

## Standard comparison (required)

### 1) Clear cache (both workspaces before each run)

- rm -rf node_modules/.cache/webpack-dev/

### 2) Baseline run (dev-server-test2, BVM bit)

Run from dev-server-test2:

- bit start 2>&1 | tee /tmp/baseline.log

### 3) Optimized run (dev-server-test, local \_\_bd)

Run from dev-server-test:

- \_\_bd start 2>&1 | tee /tmp/optimized.log

---

## What to record in results.csv

Required fields:

- date
- os
- workspace
- bit_source (BVM or \_\_bd)
- cache_cleared (true/false)
- total_boot_s
- slowest_env_s
- first_preview_ok (true/false)
- hmr_ok (true/false)
- notes
- commit_or_branch
- log_path

Guidance:

- “total_boot_s” should be the time until the dev servers are up and previews are usable.
- “slowest_env_s” should be the slowest webpack compilation among the parallel envs.
- first_preview_ok and hmr_ok must be verified before marking an optimization as acceptable.

---

## Rules

- One experiment per iteration
- Never stack multiple optimizations without isolating impact
- If a change is neutral or worse, revert and document the result
- If runtime degrades, revert even if boot improves

---
