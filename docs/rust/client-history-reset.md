# Client history reset in Rust

Repository history reset and untag use the Rust client engine when `BIT_RUST_CLIENT_VCS=on`. Rollout remains opt-in. This operation is separate from restoring workspace files with `checkout reset`. It retains the existing public reset, soft-tag reset and never-exported reset routes.

An awaited reset owns one helper lease and serialized request broker. Rust tracks completed operation phases and forks independent component cursors before the existing concurrent component map. Public callbacks remain concurrent; a rejected component does not cause the caller to await unrelated siblings. A retired helper is not replaced during that operation, and completed public effects are not replayed to reconstruct its cursor.

Cleanup closes the native operation before releasing its tokens. Siblings that are still running after an earlier rejection retain their canonical continuation, while late receipts and ref plans decline native work. Cleanup does not wait for those public callbacks.

Concurrent component removals queue the default unmerged-state initialize, transition and apply sequence per helper session. Persistence uses the same queue. Each queued operation captures the current state after its predecessor finishes, so concurrent removals cannot reuse a stale revision. Public component callbacks remain outside this queue.

Node discovers export-pending models and staged removals at their existing callback boundaries. Rust reconciles removed-ID membership, then plans pattern selection, local-history unions and lane filtering, tag labels, immediate dependents and successful ref transitions from bounded metadata. Node applies these selectors through canonical mutation and repository callbacks. Canonical model loaders still observe divergence, cached Versions and lane heads at their original boundaries. The dependency loader retains model and Version nodes, completion order and the canonical assignment of `Version.id`; Rust constructs its inbound dependency index from the resulting flattened-dependency strings. Ordinary dependency graph loading remains available to other callers.

Ref planning accepts a cached `Version.id` data alias only when the canonical dependency loader recorded that exact assignment. Other method shadows, custom accessors and changed defining methods retain canonical behavior. Selectors recheck captured descriptors, metadata and object aliases after the helper acknowledgement before applying their result. Helper loss resumes the remaining observed algorithm without repeating discovery callbacks.

The shared Version reader validates ordinary dependency, flattened-edge and extension metadata before traversing history. Eligibility validation leaves the returned Version JSON intact. Unsupported builder artifact shapes retain the existing conservative fallback; the reset engine does not weaken helper retirement after a failed request.

Lane history pruning deletes entries from the original history map and preserves retained row aliases. Rust also projects and serializes ordinary LaneHistory metadata, including its stable identity derived from the lane hash. Changing a history entry does not change that identity. Unsupported objects, accessors and changed metadata use the existing model methods.

Real reset preserves its effect order: candidate selection, dependency checks and concurrent component mutation; lane history pruning; repository persistence; serial bitmap updates; staged-snapshot writing; consumer cleanup. Hidden lane dependents retain their existing bitmap exclusions. Soft reset still calls the bitmap lookup and clears each selected entry serially, including the existing duplicate-entry behavior. Never-exported reset deletes repository objects before its bitmap callbacks and bitmap write.

These operations are not atomic repository transactions. Earlier canonical mutations can remain when a later callback fails. Node retains public component objects, scope and model loaders, bitmap lifecycle callbacks and error presentation. Reset does not delete orphaned version labels or collect Version objects as an additional side effect. The client migration remains tracked by #73.

## Qualification

The frozen production revision is `6a6c521ebc77cb9ac97c0166f16573e4d28392a5`. Subsequent commits change qualification harnesses and documentation; production code is unchanged. The physically compiled private CLI uses the authentic Bit `2.2.93` baseline at `323f727bc81dd6a61bbf2b279d182bd465532984`, with 35 rebuilt components, 164 source fingerprints and 162 compiled-module fingerprints. It has no runtime source rerouting. Drivers verify source, compiled modules, helper, native source and harness before and after qualification.

Native source SHA-256 is `82e2eb4ee03440456021b122198ba5f20d85596c3168e5f431366a3b4b470441`; GNU release helper SHA-256 is `56d80710ba3a9687f0587c4c3fb6cd3d151779c1087f2703990337cac8695178`. The official archive is `bit-object-import-0.1.0-x86_64-unknown-linux-gnu-6a6c521ebc77.tar.gz`, SHA-256 `b0e27acf123f99cf57f91c35641ec184b0a9cca0bd46d52100e5c52ac9d616d2`. The artifact and HTTP checks use that packaged helper.

Two command proofs cover 6 and 266 tracked Sources. Each passes eighteen genuine reset scenarios in canonical Node, native, missing-helper and crashed-helper modes: 144 complete command flows. They include main and lane head/all reset, pattern and dependency guards, force, detached heads, soft reset, soft deletion, never-exported reset, missing/corrupt local Versions and a repository-persistence callback failure. Comparisons cover ordinary stdout/stderr, exits and errors, repository objects, bitmap/configuration/history, pending state, status and workspace Source bytes. Fixture timestamps, UUIDs and elapsed-time presentation are deterministic; actual benchmark clocks remain untouched. Only pre-existing scope-index row insertion order is compared semantically, with raw bytes retained. Full state comparisons run before reports are compacted; all raw stage artifacts remain hashed and retained.

Native acceptance is required in addition to state parity. Each proof observes eighteen native command owners, 202 phase receipts, eleven component forks and sixteen finishes, with zero failed history-reset acknowledgements and zero Source-body RPC payloads. The two bad-Version commands retire at their actual failed graph read, before any component fork or replacement helper. A rejected dependency branch completes its observed child prefix without a late receipt after parent cleanup. Real lane reset must accept LaneHistory serialization and persistence; soft-pattern reset must accept its combined selector and pattern receipt. A separate genuine public delete, removed-marker snap and reset probe passes all four modes and positively exercises removed-candidate reconciliation. Reset preserves workspace Source bytes; metadata-only RPC does not establish zero Node body I/O in other adapters.

Separate existing update-dependent and merge-reset assertions pass eighteen tests with native enabled and eighteen with it disabled. They exercise actual hidden lane dependents and diverged, fast-forward and squash history. Hidden dependent removal accepts component plans, LaneHistory pruning, persistence and finish on one owner, with no failed graph acknowledgements.

All 26 focused tests pass in both source and physically compiled modes, including concurrent unmerged-state revisions, genuine late-sibling cleanup, alias and descriptor guards, callback ordering and helper loss without replay. The broader suites contain 339 tests each: 337 source passes with two documented skips, and 338 compiled passes with one Windows ACL skip. All 69 canonical model tests, 192 seeded production differential cases and canonical private-CLI lint/type checks pass. Native validation passes 297 tests and 550 canonical projection cases, plus formatting, strict Clippy, strict Dylint and documentation checks. The official artifact suite passes 30 tests; the HTTP corpus passes 23 cases. Retained command/performance evidence is Linux GNU host evidence; cross-platform CI is an additional merge gate.

Evidence is retained under `/var/home/zoltan/bit-history-reset-evidence-2026-10-12`. Final command proofs are `history-reset-correctness-small-final-compact.json` (SHA-256 `affe9346160b5fbdc2c64f4b79b7628271990dba8c6f11ff63188cbbe0d26c56`) and `history-reset-correctness-large-final-compact.json` (`75063e896f0094a8eb11fc7428eadb718bbb76df1989aba69632aef0eb5da456`). The removed-candidate probe is `deleted-staged-four-mode-snap-bootstrap.json` (`b8ab1536690d653ee1033fcdde000ee0d898cb287a0544f1fb52df230e94f8d2`). Superseded and failed preliminary runs remain separate and are not counted as qualified production evidence.

## Whole-command measurements

Four proof-bound reports cover 6 and 266 tracked Sources on tmpfs and Btrfs. Each uses three alternating retained Node/native pairs after excluded warmup. Together they contain 288 retained timing samples, 96 excluded warmup samples and 48 operation/workload median summaries. Deliberate error routes remain parity-checked but untimed. Each report verifies its matching fixture dimensions and correctness proof before timing and rechecks all bindings afterward.

Ratios are native/Node. Each range below spans twelve operation medians, each calculated from three paired ratios.

| Workspace | Tracked Sources |  Wall ratio |   CPU ratio |   RSS ratio |
| --------- | --------------: | ----------: | ----------: | ----------: |
| tmpfs     |               6 | 0.997–1.098 | 0.968–1.125 | 0.998–1.045 |
| tmpfs     |             266 | 0.994–1.077 | 0.971–1.103 | 1.027–1.071 |
| Btrfs     |               6 | 1.008–1.098 | 1.000–1.129 | 1.031–1.076 |
| Btrfs     |             266 | 1.017–1.119 | 0.971–1.133 | 1.029–1.052 |

Wall time is measured externally, and CPU includes descendants. RSS is the near-simultaneous sum of command and observed descendant memory, sampled every 10 ms; sampler costs are recorded. The filesystem condition applies to disposable workspaces. The private CLI and its temporary build files remain on Btrfs. The Node control disables the client migration flag and can still use earlier native helpers.

These results do not establish a general speedup. Paired median wall ratios range from 0.994 to 1.119, CPU from 0.968 to 1.133 and RSS from 0.998 to 1.076. The separate ratio-of-medians calculation has wall ratios from 1.007 to 1.141. Rollout stays opt-in. Node discovery, loaders, public errors, component mutation, bitmap lifecycle and unsupported metadata remain adapter boundaries; #73 remains open.

Performance reports are in the evidence directory's `performance/` subdirectory:

- `tmpfs-small.json`: SHA-256 `243aec2fdeb6b2bf514a1986bc1d941eb8ceb6b2fea5a76a56d67763e689e8d1`
- `tmpfs-large.json`: `76ed4a6b22ad839b24dbb297c15a165ad720b126b446dc59977d38619dabc06d`
- `btrfs-small.json`: `4e4b75b987f39d47ad31aeeed1c483feb93571f4925a7235528bb4fd1aa53295`
- `btrfs-large.json`: `2a7f6d71794eb36469d911106dc6d5b17b5b9da34ce126681091711ef4161978`

Reproduce command qualification by calling `runQualification(privateCli, helper, { extraFiles: 0, report, scratch })` from `scripts/rust-object-import/history-reset-qualification.cjs`; use `extraFiles: 260` for the larger fixture. The CLI must be physically compiled with `prepare-cli.cjs`. Run `history-reset-measure.cjs` with `BIT_HISTORY_RESET_CLI`, `BIT_HISTORY_RESET_HELPER`, `BIT_HISTORY_RESET_PROOF` and `BIT_HISTORY_RESET_REPORT`; set `BIT_HISTORY_RESET_EXTRA_FILES=260` for the larger fixture and `BIT_HISTORY_RESET_SCRATCH` for the workspace filesystem. A timing run requires a freshly qualified proof with matching source/helper/harness fingerprints and ordered scenario dimensions. The seeded differential driver is `history-reset-differential.cjs`; preliminary mode does not qualify production.
