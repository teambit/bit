### `scale/50-glossary.md`

# Glossary

BVM bit:

- System-installed Bit (what users experience today)

\_\_bd:

- node /Users/luv/bit.dev/code/\_\_bit/node_modules/@teambit/bit/dist/app.js

dev-server-test:

- Optimized workspace, run with \_\_bd

dev-server-test2:

- Baseline workspace, run with BVM bit

Host deps:

- Dependencies provided by envs via getPreviewHostDependenciesFromEnv(), curated browser-safe

Preview infrastructure deps:

- Dependencies of the preview runtime stack (often the real module-count bottleneck)

---

## 3) “Any other context file” — what you should add

### `context.md`

Put exactly the big context you pasted (as-is). That’s your source of truth.

### `bench/README.md`

# Bench Summary

This folder records baseline vs optimized results.

Rules:

- Every entry in results.csv must correspond to a baseline run (dev-server-test2/BVM)
  and an optimized run (dev-server-test/\_\_bd) under similar conditions.
- If a result is ambiguous, mark it as such and do not claim improvement.

### `bench/results.csv`

Create the file with this header row:

date,os,workspace,bit_source,cache_cleared,total_boot_s,slowest_env_s,notes,commit_or_branch

(Leave it empty otherwise.)
