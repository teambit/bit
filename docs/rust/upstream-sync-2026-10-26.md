# Upstream sync: 2026-10-26

Previous shared ancestor: `8acc4d603abbb644efd60de978c1202983d75bc9`.
Upstream target: `833c8928132c61c72d73aa7bee054a05d8dcc56c`.
Integration starting point: `beb177e26186a1dc9f837c76e3dac305365cd5e3`.

The interval contains 57 commits, including 26 release-version bumps. The merge applies cleanly. It must retain upstream ancestry: squashing the upstream merge would make upstream TypeScript changes appear to be Rust-owned changes to the scope guard.

The released parity oracle advances from 2.2.94 to 2.2.146. The initial baseline against the new release completed with 1,508 passing, 102 failing and two ignored E2E cases; focused qualification follows below. Updating the generated E2E index adds 29 new or renamed unchecked entries; those entries are not evidence of native implementation.

| Upstream change | Native impact and qualification status |
| --- | --- |
| #10854: in-memory dependency-graph filtering and missing root-snapshot fallback | Audited, remaining native gap: native snapshot graph generation already avoids N-API and constructs its workspace-version replacer once per batch, but still clones and deserializes the full lockfile per component and uses importer presence to select a root. The new reachable-only filtering and missing-root/snapshot fallback need a Rust port and released 2.2.147 qualification. |
| #10838: move unexported main snaps when creating a lane | In progress: native lane creation transfers staged snaps, restores the exported main head, and preserves existing lane origins. Four repository tests cover movement, rejected tags/outdated checkouts and changed-object protection. Released end-to-end comparison passes with and without an exported main head, including output and every stored object. Cross-scope export, merged-lane origins and rejection diagnostics still need end-to-end qualification. |
| #10815: component peers and plus ranges | In progress: shared plus-version resolution, manifest/policy consumers and snapshot feature guard. All 14 snapshot-environment cases pass against the released oracle, including exact Version metadata for the feature guard. Component peer restoration and the remaining lifecycle cases still need qualification. |
| #10841: retain added type dependencies during merge | Implemented: TypeScript type-package discovery checks workspace policy, incoming automatic merge policy, then model dev dependencies; an explicit removal stops fallback. Eleven detector tests pass, including precedence/removal cases across all policy fields. A released lane-merge comparison retains the incoming type package and matches reports and dependency metadata, masking only the newly allocated snap hash. |
| #10833: import directory ownership collisions | Implemented for scoped imports: scope-aware tracked-component matching, owner-prefixed destinations, duplicate-name bitmap keys, retained filesystem checks and correctly ordered warnings. Released same-path comparisons cover the initial collision and re-import, including workspace, objects and documentation caches. Repository tests cover occupied/nested destinations and changed-input rejection. The import group passes 84 of 85 cases; the remaining dependent-installation link/lockfile failure also occurs in both saved baselines. Unscoped collision identities still decline before writes. |
| #10836: remove without loading removed environments | In progress: source-only modification checks and effective package/aspect metadata avoid loading environments. Focused tests qualify lane-only history and missing-main cache invalidation. The removal group previously passed 45 cases; its remaining soft-removal snapshot workflow now also passes after the snapshot boundary correction. |
| #10822: planned build tasks on unbuilt versions | Implemented task-descriptor transport from the published builder and native Version allocation; the 14 snapshot-environment tests pass. The soft-removal workflow now passes through pre-effect delegation where needed. Stash retains stored planned-task metadata, including with configured aspects. Full-suite results and remaining failures are recorded below. |
| #10831: replace the previous environment in scope snapshots | Pending audit of hosted scope operations and native snapshot metadata. |
| #10832: load scope applications only when building | Pending audit of callback boundaries. |
| #10829: deduplicate restored graphs against capsule roots | Pending audit of native graph conversion and hosted installation boundaries. |
| #10823 and #10808: scope dependency and lane merging | Pending: compare source-import correction, dependency lifecycles and scope/workspace snapshot equivalence; delegated operations remain explicitly delegated. |
| #10818: restore only tracked lane configuration in CI merge | Pending native CI merge audit and cross-scope regression fixture. |
| #10840: commit main bitmap when CI merge tags nothing | Pending native CI merge behavior and Git-state fixture. |
| #10819: resolve CI branches against the lane host scope | CI sync execution currently delegates; new native reconciliation remains outstanding. |
| #10820 and #10835: CI onboarding output and agent instructions | CI scaffolding currently delegates; new native scaffolding remains outstanding. |
| #10827: ripple log identity resolution and error flag | Audited: native Ripple handles only the bare command and invalid list limits. Log identity lookup, error reporting and the renamed full-log flag delegate unchanged to the installed CLI; native remote execution remains outstanding. |
| #10848, #10843 and #10773: module and type relocation | Verify published module compatibility in host adapters; do not port type-only reorganizations as new runtime behavior. |
| #10825, #10821 and #10802: browser comparison and preview fixes | Browser UI changes, outside the native CLI command/runtime scope; upstream files enter through the merge unchanged. |
| #10837: UI development environment migration | Upstream UI build configuration; no native command implementation to duplicate. |
| #10842 and #10830: public generation and hygiene checks | Preserve upstream checks; scan new Rust artifacts and public messages for private command invocations and identifiers. |
| #10851, #10853, #10850 and #10834: CI/runtime/package tooling | Preserve upstream files and validate the Rust harness with the newly released CLI. The pnpm Rust engine advances atomically to the v12.13.0 commit `063bd8d216b1e610e6ae4dcc3eff3bc2786e9c4e`, matching the released installation metadata. The ten hosted installation-compatibility cases now pass after adding core-removal overrides, omitting the obsolete runtime read-package hook, and preserving incoming component-specific configuration. Historical graph restoration now migrates legacy hook checksums to core-removal overrides and retains compatible resolution context. A released-helper comparison passes 144 context combinations; full-suite results and remaining failures are recorded below. |

A row becomes qualified only after its implementation and appropriate released-oracle tests pass. A Node delegation is not recorded as a Rust port.

## Publication validation

The merge includes upstream master through 2.2.147 and the latest PR integration, preserving application-option parsing and show-help changes. The parity oracle remains pinned to released Bit 2.2.146. Publishing this sync does not claim that all upstream behavior is implemented in Rust.

Formatting, Clippy, Dylint, rustdoc and the generated E2E index pass. The final workspace suite passes 1,792 tests with one ignored and no failures.

The complete E2E run recorded **1,555 passed, 68 failed, two ignored** in 1,582 seconds. Twenty-nine failure reports explicitly contain temporary-storage exhaustion. The suite is not green. The earlier baseline against the same released oracle recorded 1,508 passes, 102 failures and two ignored cases, but the test set has grown, so these totals are not a direct fixed-case count.

The full run exposed two follow-up corrections: hidden snapshot graph targets now decline before default hosted callbacks begin, preserving safe fallback; the merge comparison helper recognizes unbuilt planned-task metadata without assuming a completed build pipeline. The latter leaves planned-task metadata intact for exact comparison. An attempted peer-metadata adapter change failed validation and was reverted.

After those corrections, a rebuilt recheck of every full-run failure plus peer, snapshot-environment, stash and staged-lane cases completed with **113 passed and 29 failed** (142 cases, three threads). Both hidden-dependent regressions, all three merge-callback regressions, and the storage-affected rename/recovery cases pass on recheck. This is a focused rerun, not a second complete-suite pass.

The 29 reproducible failures are:

| Area | Cases | Baseline comparison |
| --- | ---: | --- |
| Versioned dependency debug | 21 | Native execution now declines; these cases passed in the original baseline. |
| Component peer metadata | 4 | Metadata parity regressions relative to the original baseline; not qualified. |
| Import/lane installation and local environment import | 3 | Also failed in the original baseline. |
| CI onboarding scaffolding | 1 | Also failed in the original baseline. |

These failures remain visible and require follow-up. No test or CI check was disabled.

Previously completed focused evidence includes all 14 snapshot-environment cases, ten hosted installation-compatibility cases, 19 lane-merge/component-policy cases and 29 stash/staged-lane/soft-editor/issue-catalog cases. Released helper tests passed 144 historical graph-context combinations and the plus-range resolver/guard comparisons. Those earlier focused runs supplement, rather than replace, the complete-run result above.
