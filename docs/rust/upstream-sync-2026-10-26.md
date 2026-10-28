# Upstream sync: 2026-10-26

Previous shared ancestor: `8acc4d603abbb644efd60de978c1202983d75bc9`.
Initial upstream target: `833c8928132c61c72d73aa7bee054a05d8dcc56c`.
Publication follow-up target: `99e0f30dbcda684161b81ef6578ff61713358d73`.
Integration starting point: `beb177e26186a1dc9f837c76e3dac305365cd5e3`.

The interval contains 57 commits, including 26 release-version bumps. The merge applies cleanly. It must retain upstream ancestry: squashing the upstream merge would make upstream TypeScript changes appear to be Rust-owned changes to the scope guard.

The released parity oracle advances from 2.2.94 to 2.2.146. The initial baseline against the new release completed with 1,508 passing, 102 failing and two ignored E2E cases; focused qualification follows below. The regenerated E2E index is fully accounted for: new scenarios have executable mappings, and upstream-skipped or invalid fixtures have explicit explanations. Delegated cases are labeled as such.

| Upstream change | Native impact and qualification status |
| --- | --- |
| #10854: in-memory dependency-graph filtering and missing root-snapshot fallback | Implemented reachable-only filtering, missing root/entry/snapshot fallback, and cycle-safe traversal. Released 2.2.147 filter/converter comparisons preserve exact graph data and edge order. The 2.2.146 path retains that release’s filtering behavior. |
| #10838: move unexported main snaps when creating a lane | Qualified staged-snap transfer, exported-main restoration, original-lane identity, cross-scope export, and closed version history. Switching back to main excludes components moved entirely onto the lane. Rejected lane creation compares exact released errors through pre-effect delegation. |
| #10815: component peers and plus ranges | Qualified plus ranges, policy and manifest consumers, peer metadata, and snapshot feature guards. A lane-to-main-to-scope-tag fixture retains component peers through checkout and capsule creation. Scope tagging and component-peer builds remain explicitly delegated; the build declines before writing capsules. |
| #10841: retain added type dependencies during merge | Implemented: TypeScript type-package discovery checks workspace policy, incoming automatic merge policy, then model dev dependencies; an explicit removal stops fallback. Eleven detector tests pass, including precedence/removal cases across all policy fields. A released lane-merge comparison retains the incoming type package and matches reports and dependency metadata, masking only the newly allocated snap hash. |
| #10833: import directory ownership collisions | Scoped collisions retain owner-prefixed destinations, duplicate-name bitmap keys and ordered warnings. Same-path import comparisons cover re-import and stored state. The dependent-installation regression is fixed by preserving sibling dependency manifests for pnpm injection. Unscoped collision identities still decline before writes. |
| #10836: remove without loading removed environments | Qualified source-only modification checks, effective package/aspect metadata, lane-only history and missing-main cache invalidation. The soft-removal snapshot workflow preserves its pre-effect fallback where hosted callbacks require it. |
| #10822: planned build tasks on unbuilt versions | Implemented task-descriptor transport from the published builder and native Version allocation; the 14 snapshot-environment tests pass. The soft-removal workflow now passes through pre-effect delegation where needed. Stash retains stored planned-task metadata, including with configured aspects. Full-suite results and remaining failures are recorded below. |
| #10831: replace the previous environment in scope snapshots | Audited: scope snapshot mutation remains owned by the published SnappingMain; the Rust workspace snapshot engine does not implement snapFromScope. The upstream environment replacement enters through the unchanged published fallback. |
| #10832: load scope applications only when building | Audited: scope aspect loading and application build callbacks remain in the published SnappingMain. Workspace snapshot fixtures retain registered application metadata and planned build tasks. This is an explicit hosted boundary, not a Rust implementation of scope snapping. |
| #10829: deduplicate restored graphs against capsule roots | Ported root-manifest deduplication before graph package resolution: exact root versions and peer providers win, optional-only providers and explicit overrides are preserved, and unreachable packages are removed before registry resolution. Released conversion qualification is recorded below. |
| #10823 and #10808: scope dependency and lane merging | Audited: bare-scope dependency and lane merging remain delegated to the published runtime, including merged-source dependency correction. Rust workspace merge fixtures cover retained type dependencies and component peer lifecycles; the bare-scope test helper calls the published API explicitly. |
| #10818: restore only tracked lane configuration in CI merge | Native CI merge preserves tracked lane configuration and uses the released force-ours switch. Cross-scope fixtures cover lane host identity, merge/export and Git state. |
| #10840: commit main bitmap when CI merge tags nothing | Native CI merge commits and pushes the main bitmap even when no component is tagged, and propagates child switch/tag/export failures. The no-change CI fixture passes. |
| #10819: resolve CI branches against the lane host scope | CI sync remains delegated. Released fixtures cover foreign host scopes, exported branch commits, unrelated branches, missing origins and closed pull requests; delegation is asserted rather than counted as a native port. |
| #10820 and #10835: CI onboarding output and agent instructions | CI onboarding remains delegated. Fixtures cover repeat initialization, unrelated staged files, ignored workflow files, initial commits, GitHub commands and enterprise webhooks. The helper’s Node-only control now actually forces delegation. |
| #10827: ripple log identity resolution and error flag | Audited: native Ripple handles only the bare command and invalid list limits. Log identity lookup, error reporting and the renamed full-log flag delegate unchanged to the installed CLI; native remote execution remains outstanding. |
| #10848, #10843 and #10773: module and type relocation | Published adapters are exercised by installation, snapshot, environment and import fixtures against 2.2.146. Type relocations require no Rust runtime duplicate; the upstream source refactors enter through the ancestry-preserving merge. |
| #10825, #10821 and #10802: browser comparison and preview fixes | Browser UI changes, outside the native CLI command/runtime scope; upstream files enter through the merge unchanged. |
| #10837: UI development environment migration | Upstream UI build configuration; no native command implementation to duplicate. |
| #10842 and #10830: public generation and hygiene checks | Preserve upstream checks; scan new Rust artifacts and public messages for private command invocations and identifiers. |
| #10851, #10853, #10850 and #10834: CI/runtime/package tooling | Preserved upstream tooling. All pnpm engine crates are pinned together to the 12.13.0 backport `0745ab835ad21f0f0284b1858fdbb3ea8d6b7b53`, containing the real bundled CAS loader. The preparation stub and workflow workaround are removed. Upstream fix: pnpm/pnpm#17388. Historical graph restoration retains resolution context and migrates legacy hook checksums; the released-helper comparison covers 144 context combinations. |

A row becomes qualified only after its implementation and appropriate released-oracle tests pass. A Node delegation is not recorded as a Rust port.

## Publication validation

The merge includes upstream master through 2.2.147 and preserves application-option parsing and show-help changes. The full-suite oracle remains pinned to released Bit 2.2.146; the new graph algorithm is separately compared with 2.2.147. This sync does not claim that every command runs entirely in Rust.

The previous published checkpoint had 29 reproducible failures. Those failures are addressed by accepting configured versioned dependencies, restoring component peer metadata, preserving injected sibling manifests, and updating onboarding fixtures to the current release. Every failure from the earlier storage-affected complete run passed a focused rerun.

Additional qualification covers all 15 released relative-file extensions and directory indexes, empty pre-install imports and received-object progress counts, cross-scope CI merges, and lane peer restoration. No test or CI check was disabled. The final complete E2E run records **1,635 passed, one failed and two existing skips**. The sole failure is the Node-only control fetching the published aspect from Bit Cloud; the complete failed case passes on an immediate rerun. The preceding run recorded 1,633 passes and three failures: two snapshot-input checks and a Node-control network request. Both snapshot cases pass in the final run and in nine additional bitmap stress runs; no weakening or retry was added to the harness.

The workspace suite covers 1,798 passing tests and one existing skip. Formatting, Clippy, Dylint, rustdoc, the generated index, packaging tests and scope checks pass. Separate released-oracle checks pass all 14 snapshot-environment cases on 2.2.147, the reachable graph comparisons, twelve restored-root graph conversions on 2.2.146, and 144 historical context combinations.

Native distribution builds five bvm archives plus a musl binary. Bvm 3.1.7 selects the native entry; an isolated installation with that released package successfully ran the native command and its Node fallback. Distribution remains opt-in and does not change bvm’s default release index.

## Publication follow-up

Five further upstream commits landed during qualification, including release versions 2.2.148 and 2.2.149. They are merged with ancestry preserved. #10856 injects the existing remote resolver into the legacy scope provider and re-exports the relocated errors; the native inventory host still calls the published resolver directly, and hosted scope operations load Harmony before invoking the importer. No native protocol or fetch semantics change. #10857 removes obsolete TypeScript suppression comments. #10858 replaces dependency-tree configuration with an equivalent class and makes type declarations explicit; defaults, cloning and resolution behavior remain unchanged.

The suppression-comment removal shifted E2E source locations and made the generated porting index stale in GitHub’s upstream merge checkout. Regenerating the index against this merged tree updates the locations without changing case coverage or marking additional cases complete.

A repeated full-suite run exposed test interference: the root-clone fixture changed the shared global remote registry while parallel snapshot and checkout commands were validating it. Diagnostic paths identified `global-remotes.json`; the fixture now uses its own global configuration for remote registration and every clone invocation. Native input validation is unchanged.

Follow-up qualification: formatting, workspace/E2E Clippy, Dylint, rustdoc, the 1,798 workspace tests and the generated porting index pass. All 37 focused root-clone, bitmap and CI-sync cases pass together. The final full E2E run at 16 threads records 1,632 passes, four failures and two existing skips. Two failures are published environment fetches; two registry-update cases leave their old versions unchanged. All four complete cases pass on focused reruns. No retry or weakened assertion was added. The published native implementation at `df2ce7438` also passes all platform, E2E-shard and Windows workspace jobs in [run 40373417279](https://github.com/zkochan/bit/actions/runs/40373417279).


## Follow-up sync on 2026-10-27

The next sync advances from `3ab125f2df4329b256a4fda904478cb02375b756` to
`f74f23c8ef59e90206b35e84ceb06bd524686391` (Bit 2.2.157), seven commits.

| Upstream change | Native disposition |
| --- | --- |
| #10859: scope/object TypeScript migration cleanup | Type assertions and optional fields preserve runtime object formats. Buffer-to-string parsing preserves existing JSON coercion. Removed unused legacy helpers have no native callers. Remote latest-version requests already serialize ID arrays directly; the repaired remote-map validation has no production call sites in the synced tree. |
| #10861: CLI and parser TypeScript migration cleanup | Error rendering, doctor flags, documentation parsing, component diff, removal, fetch reporting and snapshot result fields retain their observable behavior. Empty package arrays still disappear after filtering; snapshot lane-name insertion order is unchanged. No Rust behavior change is needed for these valid inputs. |
| #10864: installer engine 12.16.0 | All pnpm Git dependencies advance together to the release commit, including the direct override-parser dependency and tar patch. The upstream dashmap patch is retained for Cargo resolution. Native adapters follow the new hook-result, install-policy and symlinked-lockfile APIs. The upstream stale-link retry regression is run from the exact pinned engine source. |
| Four version bumps and regenerated metadata | Merged without editing the Node implementation. |

The cross-scope hidden-update merge regression also completes the outstanding
workspace merge assertion from the previous sync. Main-history prefetch includes
hidden lane identities, and multiple histories received in one operation merge
against retained history rather than discarding the earlier lane history. The
fixture still uses the released scope-side producer; those two producer assertions
remain open. Removing either native history fix makes the workspace merge fail.

Bit 2.2.157 is not yet downloadable, and released 2.2.156 still bundles pnpm
12.13.0. The E2E reference therefore keeps released Bit 2.2.146 and resolves its
pnpm dependency to the published 12.16.0 addon through an isolated test preload.
The addon and platform binaries are integrity-pinned in the test reference lockfile;
CI installs them without package scripts. No Bit implementation is replaced.
Comparisons retain new validation digests, manifest fingerprints, file sizes and
settings. Only validation recording and file-stat timestamps are projected after
checking their types and time bounds. The original version mismatch is not masked.

Qualification: formatting, Clippy, Dylint and rustdoc passed; all 1,800 workspace
tests passed, with one existing ignored test. The final full E2E run recorded
1,658 passes, two Bit Cloud request failures during released-CLI fixture setup
and two existing skips. Both failed cases passed unchanged on a serial rerun.
The new cross-scope merge regression fails independently when either history fix
is removed. The pinned pnpm stale-symlink regression and the new symlinked-lockfile
preservation test pass. Generated porting and runtime-boundary checks pass.
Repository Node lint remains unavailable because `tsc` is not installed.

The Windows transfer fixture now uses the released CLI explicitly for its setup
snapshots: the tested operation is native cross-scope fetching, including exact
output, model, version and ref comparisons. The prior Windows failure was a setup
snapshot declining because its environment package was absent, before that fetch
comparison ran. No native fetch assertion was removed.


## Follow-up through Bit 2.2.160

This sync advances from `f74f23c8ef59e90206b35e84ceb06bd524686391` to
`e564f07658bdcc541d4ff4c66ec6c4751ef21d04`, preserving all six upstream commits.
The generated test inventory includes the two new main recovery assertions;
the stale inventory caused the formatting job to fail on GitHub's synthetic
merge of the previous Rust head with this newer master.

| Upstream change | Native disposition |
| --- | --- |
| #10865: indexed version-parent traversal | Cached and newly loaded history use indexed membership and replacement while preserving insertion and preorder traversal order. Subset traversal uses first-entry lookup and indexed stop boundaries. A deep-history regression covers overlay replacement and stop order. |
| #10860: TypeScript migration cleanup | Type annotations, explicit identity-string keys and removed unused constructor arguments do not change native wire formats or behavior. The existing status error-field behavior is preserved. |
| #10846: aborting a lane merge into main restores component models | Native merge snapshots all selected main models before publication. Abort restores their canonical objects, updates retained import proofs and removes pending model overlays so later import publication cannot replay the merged heads. Missing legacy backups remain compatible; malformed snapshots and restoration requiring index repair decline before effects. |

The two new upstream recovery assertions run natively: abort restores the original
main head and leaves no merged snaps staged for export. Disabling the new snapshot
makes the head assertion fail. Serialization uses the existing released-qualified
component projection. Bit 2.2.160 is not yet downloadable from the release service,
so these new upstream semantics are covered by explicit regression assertions;
a differential run against that release remains pending its availability. The
full-suite released reference stays at Bit 2.2.146.

Collection qualification also adds bare verbose counts and object identities,
workspace verbose text/JSON suppression, legacy aliases and boxed names, and scoped lookup without a name-only
fallback. Missing alias targets delegate before deletion. Mixed Version/Source
workspace reports remain delegated because their property and text order depends
on the released glob traversal. Runtime callbacks and the other documented
collection boundaries remain open.

The installer compatibility comparisons retain exact scope state and add only the
three expected entries for the new main-model backup (directory, object bytes,
and file mode). The expected object is the pre-merge model written by the released
Node fixture, not a native-generated expected value. The older reference still
supplies every other output, file, remote and callback assertion. The first full
run had 1,702 passes, these two expected upstream-delta failures, one Bit Cloud
setup failure and two existing skips. Both installer cases pass with the explicit
backup assertion, alongside all 36 focused collection/recovery cases. Disabling
workspace verbose logging makes its exact stdout comparison fail.

Final qualification: formatting, Clippy, Dylint, rustdoc and all 1,809 workspace
tests pass. Full E2E records 1,704 passes, two Bit Cloud failures during released
fixture setup and two existing skips; both failed cases pass unchanged in a serial
rerun. Generated inventory/census/asset and scope checks pass. Windows CI now
explicitly includes the lane-abort regressions. Repository Node lint remains
unavailable because `tsc` is not installed. A newer upstream history-membership
optimization landed during validation and is the next sync audit.

## Indexed history-merge follow-up

Upstream `3754c4f5754aa82394141a3f807f3403c26a30e2` replaces linear membership
checks in `VersionHistory.merge` with a set. Native `operation::history` already
uses sets for both incoming and stored membership, and `command_import::history`
keeps incoming rows first before appending existing-only rows. No algorithm
replacement is needed. Added regression coverage verifies 40,000-row histories,
incoming override data and ordering, both empty-side cases, and preservation of
existing graph metadata. The upstream performance test's wall-clock threshold
is not copied into the native correctness test.

The preceding Linux CI run exposed a host-transport test fixture race. Repeated
local runs with the hidden call error included reproduce `ETXTBSY` when executing
the fake Node program just written by the test. The fixture now uses an immutable,
checked-in shell executable and writes only per-session response data. Script
lifetime, exact script contents, callback errors and cleanup assertions are
unchanged. The original fails on iteration 34 at 64 test threads; the fix passes
all 60 complete CLI unit-suite stress runs at the same concurrency.

Validation: formatting, Clippy, Dylint, rustdoc, generated checks and all 1,811
workspace tests pass. Full E2E: 1,703 passed, three failed and two existing skips.
Two failures were Bit Cloud requests during fixture setup; the third was a
dependency-capture freshness failure in the environment-policy tagging case.
All three pass unchanged in a serial rerun. The intermittent freshness failure
remains under investigation; no proof validation was weakened. Node lint cannot
start locally because `tsc` is unavailable. Windows merge-history CI on the
preceding head passed, including the new lane-abort assertions.

## Default-environment formatter orchestration

Rust now selects components, loads their sources, prepares native dependency,
history and documentation caches, invokes external Prettier and renders formatter
reports. The external tool adapter requires only Prettier and Node built-ins;
this is not a Rust reimplementation of Prettier or a Node-free distribution.
An execution fixture rejects Bit module loads and still runs the native command.

Coverage includes literal/glob selection, changed-only selection, ordinary and
CI JSON, text, empty workspaces, configured names, new/tagged identities, nested
source checks, single-file writes and repeated clean checks. Read-only source
writes retain the released successful exit with an EACCES entry in the JSON
errors array. Documentation-cache preparation retains existing cache values;
its AST proof additionally covers zero-argument arrows returning literal strings,
numbers or booleans, while null-returning/parameterized/async arrows and other
semantic parser inputs still delegate when their documentation is not cached.

The released loader returns cached components in completion order. A strict
Node-to-Node replay of one unchanged two-component fixture produced both full
result permutations. Only this two-row JSON order is normalized in the test;
identities, cardinality, fields, file order, formatting bytes, command formatting,
exit status, caches, workspace state and the real remote remain compared. The
initial quiet probes copied timestamps incorrectly and invalidated the cache;
they were replaced with same-path replay preserving the complete freshness state.
Larger cached batches, cached text reports and concurrent writes remain guarded.
Custom environments/providers and semantic documentation parsing are still open.
Windows provisioning CI includes these formatter cases.

Negative controls verify that disabling native dispatch fails the ownership
assertion and disabling documentation-cache publication fails the complete scope
comparison. Nested source order follows the released breadth-first loader.

Validation: formatting, Clippy, Dylint, rustdoc and all 1,811 workspace tests pass.
The final full E2E run passes all 1,715 active cases, with two existing skips.
An earlier run had one Bit Cloud request failure during capsule fixture setup;
that case passed unchanged before the final full run. Generated inventory/census,
asset and scope checks pass. The preceding PR head has no failing CI checks.
Repository Node lint remains unavailable because `tsc` is not installed.

## Pending-import status partition

Merged upstream through `c15f6da17` (Bit 2.2.162). Since the preceding sync at
`3754c4f5754aa82394141a3f807f3403c26a30e2`, the only behavioral change is
`3b52056c6e17d1c0b5a8947a229fda5b62b76072`: pending-import components no longer
appear a second time as invalid components. Version/bitmap metadata and the
status component's test-dependency lockfile changes are inherited unchanged.

The native status engine now partitions pending-import and other invalid
components in input order. The mixed-error regression retains ordinary invalid
errors and verifies that invalid entries do not enter modification or auto-tag
results. Restoring the old duplicate classification makes the regression fail.

Released Bit 2.2.146 still produces the duplicate classification; the 2.2.162
release artifact was unavailable during qualification. The existing real-workspace
regression therefore asserts the exact released duplicate row before applying
only the explicit upstream removal to its expected JSON. All other fields,
exit status and stderr remain compared. The text regression asserts the entire
old invalid section before replacing it with the existing clean summary that
upstream now renders when no other sections exist; the import warning and
loading prefix are preserved. This is an explicit upstream delta, not a claim
that the released oracle already contains the fix.

Validation: formatting, Clippy, Dylint, rustdoc and all 1,812 workspace tests pass.
Full E2E: 1,714 passed, one Bit Cloud request failed during released-CLI MDX
environment setup, and two existing cases were skipped. The failed fixture passes
unchanged on a serial rerun. Generated inventory/census/assets and scope checks
pass. Repository Node lint still cannot start because `tsc` is not installed.

## Built-in lint orchestration and formatter platform fixes

Linting now shares the Rust component loader with formatting. Rust owns default
Node-environment selection, dependency/history/documentation cache publication,
generated TypeScript configuration, diagnostic totals, reports and single-file
fixes. ESLint remains an external Node tool. Built-in configuration data is
embedded from public `@teambit/react.eslint-config-bit-react` 2.0.27 (Apache-2.0);
other versions decline before effects. Tool preparation resolves metadata and
third-party dependencies but imports neither Bit runtime nor Bit configuration
modules. A preload fixture rejects all Bit module imports during native linting.

The generated config's name reproduces `object-hash` for its fixed plain-object
schema, including prototype references and UTF-16 string lengths. Independent
library probes match 101 configurations with Unicode paths. Regression tests
also assert known library hashes and the actual released generated filename.
The command preserves existing canonical configs; noncanonical configs delegate.
An external-tool process is prepared before cache publication and retained until
linting completes, with cleanup on early exits. After publication, config/source
write failures are owned service errors and never replayed through fallback.

Released-CLI comparisons retain complete workspace/cache/remote state and raw
ESLint diagnostics, including generated config paths, bytes and permissions.
Only the validated duration changes. Cases cover clean/cached runs, warnings,
errors, autofixes, changed/new selection, empty/configured workspaces, nested
files, CI/colors, read-only sources and read-only config directories. The latter
exposed directory modes lost while copying comparison fixtures; the helper now
restores those modes along with timestamps, with a separate regression.
Multiple components, concurrent fixes, custom services and semantic documentation
cache misses remain guarded. Fixing rich source can invalidate its documentation
cache; subsequent cache misses retain that explicit boundary.

Windows provisioning CI exposed two formatter defects. The released formatter
package uses `fs-extra.outputFile` directly, preserving Prettier's LF bytes; it
does not use the legacy vinyl writer's platform EOL conversion. Native formatting
now preserves those bytes on Windows too. Preload fixtures use quoted forward-slash
paths because Node's options parser consumes backslashes. The same fixes apply
to lint preload tests. Formatter checks also guard ignored extensions and now
retain new components whose status-context version is the empty string when
selecting changed components. Windows provisioning CI includes both services.

Validation: formatting, Clippy, Dylint, rustdoc, generated plan/census/asset and
scope checks pass; all 1,814 workspace tests pass. Full E2E: 1,725 passed, two
existing skips and one Bit Cloud request failure during released-CLI fixture
setup. That case passed unchanged on a serial rerun. All 20 focused service and
fixture-permission cases pass. Negative controls catch disabled native dispatch
and incorrect generated config filenames. Windows CI for this batch is pending.
Repository Node lint remains unavailable because `tsc` is missing.

## Built-in React component services

Formatting and linting can now load qualified built-in React components without
the published Bit runtime host. Rust supplies the released React dependency
policy, development-file patterns and compiler facts, retaining native cache,
selection and report ownership. A dedicated component-service mode preserves
the existing lifecycle requirements of other operations. Startup still rejects
custom workspace/scope/global providers, configured requires, lane hydration
and bitmap auto-sync. Mixed environment groups remain guarded before effects.
Unsupported dependency syntax also declines before starting a Bit parser host.

Differential fixtures exercise React formatting and linting on repeated caches,
changed selection, real dependency metadata, diagnostics, fixes, CI/colors and
read-only write failures. Errors identify the selected environment. An external
ESLint preload rejects all Bit module imports. External ESLint/Prettier and their
installed distribution metadata remain requirements; this is not a standalone
runtime or arbitrary JavaScript environment implementation.

Validation: all 1,814 workspace tests and formatting, Clippy, Dylint, rustdoc,
generated plan/census/asset and scope checks pass. Full E2E: 1,729 passed, two
existing skips and five external request failures (two Bit Cloud fixture setup
requests and three registry timeouts in existing Yarn cases). All five passed
unchanged in a serial rerun. All eight new React comparisons pass; the peer-policy
negative control fails as intended. Yarn implementation remains excluded.
Windows provisioning passed on the preceding lint/formatter revision, confirming
its platform fixes; CI for this React batch is pending. Local Node lint still
requires the unavailable `tsc`.

## Capsule fixture network verification

The remaining-core-environment capsule comparison now configures five built-in
environments directly in its fixture. Independent released-CLI replay confirmed
that these are the exact component config entries written by environment
assignment and that all five resulting capsule manifests are identical. The
comparison still runs the actual released capsule command, requires native
ownership and compares complete manifest bytes and command output. A preload
rejects JavaScript HTTP/HTTPS/fetch requests during these five comparisons.

The versioned custom-aspect environment retains released assignment and metadata
import: replacing it with an unversioned entry changes a manifest dependency,
and the correctly versioned entry needs imported objects. It therefore remains
a network-dependent fixture. No retry, timeout or assertion was weakened; this
removes only unrelated remote verification from the five built-in setups.

Validation: formatting, Clippy, Dylint, rustdoc, all 1,814 workspace tests and
generated plan/census/asset/scope checks pass. Full E2E: 1,733 passed, two existing
skips and one Bit Cloud request failure in the unchanged React Native capsule
comparison. That case passed unchanged on a serial rerun. The revised remaining
core-environment comparison passed both focused and full runs. Platform CI is
pending; local Node lint remains unavailable because `tsc` is missing.

## Upstream history indexing sync

Merged upstream through `7c0228a4f` (Bit 2.2.163), following `c15f6da17`.
The delta contains history/export lookup indexing, the version bump and stale
TypeScript suppression removal. Rust history queries now index supplied versions
once per walk, preserve the first object for duplicate hashes and use indexed
stop boundaries. History population indexes existing hashes and accumulated
versions, preserving insertion order while replacing duplicate accumulated rows.

The upstream population change has one observable delta: full traversal of a
merge diamond now returns each shared ancestor once. Running the actual method
extracted from both upstream revisions confirmed this difference and unchanged
default traversal. The Rust regression failed on the previous implementation
and passes after the port. Additional regressions preserve first-object lookup,
stop boundaries and missing-parent results. These are explicit upstream-delta
checks; the released CLI remains the oracle for unchanged behavior.

Existing native export/history collection already uses indexed visited sets.
The upstream export filtering/index reuse and removed suppressions introduce no
additional command contract. Existing native bounds and pre-effect guards remain;
this sync does not claim arbitrary provider or compiler support. The generated
E2E plan follows the upstream source-line change.

Validation: all 1,816 workspace tests, formatting, Clippy, Dylint, rustdoc and
generated plan/census/asset/scope checks pass. Full E2E: 1,733 passed, two existing
skips and one Bit Cloud fetch failure during released-CLI setup for the existing
nonstandard-main capsule case. That case passed unchanged on a serial rerun.
The regenerated plan also fixes the prior PR lint job's stale graph-test line
reference when GitHub combines the branch with the updated upstream master.
Platform CI for this sync is pending; local Node lint still lacks `tsc`.

## Built-in compiler orchestration and byte parity

Replaced the handwritten transpiler and placeholder source maps with external
TypeScript transpilation under Rust-owned component loading, selection, scheduling,
dist persistence, package linking and reports. Qualified built-in Node and React
commands no longer load the published Bit runtime. Rust retains documentation and
dependency-cache effects, repeated and changed selection, duplicate-selector load
counts, stale dist files unless deletion is requested, copied-file ordering,
platform text line endings, injected packages and root-component copies. Generated
manifests retain optional package, peer and component dependency metadata.

TypeScript diagnostics preserve text/JSON differences, including JSON's released
zero exit code for compilation diagnostics. A narrow external TypeScript ESTree
parser supplies malformed-source diagnostics to the native dependency loader;
source hashes, graph resolution and cache ownership remain native. The external
tools resolve through installed distribution metadata. A preload rejects Bit
module imports for valid compilation and syntax-error handling. This is not a
standalone compiler distribution or an arbitrary environment implementation.

Filesystem failures use the shared released error formatter, including CI details
and colors. Independent released-command replay established the tested first-open
failure's partial-write state: a pending sibling output is truncated, not completed.
Rust opens each configured I/O batch before writing it, retaining that state on
failure and respecting configured single-file batches. The regression compares
complete output bytes, caches, manifests and the unchanged remote; it does not
mask failed-write contents. Other concurrent-failure interleavings are not claimed
as qualified by this fixture.

Fourteen differential cases cover emitted code/maps, repeated commands, new/changed
selection, diagnostics, assets, optional metadata, copies, CI/colors and owned write
failures. Negative controls detect both the previous missing loading messages and
corrupted source-map bytes. A cold-cache regression after dependency rewiring
now proves that bounded data-only `console.log` calls have no documentation;
released-parser replay confirms the empty result. Disabling that proof fails
the new native-execution assertion. Two obsolete unit assertions for the old transpiler
and incorrect empty JSON success were removed; the released no-selector JSON
failure remains explicitly delegated. Windows provisioning includes the new suite.
Custom providers/environments, mixed groups, type generation, rich documentation
cache misses, unsupported dependency syntax, binary sources, colliding outputs
and ordered multi-component reports remain pre-effect guards.

Validation: formatting, Clippy, Dylint, rustdoc and all 1,814 workspace tests pass.
All 17 focused compiler/regression/capsule cases pass. The final full E2E run
reports 1,746 passes, two Bit Cloud failures in released environment assignment
and two existing skips; both failed cases pass unchanged on a serial rerun.
An earlier full run exposed the cold documentation-cache regression now covered
by the new comparison and negative control. Generated inventory/census, asset,
scope and public-data checks pass. Local Node lint still requires the unavailable
tsc. Platform CI for this compiler change is pending.

The preceding head's E2E shard 3 failed on an extra timed pnpm progress frame.
Independent released-command replays reproduce that frame under slower scheduling;
a narrowly bounded comparison fix is prepared separately. The remaining runtime,
compiler, tester, build and service milestones remain open.

## Installer progress scheduling qualification

The preceding head's E2E shard 3 failed because its installer comparison retained
an optional initial progress frame with one resolved package before the two-package
store banner. Independent replays of the same restored fixture through the released
Node command reproduce both forms: ordinary scheduling coalesces the first frame,
while CPU contention on one core exposes it. Full outputs match after accounting
only for elapsed times and that initial frame. No reporter setting or clock hook
was changed for the replay.

The comparison now accepts that specific zero-added one-to-two resolution advance,
as well as the already qualified identical-counter redraws. It preserves store
paths, the complete banner, later transitions, final counters, errors, reports,
provider assertions and filesystem comparisons. Released padded and unpadded banner
lines are recognized without changing their bytes. Other counter advances, reversed
counters, changed transfer/addition counts and malformed control sequences remain
unrecognized. Negative controls using both complete Node replays and the captured
CI failure fail with the old comparison and pass with the new one.

Validation: formatting, Clippy, Dylint, rustdoc and all 1,814 workspace tests pass.
All 17 focused progress/provider cases pass. Full E2E: 1,749 passed, one Bit Cloud
failure while creating a React fixture and two existing skips. The failed case
passes unchanged on a serial rerun. Generated inventory/census, asset, scope and
public-data checks pass. Local Node lint still lacks tsc. CI for the preceding
compiler head has no reported failures at publication time, with jobs still
running; the new head requires its own platform checks.

## Built-in tester orchestration and Windows compiler paths

Rust now owns single-component Node/React JSON test selection, native loader/cache
publication, test discovery and Bit result/error projection. External Jest 29.7
runs user tests, with external Babel and native-owned JavaScript configuration
adapters. Installed distribution metadata resolves these tools; no Bit runtime
module is imported on the qualified path. Configuration versions are checked before
workspace effects. Stable native-owned assets use their own cache directory, so
opaque global Jest transform-cache identities differ from the installed runner.
This is not a standalone distribution or an arbitrary environment implementation.

Cold test callbacks, TypeScript/TSX sources and Jest snapshots now have bounded
AST proofs for empty documentation where appropriate. Released-parser comparisons
confirm these results; exported component/documentation shapes remain guarded.
Snapshots preserve exact workspace bytes on first write, repeated execution and
mismatch. A preload rejecting Bit imports verifies external-tool-only execution.
Twenty differential cases compare reports, exit codes, workspace/scope/remote bytes
and loader caches, masking test start/duration fields and one qualified pair of parallel test-file
completion orders. Sixteen independent same-path released-command replays produce
both orders and otherwise identical complete reports. Jest retains its default
scheduling; the external adapter is a script file so forked workers do not inherit
an evaluated Node program. The cases cover pending/todo
assertions, assertion failures, empty selection, React, actual TSX runtime execution,
colors/CI, test-set exit codes, and side effects without replay. Direct test process
exit preserves both the exit code and the unfinished command-history entry. The
new exit regression failed before both lifecycle fixes; configured negative
patterns also failed before preserving the exclusion prefix. Unknown negated CLI
flags retain the released command errors in populated and empty workspaces.
In-band user tests retain the released process arguments and working directory.
Deliberately corrupting
the success field fails the report comparison.

Coverage consumption is native, including pre-existing reports without a coverage
flag, reports written by user tests, malformed input, rounded totals and the
released string-prefix inclusion behavior. A directory without the summary file
is preserved. Cleanup failure returns the released structured environment error
without replaying tests. The regression exposed a fixture-restoration bug: a
read-only directory could make removal fail silently and retain outputs from the
reference run. Restoration now removes that state or fails explicitly; its own
regression verifies that cleanup does not follow symlinks or alter their targets.

Text, multiple-component/environment groups, explicit file selection, coverage
collection flags, JUnit, snapshot-update flags, custom providers, watch/debug and broader lifecycle
modes remain open. Unsupported selections/options decline before workspace effects.
Windows provisioning now includes these tester comparisons.

The preceding head's Windows compiler comparisons exposed mixed separators in
emitted paths. Reconstructing emitted paths from platform components now matches
Node's normalized paths for text and JSON, including root-component copies.
Existing exact-output assertions remain unchanged; Windows CI must verify the fix.

Validation: formatting, Clippy, Dylint, rustdoc and all 1,816 workspace tests pass.
All 20 focused tester cases pass. The final full E2E run reports 1,769 passes,
two Bit Cloud failures in existing capsule/generator fixtures and two existing
skips; both failed cases pass unchanged on serial reruns. The new fixture cleanup
regression also passes in the full run. Generated plan/census, asset, scope and
public-data checks pass. Local Node lint cannot run because tsc is unavailable.
Windows and other platform CI for this batch remain pending.

## Tester JSON modes and upstream version sync

Merged upstream `a5813e8d6` with ancestry preserved. The change since `7c0228a4f`
updates release metadata to 2.2.164; it adds no runtime behavior requiring a Rust
port.

Built-in single-component Node/React testing now owns summary JSON, coverage
collection, snapshot updates and explicit test-file selection. Summary projection
preserves versionless identities, test counters, components without tests and
environment failure messages. Coverage uses the released development-file ignore
list and consumes/removes reports through the existing native coverage path.
Jest and Babel remain external tools with native-owned configuration adapters;
installed distribution metadata still resolves their dependencies.

Explicit files are resolved lexically to their owning component and filtered
against the loader's recognized test files. Duplicate paths execute once. Invalid
existing non-test files still decline before loader effects so their released
validation and cache effects remain intact. Multiple-component file selections,
custom environments, text/JUnit reporting and watch/debug sessions remain gaps.
The released CLI ignores arguments after `--`; the Rust parser now reproduces
that behavior instead of treating those arguments as file selectors.

Nine new differential cases cover summaries with passing/failing/empty tests,
nonzero process exit codes and environment errors; empty selections; Node/React
coverage and cleanup; snapshot updates and exact snapshot bytes; relative,
absolute and duplicate file selectors; invalid files; and the argument separator.
Reports, exit codes, workspace/scope contents and history remain compared. Only
existing qualified report timing fields are masked. Failing coverage tests and
environment failures assert that test side effects happen once. Pre-change
negative runs caught both missing native summary support and file selection.

CI on the preceding tester commit exposed two Windows differences. Restoring a
remote now removes and verifies every child while retaining the root directory
held by a running HTTP scope server. It does not ignore deletion errors or retain
stale outputs. A Windows test holds a directory handle without delete sharing;
a Unix test checks read-only children and preservation of external symlink
targets. Windows transfer CI includes the restoration tests. The tester adapter
also resolves its exposed CLI entry path as Node does, preserving exact
`process.argv` bytes when the configured installation path mixes separators.
Existing strict process-artifact comparisons caught that mismatch on Windows.

## Tester JUnit output

Single-component built-in JSON testing now creates JUnit XML after executing
tests, including nested output directories, failure and suite-error messages,
skipped tests, test durations, timestamp, XML escaping and empty reports. The
Jest adapter supplies the original execution error message separately because
JavaScript Error messages are not normally enumerable. Direct test-process exit
does not create a report; filesystem failures remain owned after test effects.

Differential cases compare complete XML apart from validated command timestamps
and nonzero durations (the fixture runs long enough to avoid zero-duration
attribute ambiguity), plus stdout, exit status, workspace and scope state. They
cover passing and failing assertions, suite errors, pending and todo tests, empty
reports, nonzero process exit and an output path that is a directory. The last
cases assert the test's side effect occurs once. A negative control that
suppressed report writing failed the full filesystem comparison. The standalone renderer also
matched captured released reports for Unicode, control characters and ANSI
sequences. Multi-component, custom tester and text paths remain outside this
bounded implementation.

Validation for this checkpoint: formatting, Clippy, Dylint, rustdoc, generated
checks and 1,817 workspace tests passed. Four focused JUnit differential cases
passed. The final full E2E run reported 1,784 passes, two existing skips and two Bit
Cloud request failures during released capsule fixtures; both passed unchanged
on rerun. Platform CI for this checkpoint remains pending.

## Tester selection flags

For the qualified single-component JSON tester, explicit selection of the
configured built-in environment now runs natively. A different environment
continues to decline before loader effects. As in the released CLI, specifying
an environment suppresses JUnit file generation. The deprecated all and scope
flags are accepted in JSON mode and do not change component selection, matching
the released JSON handler. Differential cases cover long, short and inline flag
forms, summary output, JUnit interaction and an invalid environment. The new
strict native assertion failed on the prior implementation, which delegated the
first deprecated-flag case.

Validation: 35 focused tester cases, formatting, Clippy, Dylint, rustdoc,
generated checks and 1,817 workspace tests passed. The final full E2E run had
1,785 passes, two existing skips and three Bit Cloud request failures during
fixture setup; all three cases passed unchanged on serial rerun. The preceding
JUnit head's platform checks were still running at this checkpoint.

## Multi-component tester summary

Same-environment built-in JSON summaries can run one Jest invocation for
multiple components. Rust combines test patterns, groups results by qualified
component roots, aggregates counters and preserves environment errors. Coverage
is collected by Jest and the existing native path consumes and removes its
artifact. Components without tracked tests still contribute their patterns and
development-file exclusions when another component has tests: the released
runner can execute matching untracked test files from those components.

The path declines before effects for overlapping or symlinked component trees,
component roots containing glob metacharacters, negated or unconfined patterns,
explicit files from multiple components, JUnit output, detailed JSON and mixed or
custom environments. Warm parallel loader cases retain the existing cache-order
guard. A runtime import guard proves the qualified path does not load Bit's
JavaScript modules; Jest and Babel remain external tools resolved through the
installed distribution.

Differential tests cover passing and failing tests, components with and without
tests, coverage, environment cleanup errors, matching untracked files, and the
pre-effect guards. Side-effect assertions verify tests run once. The test
normalizer only reorders the known two fixture components in summary arrays;
eight same-path released runs independently produced both orders for tested,
untested and environment-error arrays, with every other field unchanged. A
negative control that dropped patterns for the untracked component failed the
strict complete-summary comparison.

Jest's default scheduling can place multiple test files in workers or run them
in-band according to its cache. Eight repeated released runs of a two-file
fixture that sets `process.exitCode` produced both exit codes 0 and 7; the
complete summaries otherwise matched after the same independently qualified
component-order projection. The adapter retains Jest's default scheduling and
uses its existing separate native cache identities. The deterministic regression
uses one file, verifies exit code 7 and compares command history exactly.

Validation: 11 focused multi-component cases and 45 tester comparisons passed,
as did formatting, Clippy, Dylint, rustdoc, generated checks and 1,817 workspace
tests. The full E2E run had 1,797 passes, two existing skips and two Bit Cloud
fixture setup failures; both failed cases passed unchanged on serial rerun.
The separately committed Dylint bootstrap repair passed a clean driver build and
lint run against the current Clippy repository, plus local tests for both branch
layouts. Its GitHub CI job was still running at this checkpoint.

## Multi-component detailed tester results

Same-environment built-in multi-component testing now also returns detailed JSON
reports. Rust groups Jest files and errors by component, preserves the shared
Jest success and start values, projects coverage separately for each component,
and consumes the coverage artifact once. This includes coverage created during
the run, stale and malformed reports, and the released string-prefix path
matching behavior. JUnit for multiple components and the earlier path, pattern,
loader and environment guards still decline before effects.

Differential cases cover mixed pass/fail results, components without tests,
per-component coverage, stale and malformed coverage, cleanup errors with
once-only test effects, and an in-band nonzero process exit. Eight same-path
released detailed reports produced both observed component orders; after
projecting that known pair and the existing timing fields, all remaining report
fields matched. A pre-change strict native test confirmed detailed multi-component
JSON previously delegated.

Validation: seven focused detailed-report cases, formatting, Clippy, Dylint,
rustdoc, generated checks and 1,817 workspace tests passed. The full E2E run
had 1,805 passes, two existing skips and one Bit Cloud setup failure; the failed
case passed unchanged on rerun. The Dylint bootstrap repair subsequently passed
its GitHub Actions lint job. Other platform jobs for the prior head were pending
at this checkpoint.

## Multi-component JUnit

Same-environment built-in testing now writes multi-component JUnit reports,
including summary and coverage combinations, empty reports, suite failures,
nonzero exit codes and report-write errors. Rust groups Jest results by component
before rendering XML so distinct suite errors remain associated with their own
components. An explicit environment selector retains the released behavior of
suppressing JUnit output. Multi-component explicit-file selections and the
existing path, pattern, loader and environment guards continue to decline before
effects.

Nine focused comparisons cover those modes, direct process termination, report
permissions, once-only side effects, and execution without loading Bit runtime
modules. Eight same-path released runs established both suite orders and the
validated timing projection. Another eight established both observed serialized
error-type forms for a one-error fixture; its JSON comparison permits only those
coupled forms while keeping the XML exact apart from suite order and timings.
A two-error negative control that removed per-component mapping failed the XML
comparison. Capturing Jest error code and type explicitly also preserves
non-enumerable fields that were previously lost during serialization.

Validation: 62 focused tester cases, formatting, Clippy, Dylint, rustdoc,
generated checks and 1,817 workspace tests passed. The full E2E run had 1,814
passes, two existing skips and one Bit Cloud setup failure; the case passed
unchanged on rerun. Platform CI for this checkpoint is pending.

## Explicit test files across components

Same-environment built-in JSON testing now accepts explicit test files from
multiple components. Rust validates each file against its owning component,
selects only the requested tests, and preserves the first-seen component order
in reports and JUnit suites. Duplicate paths are executed once. Existing
unsupported ownership, loader, environment and path cases still decline before
execution.

Seven differential cases cover relative and absolute paths, duplicate inputs,
summary and coverage, JUnit, reversed input order, and an unrecognized file.
The fixtures assert selected and excluded test effects as well as output and
workspace state. Eight released runs in each input order confirmed the exact
component and JUnit suite order. Removing target-order loading makes the
reversed-order comparison fail; the previous implementation declined the
multi-component selection.

Validation: 69 focused tester cases, 14 compiler cases, formatting, Clippy,
Dylint, rustdoc, generated checks and all workspace tests passed. The full E2E
run had 1,821 passes, two existing skips and one Bit Cloud request failure in
released-CLI custom-aspect fixture setup; that case passed unchanged on rerun.

## Tester text summaries

Built-in same-environment testing now owns the text `--summary` path as well
as JSON. Rust renders the released pass, failure, tester-error, no-test and
nonzero-exit headlines from the existing aggregate, with color and measured
duration. It preserves cold loader progress, explicit-file selection, report
writes and direct process termination. Regular text reporting, deprecated text
selection flags and the existing unsupported loader and environment cases still
decline before effects.

Eight differential cases cover passing, pending, failing and missing tests,
suite errors, explicit files, CI colors, JUnit and coverage, nonzero and direct
exit, and once-only effects. A preload rejects Bit runtime imports for a text
summary. The before-change controls confirm these cases previously delegated;
comparisons retain output, exit codes and workspace effects while validating and
normalizing only elapsed durations and JUnit timestamps/durations.

Validation: eight focused text-summary cases and 75 focused tester cases passed,
as did formatting, Clippy, Dylint, rustdoc, workspace tests and generated/scope
checks. The full E2E run had 1,827 passes, two existing skips and three Bit
Cloud request failures in existing fixture setup. All three passed unchanged
on serial rerun.

## Tester summary selection flags

Text summaries now preserve the released `--all` and `--scope` warnings and
selection rules. The all-components flag includes unchanged components; scope
qualifies component patterns, while explicit file paths ignore that filter.
JSON retains its existing released behavior for these flags. Unknown or
unsupported selections decline before test execution.

Differential cases cover both flags, their combination, scope-qualified and
explicit-file selection, CI colors, and an unknown scope. A tagged unchanged
component proves the all-components selection; a negative control that reverts
it to changed-only selection fails the native-ownership assertion.

Validation: all focused text-summary cases passed, along with formatting,
Clippy, Dylint, rustdoc, workspace tests and generated/scope checks. The full
E2E run had 1,835 passes, two existing skips and two Bit Cloud request failures
in existing fixtures; both passed unchanged on serial rerun.

## Empty changed test selections

When the workspace has components but none are changed, Rust now publishes the
released loader progress and no-components hint in both text summary and
ordinary text modes. This path does not start Jest. Ordinary text with selected
components still declines before test execution.

Differential cases cover a tagged unchanged component, the summary and regular
text forms, colored CI output and the selected-component delegation boundary.
The summary case failed the native-ownership assertion before this change.

Validation: focused text comparisons, formatting, Clippy, Dylint, rustdoc,
workspace tests and generated/scope checks passed. The full E2E run had 1,840
passes, two existing skips and one Bit Cloud fixture setup failure; that case
passed unchanged on rerun. Upstream advanced after this validation and is synced
in the following checkpoint.

## Upstream lane export reconciliation

Merged upstream through `88bb28f16` (Bit 2.2.165); the later commit updates release metadata. The export delta reconciles hidden lane
entries against the current remote lane: remote-only entries are retained,
removed remote entries are dropped unless new entries were explicitly marked,
visible components are excluded, and a local head replaces the remote head only
when its version history establishes ancestry. The exported lane sets the
one-export override when its reconciled hidden list differs from the remote;
following acknowledgement, the local lane retains the reconciled list and clears
the override. File and HTTP lane reads are bounded; an explicit remote
lane-not-found response is distinguished from other remote errors.

The new scenario-18 regression exercises a stale hidden entry removed remotely,
checks the visible exported head and checks the local lane after export. Another
case adds a remote-only hidden entry after checkout and verifies both lanes.
The original test mapping for scenarios 17 and 18 named assertions it did not
execute; it now maps only the fetch scenario, and the actual scenario-18 test
owns its assertions. Unit cases cover advanced and diverged heads, remote-only
and new entries, promoted components, and HTTP lane fetch/error routing.
Removing remote-only preservation makes the new end-to-end test fail. The
pre-change export failed the new local stale-entry assertion.

The Windows provisioning failure reported a directory report target as access
denied. On Windows, a directory target now produces the released absolute-path
directory error while ordinary permission failures keep their existing message.
The existing single- and multi-component once-only write-failure comparisons
cover this in Windows CI; a unit case exercises the conversion locally.

Validation: 15 cascade cases, 34 export cases, HTTP/reconciliation unit cases,
formatting, Clippy, Dylint, rustdoc, workspace tests and generated/scope checks
passed. The final full E2E run had 1,841 passes, two existing skips and two Bit
Cloud fixture failures. The capsule case passed unchanged on rerun; the custom
environment case encountered another Cloud request failure on its first rerun
and passed unchanged on the second. The Windows error conversion passed its
local unit test; the actual Windows differential tests await PR CI.

## Upstream raw Source fetches

Merged upstream through `9d1e17110`. For a valid fetched Source, upstream now
writes the received compressed representation directly instead of recompressing
it. Rust already captures, verifies and publishes those exact bytes for both
file remotes and virtual HTTP captures. New tests use a nondefault compression
stream and assert byte-for-byte capture and publication; a negative control
that discards the captured bytes fails.

An incoming Source whose transfer reference disagrees with its content remains
a guarded Rust boundary: the upstream Node path writes under the content hash,
while Rust declines before publication. That pre-existing malformed-input gap is
not counted as completed parity.

Validation: the Source capture tests, formatting, Clippy, Dylint, rustdoc,
workspace tests and generated/scope checks passed. The full E2E run had 1,841
passes, two existing skips and two Bit Cloud request failures in fixture setup;
both cases passed unchanged on serial rerun. The preceding PR head's Rust lint
job passed; Windows provisioning is still running.

## Ordinary text with no test files

Rust now renders ordinary text reports when selected built-in components have
no test files. It preserves component-loading progress, workspace and component
counts, sorted verbose identities, CI colors, deprecated selection warnings and
empty JUnit reports. Ordinary text with runnable tests continues to decline
before execution. Four focused differential cases cover the new modes, and a
before-change control confirms they previously delegated.

Validation: the focused text comparisons, formatting, Clippy, Dylint, rustdoc,
workspace tests and generated/scope checks passed. The full E2E run had 1,844
passes, two existing skips and three Bit Cloud fixture setup failures; all three
passed unchanged on serial rerun.

## Concurrent garbage-collection failure comparison

A Linux E2E shard failed because a permission error raced another object move in
the released CLI. Sixteen same-path released runs completed the other move;
sixteen runs with that rename deliberately delayed left it pending when the
process exited. Both groups had identical stdout and stderr, and the only tree
differences were the object's original and backup paths and their mode entries.
The delayed replay reproduced the CI failure with the previous comparison.

The comparison now accepts only those two observed locations for that one
object, requiring exactly one copy with the original bytes and mode. Every other
scope entry and the full command output remain exact, and the native run still
asserts the successful move occurred once without replay. A separate regression
rejects duplicate, missing and modified copies. No production behavior or test
timeout changed.

Validation: 32 focused GC cases, formatting, Clippy, Dylint, rustdoc, workspace
tests and generated/scope checks passed. The full E2E run had 1,847 passes,
two existing skips and one Bit Cloud fixture setup failure; the case passed
unchanged on rerun. The preceding Windows provisioning check passed.

The subsequent upstream sync to `f367980931c33240f17c1f259c7d1d000d6b7f89` updates release and CLI reference metadata; it does not add a Rust behavior gap.

Upstream `e831b73da` adds release notes only; no Rust behavior change is required.

Upstream `3bd72fe67` changes scope-side documentation recalculation: a failed
reader for an existing docs file leaves the stored doc intact, while a component
without a docs file clears it. The native scope configuration merge already
preserves stored documentation data, now covered by a regression test. Full
scope-side aspect recalculation and the reader/no-file distinction are still a
porting gap; scope-side snapshot paths needing those callbacks remain delegated.
The following `06ab7f06c` commit updates release metadata.
