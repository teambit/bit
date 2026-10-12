# Client checkout transitions in Rust

The checkout transition engine is enabled by `BIT_RUST_CLIENT_VCS=on`. It remains opt-in. It covers checkout target selection, reset of workspace files, revert and checkout used by stash loading. Reset of repository history and untag are separate operations.

The awaited public checkout operation owns one helper lease. Inspection, target selection, merge planning and filesystem persistence share its serialized request broker. Public callbacks run between requests; the broker does not serialize those callbacks or replace component objects. A retired helper is never replaced for the remaining operation. Other object-reading adapters retain their existing boundaries.

Node preserves discovery, imports, missing-component restoration, conflict prompts, removal callbacks, component construction, configuration, installation, build and bitmap updates in their original phases. Those phases may have completed before a later error; checkout is not an atomic repository transaction. Rust selects targets using callback receipts at the original observation boundaries and retains its selection checkpoint rather than replaying callbacks after failure.

Canonical `getNewVersion` and model callbacks still resolve the requested version/ref in Node. Rust owns the staged branch, status and apply decisions around those observations. Early restoration and import can change workspace files before a later conflict is rejected. This chunk does not complete the client VCS migration tracked in #73.

Merge preparation validates referenced Versions and Sources before destructive workspace effects. Rust retains target and newly merged bodies in private snapshots. Ordinary file writes reference those snapshots directly instead of returning merged text to Node and sending the same bytes back to the helper. Current-file clones retain canonical Buffer sharing. Cached target bodies also retain their public Buffer aliases; mutation invalidates native provenance.

The writer captures ordinary planned writes before its first asynchronous receipt, including files in later bounded helper frames. Acknowledged writes are not repeated. On helper loss, the remaining default writes use the captured destination, snapshot bytes, EOL conversion and write functions. Custom writers, accessors and unsupported metadata retain canonical behavior. Private snapshots survive helper loss, and escaped public SourceFiles are hydrated before snapshot cleanup.

Metadata-only checkout RPC does not imply zero Node body I/O. Current component classes retain their canonical buffers, and compatibility reads and escaped-file cleanup may hydrate private snapshots. Earlier restoration and ordinary fallback writes can still use the existing workspace persistence protocols; independent object readers retain their own leases.

## Qualification

The frozen implementation is revision `d0b4e513fcd448d18306740a6d0ba17e3cdd26b6`. Its physically compiled private CLI uses the authentic Bit `2.2.93` baseline at `323f727bc81dd6a61bbf2b279d182bd465532984`, with 158 source and 156 compiled-module fingerprints and no runtime source rerouting. The qualification driver checks those fingerprints, the helper, native source and harness before and after each run.

The native source digest is `8af182ec41b69e381b510dcbd16e82f4cb33f4d39fca3dd686a729c5d6056abc`; the GNU release helper SHA-256 is `c06a76d2d1da1b37f26e36d98138927b492162b473787231657be58b8d7133fc`. The official archive is `bit-object-import-0.1.0-x86_64-unknown-linux-gnu-d0b4e513fcd4.tar.gz`, SHA-256 `8f0ddbf0613ac88734b5bf6806b44bcb96af0342e8cc71424581365155749c85`. Loader and artifact checks use this packaged helper rather than an unbound development executable.

Both the 5-file and 265-file component fixtures pass all fourteen public command scenarios in four modes: canonical Node, native, missing helper and crashed helper. The fixture also contains an independently tracked dependency component. The scenarios cover old/head checkout, edited and deleted file reset, missing-component restoration, workspace-root reset, lane reset/revert, revert without changing the tracked version, preserved local edits/deletions, rejected conflicts and manual/ours/theirs conflict strategies. Comparisons include ordinary CLI stdout/stderr and exit results, raw workspace bytes, bitmap/configuration state, status and repository objects. Deterministic fixture metadata and elapsed-time presentation remove unrelated nondeterminism; only pre-existing scope-index insertion order is normalized. The large report retains before/after state fingerprints after performing exact comparisons, instead of serializing every full state again.

Separate public-route qualification passes `stash load` with clean and conflicting files, and `latest`, `head`, ancestor and main target requests in all four modes. The final reports are `qualification-small-final.json`, `qualification-large-final.json` and `public-routes-final.json` under `/var/home/zoltan/bit-checkout-transition-evidence-2026-10-12`.

Successful state parity alone is insufficient. The diagnostic runs require accepted selection-begin/receipt, apply-decision, preparation, removal, apply, materialization and finish requests, with no failed acknowledgements or failed materialization prefixes. Every command uses one pinned helper across its workspace inspection, checkout, merge and persistence protocols. Clean checkout, edited-file reset and workspace-root reset must actually prepare retained Source snapshots and write them. The small and large fixtures complete 56 and 2,916 retained materialization steps respectively; the public-route fixture completes 30. Checkout RPCs carry zero Source-body payload bytes. The ours fork accepts its early decision without reloading a target after that decision or writing target files; the rejected-conflict fixture throws before removal/writer effects.

All 32 focused checkout/guard tests pass in both source and compiled modes. They cover serialization without callback-scope deadlocks, no replacement helper after failure, cleanup and original error identity, current/cached Buffer aliases, sealed/frozen files, immutable writer suffixes, observed selection receipts, clone-once apply fallback and partial mutations before typed errors. Genuine separately hydrated Version metadata is accepted, changed manifest fields are rejected, and replaced Babel/defining getters and binary/config hooks are rejected without speculative invocation.

The broader suite contains 323 tests per mode: source has 321 passes and two skips; compiled has 322 passes and one skip, with no failures. The 69 canonical object-model tests and full private-CLI TypeScript/lint check pass. Native validation passes 286 tests and 550 canonical projection cases, plus formatting, strict Clippy, strict Dylint and documentation checks. The standalone artifact suite passes all 30 tests. Cross-platform CI remains a separate merge gate; these retained command proofs and measurements are Linux GNU host evidence.

The rollout remains opt-in with `BIT_RUST_CLIENT_VCS=on`. This result does not establish a complete Rust client VCS or a globally atomic checkout. Canonical target-resolution callbacks, component construction, restoration/import, prompts, installation/build and bitmap lifecycle remain adapters. Restoration/import may already have changed the workspace before a later conflict failure. Metadata-only RPC does not imply zero Node file-body I/O: current component buffers, public consumers and escaped-file cleanup can hydrate retained snapshots. Repository-history reset and untag are separate from `checkout reset` and are the next operation-level scope.

## Whole-command measurements

Four proof-bound reports cover 6 and 266 tracked Sources on tmpfs and Btrfs, using three alternating Node/native pairs after excluded warmup. They contain 312 timed command samples, 104 excluded warmup samples and 52 separate operation/workload median summaries. Deliberate conflict rejection is untimed but remains parity-checked. Ratios below are native/Node: each row spans the thirteen operation medians, each computed from three paired ratios.

| Workspace | Tracked Sources | Wall ratio | CPU ratio | RSS ratio |
| --- | ---: | ---: | ---: | ---: |
| tmpfs | 6 | 0.810–1.089 | 1.027–1.106 | 1.027–1.206 |
| tmpfs | 266 | 0.936–1.248 | 1.111–1.296 | 0.902–1.138 |
| btrfs | 6 | 1.036–1.103 | 1.020–1.117 | 1.019–1.102 |
| btrfs | 266 | 0.946–1.239 | 1.030–1.223 | 0.926–1.141 |

Wall time is measured externally; CPU includes command descendants. RSS is the near-simultaneous sum of the command process and observed descendants, sampled every 10 ms, rather than a sum of unrelated lifetime peaks. Sampler cost is recorded. Workspace-root scenarios additionally contain three versioned metadata Sources. Private capsules and CLI temporary files reside on Btrfs for both workspace-filesystem conditions. The Node control disables the client migration flag but can still use previously existing native helpers.

Results are mixed: wall ratios range from 0.810 to 1.248, CPU from 1.020 to 1.296 and RSS from 0.902 to 1.206. This migration does not establish a general speedup; rollout stays opt-in. Raw per-operation pairs and provenance are retained in `performance-{small,large}-{tmpfs,btrfs}.json` and `performance-summary.json` in the evidence directory above.

Report SHA-256 values:

- `performance-small-tmpfs.json`: `7a8d6ae13bfe179df3c1d1065e2f443e139ed5d0ecd8594619f68c11d9772dd1`
- `performance-large-tmpfs.json`: `9616ed63595f08eb32abae10360c14fa93effb44bcf6c8af1415b4b559890503`
- `performance-small-btrfs.json`: `d56e26b77fe236910af3370a57fc23e78222474c081a0ceb3884fc096e6541d9`
- `performance-large-btrfs.json`: `f555055c3bcaba6cb9ac768c19e95c919f8839bab78363539aa7a874673817d1`
