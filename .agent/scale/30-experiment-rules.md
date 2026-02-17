### `scale/30-experiment-rules.md`

# Experiment Rules (No Chaos)

- One hypothesis per iteration
- Minimal diff
- Revert if neutral/worse
- Never “stack” multiple changes without isolating impact
- Prefer changes that improve both boot + runtime (or at least don’t harm runtime)
- If a change risks browser-safety, it must be guarded and validated by runtime checklist
