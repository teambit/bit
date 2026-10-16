# Status and diff acceptance

This matrix tracks the second operation milestone of [#73](https://github.com/zkochan/bit/issues/73).
It records the implementation, pinned-Node oracle coverage, and qualification for public
`status` (including quick mode) and `diff`. Final acceptance requires the complete local gates
and the PR's platform checks to pass on the same head; the tested head is recorded in the PR
and issue update. Other #73 operation milestones remain separate.

| Requirement | Owner and data path | Evidence in this branch | Acceptance |
| --- | --- | --- | --- |
| Workspace inventory and file identity | Rust inventory, ignore rules, Source normalization and comparison | Existing status, missing-component, lane and bitmap suites; nested-file/CRLF diff case | Full regression and Windows oracle suites |
| Current/stored metadata comparison | Shared Rust repository/workspace engine | Existing status/diff coverage; new component policy cases | Full regression suite |
| Component dependency policy | Rust `EnvPolicy`/`VariantPolicy` projection and existing dependency pipeline | Object/array forms, forced/automatic entries, duplicate/lifecycle precedence, removals and `resolveFromEnv`; bitmap, component.json and stored policies | Local pinned-Node parity passed |
| Root dependency policy | Existing Rust workspace-policy implementation | Object `version`/`preserve` entries and package metadata comparison | Local pinned-Node parity passed |
| Aspect and variant precedence | Existing Rust installer aspect merger and variant matcher | Bitmap, component.json, stored specific/non-specific, directory/namespace variants, exclusions and propagation | Local pinned-Node parity passed for dependency policy |
| Merge configuration | Existing Rust `MergeConfig`, native combination and automatic/forced policy split | Resolved and unresolved merge-conflict entries; boolean conflict issue | Pinned-Node parity, including real unresolved/resolved lane merges |
| Component/global issue ignores | Rust projected aspect config and native issue filtering | New component.json/variant and root ignore fixture | Pinned-Node parity and full regression suite |
| Environments and aspect callbacks | JavaScript supplies Harmony callbacks; Rust owns inventory, source normalization/hashing, comparison and operation state | Core/custom environments; metadata and source changes, virtual source addition/removal, formatter overrides, stdout/colors and quick provider startup | Pinned-Node adapter suite and confined-source/read-proof negative tests |
| Diff selection | Rust literal/glob selection and workspace state predicates | Classes, positive/negative extglobs, numeric ranges, new/modified/codeModified/env/localOnly/softTagged/snappedOnMain/internal/deprecated, AND/union | Local JSON and ordinary/CI text parity passed, including remote deletion; versioned literals preserve Node errors |
| Pattern semantics | Shared native minimatch subset plus read-only range expansion; write-command grammar unchanged | Pinned Node multimatch 5.0.0/minimatch 3.1.5 oracle, including Bit's comma and `@` splitting quirks | Local oracle tests passed |
| Diff presentation | Rust file/metadata/table/verbose formatting and Git invocation | Standard, JSON, table, parent, historical, custom package name and configured Git cases | 20 diff completion oracle cases |
| Remote-only diff versions | Native retained import preparation and publication after report preflight | File and HTTP remote diff cases | File/HTTP and embedded-Git-scope oracle cases with imported object/index verification |
| Bitmap startup auto-sync | Native git HEAD/sentinel checks, retained inbound import and bitmap publication before command capture | Remote head advancement; JSON/ordinary/CI and quick status, mini-status exclusion, diff, original-version dependency closure, cached sentinel, fetch retry and no-fallback-after-publication fixtures | Local pinned-Node parity passed |
| Current-lane status | Existing native lane-head/ref/history engine | Existing exported/forked/deleted/hidden-dependent lane suites, optional absent main heads and staged models outside the bitmap | Full regression suite |
| Missing/corrupt data and precommit mutation | Native validated object reads, controls, dependency/environment proofs | Existing failure cases plus this branch's control/environment read sets | Mutation, unsafe-path, symlink and bounded-source tests |
| Windows behavior | Native directory traversal/diff ordering | New Windows ordering implementation and parity cases | Dedicated pinned-Node Windows oracle job |
| Performance | Complete commands on fresh fixture copies | Two-component policy/source-change fixture measured below | Fresh-copy whole-command measurements below |

## Valid-input audit

The implementation audit removed the workspace/resolver installation-option allowlists and
scope metadata whitelist. Native startup reconciliation handles `bitmapAutoSync` as a separate
operation before command capture; committed startup failures cannot delegate. The remaining
settings' read-side behavior is qualified by an oracle fixture with a
custom roots directory, package manager/linker settings, disabled core linking, package overrides
and a scope license. Root policy remains validated by the native policy reader.

The status collation path now uses the permitted presentation adapter for locale ordering.
Temporary lifecycle cleanup, headless tagged models, merge states and custom callbacks have
separate qualification fixtures; their final gate results determine milestone acceptance.

Locally removed bitmap rows are excluded from explicit diff selection pools, matching `listIds`.
Implicit `diff --parent` retains them, matching the command's bitmap-based selection.
Imported remotely removed Versions remain selectable with `$deleted`; JSON and ordinary/CI
text parity cover their deleted-file diff. A literal `component@version` is not equivalent to a
positional revision: pinned Node itself throws `computeDiff: fromFiles must be defined`, so native
selection preserves its canonical error through pre-write delegation.

Saved external graph adjacency does not require optional external model metadata. The missing
model/index-row oracle succeeds without fetching or rewriting the model; native behavior retains
that distinction rather than inventing an import. A stale index pointing at a missing model
causes Node's own index-repair error and remains a corruption boundary.

## Permitted boundaries

Harmony aspect execution, custom environment callbacks, dependency detector callbacks, class
hydration, and presentation callbacks can remain JavaScript adapters. Rust must retain file
inventory, Source bodies, object validation, component policy precedence and operation state.
Sending metadata to one of those callbacks is different from delegating the whole VCS command.

Malformed arguments, unsupported legacy object schemas, corrupt/missing objects that cannot be
fetched, unsafe paths and explicit resource limits retain pre-write delegation. These safety and
compatibility boundaries must remain documented, but do not justify treating an ordinary valid
workspace setting or missing production operation path as a completed migration.

## Reproducible evidence

The policy and selector parity fixtures live in
[`status_component_policy.rs`](../../native/cli/tests/e2e/harmony/status_component_policy.rs) and
[`status_component_selectors.rs`](../../native/cli/tests/e2e/harmony/status_component_selectors.rs).
The pattern oracle records the actual package versions in
[`oracle.json`](../../native/cli/src/commands/patterns/extended/oracle.json).
Final qualification must record the tested head, helper/fixture fingerprints, complete-command
timings and all required CI results before this milestone is checked off.

### Whole-command benchmark

Linux, pinned Node CLI 2.2.94 on Node 22.22.0 versus the final Rust release build.
Five alternating runs per implementation, each on a fresh workspace copy. All 20
Node/Rust pairs have identical complete stdout and visible stderr; native traces
confirm that no measured command delegates.

| Fixture and command | Node median | Rust release median | Ratio |
| --- | ---: | ---: | ---: |
| ordinary, `status --json` | 517.506 ms | 7.275 ms | 71.13× |
| ordinary, `diff comp1 --json` | 462.469 ms | 7.113 ms | 65.02× |
| callbacks, `status --json` | 1789.117 ms | 1504.760 ms | 1.19× |
| callbacks, `diff bar/foo --json` | 1670.458 ms | 1430.105 ms | 1.17× |

The ordinary fixture has two tagged components, a changed source, a component
dependency and a variant with a manual development package policy. Generate it
with the e2e helper's `populate_components(2, true, "")`, `tag_without_build("", "")`,
then change `comp1/index.js` to
`module.exports = require('@my-scope/comp2'); // change\n` and set the `comp1` variant's
`teambit.dependencies/dependency-resolver.policy.devDependencies.missing-benchmark-package`
to `1.0.0`.

The callback fixture is `callback_workspace()` in
[`status_environments.rs`](../../native/cli/tests/e2e/harmony/status_environments.rs).
It includes Harmony startup, source transformation, virtual file addition/removal,
metadata changes, issue callbacks, dynamic formatting and callback stdout. Its
smaller speedup reflects the required JavaScript extension work.

Reproduce measurements with `scripts/rust/bench-native-command.py --source <fixture>
--node <oracle-wrapper> --rust <release-binary> --runs 5 -- <command>`. The oracle
wrapper executes the pinned Node binary and installed CLI entry with the supplied
arguments. Compare every output pair, including any callback prefix before JSON.

Recorded SHA-256 fingerprints:

- Ordinary fixture (benchmark helper's canonical file walk): `c58214e737af4a7d07d0521cb22449978cb184c5cdef706b9c7a6ce235829a8f`.
- Callback fixture: `7f36b80f80932f86dc895f7e1c0592980528e1cfa3b06c8be5d94479040e0d63`.
- Benchmark helper: `4ea79082ea31c4e9829de770faf7fca3fe67a4e0b322a12fc6c8fc63f1aaf1e9`.
- E2e helper: `43d8e532f2afd19c4ebfff39bf6509f38d44cfd10eb29444442e9085579352e3`.
- Callback fixture source: `454f7aedc9cbcfa449b6d7ca2e38bdca826f3e3ed4ce358c47fb9e3d6ed25868`.

Raw samples (milliseconds):

- ordinary status: Node `523.292, 512.501, 508.548, 517.506, 523.527`; Rust `7.181, 7.096, 7.275, 7.436, 7.62`.
- ordinary diff: Node `461.831, 465.556, 468.487, 462.469, 461.816`; Rust `7.862, 6.818, 7.53, 6.887, 7.113`.
- callbacks status: Node `2370.129, 1801.531, 1789.117, 1552.539, 1495.963`; Rust `1896.487, 1518.865, 1380.02, 1382.424, 1504.76`.
- callbacks diff: Node `1596.267, 1420.966, 1670.458, 2030.415, 1892.158`; Rust `1827.245, 1497.898, 1391.817, 1430.105, 1358.909`.

### Local qualification

The frozen implementation passed formatting, Clippy and all workspace Dylint checks
with warnings denied, rustdoc with warnings denied, the full workspace tests,
all 339 pinned-Node e2e cases, and the test-port plan check. The dedicated Windows
oracle job additionally runs the status/diff completion, policy, selector, environment,
external graph, relative dependency and auto-sync suites. Its result, alongside the
existing platform jobs, is required before checking the milestone off in #73.
