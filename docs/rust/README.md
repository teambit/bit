# Rust dependency analysis workstream

Current completion and evidence: [work-package checklist](completion-checklist.md), [combined validation](final-consolidated-validation.md), [final command acceptance](final-command-acceptance.md), [extraction/control results](final-control-and-workspace-results.md), [CPU profiles](command-cpu-profile.md), and [parser/transport decision](parser-and-transport-decision.md). These supersede the initial sequence below; historical raw reports keep their original revisions.

The integration branch for this work is `rust` in [zkochan/bit](https://github.com/zkochan/bit).
Implementation PRs target that branch so the existing default branch keeps its current dependency-analysis backend.

Planning issues:

- [Overall performance plan, #3](https://github.com/zkochan/bit/issues/3)
- [Dependency scanning and parsing, #4](https://github.com/zkochan/bit/issues/4)

## Initial deliverables

1. Audit the actual built-in detectives, options, cache behavior, and traversal integration points.
2. Establish a differential compatibility harness using the installed legacy detectives as the reference.
3. Build a standalone Rust batch extraction prototype with explicit unsupported outcomes and structured diagnostics.
4. Compare the existing implementation, a batching-only TypeScript control, and Rust before production integration.

The initial prototype does not replace custom detectors, resolve packages, or change Bit's persistent cache format. Production integration follows compatibility and full-command performance validation.

## Review gates

Review extraction metadata and the dependency lists actually consumed by Bit separately. Existing precinct dispatch normalizes detector records to source strings; raw detective metadata remains relevant when evaluating compatibility and future integration.

Preserve environment and registered detector precedence. Cover Bit comment directives and Angular resource detection, or explicitly return unsupported and retain the existing detector path.

Report elapsed time, run variation, and total peak memory. Distinguish cold Bit caches from cold operating-system caches. A fast isolated parser benchmark does not establish a faster Bit command.

Initial targets from #4 are 2x eligible extraction speedup over a batching-only control and 15% lower elapsed time on an agreed representative cold-cache command. These are decision thresholds, not measured results. Warm-cache elapsed-time regressions above 5% and total memory increases above 10% require investigation.

## PR sequence

Audit and compatibility work can proceed alongside the standalone engine. Review those foundations before changing production dispatch. Follow with batching-only measurements, opt-in command integration, platform packaging, and finally a separately reviewed default-enable decision.
