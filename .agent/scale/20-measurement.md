# Measurement Protocol

## Golden Rule

Every claimed improvement must be backed by:

- Baseline run: dev-server-test2 with BVM bit
- Optimized run: dev-server-test with local **bd (from **bit)

## Standard commands

Baseline:

```bash
cd /Users/luv/bit.dev/code/ws/dev-server-test2
rm -rf node_modules/.cache/webpack-dev/
bit start 2>&1 | tee /tmp/baseline.log
```

Optimized:

```bash
cd /Users/luv/bit.dev/code/ws/dev-server-test
rm -rf node_modules/.cache/webpack-dev/ node_modules/.cache/rspack/
__bd start 2>&1 | tee /tmp/optimized.log
```

## What to record (minimum)

- Date/time
- Machine/OS
- Workspace (test vs test2)
- Bit build source (BVM vs \_\_bd)
- Total boot time
- Slowest env compile time (note which envs use rspack vs webpack)
- GQL query timing (for runtime measurements)
- Any warnings/errors (especially EMFILE)
- Bundle size if measured
- Notes on what changed

## How to identify rspack vs webpack compilation

- Rspack: `Rspack compiled successfully in Xms`
- Webpack: `webpack X.Y.Z compiled successfully in Xms`
- Record both separately

## How to measure runtime (GQL timing)

- Browser DevTools Network tab → filter by `graphql`
- For optimized (three-query): light query time, heavy query time, status query time
- For baseline (single query): total workspace query time
- Also check: time from page load to global loader dismissal

Record results in:

- bench/results.csv
- bench/README.md summary

## Reference Measurements

### Boot (compilation)

| Run                              | Slowest Env                           | Notes                        |
| -------------------------------- | ------------------------------------- | ---------------------------- |
| Baseline (webpack, BVM)          | 67s                                   | dev-server-test2, 2026-02-03 |
| Rspack migration                 | 14s (rspack), 84s (remaining webpack) | dev-server-test, 2026-02-05  |
| pathinfo:false + fs cache (warm) | 38-41s                                | dev-server-test, 2026-02-04  |

### Runtime (GQL queries)

| Run                           | Time to Usable Data | Notes                             |
| ----------------------------- | ------------------- | --------------------------------- |
| Baseline (single query, BVM)  | 12-16s              | All fields in one query, batched  |
| Optimized (three-query split) | ~120ms (light)      | Heavy ~78ms, status ~13s deferred |
