# E2E test porting plan

The Node.js CLI's e2e suite (`e2e/`) is the source of truth for Bit's behavior. This plan
ports its cases to the native CLI, as pnpm/pnpm's `plans/TEST_PORTING.md` ports pnpm's
TypeScript tests to pacquet. A ported case runs the `bit` binary from `native/` in a
workspace of its own, with a released Node.js CLI behind it for the commands that are not
native yet, and asserts what the e2e case asserts.

The list below names every case in `e2e/` with its file and line. It is a floor, not a
ceiling: native-only cases for edge cases the e2e suite does not cover are welcome.

## Where ports live

- `native/cli/tests/e2e/` is one test target (`main.rs`), mirroring `e2e/` by path:
  `e2e/commands/list.e2e.ts` is `commands/list.rs`, `e2e/harmony/lanes/lane-merge.e2e.ts` is
  `harmony/lanes/lane_merge.rs`. Add a file there and declare it in its parent module.
- `helper.rs` is the Rust side of `@teambit/legacy.e2e-helper`: `Helper::new()`,
  `re_init_workspace()`, `set_workspace_with_remote_scope()`, `populate_components()`, and
  so on. Port a helper method when a case needs it, keeping its e2e name in the doc comment.
- A mocha `describe` with a `before` becomes one Rust test per `it` sharing a setup
  function, or one test checking several `it`s when the setup is expensive and the `it`s
  read one result. The doc comment of each test quotes the `describe › it` titles it covers.
- Run them with `pnpm run test:e2e` (`cargo test -p bit-cli --features e2e --test e2e`).
  They need the Node.js CLI that `native/cli/tests/e2e/bit-version` names: `bvm install
  <version>`, or `BIT_E2E_NODE_CLI` pointing at another `@teambit/bit/bin/bit`. A missing
  Node.js CLI fails the run; it never skips cases.

## Native or known failure

Setup steps (`bit add`, `bit tag`, `bit export`, …) run on whichever CLI takes them. The
command a case checks must run natively:

- `helper.native(...)` and `helper.native_run(...)` fail the case when the command runs on
  the Node.js CLI.
- A case whose command the native CLI does not run yet lives in a `known_failures` module
  and reaches the command through `allow_known_failure!(helper.native_or_known(...))`: the
  case returns there while the command declines, and asserts once it runs natively. List
  them with `cargo test -p bit-cli --features e2e --test e2e known_failures -- --list`.
- When a port lands, its cases move out of `known_failures`. `BIT_E2E_NO_KNOWN_FAILURES=1`
  fails a known failure whose command still runs on the Node.js CLI, so the known failures
  that pass with it are the ones to move.
- A case whose command runs natively but behaves differently from the Node.js CLI is a
  parity bug: it lives in a `parity_bugs` module with `#[ignore = "<what differs>"]` until
  the native command is fixed, and its note in the list below says `parity bug`.

## Test the tests

- `BIT_E2E_ON_NODE=1` treats every command the Node.js CLI runs as native, so every case,
  known failures included, checks its assertions against the Node.js CLI. A port is done
  when it passes this way.
- Then break the native implementation the case covers, check that the case fails for the
  expected reason, and revert with `git restore <file>` (see `native/AGENTS.md`).

## Marking progress

- `[x]` ported, natively, as a known failure or as a parity bug; the note names the Rust
  test, and says `known failure` or `parity bug` while it is one.
- `[-]` will not be ported; the note says why (for example, a case about the Node.js
  process itself).
- `[ ]` not ported yet.

`node scripts/rust/e2e-port-plan.mjs` updates the list from `e2e/` and keeps every box and
note; CI runs it with `--check`, so a new or renamed e2e case shows up here. Edit only the
boxes and notes inside the generated part.

## Order

The cases of the commands that already run natively come first, since they check what the
native CLI does today:

- `status`: `e2e/harmony/status-harmony.e2e.ts`
- `list`: `e2e/commands/list.e2e.ts`
- `diff`: `e2e/commands/diff.e2e.ts`, `e2e/harmony/lanes/lane-diff.e2e.ts`
- `log`, `blame`: `e2e/harmony/log.e2e.ts`
- `import`, `fetch`: `e2e/commands/import.e2e.ts`, `e2e/commands/import-all.e2e.ts`,
  `e2e/harmony/import-harmony.e2e.ts`, `e2e/harmony/lanes/import-lanes.e2e.ts`
- `export`: `e2e/commands/export.e2e.ts`, `e2e/harmony/export-harmony.e2e.ts`,
  `e2e/harmony/lanes/lane-export.e2e.ts`
- `checkout`, `switch`, `revert`, `reset`: `e2e/harmony/checkout-harmony.e2e.ts`,
  `e2e/harmony/lanes/switch-lanes.e2e.ts`, `e2e/harmony/revert.e2e.ts`,
  `e2e/commands/reset.e2e.ts`
- `merge`, `lane merge`: `e2e/functionalities/merge.e2e.ts`, `e2e/harmony/lanes/merge-lanes-*.e2e.ts`,
  `e2e/harmony/lanes/lane-merge.e2e.ts`
- `snap`, `tag`: `e2e/harmony/snap.e2e.ts`, `e2e/harmony/tag-harmony.e2e.ts`,
  `e2e/commands/tag.e2e.ts`
- `install`: `e2e/harmony/install.e2e.ts`, `e2e/harmony/install-and-compile.e2e.ts`

The rest follow as their commands are ported.

## Additional native snapshot and platform qualification

These released-CLI parity cases supplement the TypeScript case inventory below:

- `commands::snap::sources::tracked_package_json_is_linked_without_generated_metadata_matching_node`
  checks tracked package manifests, source links, stdout/stderr, bitmap publication and exact
  inflated Source objects and their logical hashes against Node.js 2.2.94.
- `commands::diff_completion::remote_fixture::canonically_seeded_remote_versions_diff_matches_node`
  qualifies remote-only version fetching from a scope seeded with canonical existing objects
  and its index; Windows remote diff fixtures use this setup independently of export.
- `commands::diff_completion::remote_fixture::pinned_windows_repository_list_refs_omits_existing_pending_objects`
  runs only on Windows and characterizes the pinned repository's pending-object enumeration
  limitation directly. It does not relax export acknowledgement checks.

Windows status fixtures that require exported main or lane history run the pinned
Node export's local lifecycle, then seed canonical existing repository objects and
index into the remote. Bitmap scope promotion and the current lane's staged-config
cleanup complete the fixture state omitted by the pinned server's empty ID list.
`status_completion::pinned_windows_node_export_still_completes_its_local_lifecycle`
characterizes that published behavior; the all-platform seeded lane-merge case
checks actual status and diff against Node. Linux setup retains real native export.

The nested-file diff fixture permits only the two sibling directory batches
`a/deep.js` and `z/deep.js` to swap, including their matching Files summary order.
The pinned fast-glob walker reads sibling directories concurrently and emits each
completed scandir batch immediately. Root and deeper-file placement, exact file
identities, within-directory order, statuses and diff bytes remain checked.

Snapshot engine unit tests additionally cover builder failure staging without object publication,
artifact confinement and raw-byte hashes, exact callback-owned source proof replacement,
post-publication proof retention, configured staging, dangling source links, root package
suppression, and package metadata callback normalization. Windows snapshot link and IDE types
semantics have a platform-only unit case and the dedicated released-CLI workflow.

## Additional native checkout qualification

`harmony::checkout_callbacks` checks compiled providers and onLoad callbacks for
checkout, its `U` alias, revert, and lane switches. It compares complete output,
source and bitmap state, temporary-directory cleanup, and the dependency-cache
prefix retained after a merge conflict, including subsequent forced switches.
Unsupported HTTP transports decline before configured providers run.


`harmony::checkout_platform` compares complete released Node/native checkout,
reset, revert and lane-switch commands. It checks obsolete file deletion, missing
directory restoration, CRLF and binary source bytes, unchanged versions on revert,
corrupt Source rejection before workspace publication, and workspace-root checkout
without replacing the live bitmap or nested components. An embedded `.git/bit`
repository case verifies source lookup and bitmap history use the actual scope
without creating a shadow `.bit` directory. Only measured import
durations and the exact workspace prefix in corrupt-object diagnostics are normalized.
The Windows oracle includes this group, existing local checkout cases, and revert;
file-remote setup uses the documented canonical fixture helper on Windows.

`harmony::checkout_platform::license` compares the generated LICENSE bytes and
package metadata against the pinned CLI. LICENSE comes from the component's
ScopeMeta, not an unrelated local workspace scope. Binary conflict qualification
covers manual/ours/theirs, case-insensitive binary extensions, and NUL-containing
text files with their distinct published diagnostics. The extension classifier
uses the released `binary-extensions` 2.3.0 list and its accompanying MIT license.
`harmony::checkout_policy` also compares exact workspace JSONC bytes with interior,
block, trailing-property and trailing-document comments through the shared native
comment-json writer; the install API re-exports the same implementation.


## Additional merge history qualification

`harmony::merge_history` checks unrelated lane source choices, pending merge
relations and completed snap ancestry against the released CLI, including reuse
of a relation already resolved on main. Old parent, unrelated and Source refs
remain exact. Independently allocated snap/batch IDs and dates use the existing
snapshot oracle; import elapsed durations are normalized. Its reader fixtures
compare divergent lane histories, staged and stored range metadata, colored log
views and historical checkout after squashed/unrelated publication. Embedded
`.git/bit` fixtures exercise both lane history and component logs.

The merge history fixture `canonical_remote_seed_preserves_independent_lanes_and_native_historical_checkout` forces the published remote object writer on every platform, preserves independently exported remote Lane indexes and qualifies actual native historical checkout. Windows fixture publication bypasses only the pinned pending-object enumeration bug; the published `saveObjects` owns model/Lane merging and index/history publication.

`harmony::merge_lifecycle` compares automatic lane snapshots and component
merge globs/state predicates through materialization and final Version metadata.
`harmony::merge_policy` checks hidden components, removed versions, workspace
policy updates and configuration conflicts against fresh canonical fixtures.
`harmony::merge_recovery` checks retained callbacks, failed pre-snap prefixes,
interactive and silent aborts, and recovery with an embedded scope. The configured
`harmony::merge_callbacks` fixtures compare provider/pre-snap/build counters and
publication state, including failures after materialization. Every group runs in
the Windows parity matrix as well as the complete Linux suite.

## Additional inbound transfer qualification

`commands::import::policy` compares imported automatic dependencies against the
released CLI: workspace range updates, conflict markers, file merge strategies,
verbose output and JSON output, with and without dependency installation. The
workspace JSONC bytes, bitmap, exit status and report remain exact; only reported
completion durations are normalized. `commands::import::history` checks advanced
remote lane publication during historical checkout and `fetch --all-history`
parent Version and Source retention. `commands::import::fetch_deps` checks forced
dependency object imports without adding dependency components to the bitmap.

## Additional outbound transfer qualification

`harmony::export_completion` compares exact text and JSON bytes, exit status,
bitmap and staged controls for multiple pending versions, verbose reporting,
the JSON handler's ignored `--head-only` flag, empty exports, legacy regular
expression wildcard selection, unmatched wildcards and embedded `.git/bit`
scopes. Main and lane resume fixtures stage canonical `ObjectList` values through
the published server's `writeObjectsToPendingDir` before running both clients.
A valid snapped lane readme exports natively; unsnapped readmes and explicit
IDs on a lane decline before effects so the released CLI retains its observable
error stack. Missing-bitmap staged exports, staged removals, and independently
missing artifacts produced by the published TypeScript builder are also covered.
Generated package bytes and source-link shapes are compared for these exports,
including promoted component dependency packages and stale generated properties.
No JSON newline or component-ID serialization is normalized. Local histories
remain exact. Remote `VersionHistory.versions` rows alone are sorted by hash
for comparison: repeated explicit pinned-Node exports from fresh workspace
copies into restored remotes produced both ancestor-row permutations. Every
row's fields, object path, header, logical identity, and remote index stay exact.

## Cases

<!-- e2e-port-plan:begin (generated by scripts/rust/e2e-port-plan.mjs; edit only the boxes and notes) -->

### `e2e/commands/add.e2e.ts`

- [x] `e2e/commands/add.e2e.ts:27` bit add command › add before running "bit init" › Should return message to run "bit init" — `native/cli/tests/e2e/commands/add.rs::failures::add_before_init_reports_the_released_workspace_error`
- [ ] `e2e/commands/add.e2e.ts:35` bit add command › bit add without bitmap and .git/bit initialized › Should find local scope inside .git/bit and add component — Original successful recovery remains unported: the strict paired fixture `commands::add::embedded_scope_without_bitmap_is_recovered_before_tracking` preserves the pinned Bit 2.2.94 fatal outcome and verifies that no `.bit` is created.
- [x] `e2e/commands/add.e2e.ts:52` bit add command › add one component › Should print tracking component: id — `native/cli/tests/e2e/commands/add.rs::tracks_named_namespaced_and_single_level_components`
- [x] `e2e/commands/add.e2e.ts:57` bit add command › add one component › Should print warning when trying to add file that is already tracked with different id and not add it as a new one — `native/cli/tests/e2e/commands/add.rs::already_owned_files_warn_without_creating_a_second_identity`
- [x] `e2e/commands/add.e2e.ts:65` bit add command › add one component › Should add component with namespace flag to bitmap with correct name — `native/cli/tests/e2e/commands/add.rs::tracks_named_namespaced_and_single_level_components`
- [x] `e2e/commands/add.e2e.ts:71` bit add command › add one component › Should throw error msg if -i and -n flag are used with bit add — `native/cli/tests/e2e/commands/add.rs::errors::invalid_id_version_and_conflicting_name_flags_leave_state_unchanged`
- [x] `e2e/commands/add.e2e.ts:78` bit add command › add one component › Should throw InvalidName when the id given with -i is not a valid component name — `native/cli/tests/e2e/commands/add.rs::errors::invalid_id_version_and_conflicting_name_flags_leave_state_unchanged`
- [x] `e2e/commands/add.e2e.ts:83` bit add command › add one component › Define dynamic main file — `native/cli/tests/e2e/commands/add.rs::main_file::dynamic_parent_main_file_and_missing_directory_main_match_node`
- [x] `e2e/commands/add.e2e.ts:93` bit add command › add one component › should add component with id contains only one level — `native/cli/tests/e2e/commands/add.rs::tracks_named_namespaced_and_single_level_components`
- [x] `e2e/commands/add.e2e.ts:107` bit add command › add component/s with gitignore › Should show warning msg in case there are no files to add because of gitignore — `native/cli/tests/e2e/commands/add.rs::ignored_files_and_fully_ignored_directories_match_node`
- [x] `e2e/commands/add.e2e.ts:130` bit add command › ignore specific files inside component › Should contain inside bitmap only files that are not inside gitignore — `native/cli/tests/e2e/commands/add.rs::ignored_files_and_fully_ignored_directories_match_node`
- [x] `e2e/commands/add.e2e.ts:142` bit add command › add component when id includes a version › should throw an VersionShouldBeRemoved exception — `native/cli/tests/e2e/commands/add.rs::errors::invalid_id_version_and_conflicting_name_flags_leave_state_unchanged`
- [x] `e2e/commands/add.e2e.ts:154` bit add command › add component when the main file is a directory › should throw an exception MainFileIsDir — `native/cli/tests/e2e/commands/add.rs::main_file::dynamic_parent_main_file_and_missing_directory_main_match_node`
- [x] `e2e/commands/add.e2e.ts:175` bit add command › add the main file when it was removed before › should add the main file successfully — `native/cli/tests/e2e/commands/add.rs::main_file::removed_main_can_be_replaced_by_a_new_explicit_main`
- [x] `e2e/commands/add.e2e.ts:186` bit add command › directory is with upper case and test/main flags are written with lower case › should throw an error for case sensitive filesystem saying the file was not found. for other system, it should work — `native/cli/tests/e2e/commands/add.rs::main_file::platform_case_sensitivity_controls_explicit_main_lookup`
- [x] `e2e/commands/add.e2e.ts:210` bit add command › adding a directory outside the consumer dir › should throw PathOutsideConsumer error — `native/cli/tests/e2e/commands/add.rs::errors::individual_files_and_missing_or_outside_paths_match_errors`

### `e2e/commands/cat.e2e.ts`

- [ ] `e2e/commands/cat.e2e.ts:23` bit cat command › basic usage › should show all source files with headers
- [ ] `e2e/commands/cat.e2e.ts:29` bit cat command › basic usage › should show a specific file with --file (raw, no header)
- [ ] `e2e/commands/cat.e2e.ts:35` bit cat command › basic usage › should error when --file references a non-existent file
- [ ] `e2e/commands/cat.e2e.ts:40` bit cat command › basic usage › should show config with --config
- [ ] `e2e/commands/cat.e2e.ts:45` bit cat command › basic usage › should show both files and config with --all
- [ ] `e2e/commands/cat.e2e.ts:50` bit cat command › basic usage › should output valid JSON with --json
- [ ] `e2e/commands/cat.e2e.ts:72` bit cat command › versioned component › should show files at a specific historical version
- [ ] `e2e/commands/cat.e2e.ts:78` bit cat command › versioned component › should show the latest version when no version is specified

### `e2e/commands/config.e2e.ts`

- [ ] `e2e/commands/config.e2e.ts:28` bit config › set, get, delete configs › should set the config correctly
- [ ] `e2e/commands/config.e2e.ts:32` bit config › set, get, delete configs › should get the config correctly
- [ ] `e2e/commands/config.e2e.ts:36` bit config › set, get, delete configs › should delete the config correctly
- [ ] `e2e/commands/config.e2e.ts:51` bit config › saving config in the local workspace › should save to the workspace when using "--local-track"
- [ ] `e2e/commands/config.e2e.ts:55` bit config › saving config in the local workspace › should be available for config-get
- [ ] `e2e/commands/config.e2e.ts:63` bit config › saving config in the local workspace › deleting the config › should not list it anymore
- [ ] `e2e/commands/config.e2e.ts:67` bit config › saving config in the local workspace › deleting the config › should not be available for config-get
- [ ] `e2e/commands/config.e2e.ts:77` bit config › saving config in the local workspace › same config in global and workspace › bit config get should return the local one
- [ ] `e2e/commands/config.e2e.ts:89` bit config › saving config in the local scope › should save to the scope when using "--local"
- [ ] `e2e/commands/config.e2e.ts:93` bit config › saving config in the local scope › should be available for config-get
- [ ] `e2e/commands/config.e2e.ts:101` bit config › saving config in the local scope › deleting the config › should not list it anymore
- [ ] `e2e/commands/config.e2e.ts:105` bit config › saving config in the local scope › deleting the config › should not be available for config-get
- [ ] `e2e/commands/config.e2e.ts:115` bit config › saving config in the local scope › same config in global and scope › bit config get should return the local one

### `e2e/commands/diff.e2e.ts`

- [x] `e2e/commands/diff.e2e.ts:30` bit diff command › for non existing component › show an error saying the component was not found — `commands::diff::known_failures::a_missing_component_is_not_found` (known failure)
- [x] `e2e/commands/diff.e2e.ts:37` bit diff command › when there are no modified components › show an error saying that there are no modified components — `commands::diff::no_modified_components`
- [x] `e2e/commands/diff.e2e.ts:47` bit diff command › after the component was created › diff should show that all files were added — `commands::diff::a_new_component_shows_all_files_added`
- [x] `e2e/commands/diff.e2e.ts:56` bit diff command › after the component was created › after the component was tagged › should still indicate that there is no diff for that component — `commands::diff::a_tagged_component_has_no_diff`
- [x] `e2e/commands/diff.e2e.ts:67` bit diff command › after the component was created › after the component was tagged › and component was modified › should show a success message — `commands::diff::a_modified_component_shows_its_diff`
- [x] `e2e/commands/diff.e2e.ts:70` bit diff command › after the component was created › after the component was tagged › and component was modified › should indicate the original files with --- — `commands::diff::a_modified_component_shows_its_diff`
- [x] `e2e/commands/diff.e2e.ts:73` bit diff command › after the component was created › after the component was tagged › and component was modified › should indicate the modified files with +++ — `commands::diff::a_modified_component_shows_its_diff`
- [x] `e2e/commands/diff.e2e.ts:76` bit diff command › after the component was created › after the component was tagged › and component was modified › should show the deleted part with leading - (minus sign) — `commands::diff::a_modified_component_shows_its_diff`
- [x] `e2e/commands/diff.e2e.ts:79` bit diff command › after the component was created › after the component was tagged › and component was modified › should show the added part with leading + (plus sign) — `commands::diff::a_modified_component_shows_its_diff`
- [x] `e2e/commands/diff.e2e.ts:82` bit diff command › after the component was created › after the component was tagged › and component was modified › should show a success message also when running from an inner directory — `commands::diff::the_diff_runs_from_an_inner_directory`
- [x] `e2e/commands/diff.e2e.ts:93` bit diff command › after the component was created › after the component was tagged › and component was modified › when git path is configured incorrectly › should throw an error GitNotFound — `commands::diff::known_failures::a_wrong_git_path_fails` (known failure)
- [x] `e2e/commands/diff.e2e.ts:121` bit diff command › when there are several modified components and non modified components › running bit diff with no ids › should show diff for all modified components — `commands::diff::a_diff_without_ids_shows_the_modified_components`
- [x] `e2e/commands/diff.e2e.ts:127` bit diff command › when there are several modified components and non modified components › running bit diff with no ids › should not show non modified components — `commands::diff::a_diff_without_ids_shows_the_modified_components`
- [x] `e2e/commands/diff.e2e.ts:136` bit diff command › when there are several modified components and non modified components › running bit diff with multiple ids › should not show diff for non modified components — `commands::diff::known_failures::a_diff_of_several_ids_mentions_the_unmodified` (known failure)
- [x] `e2e/commands/diff.e2e.ts:139` bit diff command › when there are several modified components and non modified components › running bit diff with multiple ids › should mention the components with no diff — `commands::diff::known_failures::a_diff_of_several_ids_mentions_the_unmodified` (known failure)
- [x] `e2e/commands/diff.e2e.ts:158` bit diff command › when a file is deleted and another is added › should indicate the deleted files as deleted — `commands::diff::a_replaced_file_is_deleted_and_added`
- [x] `e2e/commands/diff.e2e.ts:164` bit diff command › when a file is deleted and another is added › should indicate the added files as added — `commands::diff::a_replaced_file_is_deleted_and_added`
- [x] `e2e/commands/diff.e2e.ts:172` bit diff command › when a file is deleted and another is added › other fields diff › should indicate that the mainFile was changed — `commands::diff::a_replaced_file_is_deleted_and_added`
- [x] `e2e/commands/diff.e2e.ts:178` bit diff command › when a file is deleted and another is added › other fields diff › should indicate that the files array were changed — `commands::diff::a_replaced_file_is_deleted_and_added`
- [x] `e2e/commands/diff.e2e.ts:190` bit diff command › when a file is deleted and another is added › running bit diff between the previous version and the last version › should indicate the deleted files as deleted — `commands::diff::a_diff_between_versions_shows_the_replaced_file`
- [x] `e2e/commands/diff.e2e.ts:195` bit diff command › when a file is deleted and another is added › running bit diff between the previous version and the last version › should indicate the added files as added — `commands::diff::a_diff_between_versions_shows_the_replaced_file`
- [x] `e2e/commands/diff.e2e.ts:202` bit diff command › when a file is deleted and another is added › running bit diff between the previous version and the last version › other fields diff › should indicate that the mainFile was changed — `commands::diff::a_diff_between_versions_shows_the_replaced_file`
- [x] `e2e/commands/diff.e2e.ts:208` bit diff command › when a file is deleted and another is added › running bit diff between the previous version and the last version › other fields diff › should indicate that the files array were changed — `commands::diff::a_diff_between_versions_shows_the_replaced_file`
- [x] `e2e/commands/diff.e2e.ts:215` bit diff command › when a file is deleted and another is added › running bit diff between the previous version and the last version › should have the same output as running diff of the previous version — `commands::diff::a_diff_between_versions_shows_the_replaced_file`
- [x] `e2e/commands/diff.e2e.ts:233` bit diff command › component with multiple versions › diff between a non-exist version and current version › should throw an VersionNotFound error — `commands::diff::known_failures::a_missing_version_is_not_found` (known failure)
- [x] `e2e/commands/diff.e2e.ts:244` bit diff command › component with multiple versions › diff between an earlier version and current version › should show the earlier version with leading - (minus sign) — `commands::diff::a_diff_from_an_earlier_version`
- [x] `e2e/commands/diff.e2e.ts:248` bit diff command › component with multiple versions › diff between an earlier version and current version › should show the current version with leading + (plus sign) — `commands::diff::a_diff_from_an_earlier_version`
- [x] `e2e/commands/diff.e2e.ts:258` bit diff command › component with multiple versions › diff between two different versions › should show the first version with leading - (minus sign) — `commands::diff::a_diff_between_two_versions`
- [x] `e2e/commands/diff.e2e.ts:262` bit diff command › component with multiple versions › diff between two different versions › should show the second version with leading + (plus sign) — `commands::diff::a_diff_between_two_versions`
- [x] `e2e/commands/diff.e2e.ts:286` bit diff command › ai-agent output flags › --name-only › should print the component header once — `commands::diff::name_only_lists_the_changed_files`
- [x] `e2e/commands/diff.e2e.ts:290` bit diff command › ai-agent output flags › --name-only › should list changed files with a status letter and path — `commands::diff::name_only_lists_the_changed_files`
- [x] `e2e/commands/diff.e2e.ts:293` bit diff command › ai-agent output flags › --name-only › should not include the unified diff body — `commands::diff::name_only_lists_the_changed_files`
- [x] `e2e/commands/diff.e2e.ts:303` bit diff command › ai-agent output flags › --stat › should include the changed file with +N -M counts — `commands::diff::stat_counts_the_changed_lines`
- [x] `e2e/commands/diff.e2e.ts:306` bit diff command › ai-agent output flags › --stat › should not include the unified diff body — `commands::diff::stat_counts_the_changed_lines`
- [x] `e2e/commands/diff.e2e.ts:315` bit diff command › ai-agent output flags › --file <path> › should include the matching file diff — `commands::diff::file_shows_one_file_without_fields`
- [x] `e2e/commands/diff.e2e.ts:318` bit diff command › ai-agent output flags › --file <path> › should not include fields diff (implies --files-only) — `commands::diff::file_shows_one_file_without_fields`
- [x] `e2e/commands/diff.e2e.ts:328` bit diff command › ai-agent output flags › --files-only › should include file diffs — `commands::diff::files_only_drops_the_fields`
- [x] `e2e/commands/diff.e2e.ts:331` bit diff command › ai-agent output flags › --files-only › should drop fields diff — `commands::diff::files_only_drops_the_fields`
- [x] `e2e/commands/diff.e2e.ts:341` bit diff command › ai-agent output flags › --configs-only › should include fields diff — `commands::diff::configs_only_drops_the_files`
- [x] `e2e/commands/diff.e2e.ts:344` bit diff command › ai-agent output flags › --configs-only › should drop file-content diffs — `commands::diff::configs_only_drops_the_files`
- [x] `e2e/commands/diff.e2e.ts:354` bit diff command › ai-agent output flags › --json › should return an array with one entry per matching component — `commands::diff::json_lists_the_component_diff`
- [x] `e2e/commands/diff.e2e.ts:358` bit diff command › ai-agent output flags › --json › should expose id, hasDiff, filesDiff, fieldsDiff — `commands::diff::json_lists_the_component_diff`
- [x] `e2e/commands/diff.e2e.ts:363` bit diff command › ai-agent output flags › --json › should include diffOutput in each filesDiff entry by default — `commands::diff::json_lists_the_component_diff`
- [x] `e2e/commands/diff.e2e.ts:373` bit diff command › ai-agent output flags › --json --name-only › should omit diffOutput from filesDiff entries — `commands::diff::json_name_only_omits_the_diff_output`
- [x] `e2e/commands/diff.e2e.ts:385` bit diff command › ai-agent output flags › --json --stat › should include additions/deletions and omit diffOutput — `commands::diff::json_stat_counts_without_the_diff_output`
- [x] `e2e/commands/diff.e2e.ts:392` bit diff command › ai-agent output flags › mutually exclusive flags › --files-only + --configs-only should error — `commands::diff::known_failures::exclusive_flags_fail` (known failure)
- [x] `e2e/commands/diff.e2e.ts:396` bit diff command › ai-agent output flags › mutually exclusive flags › --name-only + --stat should error — `commands::diff::known_failures::exclusive_flags_fail` (known failure)
- [x] `e2e/commands/diff.e2e.ts:400` bit diff command › ai-agent output flags › mutually exclusive flags › --configs-only + --file should error — `commands::diff::known_failures::exclusive_flags_fail` (known failure)
- [x] `e2e/commands/diff.e2e.ts:424` bit diff command › diff with --parent flag › when the version is a tag › should show the diff between the tag and its parent tag — `commands::diff::parent_diffs_against_the_parent_version`
- [x] `e2e/commands/diff.e2e.ts:433` bit diff command › diff with --parent flag › when the parent is a snap › should show the diff between the snap and its parent snap — `commands::diff::parent_diffs_against_the_parent_version`
- [x] `e2e/commands/diff.e2e.ts:442` bit diff command › diff with --parent flag › when no version is specified › should show the diff between the current version and its parent — `commands::diff::parent_diffs_against_the_parent_version`
- [x] `e2e/commands/diff.e2e.ts:451` bit diff command › diff with --parent flag › when the version is the first version › should show all files as added — `commands::diff::known_failures::parent_of_the_first_version_adds_everything` (known failure)
- [x] `e2e/commands/diff.e2e.ts:461` bit diff command › diff with --parent flag › when two versions are specified along with --parent › should throw an error — `commands::diff::known_failures::parent_of_the_first_version_adds_everything` (known failure)
- [x] `e2e/commands/diff.e2e.ts:472` bit diff command › diff with --parent flag › when the parent has identical content (e.g. a tag created on top of a squashed merge-snap) › should skip identical ancestors and diff against the first ancestor with different content — `commands::diff::parent_skips_identical_snaps_but_not_tags`
- [x] `e2e/commands/diff.e2e.ts:489` bit diff command › diff with --parent flag › when the parent is a tag with identical content (a legit tag with no changes) › should show no diff rather than walking further up the history — `commands::diff::parent_skips_identical_snaps_but_not_tags`
- [x] `e2e/commands/diff.e2e.ts:498` bit diff command › diff with --parent flag › when the component is soft-deleted in the workspace › should still compare the stored versions rather than showing the files as deleted — `commands::diff::known_failures::parent_of_a_soft_deleted_component` (known failure)
- [x] `e2e/commands/diff.e2e.ts:514` bit diff command › diff with --parent flag › when the only ancestor is a snap with identical content › should treat the version as having no parent and show all files as added — `commands::diff::parent_of_a_tag_over_an_identical_snap`

### `e2e/commands/export.e2e.ts`

- [x] `e2e/commands/export.e2e.ts:27` bit export command › with no components to export › should print nothing to export — `commands::export::known_failures::nothing_to_export` (known failure)
- [x] `e2e/commands/export.e2e.ts:42` bit export command › with multiple versions › should export it with no errors — `commands::export::multiple_versions_are_exported`
- [x] `e2e/commands/export.e2e.ts:69` bit export command › imported (v1), exported (v2) and then exported again (v3) › should export it with no errors — `commands::export::an_imported_component_is_exported_twice`
- [x] `e2e/commands/export.e2e.ts:90` bit export command › with a PNG file › should export it with no errors — `commands::export::known_failures::a_png_file_keeps_its_size` (known failure)
- [x] `e2e/commands/export.e2e.ts:99` bit export command › with a PNG file › after importing the file › the size of the binary file should not be changed — `commands::export::known_failures::a_png_file_keeps_its_size` (known failure)
- [x] `e2e/commands/export.e2e.ts:117` bit export command › export a component, do not modify it and export again to the same scope › should not export the component — `commands::export::selected_unmodified_component_matches_node`
- [x] `e2e/commands/export.e2e.ts:132` bit export command › export a component when the checked out version is not the latest › .bitmap should keep the current version and do not update to the latest version — `commands::export::exporting_an_older_checked_out_version_keeps_it`
- [x] `e2e/commands/export.e2e.ts:136` bit export command › export a component when the checked out version is not the latest › bit show should display the component with the current version, not the latest — `commands::export::exporting_an_older_checked_out_version_keeps_it`
- [x] `e2e/commands/export.e2e.ts:141` bit export command › export a component when the checked out version is not the latest › the file content should not be changed — `commands::export::exporting_an_older_checked_out_version_keeps_it`
- [x] `e2e/commands/export.e2e.ts:166` bit export command › applying permissions on the remote scope when was init with shared flag › when the group name does not exist › should throw an error indicating that the group does not exist (unless it is Windows) — `commands::export::known_failures::a_missing_shared_group_fails_the_export` (known failure)
- [x] `e2e/commands/export.e2e.ts:187` bit export command › applying permissions on the remote scope when was init with shared flag › when the group exists and the current user has permission to that group › should export the component successfully and change the owner to that group — `commands::export::known_failures::an_existing_shared_group_owns_the_export` (known failure)
- [x] `e2e/commands/export.e2e.ts:203` bit export command › export after re-creating the remote › export without any flag › should show a message that nothing to export — `commands::export::a_recreated_remote_has_nothing_to_export`
- [x] `e2e/commands/export.e2e.ts:213` bit export command › export after re-creating the remote › export with --all flag › should export them successfully — `commands::export::all_exports_to_a_recreated_remote`
- [x] `e2e/commands/export.e2e.ts:223` bit export command › export after re-creating the remote › export with --all-versions flag › should export them successfully — `commands::export::all_versions_exports_to_a_recreated_remote`
- [x] `e2e/commands/export.e2e.ts:243` bit export command › re-export using the component name without the scope name › should not show the "fork" prompt — `commands::export::reexporting_by_name_without_scope`

### `e2e/commands/import-all.e2e.ts`

- [x] `e2e/commands/import-all.e2e.ts:26` bit import command with no ids › with a component in bit.map and --merge flag › should throw an error and suggest using bit checkout reset — `commands::import_all::known_failures::merge_without_objects_suggests_checkout_reset` (known failure)
- [x] `e2e/commands/import-all.e2e.ts:53` bit import command with no ids › with components in bit.map when they are modified locally › without any flag › should not display a warning saying it was unable to import — `commands::import_all::known_failures::import_without_ids_imports_objects` (known failure)
- [x] `e2e/commands/import-all.e2e.ts:56` bit import command with no ids › with components in bit.map when they are modified locally › without any flag › should display a successful message — `commands::import_all::known_failures::import_without_ids_imports_objects` (known failure)
- [x] `e2e/commands/import-all.e2e.ts:64` bit import command with no ids › with components in bit.map when they are modified locally › with --override flag › should throw an error and suggest using bit checkout reset — `commands::import_all::known_failures::override_suggests_checkout_reset` (known failure)
- [x] `e2e/commands/import-all.e2e.ts:74` bit import command with no ids › with components in bit.map when they are modified locally › with --merge=manual flag › should display a successful message — `commands::import_all::known_failures::manual_merge_keeps_the_modification` (known failure)
- [x] `e2e/commands/import-all.e2e.ts:77` bit import command with no ids › with components in bit.map when they are modified locally › with --merge=manual flag › should show them as modified — `commands::import_all::known_failures::manual_merge_keeps_the_modification` (known failure)
- [x] `e2e/commands/import-all.e2e.ts:89` bit import command with no ids › with components in bit.map when they are modified locally › after tagging › should display a successful message — `commands::import_all::known_failures::manual_merge_after_a_local_tag` (known failure)
- [x] `e2e/commands/import-all.e2e.ts:107` bit import command with no ids › with an AUTHORED component which was only tagged but not exported › should not try to import that component as it was not exported yet — `commands::import_all::known_failures::an_unexported_component_is_not_imported` (known failure)

### `e2e/commands/import.e2e.ts`

- [x] `e2e/commands/import.e2e.ts:37` bit import › stand alone component (without dependencies) › should display a successful message — `commands::import::a_stand_alone_component_is_imported`
- [x] `e2e/commands/import.e2e.ts:42` bit import › stand alone component (without dependencies) › should indicate that the imported component is new — `commands::import::a_stand_alone_component_is_imported`
- [x] `e2e/commands/import.e2e.ts:46` bit import › stand alone component (without dependencies) › should add the component into bit.map file — `commands::import::a_stand_alone_component_is_imported`
- [x] `e2e/commands/import.e2e.ts:67` bit import › stand alone component (without dependencies) › with multiple files located in different directories › should write the internal files according to their relative paths — `commands::import::files_keep_their_relative_paths`
- [x] `e2e/commands/import.e2e.ts:92` bit import › stand alone component (without dependencies) › when the default component directory already exist › when the destination is an existing empty directory › should write the component to the specified path — `commands::import::known_failures::an_existing_empty_directory_is_written` (known failure)
- [x] `e2e/commands/import.e2e.ts:106` bit import › stand alone component (without dependencies) › when the default component directory already exist › when the destination directory is not empty › should not import the component — `commands::import::known_failures::a_non_empty_directory_is_not_overwritten` (known failure)
- [x] `e2e/commands/import.e2e.ts:109` bit import › stand alone component (without dependencies) › when the default component directory already exist › when the destination directory is not empty › should not delete the existing file — `commands::import::known_failures::a_non_empty_directory_is_not_overwritten` (known failure)
- [x] `e2e/commands/import.e2e.ts:112` bit import › stand alone component (without dependencies) › when the default component directory already exist › when the destination directory is not empty › should throw an error — `commands::import::known_failures::a_non_empty_directory_is_not_overwritten` (known failure)
- [x] `e2e/commands/import.e2e.ts:115` bit import › stand alone component (without dependencies) › when the default component directory already exist › when the destination directory is not empty › should import successfully if the --override flag is used — `commands::import::known_failures::a_non_empty_directory_is_not_overwritten` (known failure)
- [x] `e2e/commands/import.e2e.ts:128` bit import › stand alone component (without dependencies) › when the default component directory already exist › when the destination is a file › should not import the component — `commands::import::known_failures::a_file_at_the_directory_is_not_overwritten` (known failure)
- [x] `e2e/commands/import.e2e.ts:131` bit import › stand alone component (without dependencies) › when the default component directory already exist › when the destination is a file › should not delete the existing file — `commands::import::known_failures::a_file_at_the_directory_is_not_overwritten` (known failure)
- [x] `e2e/commands/import.e2e.ts:134` bit import › stand alone component (without dependencies) › when the default component directory already exist › when the destination is a file › should throw an error — `commands::import::known_failures::a_file_at_the_directory_is_not_overwritten` (known failure)
- [x] `e2e/commands/import.e2e.ts:137` bit import › stand alone component (without dependencies) › when the default component directory already exist › when the destination is a file › should throw an error also when the --override flag is used — `commands::import::known_failures::a_file_at_the_directory_is_not_overwritten` (known failure)
- [x] `e2e/commands/import.e2e.ts:156` bit import › stand alone component (without dependencies) › with a specific path, using -p flag › as imported › when the destination is a non-exist directory › should write the component to the specified path — `commands::import::known_failures::the_path_flag_sets_the_directory` (known failure)
- [x] `e2e/commands/import.e2e.ts:172` bit import › stand alone component (without dependencies) › re-import after deleting the component physically › should import the component successfully — `commands::import::known_failures::a_physically_deleted_component_is_imported_again` (known failure)
- [x] `e2e/commands/import.e2e.ts:186` bit import › stand alone component (without dependencies) › import component with custom dsl as destination dir for import › when the DSL is valid › should import the component successfully — `commands::import::known_failures::a_valid_default_directory_dsl_places_the_component` (known failure)
- [x] `e2e/commands/import.e2e.ts:189` bit import › stand alone component (without dependencies) › import component with custom dsl as destination dir for import › when the DSL is valid › should import the component into new dir structure according to dsl — `commands::import::known_failures::a_valid_default_directory_dsl_places_the_component` (known failure)
- [x] `e2e/commands/import.e2e.ts:194` bit import › stand alone component (without dependencies) › import component with custom dsl as destination dir for import › when the DSL is valid › bitmap should contain component with correct rootDir according to dsl — `commands::import::known_failures::a_valid_default_directory_dsl_places_the_component` (known failure)
- [x] `e2e/commands/import.e2e.ts:209` bit import › stand alone component (without dependencies) › import component with custom dsl as destination dir for import › when the DSL has invalid parameters › should throw an error saying it has an invalid parameter — `commands::import::known_failures::an_invalid_default_directory_dsl_fails` (known failure)
- [x] `e2e/commands/import.e2e.ts:234` bit import › with an existing component in bit.map (as author) › should write the component to the paths specified in bit.map — `commands::import::known_failures::an_authored_component_keeps_its_bitmap_paths` (known failure)
- [x] `e2e/commands/import.e2e.ts:238` bit import › with an existing component in bit.map (as author) › should not remove the originallySharedDir (because it is an AUTHORED component) — `commands::import::known_failures::an_authored_component_keeps_its_bitmap_paths` (known failure)
- [x] `e2e/commands/import.e2e.ts:241` bit import › with an existing component in bit.map (as author) › should not write any file into components directory — `commands::import::known_failures::an_authored_component_keeps_its_bitmap_paths` (known failure)
- [x] `e2e/commands/import.e2e.ts:251` bit import › with an existing component in bit.map (as author) › importing the component again › should not create an "undefined" package on node_modules — `commands::import::known_failures::an_authored_component_keeps_its_bitmap_paths` (known failure)
- [x] `e2e/commands/import.e2e.ts:285` bit import › import a component when the local version is modified › without --override flag › should display a warning saying it was unable to import — `commands::import::known_failures::a_modified_component_needs_override` (known failure)
- [x] `e2e/commands/import.e2e.ts:294` bit import › import a component when the local version is modified › with --override flag › should display a successful message — `commands::import::known_failures::a_modified_component_needs_override` (known failure)
- [x] `e2e/commands/import.e2e.ts:304` bit import › import a component when the local version is modified › with --merge=manual › should display a successful message — `commands::import::known_failures::a_modified_component_merges_manually` (known failure)
- [x] `e2e/commands/import.e2e.ts:313` bit import › import a component when the local version is modified › re-import a component after tagging the component › should import successfully — `commands::import::known_failures::a_tagged_modification_is_imported_again` (known failure)
- [x] `e2e/commands/import.e2e.ts:339` bit import › importing a component when it has a local tag › as imported › should not remove the local version — `commands::import::known_failures::a_local_tag_survives_an_import` (known failure)
- [x] `e2e/commands/import.e2e.ts:346` bit import › importing a component when it has a local tag › as imported › should not override the local component — `commands::import::known_failures::a_local_tag_survives_an_import` (known failure)
- [x] `e2e/commands/import.e2e.ts:359` bit import › importing a component when it has a local tag › as imported › importing a specific version › should not throw an error saying the component was not found — `commands::import::known_failures::a_local_tag_survives_an_import` (known failure)
- [x] `e2e/commands/import.e2e.ts:379` bit import › import with wildcards › import the entire scope › should import all components from the remote scope — `commands::import::known_failures::a_wildcard_imports_the_whole_scope` (known failure)
- [x] `e2e/commands/import.e2e.ts:384` bit import › import with wildcards › import the entire scope › bit ls should show that all components from the remote scope were imported — `commands::import::known_failures::a_wildcard_imports_the_whole_scope` (known failure)
- [x] `e2e/commands/import.e2e.ts:412` bit import › import with --dependencies-depth (chain: comp1 -> comp2 -> comp3 -> comp4) › --dependencies-depth 1 › should import only the direct dep at the version comp1 references (comp2@0.0.1) — `commands::import::known_failures::dependencies_depth_limits_the_import` (known failure)
- [x] `e2e/commands/import.e2e.ts:425` bit import › import with --dependencies-depth (chain: comp1 -> comp2 -> comp3 -> comp4) › --dependencies-depth 2 › should import direct deps and their direct deps (comp2, comp3) but not deeper — `commands::import::known_failures::dependencies_depth_limits_the_import` (known failure)
- [x] `e2e/commands/import.e2e.ts:438` bit import › import with --dependencies-depth (chain: comp1 -> comp2 -> comp3 -> comp4) › --dependencies-depth with versionless input › should resolve the root to head (comp1@0.0.2) and import its direct dep at the referenced version (comp2@0.0.2) — `commands::import::known_failures::dependencies_depth_resolves_heads` (known failure)
- [x] `e2e/commands/import.e2e.ts:451` bit import › import with --dependencies-depth (chain: comp1 -> comp2 -> comp3 -> comp4) › --dependencies-head --dependencies-depth 1 › should import the direct dep at head (comp2@0.0.2), not the version comp1@0.0.1 references — `commands::import::known_failures::dependencies_depth_resolves_heads` (known failure)
- [x] `e2e/commands/import.e2e.ts:464` bit import › import with --dependencies-depth (chain: comp1 -> comp2 -> comp3 -> comp4) › --dependencies without depth › should import all transitive dependencies — `commands::import::known_failures::dependencies_imports_the_whole_chain` (known failure)
- [x] `e2e/commands/import.e2e.ts:476` bit import › import with --dependencies-depth (chain: comp1 -> comp2 -> comp3 -> comp4) › validation errors › should error when --dependencies-depth is used without --dependencies/--dependencies-head — `commands::import::known_failures::dependencies_depth_is_validated` (known failure)
- [x] `e2e/commands/import.e2e.ts:483` bit import › import with --dependencies-depth (chain: comp1 -> comp2 -> comp3 -> comp4) › validation errors › should error when --dependencies-depth is not a positive integer — `commands::import::known_failures::dependencies_depth_is_validated` (known failure)
- [ ] `e2e/commands/import.e2e.ts:524` bit import › external package manager mode › should write dependencies to package.json
- [ ] `e2e/commands/import.e2e.ts:528` bit import › external package manager mode › should not run installation

### `e2e/commands/init.e2e.ts`

- [x] `e2e/commands/init.e2e.ts:29` run bit init › running bit init with path › should init Bit at that path — `commands::init::explicit_destination_and_agent_targets_match_node`
- [x] `e2e/commands/init.e2e.ts:40` run bit init › automatic bit init when .bit.map.json already exists › should not tell you there is already a scope when running "bit init" — `commands::init::legacy_bitmap_and_existing_standalone_git_paths_match_node`
- [x] `e2e/commands/init.e2e.ts:44` run bit init › automatic bit init when .bit.map.json already exists › bitmap should contain version" — `commands::init::legacy_bitmap_and_existing_standalone_git_paths_match_node`
- [x] `e2e/commands/init.e2e.ts:52` run bit init › init .bit › when .git exists and bit already initialized with .bit › should not create bit inside .git — `commands::init::legacy_bitmap_and_existing_standalone_git_paths_match_node`
- [x] `e2e/commands/init.e2e.ts:72` run bit init › git integration › when .git exists › should nest the bit folder inside .git by default — `commands::init::git_directory_pointer_and_standalone_scope_paths_match_node`
- [x] `e2e/commands/init.e2e.ts:79` run bit init › git integration › when .git exists › should not nest the bit folder inside .git if --standalone provided — `commands::init::git_directory_pointer_and_standalone_scope_paths_match_node`
- [x] `e2e/commands/init.e2e.ts:103` run bit init › when scope.json is missing › running bit init › should show a success message — `commands::init::reinitialization_and_scope_repair_match_node`
- [x] `e2e/commands/init.e2e.ts:106` run bit init › when scope.json is missing › running bit init › should recreate scope.json file — `commands::init::reinitialization_and_scope_repair_match_node`
- [ ] `e2e/commands/init.e2e.ts:120` run bit init › bit init --reset › when bitMap file is invalid › bit status should throw an exception InvalidBitMap
- [x] `e2e/commands/init.e2e.ts:125` run bit init › bit init --reset › when bitMap file is invalid › should create a new bitMap file — `commands::init::reset_repairs_corrupt_bitmap`
- [ ] `e2e/commands/init.e2e.ts:136` run bit init › bit init --reset › when workspace.jsonc file is invalid › bit status should throw a descriptive error
- [x] `e2e/commands/init.e2e.ts:161` run bit init › an existing environment with model and with modified bitMap › bit init › should not change BitMap file — `commands::init::tracked_reinitialization_and_reset_variants_match_node`
- [x] `e2e/commands/init.e2e.ts:166` run bit init › an existing environment with model and with modified bitMap › bit init › should not change .bit directory — `commands::init::tracked_reinitialization_and_reset_variants_match_node`
- [x] `e2e/commands/init.e2e.ts:176` run bit init › an existing environment with model and with modified bitMap › bit init --reset › should not change BitMap file — `commands::init::tracked_reinitialization_and_reset_variants_match_node`
- [x] `e2e/commands/init.e2e.ts:181` run bit init › an existing environment with model and with modified bitMap › bit init --reset › should not change .bit directory — `commands::init::tracked_reinitialization_and_reset_variants_match_node`
- [x] `e2e/commands/init.e2e.ts:191` run bit init › an existing environment with model and with modified bitMap › bit init --reset-hard › should recreate the BitMap file — `commands::init::tracked_reinitialization_and_reset_variants_match_node`
- [x] `e2e/commands/init.e2e.ts:196` run bit init › an existing environment with model and with modified bitMap › bit init --reset-hard › should recreate .bit directory — `commands::init::tracked_reinitialization_and_reset_variants_match_node`
- [x] `e2e/commands/init.e2e.ts:200` run bit init › an existing environment with model and with modified bitMap › bit init --reset-hard › .bit/objects directory should be empty — `commands::init::tracked_reinitialization_and_reset_variants_match_node`
- [x] `e2e/commands/init.e2e.ts:204` run bit init › an existing environment with model and with modified bitMap › bit init --reset-hard › should not delete the user files — `commands::init::tracked_reinitialization_and_reset_variants_match_node`
- [ ] `e2e/commands/init.e2e.ts:207` run bit init › an existing environment with model and with modified bitMap › bit init --reset-hard › bit status should show nothing-to-tag
- [x] `e2e/commands/init.e2e.ts:219` run bit init › when a project has package.json file › without --standalone flag › should preserve the default npm indentation of 2 — `commands::init::package_indentation_and_newlines_match_node`
- [x] `e2e/commands/init.e2e.ts:223` run bit init › when a project has package.json file › without --standalone flag › should preserve the new line at the end of json as it was created by npm — `commands::init::package_indentation_and_newlines_match_node`
- [x] `e2e/commands/init.e2e.ts:234` run bit init › when a project has package.json file › with --standalone flag › should not write the "bit" prop into the package.json file — `commands::init::git_directory_pointer_and_standalone_scope_paths_match_node`
- [x] `e2e/commands/init.e2e.ts:238` run bit init › when a project has package.json file › with --standalone flag › should create workspace.jsonc file — `commands::init::git_directory_pointer_and_standalone_scope_paths_match_node`
- [x] `e2e/commands/init.e2e.ts:251` run bit init › when a project has package.json file › with an indentation of 4 › should preserve the original indentation and keep it as 4 — `commands::init::package_indentation_and_newlines_match_node`
- [ ] `e2e/commands/init.e2e.ts:264` run bit init › when there is .bitmap, bit.json but not .bit dir › when .bit located directly on workspace root › bit ls (or any other command) should not throw an error and should rebuild .bit dir
- [ ] `e2e/commands/init.e2e.ts:278` run bit init › when there is .bitmap, bit.json but not .bit dir › when bit located on .git › bit ls (or any other command) should not throw an error and should rebuild .bit dir
- [x] `e2e/commands/init.e2e.ts:291` run bit init › external package manager mode › bit init --external-package-manager › should set externalPackageManager to true in dependency-resolver config — `commands::init::workspace_defaults_generators_and_external_manager_match_node`
- [x] `e2e/commands/init.e2e.ts:298` run bit init › external package manager mode › bit init --external-package-manager › should set rootComponent to false in dependency-resolver config — `commands::init::workspace_defaults_generators_and_external_manager_match_node`
- [x] `e2e/commands/init.e2e.ts:302` run bit init › external package manager mode › bit init --external-package-manager › should set enableWorkspaceConfigWrite and useDefaultDirectory to true — `commands::init::workspace_defaults_generators_and_external_manager_match_node`
- [x] `e2e/commands/init.e2e.ts:313` run bit init › external package manager mode › bit init --external-package-manager › should create package.json with type module — `commands::init::workspace_defaults_generators_and_external_manager_match_node`
- [x] `e2e/commands/init.e2e.ts:317` run bit init › external package manager mode › bit init --external-package-manager › should create package.json with postinstall script — `commands::init::workspace_defaults_generators_and_external_manager_match_node`
- [ ] `e2e/commands/init.e2e.ts:328` run bit init › external package manager mode › bit install in external package manager mode › should throw error when answering no to prompt
- [ ] `e2e/commands/init.e2e.ts:332` run bit init › external package manager mode › bit install in external package manager mode › should switch to Bit package manager when answering yes to prompt
- [ ] `e2e/commands/init.e2e.ts:382` run bit init › external package manager mode › validation of conflicting settings › should throw error when manually setting rootComponent to true
- [x] `e2e/commands/init.e2e.ts:406` run bit init › external package manager mode › preserving existing package.json › should preserve existing package.json properties — `commands::init::existing_package_options_preserve_properties_like_node`
- [x] `e2e/commands/init.e2e.ts:411` run bit init › external package manager mode › preserving existing package.json › should preserve existing scripts and add postinstall — `commands::init::existing_package_options_preserve_properties_like_node`
- [x] `e2e/commands/init.e2e.ts:417` run bit init › external package manager mode › preserving existing package.json › should not add type module to existing package.json — `commands::init::existing_package_options_preserve_properties_like_node`
- [x] `e2e/commands/init.e2e.ts:431` run bit init › interactive mode › when git repository exists and workspace is not initialized › should skip interactive mode with --skip-interactive flag — `commands::init::git_directory_pointer_and_standalone_scope_paths_match_node`
- [x] `e2e/commands/init.e2e.ts:439` run bit init › interactive mode › when git repository exists and workspace is not initialized › should skip interactive mode with --external-package-manager and with --standalone — `commands::init::git_directory_pointer_and_standalone_scope_paths_match_node`
- [ ] `e2e/commands/init.e2e.ts:451` run bit init › interactive mode › when git repository exists and workspace is not initialized › should run interactive mode by default in git repository

### `e2e/commands/list.e2e.ts`

- [x] `e2e/commands/list.e2e.ts:20` bit list command › when a component is created but not tagged › should display "found 0 components" — `commands::list::a_new_component_is_not_listed`
- [x] `e2e/commands/list.e2e.ts:32` bit list command › when a component is created and tagged › should display "found 1 components" — `commands::list::a_tagged_component_is_listed`
- [x] `e2e/commands/list.e2e.ts:60` bit list command › with --outdated flag › when a remote component has a higher version than the local component › should show that it has a later version in the remote — `commands::list::known_failures::a_later_remote_version_is_shown` (known failure)
- [x] `e2e/commands/list.e2e.ts:79` bit list command › with --outdated flag › when a remote component has the same version as the local component › should display the same version for the local and remote — `commands::list::known_failures::the_same_remote_version_is_shown` (known failure)
- [x] `e2e/commands/list.e2e.ts:93` bit list command › with --outdated flag › when a component is local only (never exported) › should show that the component does not have a remote version — `commands::list::known_failures::a_local_only_component_has_no_remote_version` (known failure)

### `e2e/commands/move.e2e.ts`

- [x] `e2e/commands/move.e2e.ts:29` bit move command › move a directory › should move physically the directory — `commands::move_paths::directory_move_changes_physical_sources_and_bitmap_root`
- [x] `e2e/commands/move.e2e.ts:35` bit move command › move a directory › should update the rootDir of bit.map — `commands::move_paths::directory_move_changes_physical_sources_and_bitmap_root`
- [x] `e2e/commands/move.e2e.ts:48` bit move command › when the destination starts with the source dir › should not throw an error saying the path is not a directory — `commands::move_paths::destination_sharing_the_source_prefix_is_not_a_nested_directory`
- [x] `e2e/commands/move.e2e.ts:67` bit move command › move root directory after import › should move physically the directory — `commands::move_paths::imported_directory_move_preserves_clean_component_status`
- [x] `e2e/commands/move.e2e.ts:75` bit move command › move root directory after import › should not recognize the component as modified — `commands::move_paths::imported_directory_move_preserves_clean_component_status`
- [x] `e2e/commands/move.e2e.ts:88` bit move command › move directory manually then run bit move › should be able to run bit move with no error — `commands::move_paths::manually_moved_tagged_directory_updates_metadata_without_repeating_the_move`

### `e2e/commands/pattern.e2e.ts`

- [ ] `e2e/commands/pattern.e2e.ts:22` pattern command › general pattern matching › should match all components with **
- [ ] `e2e/commands/pattern.e2e.ts:30` pattern command › general pattern matching › should match specific component by name
- [ ] `e2e/commands/pattern.e2e.ts:38` pattern command › general pattern matching › should match components with comma-separated patterns
- [ ] `e2e/commands/pattern.e2e.ts:47` pattern command › general pattern matching › should return JSON format when using --json flag
- [ ] `e2e/commands/pattern.e2e.ts:57` pattern command › general pattern matching › should handle non-matching patterns gracefully
- [ ] `e2e/commands/pattern.e2e.ts:73` pattern command › pattern exclusion with negation (!) › basic exclusion patterns › should exclude comp1 when using pattern "**, !**/comp1"
- [ ] `e2e/commands/pattern.e2e.ts:81` pattern command › pattern exclusion with negation (!) › full component ID exclusion › should exclude comp1 when using pattern with just "!scope-name/comp1"
- [ ] `e2e/commands/pattern.e2e.ts:88` pattern command › pattern exclusion with negation (!) › full component ID exclusion › should exclude both components when using "!scope-name/comp1, !scope-name/comp2"
- [ ] `e2e/commands/pattern.e2e.ts:110` pattern command › pattern with --remote flag › should list all components from remote scope with **
- [ ] `e2e/commands/pattern.e2e.ts:120` pattern command › pattern with --remote flag › should support wildcard exclusion patterns from remote
- [ ] `e2e/commands/pattern.e2e.ts:128` pattern command › pattern with --remote flag › should throw error when pattern does not include scope name
- [ ] `e2e/commands/pattern.e2e.ts:148` pattern command › pattern with --remote flag › with multiple remote scopes › should list components from multiple remote scopes

### `e2e/commands/remote.e2e.ts`

- [ ] `e2e/commands/remote.e2e.ts:22` bit remote command › adding a global remote › should be shown when running "bit remote"
- [ ] `e2e/commands/remote.e2e.ts:26` bit remote command › adding a global remote › should be shown from any other workspace as well
- [ ] `e2e/commands/remote.e2e.ts:35` bit remote command › adding a global remote › deleting remote › deleting a non-exist remote should throw an error
- [ ] `e2e/commands/remote.e2e.ts:39` bit remote command › adding a global remote › deleting remote › deleting the global remote without "--global" flag should throw an error
- [ ] `e2e/commands/remote.e2e.ts:45` bit remote command › adding a global remote › deleting remote › should successfully delete the global remote when "--global" flag was used
- [ ] `e2e/commands/remote.e2e.ts:60` bit remote command › adding a local remote › should be shown when running "bit remote"
- [ ] `e2e/commands/remote.e2e.ts:64` bit remote command › adding a local remote › should not be shown from other workspace
- [ ] `e2e/commands/remote.e2e.ts:74` bit remote command › adding a local remote › deleting remote › deleting the remote with "--global" flag should throw an error
- [ ] `e2e/commands/remote.e2e.ts:80` bit remote command › adding a local remote › deleting remote › should successfully delete the remote when "--global" flag was not used
- [ ] `e2e/commands/remote.e2e.ts:90` bit remote command › adding a non exist local remote with relative path › should throw ScopeNotFound error

### `e2e/commands/remove.e2e.ts`

- [ ] `e2e/commands/remove.e2e.ts:28` bit remove command › with tagged components and --track=false › should remove component
- [ ] `e2e/commands/remove.e2e.ts:32` bit remove command › with tagged components and --track=false › should not show in bitmap
- [ ] `e2e/commands/remove.e2e.ts:36` bit remove command › with tagged components and --track=false › removed component should not be in new component when checking status
- [ ] `e2e/commands/remove.e2e.ts:51` bit remove command › with tagged components and -t=true › should show in bitmap
- [ ] `e2e/commands/remove.e2e.ts:55` bit remove command › with tagged components and -t=true › removed component should be in new component
- [ ] `e2e/commands/remove.e2e.ts:76` bit remove command › with remote scope without dependencies › without --remote flag › should show a successful message
- [ ] `e2e/commands/remove.e2e.ts:80` bit remove command › with remote scope without dependencies › without --remote flag › should remove the component from the local scope
- [ ] `e2e/commands/remove.e2e.ts:84` bit remove command › with remote scope without dependencies › without --remote flag › should not remove the component from the remote scope
- [ ] `e2e/commands/remove.e2e.ts:94` bit remove command › with remote scope without dependencies › with --remote flag › should show a successful message
- [ ] `e2e/commands/remove.e2e.ts:98` bit remove command › with remote scope without dependencies › with --remote flag › should remove the component from the remote scope
- [ ] `e2e/commands/remove.e2e.ts:112` bit remove command › with remote scope with dependencies › should not remove component with dependencies when -f flag is false
- [ ] `e2e/commands/remove.e2e.ts:118` bit remove command › with remote scope with dependencies › should remove component with dependencies when -f flag is true
- [ ] `e2e/commands/remove.e2e.ts:136` bit remove command › with imported components, no dependencies › should remove components with no dependencies when -f flag is false
- [ ] `e2e/commands/remove.e2e.ts:152` bit remove command › remove modified component › should not remove modified component
- [ ] `e2e/commands/remove.e2e.ts:171` bit remove command › remove a component when the main file is missing › should remove the component successfully
- [ ] `e2e/commands/remove.e2e.ts:204` bit remove command › remove a component when a dependency has a file with the same content as other component file › should successfully remove
- [ ] `e2e/commands/remove.e2e.ts:207` bit remove command › remove a component when a dependency has a file with the same content as other component file › bit status should not throw an error about missing file from the model
- [ ] `e2e/commands/remove.e2e.ts:211` bit remove command › remove a component when a dependency has a file with the same content as other component file › expect the shared hash to not be deleted
- [ ] `e2e/commands/remove.e2e.ts:227` bit remove command › soft remove › bit status should show a section of removed components
- [ ] `e2e/commands/remove.e2e.ts:231` bit remove command › soft remove › bit status should show the dependent component with an issue because it is now missing the dependency
- [ ] `e2e/commands/remove.e2e.ts:234` bit remove command › soft remove › bit status should not show the component as unavailable on main
- [ ] `e2e/commands/remove.e2e.ts:238` bit remove command › soft remove › bit list should not show the removed component
- [ ] `e2e/commands/remove.e2e.ts:243` bit remove command › soft remove › bit show should show the component as removed
- [ ] `e2e/commands/remove.e2e.ts:252` bit remove command › soft remove › tagging the component › should tag the removed components
- [ ] `e2e/commands/remove.e2e.ts:256` bit remove command › soft remove › tagging the component › bit show should still show the component as removed
- [ ] `e2e/commands/remove.e2e.ts:265` bit remove command › soft remove › tagging the component › exporting the components › should export the deleted components
- [ ] `e2e/commands/remove.e2e.ts:268` bit remove command › soft remove › tagging the component › exporting the components › bit status should be clean
- [ ] `e2e/commands/remove.e2e.ts:271` bit remove command › soft remove › tagging the component › exporting the components › bit list remote should not show the removed component
- [ ] `e2e/commands/remove.e2e.ts:283` bit remove command › soft remove › tagging the component › exporting the components › importing the component to a new workspace › should indicate that the component is removed
- [ ] `e2e/commands/remove.e2e.ts:286` bit remove command › soft remove › tagging the component › exporting the components › importing the component to a new workspace › bit status should show them as remotelySoftRemoved
- [ ] `e2e/commands/remove.e2e.ts:297` bit remove command › soft remove › tagging the component › exporting the components › importing the entire scope to a new workspace › should not import the removed component
- [ ] `e2e/commands/remove.e2e.ts:311` bit remove command › soft remove › soft-tagging the component › should leave the .bitmap entry and soft-tag it as well
- [ ] `e2e/commands/remove.e2e.ts:322` bit remove command › soft remove › soft-tagging the component › tag --persist › should remove the entry from .bitmap
- [ ] `e2e/commands/remove.e2e.ts:341` bit remove command › removing from workspace when it had dependents previously in old tags › should remove successfully without the need for --force flag
- [ ] `e2e/commands/remove.e2e.ts:351` bit remove command › remove new component with --keep-files flag › should remove the component from .bitmap
- [ ] `e2e/commands/remove.e2e.ts:355` bit remove command › remove new component with --keep-files flag › should not delete the directory from the filesystem
- [ ] `e2e/commands/remove.e2e.ts:358` bit remove command › remove new component with --keep-files flag › should delete the directory from the node_modules
- [ ] `e2e/commands/remove.e2e.ts:368` bit remove command › remove new component without --keep-files flag › should remove the component from .bitmap
- [ ] `e2e/commands/remove.e2e.ts:372` bit remove command › remove new component without --keep-files flag › should delete the directory from the filesystem
- [ ] `e2e/commands/remove.e2e.ts:375` bit remove command › remove new component without --keep-files flag › should delete the directory from the node_modules
- [ ] `e2e/commands/remove.e2e.ts:387` bit remove command › soft-remove then snap with --ignore-issues › should show it as removed
- [ ] `e2e/commands/remove.e2e.ts:401` bit remove command › remove when a lane is new › should remove the components from the local lane
- [ ] `e2e/commands/remove.e2e.ts:405` bit remove command › remove when a lane is new › should remove the components from the workspace
- [ ] `e2e/commands/remove.e2e.ts:420` bit remove command › soft-remove then import › should not throwing an error upon import
- [ ] `e2e/commands/remove.e2e.ts:434` bit remove command › soft remove then tagging the dependent without removing the references to the removed component › bit status should show RemovedDependency issue
- [ ] `e2e/commands/remove.e2e.ts:459` bit remove command › soft remove then tagging the dependent without removing the references to the removed component then recovering it › bit status should not show RemovedDependency issue because it was recovered
- [ ] `e2e/commands/remove.e2e.ts:473` bit remove command › soft remove then snapping with --build › should not build the removed component
- [ ] `e2e/commands/remove.e2e.ts:478` bit remove command › soft remove then snapping with --build › should remove successfully
- [ ] `e2e/commands/remove.e2e.ts:491` bit remove command › remove component that exists in workspace.jsonc › should remove the id from the root of workspace.jsonc

### `e2e/commands/reset.e2e.ts`

- [x] `e2e/commands/reset.e2e.ts:29` bit reset command › untag single component › with one version › should delete the entire component from the model — `commands::reset::known_failures::reset_head_of_a_single_version_deletes_the_component` (known failure)
- [x] `e2e/commands/reset.e2e.ts:44` bit reset command › untag single component › with multiple versions when specifying the version › should delete only the specified tag — `commands::reset::known_failures::reset_head_deletes_only_the_head_tag` (known failure)
- [x] `e2e/commands/reset.e2e.ts:51` bit reset command › untag single component › with multiple versions when specifying the version › should delete the specified version from the "state" attribute — `commands::reset::known_failures::reset_head_deletes_only_the_head_tag` (known failure)
- [x] `e2e/commands/reset.e2e.ts:58` bit reset command › untag single component › with multiple versions when specifying the version › bit show should work — `commands::reset::known_failures::reset_head_deletes_only_the_head_tag` (known failure)
- [x] `e2e/commands/reset.e2e.ts:62` bit reset command › untag single component › with multiple versions when specifying the version › bit status should show the component as staged — `commands::reset::known_failures::reset_head_deletes_only_the_head_tag` (known failure)
- [x] `e2e/commands/reset.e2e.ts:78` bit reset command › untag single component › with multiple versions when not specifying the version › and all versions are local › should delete the entire component from the model — `commands::reset::known_failures::reset_of_local_versions_deletes_the_component` (known failure)
- [x] `e2e/commands/reset.e2e.ts:99` bit reset command › untag single component › when some versions are exported, some are local › untagging without version › should delete only the local tag and leave the exported tag — `commands::reset::known_failures::reset_keeps_the_exported_tag` (known failure)
- [x] `e2e/commands/reset.e2e.ts:109` bit reset command › untag single component › when tagging non-existing component › should show an descriptive error — `commands::reset::known_failures::reset_of_a_missing_component_fails` (known failure)
- [x] `e2e/commands/reset.e2e.ts:137` bit reset command › untag multiple components (--all flag) › without specifying a version › should display a descriptive successful message — `commands::reset::reset_all_removes_only_local_components`
- [x] `e2e/commands/reset.e2e.ts:140` bit reset command › untag multiple components (--all flag) › without specifying a version › should remove only local components from the model — `commands::reset::reset_all_removes_only_local_components`
- [x] `e2e/commands/reset.e2e.ts:153` bit reset command › untag multiple components (--all flag) › with --head › should display a descriptive successful message — `commands::reset::reset_all_head_removes_only_the_head`
- [x] `e2e/commands/reset.e2e.ts:156` bit reset command › untag multiple components (--all flag) › with --head › should remove only the specified version from the model — `commands::reset::reset_all_head_removes_only_the_head`
- [x] `e2e/commands/reset.e2e.ts:186` bit reset command › components with dependencies › untag only the dependency › without force flag › should throw a descriptive error — `commands::reset::known_failures::reset_of_a_dependency_needs_force` (known failure)
- [x] `e2e/commands/reset.e2e.ts:197` bit reset command › components with dependencies › untag only the dependency › with force flag › should untag successfully — `commands::reset::known_failures::reset_of_a_dependency_needs_force` (known failure)
- [x] `e2e/commands/reset.e2e.ts:215` bit reset command › components with dependencies › untag only the dependency › after exporting the component and tagging the scope › should show an error — `commands::reset::known_failures::reset_of_an_exported_dependency_fails` (known failure)
- [x] `e2e/commands/reset.e2e.ts:226` bit reset command › components with dependencies › untag all components › when all components have only local versions › should remove all the components because it does not leave a damaged component without dependency — `commands::reset::reset_all_of_local_dependencies_removes_all`
- [x] `e2e/commands/reset.e2e.ts:238` bit reset command › components with dependencies › untag only the dependent › should untag successfully the dependent — `commands::reset::known_failures::reset_of_the_dependent_keeps_the_dependency` (known failure)
- [x] `e2e/commands/reset.e2e.ts:242` bit reset command › components with dependencies › untag only the dependent › should leave the dependency intact — `commands::reset::known_failures::reset_of_the_dependent_keeps_the_dependency` (known failure)
- [x] `e2e/commands/reset.e2e.ts:265` bit reset command › components with dependencies › after import and tagging › untag using the id without scope-name › should untag successfully — `commands::reset::known_failures::reset_by_an_id_without_scope` (known failure)
- [x] `e2e/commands/reset.e2e.ts:277` bit reset command › components with dependencies › after import and tagging › modify, tag and then untag all › should show the component as modified — `commands::reset::reset_all_keeps_the_modification`
- [x] `e2e/commands/reset.e2e.ts:297` bit reset command › components with config in the .bitmap file › bit reset should leave the config as they were before the tag — `commands::reset::reset_keeps_the_bitmap_config`
- [x] `e2e/commands/reset.e2e.ts:301` bit reset command › components with config in the .bitmap file › bit export should remove the entries form the staged-config file — `commands::reset::reset_keeps_the_bitmap_config`
- [x] `e2e/commands/reset.e2e.ts:318` bit reset command › components with env config after multiple snaps › when env is not changed between snaps › bit reset should restore the env config that was set before the first snap — `commands::reset::reset_restores_the_env_of_the_first_snap`
- [x] `e2e/commands/reset.e2e.ts:333` bit reset command › components with env config after multiple snaps › when env is changed between snaps › bit reset should keep the latest env config (not revert to the first snap env) — `commands::reset::reset_keeps_the_latest_env`
- [x] `e2e/commands/reset.e2e.ts:348` bit reset command › components with env config after multiple snaps › when a different config (deps) is changed between snaps but env stays the same › bit reset should restore both the env and the deps config — `commands::reset::reset_restores_the_env_after_a_deps_change`
- [x] `e2e/commands/reset.e2e.ts:377` bit reset command › when checked out to a non-head version with detach-head functionality › expect .bitmap to point to the same version as it was before the reset, and not the latest — `commands::reset::known_failures::reset_of_a_detached_head` (known failure)
- [x] `e2e/commands/reset.e2e.ts:381` bit reset command › when checked out to a non-head version with detach-head functionality › should not show the component as modified — `commands::reset::known_failures::reset_of_a_detached_head` (known failure)
- [x] `e2e/commands/reset.e2e.ts:385` bit reset command › when checked out to a non-head version with detach-head functionality › should clear the detached head — `commands::reset::known_failures::reset_of_a_detached_head` (known failure)

### `e2e/commands/search.e2e.ts`

- [ ] `e2e/commands/search.e2e.ts:26` bit search command › local search with components in workspace › should find a component by matching keyword
- [ ] `e2e/commands/search.e2e.ts:31` bit search command › local search with components in workspace › should not find components that do not match
- [ ] `e2e/commands/search.e2e.ts:36` bit search command › local search with components in workspace › should match case-insensitively
- [ ] `e2e/commands/search.e2e.ts:41` bit search command › local search with components in workspace › should union and deduplicate results across multiple queries
- [ ] `e2e/commands/search.e2e.ts:49` bit search command › local search with components in workspace › should return json output with --json flag

### `e2e/commands/tag.e2e.ts`

- [x] `e2e/commands/tag.e2e.ts:35` bit tag command › tag component with invalid mainFile in bitmap › should not tag the component — `commands::tag::known_failures::an_invalid_main_file_is_not_tagged` (known failure)
- [x] `e2e/commands/tag.e2e.ts:52` bit tag command › semver flags › tag specific component › Should not allow invalid semver — `commands::tag::known_failures::invalid_semver_is_rejected` (known failure)
- [x] `e2e/commands/tag.e2e.ts:61` bit tag command › semver flags › tag specific component › Should increment the patch version when no version type specified — `commands::tag::qualification::release_type_flags_bump_the_version`
- [x] `e2e/commands/tag.e2e.ts:65` bit tag command › semver flags › tag specific component › Should increment the patch version when --patch flag specified — `commands::tag::qualification::release_type_flags_bump_the_version`
- [x] `e2e/commands/tag.e2e.ts:69` bit tag command › semver flags › tag specific component › Should increment the minor version when --minor flag specified — `commands::tag::qualification::release_type_flags_bump_the_version`
- [x] `e2e/commands/tag.e2e.ts:73` bit tag command › semver flags › tag specific component › Should increment the major version when --major flag specified — `commands::tag::qualification::release_type_flags_bump_the_version`
- [x] `e2e/commands/tag.e2e.ts:77` bit tag command › semver flags › tag specific component › Should set the exact version when specified on new component — `commands::tag::qualification::an_exact_version_tags_a_new_component`
- [x] `e2e/commands/tag.e2e.ts:83` bit tag command › semver flags › tag specific component › Should increment patch version of dependent when using other flag on tag dependency — `commands::tag::qualification::a_dependent_gets_a_patch_bump`
- [x] `e2e/commands/tag.e2e.ts:109` bit tag command › semver flags › tag specific component › Should throw error when the version already exists — `commands::tag::known_failures::an_existing_version_is_not_tagged_again` (known failure)
- [x] `e2e/commands/tag.e2e.ts:124` bit tag command › with removed file/files › Should not let you tag with a non-existing dependency — `commands::tag::known_failures::a_missing_dependency_file_blocks_the_tag` (known failure)
- [x] `e2e/commands/tag.e2e.ts:148` bit tag command › with Windows end-of-line characters › should write the file to the model with Linux EOL characters — `commands::tag::qualification::windows_line_endings_are_stored_as_linux`
- [x] `e2e/commands/tag.e2e.ts:164` bit tag command › tag a component without its dependencies › should show a descriptive error message — `commands::tag::known_failures::a_dependency_left_out_of_the_tag_is_explained` (known failure)
- [x] `e2e/commands/tag.e2e.ts:174` bit tag command › tag with an empty string › should not throw an error — `commands::tag::qualification::an_empty_message_tags`
- [x] `e2e/commands/tag.e2e.ts:199` bit tag command › component count display when new component depends on existing tagged component › should correctly display 2 components tagged, not 3 — `commands::tag::qualification::a_new_dependent_is_counted_once`
- [x] `e2e/commands/tag.e2e.ts:234` bit tag command › tag component with auto-tag should validate component issues › should throw an error about component issues, not about relativePaths in Version object — `commands::tag::known_failures::an_auto_tagged_dependent_is_validated` (known failure)

### `e2e/commands/watch.e2e.ts`

- [ ] `e2e/commands/watch.e2e.ts:42` Harmony watch, using Compiler & Typescript extensions › run bit watch › changing a file › should write the dists on node_modules correctly
- [ ] `e2e/commands/watch.e2e.ts:52` Harmony watch, using Compiler & Typescript extensions › run bit watch › adding a new file to an existing component › should write the dists on node_modules correctly
- [ ] `e2e/commands/watch.e2e.ts:56` Harmony watch, using Compiler & Typescript extensions › run bit watch › adding a new file to an existing component › should update the .bitmap file with the newly added file
- [ ] `e2e/commands/watch.e2e.ts:68` Harmony watch, using Compiler & Typescript extensions › run bit watch › adding a new component › should recognize the .bitmap changes and compile the newly added component
- [ ] `e2e/commands/watch.e2e.ts:78` Harmony watch, using Compiler & Typescript extensions › run bit watch › adding a new component › changing this new component › should watch this newly added component for changes
- [ ] `e2e/commands/watch.e2e.ts:100` Harmony watch, using Compiler & Typescript extensions › run bit watch › tagging the component › editing the file, should not change the version to an older version
- [ ] `e2e/commands/watch.e2e.ts:131` when the @parcel/watcher native binary is unavailable › changing a file › should fall back to chokidar and still rebuild the component
- [ ] `e2e/commands/watch.e2e.ts:157` scope file watching (${scopeDir} directory) › should not trigger main watcher events for files inside ${scopeDir}
- [ ] `e2e/commands/watch.e2e.ts:168` scope file watching (${scopeDir} directory) › should detect IPC event files written to ${scopeDir}/events/ via the scope watcher

### `e2e/doctor/doctor-git-exec.e2e.ts`

- [x] `e2e/doctor/doctor-git-exec.e2e.ts:27` bit doctor - git exec validation › without configuration changes › should run the correct diagnosis — `native/cli/tests/e2e/harmony/doctor.rs::git_diagnosis_matches_node_success_failure_and_treatment`; exact published Node parity
- [x] `e2e/doctor/doctor-git-exec.e2e.ts:30` bit doctor - git exec validation › without configuration changes › should pass the diagnosis — `native/cli/tests/e2e/harmony/doctor.rs::git_diagnosis_matches_node_success_failure_and_treatment`; exact published Node parity
- [x] `e2e/doctor/doctor-git-exec.e2e.ts:55` bit doctor - git exec validation › with wrong git path › should fail the diagnosis — `native/cli/tests/e2e/harmony/doctor.rs::git_diagnosis_matches_node_success_failure_and_treatment`; exact published Node parity
- [x] `e2e/doctor/doctor-git-exec.e2e.ts:58` bit doctor - git exec validation › with wrong git path › should show the symptoms correctly — `native/cli/tests/e2e/harmony/doctor.rs::git_diagnosis_matches_node_success_failure_and_treatment`; exact published Node parity
- [x] `e2e/doctor/doctor-git-exec.e2e.ts:62` bit doctor - git exec validation › with wrong git path › should show the suggestion for fix correctly — `native/cli/tests/e2e/harmony/doctor.rs::git_diagnosis_matches_node_success_failure_and_treatment`; exact published Node parity

### `e2e/doctor/doctor-infra.e2e.ts`

- [x] `e2e/doctor/doctor-infra.e2e.ts:49` bit doctor infra › run all diagnoses › should return all the fields for each check — `native/cli/tests/e2e/harmony/doctor.rs::default_diagnoses_match_node_offline_without_creating_a_fresh_index`; exact published Node parity
- [x] `e2e/doctor/doctor-infra.e2e.ts:62` bit doctor infra › run all diagnoses › save results as tar file › with default file name › should print the output file name — `native/cli/tests/e2e/harmony/doctor.rs::default_save_filename_matches_its_metadata_timestamp_and_canonical_contents`; exact published Node parity
- [x] `e2e/doctor/doctor-infra.e2e.ts:66` bit doctor infra › run all diagnoses › save results as tar file › with default file name › should create a non empty tar file in the file system — `native/cli/tests/e2e/harmony/doctor.rs::default_save_filename_matches_its_metadata_timestamp_and_canonical_contents`; exact published Node parity
- [x] `e2e/doctor/doctor-infra.e2e.ts:80` bit doctor infra › run all diagnoses › save results as tar file › with provided file name › should print the output file name with tar extension — `native/cli/tests/e2e/harmony/doctor.rs::save_and_archive_retain_canonical_entries_and_scope_exclusions`; exact published Node parity
- [x] `e2e/doctor/doctor-infra.e2e.ts:83` bit doctor infra › run all diagnoses › save results as tar file › with provided file name › should create a non empty tar file in the file system — `native/cli/tests/e2e/harmony/doctor.rs::save_and_archive_retain_canonical_entries_and_scope_exclusions`; exact published Node parity
- [x] `e2e/doctor/doctor-infra.e2e.ts:92` bit doctor infra › run one diagnosis › should show error when the diagnosis not exist — `native/cli/tests/e2e/harmony/doctor.rs::diagnosis_listing_matches_node_text_json_and_colors`; exact published Node parity
- [x] `e2e/doctor/doctor-infra.e2e.ts:113` bit doctor infra › archive with --exclude-local-scope flag › should exclude .bit/objects contents — `native/cli/tests/e2e/harmony/doctor.rs::save_and_archive_retain_canonical_entries_and_scope_exclusions`; exact published Node parity
- [x] `e2e/doctor/doctor-infra.e2e.ts:117` bit doctor infra › archive with --exclude-local-scope flag › should exclude .bit/cache contents — `native/cli/tests/e2e/harmony/doctor.rs::save_and_archive_retain_canonical_entries_and_scope_exclusions`; exact published Node parity
- [x] `e2e/doctor/doctor-infra.e2e.ts:121` bit doctor infra › archive with --exclude-local-scope flag › should exclude .bit/tmp contents — `native/cli/tests/e2e/harmony/doctor.rs::save_and_archive_retain_canonical_entries_and_scope_exclusions`; exact published Node parity
- [x] `e2e/doctor/doctor-infra.e2e.ts:125` bit doctor infra › archive with --exclude-local-scope flag › should include .bit/command-history — `native/cli/tests/e2e/harmony/doctor.rs::save_and_archive_retain_canonical_entries_and_scope_exclusions`; exact published Node parity
- [x] `e2e/doctor/doctor-infra.e2e.ts:129` bit doctor infra › archive with --exclude-local-scope flag › should include .bit/scope.json — `native/cli/tests/e2e/harmony/doctor.rs::save_and_archive_retain_canonical_entries_and_scope_exclusions`; exact published Node parity
- [x] `e2e/doctor/doctor-infra.e2e.ts:148` bit doctor infra › archive should exclude previously created doctor-results archives › should create the first archive on disk — `native/cli/tests/e2e/harmony/doctor.rs::save_and_archive_retain_canonical_entries_and_scope_exclusions`; exact published Node parity
- [x] `e2e/doctor/doctor-infra.e2e.ts:151` bit doctor infra › archive should exclude previously created doctor-results archives › should archive workspace files (sanity check) — `native/cli/tests/e2e/harmony/doctor.rs::save_and_archive_retain_canonical_entries_and_scope_exclusions`; exact published Node parity
- [x] `e2e/doctor/doctor-infra.e2e.ts:155` bit doctor infra › archive should exclude previously created doctor-results archives › should not include the previously created doctor-results archive — `native/cli/tests/e2e/harmony/doctor.rs::save_and_archive_retain_canonical_entries_and_scope_exclusions`; exact published Node parity
- [x] `e2e/doctor/doctor-infra.e2e.ts:169` bit doctor infra › list all checks › should return all the fields for each check item — `native/cli/tests/e2e/harmony/doctor.rs::diagnosis_listing_matches_node_text_json_and_colors`; exact published Node parity
- [x] `e2e/doctor/doctor-infra.e2e.ts:192` bit doctor infra › validate scope objects diagnosis › when all objects are present › should pass the diagnosis — `native/cli/tests/e2e/harmony/doctor.rs::scope_integrity_matches_node_healthy_and_missing_head`; exact published Node parity
- [x] `e2e/doctor/doctor-infra.e2e.ts:195` bit doctor infra › validate scope objects diagnosis › when all objects are present › should have empty symptoms when valid — `native/cli/tests/e2e/harmony/doctor.rs::scope_integrity_matches_node_healthy_and_missing_head`; exact published Node parity
- [x] `e2e/doctor/doctor-infra.e2e.ts:211` bit doctor infra › validate scope objects diagnosis › when head version object is missing › should fail the diagnosis — `native/cli/tests/e2e/harmony/doctor.rs::scope_integrity_matches_node_healthy_and_missing_head`; exact published Node parity
- [x] `e2e/doctor/doctor-infra.e2e.ts:214` bit doctor infra › validate scope objects diagnosis › when head version object is missing › should show the component with missing head in symptoms — `native/cli/tests/e2e/harmony/doctor.rs::scope_integrity_matches_node_healthy_and_missing_head`; exact published Node parity
- [x] `e2e/doctor/doctor-infra.e2e.ts:218` bit doctor infra › validate scope objects diagnosis › when head version object is missing › should suggest restoring from backups — `native/cli/tests/e2e/harmony/doctor.rs::scope_integrity_matches_node_healthy_and_missing_head`; exact published Node parity

### `e2e/flows/big-file.e2e.ts`

- [ ] `e2e/flows/big-file.e2e.ts:34` big text file › Windows format (\\r\\n) › tagging the component should not throw any error
- [ ] `e2e/flows/big-file.e2e.ts:45` big text file › Windows format (\\r\\n) › exporting and importing the component › should work with no errors
- [ ] `e2e/flows/big-file.e2e.ts:48` big text file › Windows format (\\r\\n) › exporting and importing the component › should import the big file

### `e2e/flows/bitmap-deleted.e2e.ts`

- [ ] `e2e/flows/bitmap-deleted.e2e.ts:29` user deleted only .bitmap file leaving the objects in place › tagging a component, then, deleting .bitmap file › bit init › should throw an error
- [ ] `e2e/flows/bitmap-deleted.e2e.ts:39` user deleted only .bitmap file leaving the objects in place › tagging a component, then, deleting .bitmap file › bit init --force › should init successfully

### `e2e/flows/cyclic-dependencies.e2e.ts`

- [ ] `e2e/flows/cyclic-dependencies.e2e.ts:36` cyclic dependencies › a => b, b => a (component A requires B, component B requires A) › should be able to tag both with no errors
- [ ] `e2e/flows/cyclic-dependencies.e2e.ts:39` cyclic dependencies › a => b, b => a (component A requires B, component B requires A) › should save the dependencies and flattenedDependencies of A correctly
- [ ] `e2e/flows/cyclic-dependencies.e2e.ts:48` cyclic dependencies › a => b, b => a (component A requires B, component B requires A) › should save the dependencies and flattenedDependencies of B correctly
- [ ] `e2e/flows/cyclic-dependencies.e2e.ts:62` cyclic dependencies › a => b, b => a (component A requires B, component B requires A) › exporting the component › should export successfully with no errors
- [ ] `e2e/flows/cyclic-dependencies.e2e.ts:73` cyclic dependencies › a => b, b => a (component A requires B, component B requires A) › exporting the component › importing to a new environment › should import successfully and not throw any error
- [ ] `e2e/flows/cyclic-dependencies.e2e.ts:77` cyclic dependencies › a => b, b => a (component A requires B, component B requires A) › exporting the component › importing to a new environment › should bring in the components
- [ ] `e2e/flows/cyclic-dependencies.e2e.ts:82` cyclic dependencies › a => b, b => a (component A requires B, component B requires A) › exporting the component › importing to a new environment › should not show a clean workspace
- [ ] `e2e/flows/cyclic-dependencies.e2e.ts:115` cyclic dependencies › a complex case with a long chain of dependencies › should be able to tag with no errors
- [ ] `e2e/flows/cyclic-dependencies.e2e.ts:118` cyclic dependencies › a complex case with a long chain of dependencies › bit insights should show the circular with the correct order: dependent -> dependency
- [ ] `e2e/flows/cyclic-dependencies.e2e.ts:128` cyclic dependencies › a complex case with a long chain of dependencies › leaves (A3 and is-type) should not have any dependency
- [ ] `e2e/flows/cyclic-dependencies.e2e.ts:139` cyclic dependencies › a complex case with a long chain of dependencies › A2 should have only A3 as a dependency and flattenedDependency
- [ ] `e2e/flows/cyclic-dependencies.e2e.ts:155` cyclic dependencies › a complex case with a long chain of dependencies › A1 should have A2 and B1 as direct dependencies, and all the rest as flattenedDependencies
- [ ] `e2e/flows/cyclic-dependencies.e2e.ts:215` cyclic dependencies › a complex case with a long chain of dependencies › B2 should have A1 and B3 as direct dependencies, and all the rest as flattenedDependencies
- [ ] `e2e/flows/cyclic-dependencies.e2e.ts:275` cyclic dependencies › a complex case with a long chain of dependencies › B1 should have B2 as direct dependencies, and all the rest as flattenedDependencies
- [ ] `e2e/flows/cyclic-dependencies.e2e.ts:334` cyclic dependencies › a complex case with a long chain of dependencies › B3 should have B4 as direct dependencies, and B4, is-type, is-string as flattenedDependencies
- [ ] `e2e/flows/cyclic-dependencies.e2e.ts:363` cyclic dependencies › a complex case with a long chain of dependencies › B4 should have is-string as a direct dependency, and is-type, is-string as flattenedDependencies
- [ ] `e2e/flows/cyclic-dependencies.e2e.ts:394` cyclic dependencies › a complex case with a long chain of dependencies › exporting the component › should export successfully with no errors
- [ ] `e2e/flows/cyclic-dependencies.e2e.ts:404` cyclic dependencies › a complex case with a long chain of dependencies › exporting the component › importing to a new environment › should import successfully and not throw any error
- [ ] `e2e/flows/cyclic-dependencies.e2e.ts:408` cyclic dependencies › a complex case with a long chain of dependencies › exporting the component › importing to a new environment › should bring in the components
- [ ] `e2e/flows/cyclic-dependencies.e2e.ts:412` cyclic dependencies › a complex case with a long chain of dependencies › exporting the component › importing to a new environment › bit status should the circular dependency issue
- [ ] `e2e/flows/cyclic-dependencies.e2e.ts:431` cyclic dependencies › same component require itself using module path › should block the tag by default
- [ ] `e2e/flows/cyclic-dependencies.e2e.ts:434` cyclic dependencies › same component require itself using module path › should tag successfully with --ignore-issues flag and should not save the component itself as a dependency
- [ ] `e2e/flows/cyclic-dependencies.e2e.ts:463` cyclic dependencies › modified component depends on a non-workspace component that depends on its previous version › should not show a circular dependencies issue
- [ ] `e2e/flows/cyclic-dependencies.e2e.ts:466` cyclic dependencies › modified component depends on a non-workspace component that depends on its previous version › should be able to snap

### `e2e/flows/delete-files.e2e.ts`

- [ ] `e2e/flows/delete-files.e2e.ts:24` delete files from a component › after adding it › bit status should not throw an error and should show it as a new component
- [ ] `e2e/flows/delete-files.e2e.ts:38` delete files from a component › tag and then delete a file › bit status should show the component as modified
- [ ] `e2e/flows/delete-files.e2e.ts:54` delete files from a component › adding a file, tagging it, deleting it and then tagging again › should not show the deleted file in bit show command

### `e2e/flows/id-with-wildcard.e2e.ts`

- [ ] `e2e/flows/id-with-wildcard.e2e.ts:32` component id with wildcard › adding components with various namespaces › tag with wildcard › when wildcard does not match any component › should not tag any component
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:42` component id with wildcard › adding components with various namespaces › tag with wildcard › when wildcard match some of the components › should indicate the tagged components
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:47` component id with wildcard › adding components with various namespaces › tag with wildcard › when wildcard match some of the components › should tag only the matched components
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:60` component id with wildcard › adding components with various namespaces › remove with wildcard › when wildcard does not match any component › should throw an error saying the wildcard does not match any id
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:74` component id with wildcard › adding components with various namespaces › remove with wildcard › when wildcard match some of the components › should indicate the removed components
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:78` component id with wildcard › adding components with various namespaces › remove with wildcard › when wildcard match some of the components › should remove only the matched components
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:95` component id with wildcard › adding components with various namespaces › remove from remote with wildcard › when wildcard does not match any component › should throw an error saying the wildcard does not match any id
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:106` component id with wildcard › adding components with various namespaces › remove from remote with wildcard › when wildcard match some of the components › should indicate the removed components
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:110` component id with wildcard › adding components with various namespaces › remove from remote with wildcard › when wildcard match some of the components › should remove only the matched components
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:137` component id with wildcard › adding components with various namespaces › remove from remote with wildcard after removed locally › when wildcard match some of the components › should indicate the removed components
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:141` component id with wildcard › adding components with various namespaces › remove from remote with wildcard after removed locally › when wildcard match some of the components › should remove only the matched components
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:158` component id with wildcard › adding components with various namespaces › export with wildcard › when wildcard does not match any component › should not export any component
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:168` component id with wildcard › adding components with various namespaces › export with wildcard › when wildcard match some of the components › should indicate the exported components
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:171` component id with wildcard › adding components with various namespaces › export with wildcard › when wildcard match some of the components › should export only the matched components
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:175` component id with wildcard › adding components with various namespaces › export with wildcard › when wildcard match some of the components › should not export the non matched components
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:195` component id with wildcard › adding components with various namespaces › untag with wildcard › when wildcard does not match any component › should throw an error saying that no components found
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:205` component id with wildcard › adding components with various namespaces › untag with wildcard › when wildcard match some of the components › should indicate the untagged components
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:210` component id with wildcard › adding components with various namespaces › untag with wildcard › when wildcard match some of the components › should untag only the matched components
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:228` component id with wildcard › adding components with various namespaces › checkout with wildcard › when wildcard does not match any component › should throw an error saying the wildcard does not match any id
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:239` component id with wildcard › adding components with various namespaces › checkout with wildcard › when wildcard match some of the components › should indicate the number of checked out components
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:242` component id with wildcard › adding components with various namespaces › checkout with wildcard › when wildcard match some of the components › should checkout only the matched components
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:247` component id with wildcard › adding components with various namespaces › checkout with wildcard › when wildcard match some of the components › should not checkout the unmatched components
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:271` component id with wildcard › adding components with various namespaces › diff with wildcard › when wildcard does not match any component › should throw an error saying the wildcard does not match any id
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:282` component id with wildcard › adding components with various namespaces › diff with wildcard › when wildcard match some of the components › should show diff only for the matched components
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:286` component id with wildcard › adding components with various namespaces › diff with wildcard › when wildcard match some of the components › should not show diff for unmatched unmatched components
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:300` component id with wildcard › adding components with various namespaces › list with wildcard › should list only for the matched components
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:303` component id with wildcard › adding components with various namespaces › list with wildcard › should not list unmatched components
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:316` component id with wildcard › adding components with various namespaces › list remote with wildcard › should list only for the matched components
- [ ] `e2e/flows/id-with-wildcard.e2e.ts:319` component id with wildcard › adding components with various namespaces › list remote with wildcard › should not list unmatched components

### `e2e/flows/import-package-json.e2e.ts`

- [ ] `e2e/flows/import-package-json.e2e.ts:23` component with package.json as a file of the component › bit version >= 14.8.0 should ignore package.json files altogether › should not track the package.json file

### `e2e/flows/out-of-sync-componets.e2e.ts`

- [ ] `e2e/flows/out-of-sync-componets.e2e.ts:30` components that are not synced between the scope and the consumer › consumer with a new component and scope with the same component as staged › bit tag › should tag the component to the next version of what the scope has
- [ ] `e2e/flows/out-of-sync-componets.e2e.ts:41` components that are not synced between the scope and the consumer › consumer with a new component and scope with the same component as staged › bit status › should sync .bitmap according to the scope
- [ ] `e2e/flows/out-of-sync-componets.e2e.ts:54` components that are not synced between the scope and the consumer › consumer with a new component and scope with the same component as staged › bit export with id › should export the component successfully
- [ ] `e2e/flows/out-of-sync-componets.e2e.ts:65` components that are not synced between the scope and the consumer › consumer with a new component and scope with the same component as staged › bit export all › should export the component successfully
- [ ] `e2e/flows/out-of-sync-componets.e2e.ts:83` components that are not synced between the scope and the consumer › consumer with a tagged component and scope with the same component as exported › bit tag › should tag the component to the next version of what the scope has
- [ ] `e2e/flows/out-of-sync-componets.e2e.ts:93` components that are not synced between the scope and the consumer › consumer with a tagged component and scope with the same component as exported › bit status › should sync .bitmap according to the scope
- [ ] `e2e/flows/out-of-sync-componets.e2e.ts:113` components that are not synced between the scope and the consumer › consumer with no components and scope with staged components › bit show › should not throw because "bit show" supports showing components from the scope
- [ ] `e2e/flows/out-of-sync-componets.e2e.ts:125` components that are not synced between the scope and the consumer › consumer with no components and scope with staged components › bit export all › should export the component successfully
- [ ] `e2e/flows/out-of-sync-componets.e2e.ts:130` components that are not synced between the scope and the consumer › consumer with no components and scope with staged components › bit export all › should tell the user that no local changes have been made because the components are not tracked
- [ ] `e2e/flows/out-of-sync-componets.e2e.ts:139` components that are not synced between the scope and the consumer › consumer with no components and scope with staged components › bit export id › should throw an error saying the component does not exist
- [ ] `e2e/flows/out-of-sync-componets.e2e.ts:163` components that are not synced between the scope and the consumer › consumer with no components and scope with exported components › bit add of the same component › should sync the new component with the scope and assign a version and a scope name
- [ ] `e2e/flows/out-of-sync-componets.e2e.ts:182` components that are not synced between the scope and the consumer › consumer has exported components and scope is empty › bit tag › should stop the tagging process and throw an error suggesting to import the components
- [ ] `e2e/flows/out-of-sync-componets.e2e.ts:193` components that are not synced between the scope and the consumer › consumer has exported components and scope is empty › bit status › should show a massage suggesting to import the components
- [ ] `e2e/flows/out-of-sync-componets.e2e.ts:212` components that are not synced between the scope and the consumer › consumer has tagged component with a version that not exist in the scope › bit tag › should tag the component to the next version of what the scope has
- [ ] `e2e/flows/out-of-sync-componets.e2e.ts:223` components that are not synced between the scope and the consumer › consumer has tagged component with a version that not exist in the scope › bit status › should sync .bitmap according to the scope
- [ ] `e2e/flows/out-of-sync-componets.e2e.ts:247` components that are not synced between the scope and the consumer › consumer has exported component with a version that not exist in the scope › when the remote component has this missing version › bit status › should throw an error suggesting to import the components
- [ ] `e2e/flows/out-of-sync-componets.e2e.ts:253` components that are not synced between the scope and the consumer › consumer has exported component with a version that not exist in the scope › when the remote component has this missing version › bit show › should throw an error suggesting to import the components
- [ ] `e2e/flows/out-of-sync-componets.e2e.ts:259` components that are not synced between the scope and the consumer › consumer has exported component with a version that not exist in the scope › when the remote component has this missing version › bit tag › should throw an error suggesting to import the components
- [ ] `e2e/flows/out-of-sync-componets.e2e.ts:287` components that are not synced between the scope and the consumer › consumer has exported component with a version that not exist in the scope › when the remote component does not exist or does not have this missing version › bit status › should sync .bitmap according to the latest version of the scope
- [ ] `e2e/flows/out-of-sync-componets.e2e.ts:296` components that are not synced between the scope and the consumer › consumer has exported component with a version that not exist in the scope › when the remote component does not exist or does not have this missing version › bit tag › should tag the component to the next version of what the scope has

### `e2e/flows/remote-commands-outside-workspace.e2e.ts`

- [ ] `e2e/flows/remote-commands-outside-workspace.e2e.ts:31` bit remote command › exporting a component to a global remote › bit status should throw an error OutsideWorkspaceError
- [ ] `e2e/flows/remote-commands-outside-workspace.e2e.ts:36` bit remote command › exporting a component to a global remote › bit list without --remote flag should throw an error ConsumerNotFound
- [ ] `e2e/flows/remote-commands-outside-workspace.e2e.ts:41` bit remote command › exporting a component to a global remote › bit list with --remote flag should list the global remote successfully
- [ ] `e2e/flows/remote-commands-outside-workspace.e2e.ts:45` bit remote command › exporting a component to a global remote › bit show --legacy should show the component and not throw an error about missing workspace
- [ ] `e2e/flows/remote-commands-outside-workspace.e2e.ts:49` bit remote command › exporting a component to a global remote › bit show without --legacy should throw a descriptive error
- [ ] `e2e/flows/remote-commands-outside-workspace.e2e.ts:58` bit remote command › exporting a component to a global remote › bit remove with --remote flag › should not throw an error
- [ ] `e2e/flows/remote-commands-outside-workspace.e2e.ts:61` bit remote command › exporting a component to a global remote › bit remove with --remote flag › should remove successfully

### `e2e/flows/same-name-different-scopes.e2e.ts`

- [ ] `e2e/flows/same-name-different-scopes.e2e.ts:32` two components with the same name but different scope-name › importing objects from another scope › bit status should show the component as new
- [ ] `e2e/flows/same-name-different-scopes.e2e.ts:58` two components with the same name but different scope-name › importing and using both in the same workspace › bitmap should have both and the keys should contain the scope-name to differentiate
- [ ] `e2e/flows/same-name-different-scopes.e2e.ts:63` two components with the same name but different scope-name › importing and using both in the same workspace › bit status should show the new component correctly
- [ ] `e2e/flows/same-name-different-scopes.e2e.ts:79` two components with the same name but different scope-name › importing and using both in the same workspace › having both components as imported › the workspace should be fine and not throw errors
- [ ] `e2e/flows/same-name-different-scopes.e2e.ts:96` two components with the same name but different scope-name › creating two new components with the same name in the same workspace › bit list should list them both
- [ ] `e2e/flows/same-name-different-scopes.e2e.ts:104` two components with the same name but different scope-name › creating two new components with the same name in the same workspace › tagging them both › should tag both of them
- [ ] `e2e/flows/same-name-different-scopes.e2e.ts:108` two components with the same name but different scope-name › creating two new components with the same name in the same workspace › tagging them both › should export with no errors

### `e2e/flows/sort-components-output.e2e.ts`

- [ ] `e2e/flows/sort-components-output.e2e.ts:33` basic flow with dependencies › after adding components › bit status › should show all of them under new components
- [ ] `e2e/flows/sort-components-output.e2e.ts:37` basic flow with dependencies › after adding components › bit status › should show new components sorted alphabetically
- [ ] `e2e/flows/sort-components-output.e2e.ts:41` basic flow with dependencies › after adding components › bit list --local-scope should not show any component
- [ ] `e2e/flows/sort-components-output.e2e.ts:54` basic flow with dependencies › after adding components › after tagging the components › bit status › should show all of them under staged components
- [ ] `e2e/flows/sort-components-output.e2e.ts:58` basic flow with dependencies › after adding components › after tagging the components › bit status › should show staged components sorted alphabetically
- [ ] `e2e/flows/sort-components-output.e2e.ts:62` basic flow with dependencies › after adding components › after tagging the components › bit list should show the components sorted alphabetically
- [ ] `e2e/flows/sort-components-output.e2e.ts:82` basic flow with dependencies › after adding components › after tagging the components › after deleting the components › bit status › should show all of them under deleted components
- [ ] `e2e/flows/sort-components-output.e2e.ts:85` basic flow with dependencies › after adding components › after tagging the components › after deleting the components › bit status › should show deleted components sorted alphabetically

### `e2e/functionalities/auto-tagging.e2e.ts`

- [ ] `e2e/functionalities/auto-tagging.e2e.ts:31` auto tagging functionality › with dependencies of dependencies › should auto tag the dependencies and the nested dependencies
- [ ] `e2e/functionalities/auto-tagging.e2e.ts:38` auto tagging functionality › with dependencies of dependencies › should update the dependencies and the flattenedDependencies of the dependent with the new versions
- [ ] `e2e/functionalities/auto-tagging.e2e.ts:52` auto tagging functionality › with dependencies of dependencies › should update the dependencies and the flattenedDependencies of the dependent of the dependent with the new versions
- [ ] `e2e/functionalities/auto-tagging.e2e.ts:72` auto tagging functionality › with dependencies of dependencies › bit-status should show them all as staged and not modified
- [ ] `e2e/functionalities/auto-tagging.e2e.ts:85` auto tagging functionality › with dependencies of dependencies › with --skip-auto-tag › should not auto tag the dependencies
- [ ] `e2e/functionalities/auto-tagging.e2e.ts:90` auto tagging functionality › with dependencies of dependencies › with --skip-auto-tag › bitmap should show the correct versions
- [ ] `e2e/functionalities/auto-tagging.e2e.ts:112` auto tagging functionality › with cyclic dependencies › bit status should recognize the auto tag pending components
- [ ] `e2e/functionalities/auto-tagging.e2e.ts:122` auto tagging functionality › with cyclic dependencies › tagging the components with auto-version-bump › should auto tag all dependents
- [ ] `e2e/functionalities/auto-tagging.e2e.ts:129` auto tagging functionality › with cyclic dependencies › tagging the components with auto-version-bump › should update the dependencies and the flattenedDependencies of the all dependents with the new versions
- [ ] `e2e/functionalities/auto-tagging.e2e.ts:160` auto tagging functionality › with cyclic dependencies › tagging the components with auto-version-bump › should update the dependencies and the flattenedDependencies of the modified component with the cycle dependency
- [ ] `e2e/functionalities/auto-tagging.e2e.ts:187` auto tagging functionality › with cyclic dependencies › tagging the components with a specific version › should auto tag all dependents
- [ ] `e2e/functionalities/auto-tagging.e2e.ts:194` auto tagging functionality › with cyclic dependencies › tagging the components with a specific version › should update the dependencies and the flattenedDependencies of the all dependents with the new versions
- [ ] `e2e/functionalities/auto-tagging.e2e.ts:225` auto tagging functionality › with cyclic dependencies › tagging the components with a specific version › should update the dependencies and the flattenedDependencies of the modified component according to the specified version
- [ ] `e2e/functionalities/auto-tagging.e2e.ts:247` auto tagging functionality › with cyclic dependencies › tagging the components with a specific version › exporting the component › should be successful
- [ ] `e2e/functionalities/auto-tagging.e2e.ts:274` auto tagging functionality › with same component as direct and indirect dependent (A in: A => B => C, A => C) › bit-status should show the auto-tagged pending
- [ ] `e2e/functionalities/auto-tagging.e2e.ts:284` auto tagging functionality › with same component as direct and indirect dependent (A in: A => B => C, A => C) › tagging the dependency › should bump the component version that is direct and indirect dependent only once

### `e2e/functionalities/binary-files.e2e.ts`

- [ ] `e2e/functionalities/binary-files.e2e.ts:38` binary files › exporting a PNG file in addition to a .js file › should export it with no errors
- [ ] `e2e/functionalities/binary-files.e2e.ts:47` binary files › exporting a PNG file in addition to a .js file › after importing the file › the size of the binary file should not be changed
- [ ] `e2e/functionalities/binary-files.e2e.ts:70` binary files › exporting a PNG file as the only file › should export it with no errors
- [ ] `e2e/functionalities/binary-files.e2e.ts:75` binary files › exporting a PNG file as the only file › should not install a package "undefined"
- [ ] `e2e/functionalities/binary-files.e2e.ts:84` binary files › exporting a PNG file as the only file › after importing the file › the size of the binary file should not be changed

### `e2e/functionalities/components-index.e2e.ts`

- [ ] `e2e/functionalities/components-index.e2e.ts:24` scope components index mechanism › after tagging a component › should save the component in the index.json file
- [ ] `e2e/functionalities/components-index.e2e.ts:40` scope components index mechanism › after tagging a component › after exporting the component › should create a new record with the new scope
- [ ] `e2e/functionalities/components-index.e2e.ts:45` scope components index mechanism › after tagging a component › after exporting the component › bit list should show only one component
- [ ] `e2e/functionalities/components-index.e2e.ts:55` scope components index mechanism › after tagging a component › after exporting the component › removing the component › should remove the record from index.json
- [ ] `e2e/functionalities/components-index.e2e.ts:66` scope components index mechanism › after tagging a component › after exporting the component › importing the component to a new scope › should populate the index.json
- [ ] `e2e/functionalities/components-index.e2e.ts:86` scope components index mechanism › changing the index.json file manually to be empty › bit list should show zero results as it uses the index.json file
- [ ] `e2e/functionalities/components-index.e2e.ts:90` scope components index mechanism › changing the index.json file manually to be empty › bit cat-scope should still show the component as it should not be affected by the cache
- [ ] `e2e/functionalities/components-index.e2e.ts:98` scope components index mechanism › changing the index.json file manually to be empty › running bit init --reset › should rebuild index.json with the missing components
- [ ] `e2e/functionalities/components-index.e2e.ts:116` scope components index mechanism › outdated / out-of-sync index.json › adding a non-exist component to index.json › bit status should throw an error for the first time and then should work on the second run

### `e2e/functionalities/dev-dependencies.e2e.ts`

- [ ] `e2e/functionalities/dev-dependencies.e2e.ts:28` dev-dependencies functionality › environment with compiler and tester › with dev-dependencies same as dependencies › should not save the dev-dependencies because they are the same as dependencies
- [ ] `e2e/functionalities/dev-dependencies.e2e.ts:31` dev-dependencies functionality › environment with compiler and tester › with dev-dependencies same as dependencies › should save "chai" in the dev-packages because it is only required in the tests files
- [ ] `e2e/functionalities/dev-dependencies.e2e.ts:34` dev-dependencies functionality › environment with compiler and tester › with dev-dependencies same as dependencies › should not save "chai" in the packages because it is not required in non-test files
- [ ] `e2e/functionalities/dev-dependencies.e2e.ts:37` dev-dependencies functionality › environment with compiler and tester › with dev-dependencies same as dependencies › should leave the dependencies intact
- [ ] `e2e/functionalities/dev-dependencies.e2e.ts:42` dev-dependencies functionality › environment with compiler and tester › with dev-dependencies same as dependencies › should leave the flattened-dependencies intact
- [ ] `e2e/functionalities/dev-dependencies.e2e.ts:68` dev-dependencies functionality › environment with compiler and tester › without dependencies and with dev-dependencies › should save the dev-dependencies
- [ ] `e2e/functionalities/dev-dependencies.e2e.ts:76` dev-dependencies functionality › environment with compiler and tester › without dependencies and with dev-dependencies › should save the flattened dev-dependencies into flattened-dependencies
- [ ] `e2e/functionalities/dev-dependencies.e2e.ts:89` dev-dependencies functionality › environment with compiler and tester › without dependencies and with dev-dependencies › should not save anything into dependencies
- [ ] `e2e/functionalities/dev-dependencies.e2e.ts:92` dev-dependencies functionality › environment with compiler and tester › without dependencies and with dev-dependencies › bit status should not show any component as modified
- [ ] `e2e/functionalities/dev-dependencies.e2e.ts:113` dev-dependencies functionality › dev-dependency of a nested component that originated from a prod dep › should be able to import with no errors
- [ ] `e2e/functionalities/dev-dependencies.e2e.ts:116` dev-dependencies functionality › dev-dependency of a nested component that originated from a prod dep › bit status should show a clean state
- [ ] `e2e/functionalities/dev-dependencies.e2e.ts:119` dev-dependencies functionality › dev-dependency of a nested component that originated from a prod dep › the nested dev-dependency and nested prod of the nested dev-dependency should be saved in the flattenedDependencies
- [ ] `e2e/functionalities/dev-dependencies.e2e.ts:142` dev-dependencies functionality › dev-dependency of a nested component that originated from a dev dep › the flattened dependencies should contain the entire chain of the dependencies
- [ ] `e2e/functionalities/dev-dependencies.e2e.ts:166` dev-dependencies functionality › dev-dependency that requires prod-dependency › should include the prod dependencies inside flattenedDependencies
- [ ] `e2e/functionalities/dev-dependencies.e2e.ts:185` dev-dependencies functionality › component with devDependency coming from an env and is used as prod › should be able to remove it from DevDependency only by "bit deps remove --dev"

### `e2e/functionalities/dynamic-namespaces.e2e.ts`

- [ ] `e2e/functionalities/dynamic-namespaces.e2e.ts:30` dynamic namespaces › multi-level namespace. using name "${veryLongName}" › should save the component correctly on the model
- [ ] `e2e/functionalities/dynamic-namespaces.e2e.ts:35` dynamic namespaces › multi-level namespace. using name "${veryLongName}" › bit status should show the component as staged
- [ ] `e2e/functionalities/dynamic-namespaces.e2e.ts:40` dynamic namespaces › multi-level namespace. using name "${veryLongName}" › bit list should list the component
- [ ] `e2e/functionalities/dynamic-namespaces.e2e.ts:44` dynamic namespaces › multi-level namespace. using name "${veryLongName}" › bit show should show the component with the correct name
- [ ] `e2e/functionalities/dynamic-namespaces.e2e.ts:55` dynamic namespaces › multi-level namespace. using name "${veryLongName}" › after import › should create the directories according to the multiple namespaces
- [ ] `e2e/functionalities/dynamic-namespaces.e2e.ts:74` dynamic namespaces › import a component with same id string as a local different component › should throw an error and not allow the import
- [ ] `e2e/functionalities/dynamic-namespaces.e2e.ts:80` dynamic namespaces › import a component with same id string as a local different component › should throw an error also after tagging

### `e2e/functionalities/env-peer-deps-install.e2e.ts`

- [ ] `e2e/functionalities/env-peer-deps-install.e2e.ts:39` env peer dependencies should be installed for created components › bit create react and then check-types › should install env peer deps like @types/react in node_modules
- [ ] `e2e/functionalities/env-peer-deps-install.e2e.ts:43` env peer dependencies should be installed for created components › bit create react and then check-types › bit check-types should pass without errors

### `e2e/functionalities/merge.e2e.ts`

- [ ] `e2e/functionalities/merge.e2e.ts:41` merge functionality › re-exporting/importing an existing version › should throw MergeConflictOnRemote error when exporting the component
- [ ] `e2e/functionalities/merge.e2e.ts:50` merge functionality › re-exporting/importing an existing version › should throw MergeConflict error when importing the component
- [ ] `e2e/functionalities/merge.e2e.ts:78` merge functionality › importing a component with --merge flag › using invalid value for merge flag › should throw an error
- [ ] `e2e/functionalities/merge.e2e.ts:95` merge functionality › importing a component with --merge flag › modifying the component so it will get conflict upon importing › merge with strategy=manual › should indicate that there were files with conflicts
- [ ] `e2e/functionalities/merge.e2e.ts:98` merge functionality › importing a component with --merge flag › modifying the component so it will get conflict upon importing › merge with strategy=manual › should rewrite the file with the conflicts segments labeled according to the versions
- [ ] `e2e/functionalities/merge.e2e.ts:103` merge functionality › importing a component with --merge flag › modifying the component so it will get conflict upon importing › merge with strategy=manual › should show the component as modified and update bitmap with the imported version
- [ ] `e2e/functionalities/merge.e2e.ts:117` merge functionality › importing a component with --merge flag › modifying the component so it will get conflict upon importing › merge with strategy=theirs › should not indicate that there were files with conflicts
- [ ] `e2e/functionalities/merge.e2e.ts:120` merge functionality › importing a component with --merge flag › modifying the component so it will get conflict upon importing › merge with strategy=theirs › should rewrite the file according to the imported version
- [ ] `e2e/functionalities/merge.e2e.ts:123` merge functionality › importing a component with --merge flag › modifying the component so it will get conflict upon importing › merge with strategy=theirs › should not show the component as modified and update bitmap with the imported version
- [ ] `e2e/functionalities/merge.e2e.ts:137` merge functionality › importing a component with --merge flag › modifying the component so it will get conflict upon importing › merge with strategy=ours › should not indicate that there were files with conflicts
- [ ] `e2e/functionalities/merge.e2e.ts:140` merge functionality › importing a component with --merge flag › modifying the component so it will get conflict upon importing › merge with strategy=ours › should leave the modified file intact
- [ ] `e2e/functionalities/merge.e2e.ts:143` merge functionality › importing a component with --merge flag › modifying the component so it will get conflict upon importing › merge with strategy=ours › should show the component as modified
- [ ] `e2e/functionalities/merge.e2e.ts:147` merge functionality › importing a component with --merge flag › modifying the component so it will get conflict upon importing › merge with strategy=ours › should update bitmap with the imported version
- [ ] `e2e/functionalities/merge.e2e.ts:165` merge functionality › importing a component with --merge flag › modifying the component to be the same as the imported component (so the merge will succeed with no conflicts) › merge with strategy=manual › should not indicate that there were files with conflicts
- [ ] `e2e/functionalities/merge.e2e.ts:168` merge functionality › importing a component with --merge flag › modifying the component to be the same as the imported component (so the merge will succeed with no conflicts) › merge with strategy=manual › should rewrite the file according to both the imported version and modified version
- [ ] `e2e/functionalities/merge.e2e.ts:171` merge functionality › importing a component with --merge flag › modifying the component to be the same as the imported component (so the merge will succeed with no conflicts) › merge with strategy=manual › should not show the component as modified
- [ ] `e2e/functionalities/merge.e2e.ts:187` merge functionality › importing a component with --merge flag › modifying the dependency then import --merge of the dependent › should not remove the dependency changes

### `e2e/functionalities/peer-dependencies.e2e.ts`

- [ ] `e2e/functionalities/peer-dependencies.e2e.ts:30` peer-dependencies functionality › when a package is a regular dependency and a peer dependency › should save the peer dependencies in the model
- [ ] `e2e/functionalities/peer-dependencies.e2e.ts:35` peer-dependencies functionality › when a package is a regular dependency and a peer dependency › should not save the peer-dependency as a package-dependency nor as a dev-package-dependency
- [ ] `e2e/functionalities/peer-dependencies.e2e.ts:39` peer-dependencies functionality › when a package is a regular dependency and a peer dependency › bit show should display the peer dependencies
- [ ] `e2e/functionalities/peer-dependencies.e2e.ts:59` peer-dependencies functionality › when a package is a regular dependency and a peer dependency › when the component is imported › should not be shown as modified
- [ ] `e2e/functionalities/peer-dependencies.e2e.ts:74` peer-dependencies functionality › when a package is only a peer dependency but not required in the code › should not save the peer dependencies in the model
- [ ] `e2e/functionalities/peer-dependencies.e2e.ts:118` peer-dependencies functionality › a component is a peer dependency › should save the peer dependency in the model
- [ ] `e2e/functionalities/peer-dependencies.e2e.ts:135` peer-dependencies functionality › a component is a peer dependency › adds peer dependency to the generated package.json
- [ ] `e2e/functionalities/peer-dependencies.e2e.ts:143` peer-dependencies functionality › a component is a peer dependency › installs a hidden peer in the workspace but excludes it from the capsule manifest
- [ ] `e2e/functionalities/peer-dependencies.e2e.ts:166` peer-dependencies functionality › peer dependency is not broken after snap › should save the peer dependency in the model
- [ ] `e2e/functionalities/peer-dependencies.e2e.ts:178` peer-dependencies functionality › peer dependency is not broken after snap › should save the peer dependency in the scope data
- [ ] `e2e/functionalities/peer-dependencies.e2e.ts:186` peer-dependencies functionality › peer dependency is not broken after snap › adds peer dependency to the generated package.json

### `e2e/functionalities/peer-dependency-component.e2e.ts`

- [ ] `e2e/functionalities/peer-dependency-component.e2e.ts:28` set-peer › a component is a peer dependency › should save the peer dependency in the model
- [ ] `e2e/functionalities/peer-dependency-component.e2e.ts:43` set-peer › a component is a peer dependency › adds peer dependency to the generated package.json
- [ ] `e2e/functionalities/peer-dependency-component.e2e.ts:57` set-peer › a component is a peer dependency › peer dependency is not broken after snap › should save the peer dependency in the model
- [ ] `e2e/functionalities/peer-dependency-component.e2e.ts:69` set-peer › a component is a peer dependency › peer dependency is not broken after snap › should save the peer dependency in the scope data
- [ ] `e2e/functionalities/peer-dependency-component.e2e.ts:77` set-peer › a component is a peer dependency › peer dependency is not broken after snap › should save the always peer fields in the scope data
- [ ] `e2e/functionalities/peer-dependency-component.e2e.ts:83` set-peer › a component is a peer dependency › peer dependency is not broken after snap › adds peer dependency to the generated package.json
- [ ] `e2e/functionalities/peer-dependency-component.e2e.ts:98` set-peer › a component is a peer dependency › peer dependency is not broken after snap › always peer config fields are preserved when setting new dependencies › should readd always peer config fields to bitmap
- [ ] `e2e/functionalities/peer-dependency-component.e2e.ts:110` set-peer › a component is a peer dependency › unset-peer › should remove the always peer fields from the scope data
- [ ] `e2e/functionalities/peer-dependency-component.e2e.ts:139` set-peer using just the version range prefix › a component is a peer dependency › should save the peer dependency in the model
- [ ] `e2e/functionalities/peer-dependency-component.e2e.ts:154` set-peer using just the version range prefix › a component is a peer dependency › adds peer dependency to the generated package.json
- [ ] `e2e/functionalities/peer-dependency-component.e2e.ts:168` set-peer using just the version range prefix › a component is a peer dependency › peer dependency is not broken after snap › should save the peer dependency in the model
- [ ] `e2e/functionalities/peer-dependency-component.e2e.ts:180` set-peer using just the version range prefix › a component is a peer dependency › peer dependency is not broken after snap › should save the peer dependency in the scope data
- [ ] `e2e/functionalities/peer-dependency-component.e2e.ts:188` set-peer using just the version range prefix › a component is a peer dependency › peer dependency is not broken after snap › should save the always peer fields in the scope data
- [ ] `e2e/functionalities/peer-dependency-component.e2e.ts:194` set-peer using just the version range prefix › a component is a peer dependency › peer dependency is not broken after snap › adds peer dependency to the generated package.json
- [ ] `e2e/functionalities/peer-dependency-component.e2e.ts:228` set-peer for existing component › a component is a peer dependency › should save the peer dependency in the model
- [ ] `e2e/functionalities/peer-dependency-component.e2e.ts:244` set-peer for existing component › a component is a peer dependency › adds peer dependency to the generated package.json
- [ ] `e2e/functionalities/peer-dependency-component.e2e.ts:275` unset-peer for existing component › a component peer status is removed after snap › should not have comp2 as a peer dependency in the model
- [ ] `e2e/functionalities/peer-dependency-component.e2e.ts:279` unset-peer for existing component › a component peer status is removed after snap › should have comp2 as a runtime dependency

### `e2e/functionalities/repository-hooks-aspects.e2e.ts`

- [ ] `e2e/functionalities/repository-hooks-aspects.e2e.ts:56` export to remote scope with aspect-based manipulation hooks › when tagging should run the on pre persist hook, then when loading, should run the on pre read hook

### `e2e/functionalities/workspace-config.e2e.ts`

- [ ] `e2e/functionalities/workspace-config.e2e.ts:41` workspace config › overrides components › ignoring components dependencies › ignoring a dependency component › when requiring with module path › should not add the removed dependency to the component
- [ ] `e2e/functionalities/workspace-config.e2e.ts:66` workspace config › overrides components › ignoring packages dependencies › ignoring a missing package › bit status should not show the component as missing packages
- [ ] `e2e/functionalities/workspace-config.e2e.ts:88` workspace config › overrides components › ignoring packages dependencies › ignoring an existing package › should ignore the specified package but keep other packages intact
- [ ] `e2e/functionalities/workspace-config.e2e.ts:92` workspace config › overrides components › ignoring packages dependencies › ignoring an existing package › should show the package as ignored
- [ ] `e2e/functionalities/workspace-config.e2e.ts:119` workspace config › overrides components › ignoring packages dependencies › ignoring an existing devDependency package › should ignore the specified package but keep other packages intact
- [ ] `e2e/functionalities/workspace-config.e2e.ts:125` workspace config › overrides components › ignoring packages dependencies › ignoring an existing devDependency package › should show the package as ignored
- [ ] `e2e/functionalities/workspace-config.e2e.ts:130` workspace config › overrides components › ignoring packages dependencies › ignoring an existing devDependency package › should not confuse ignore of dependencies with ignore of devDependencies
- [ ] `e2e/functionalities/workspace-config.e2e.ts:160` workspace config › overrides components › ignoring dependencies components entire flow › tagging the component › should remove the dependency from the model
- [ ] `e2e/functionalities/workspace-config.e2e.ts:163` workspace config › overrides components › ignoring dependencies components entire flow › tagging the component › should save the overrides data into the model
- [ ] `e2e/functionalities/workspace-config.e2e.ts:169` workspace config › overrides components › ignoring dependencies components entire flow › tagging the component › should not show the component as modified
- [ ] `e2e/functionalities/workspace-config.e2e.ts:180` workspace config › overrides components › ignoring dependencies components entire flow › tagging the component › importing the component › bit status should not show the component as modified
- [ ] `e2e/functionalities/workspace-config.e2e.ts:183` workspace config › overrides components › ignoring dependencies components entire flow › tagging the component › importing the component › bit diff should not show any diff
- [ ] `e2e/functionalities/workspace-config.e2e.ts:195` workspace config › overrides components › ignoring dependencies components entire flow › tagging the component › importing the component › changing the imported component to not ignore the dependency › bit status should show the component as modified
- [ ] `e2e/functionalities/workspace-config.e2e.ts:199` workspace config › overrides components › ignoring dependencies components entire flow › tagging the component › importing the component › changing the imported component to not ignore the dependency › bit diff should show the overrides differences
- [ ] `e2e/functionalities/workspace-config.e2e.ts:229` workspace config › overrides components › manually adding dependencies › moving a package from dependencies to peerDependencies › should ignore the specified package from dependencies
- [ ] `e2e/functionalities/workspace-config.e2e.ts:232` workspace config › overrides components › manually adding dependencies › moving a package from dependencies to peerDependencies › should add the specified package to peerDependencies
- [ ] `e2e/functionalities/workspace-config.e2e.ts:236` workspace config › overrides components › manually adding dependencies › moving a package from dependencies to peerDependencies › should show the package as ignored from dependencies
- [ ] `e2e/functionalities/workspace-config.e2e.ts:241` workspace config › overrides components › manually adding dependencies › moving a package from dependencies to peerDependencies › should show the package as manually added to peerDependencies
- [ ] `e2e/functionalities/workspace-config.e2e.ts:261` workspace config › overrides components › manually adding dependencies › adding a package with version that does not exist in package.json › should add the specified package to peerDependencies
- [ ] `e2e/functionalities/workspace-config.e2e.ts:265` workspace config › overrides components › manually adding dependencies › adding a package with version that does not exist in package.json › should show the package as manually added to peerDependencies
- [ ] `e2e/functionalities/workspace-config.e2e.ts:284` workspace config › overrides components › manually adding dependencies › adding a package without version that does not exist in package.json › should not show the package in dependencies
- [ ] `e2e/functionalities/workspace-config.e2e.ts:289` workspace config › overrides components › manually adding dependencies › adding a package without version that does not exist in package.json › should show a missing package in status

### `e2e/harmony/add-harmony.e2e.ts`

- [x] `e2e/harmony/add-harmony.e2e.ts:24` add command on Harmony › adding files when workspace is new › should throw an error AddingIndividualFiles — `commands::add::errors::individual_files_and_missing_or_outside_paths_match_errors`
- [x] `e2e/harmony/add-harmony.e2e.ts:36` add command on Harmony › add a directory inside an existing component › should throw a descriptive error about parent-dir is tracked — `commands::add::errors::tracking_inside_an_existing_component_reports_parent_owner`
- [x] `e2e/harmony/add-harmony.e2e.ts:53` add command on Harmony › adding the workspace root as a component › should save "." as the rootDir — `harmony::add::root::root_tracking_keeps_nested_ownership_bitmap_and_scope_boundaries`
- [x] `e2e/harmony/add-harmony.e2e.ts:56` add command on Harmony › adding the workspace root as a component › should own the root files, including files added after it was tracked — `harmony::add::root::root_tracking_keeps_nested_ownership_bitmap_and_scope_boundaries`
- [x] `e2e/harmony/add-harmony.e2e.ts:60` add command on Harmony › adding the workspace root as a component › should not claim the files of the component nested inside it — `harmony::add::root::root_tracking_keeps_nested_ownership_bitmap_and_scope_boundaries`
- [x] `e2e/harmony/add-harmony.e2e.ts:63` add command on Harmony › adding the workspace root as a component › should track .bitmap, so a git-free workspace can be restored from the scope — `harmony::add::root::root_tracking_keeps_nested_ownership_bitmap_and_scope_boundaries`
- [x] `e2e/harmony/add-harmony.e2e.ts:66` add command on Harmony › adding the workspace root as a component › should not claim the local scope directory — `harmony::add::root::root_tracking_keeps_nested_ownership_bitmap_and_scope_boundaries`
- [x] `e2e/harmony/add-harmony.e2e.ts:69` add command on Harmony › adding the workspace root as a component › should not be linked into node_modules, unlike a regular component — `harmony::add::root::root_tracking_keeps_nested_ownership_bitmap_and_scope_boundaries`
- [ ] `e2e/harmony/add-harmony.e2e.ts:89` add command on Harmony › workspace-root component and .bitmap › should not be modified right after snapping, despite tracking .bitmap
- [ ] `e2e/harmony/add-harmony.e2e.ts:94` add command on Harmony › workspace-root component and .bitmap › should not be modified on the quick-status path either, which hashes the files on disk
- [x] `e2e/harmony/add-harmony.e2e.ts:98` add command on Harmony › workspace-root component and .bitmap › should record on the nested component the root it was snapped in, at the version the root got in that snap — `commands::tag::root::modified_root_snap_records_allocated_hash_without_package_materialization`
- [x] `e2e/harmony/add-harmony.e2e.ts:107` add command on Harmony › workspace-root component and .bitmap › should mark the root component itself as such in its aspect data — `commands::tag::root::explicit_member_version_brings_modified_root_with_its_own_patch`
- [ ] `e2e/harmony/add-harmony.e2e.ts:121` add command on Harmony › workspace-root component and .bitmap › adding a new component inside the workspace root › should let the new component take the files from the root component
- [ ] `e2e/harmony/add-harmony.e2e.ts:125` add command on Harmony › workspace-root component and .bitmap › adding a new component inside the workspace root › should mark the root component as modified, because the map changed
- [ ] `e2e/harmony/add-harmony.e2e.ts:133` add command on Harmony › workspace-root component and .bitmap › adding a new component inside the workspace root › snapping only the new component › should snap the modified root along, and say so
- [ ] `e2e/harmony/add-harmony.e2e.ts:138` add command on Harmony › workspace-root component and .bitmap › adding a new component inside the workspace root › snapping only the new component › should record the root on the new component at the version it got in that snap
- [ ] `e2e/harmony/add-harmony.e2e.ts:145` add command on Harmony › workspace-root component and .bitmap › adding a new component inside the workspace root › snapping only the new component › should converge again
- [x] `e2e/harmony/add-harmony.e2e.ts:156` add command on Harmony › workspace-root component and .bitmap › tagging a member with an explicit version while the root is modified › should give the root a patch bump of its own rather than the version meant for the member — `commands::tag::root::explicit_member_version_brings_modified_root_with_its_own_patch`
- [ ] `e2e/harmony/add-harmony.e2e.ts:177` add command on Harmony › removing the workspace-root component › should not drop a package.json dependency that shares its derived package name
- [ ] `e2e/harmony/add-harmony.e2e.ts:183` add command on Harmony › removing the workspace-root component › should not delete the workspace
- [ ] `e2e/harmony/add-harmony.e2e.ts:191` add command on Harmony › removing the workspace-root component › should keep the other component tracked
- [ ] `e2e/harmony/add-harmony.e2e.ts:194` add command on Harmony › removing the workspace-root component › should not delete a dependency that shares its derived package name
- [x] `e2e/harmony/add-harmony.e2e.ts:214` add command on Harmony › writing the workspace-root component to the filesystem › should check out an earlier version of it without throwing — `harmony::checkout_platform::root_checkout_restores_readme_without_rewinding_live_bitmap_or_nested_components`
- [ ] `e2e/harmony/add-harmony.e2e.ts:225` add command on Harmony › writing the workspace-root component to the filesystem › importing it into another workspace › should not write a .bitmap outside the workspace root
- [ ] `e2e/harmony/add-harmony.e2e.ts:231` add command on Harmony › writing the workspace-root component to the filesystem › importing it into another workspace › should not be modified by the map it left behind
- [ ] `e2e/harmony/add-harmony.e2e.ts:243` add command on Harmony › writing the workspace-root component to the filesystem › importing it onto the root of an empty workspace › should write its files at the workspace root
- [ ] `e2e/harmony/add-harmony.e2e.ts:246` add command on Harmony › writing the workspace-root component to the filesystem › importing it onto the root of an empty workspace › should record "." as its rootDir
- [ ] `e2e/harmony/add-harmony.e2e.ts:249` add command on Harmony › writing the workspace-root component to the filesystem › importing it onto the root of an empty workspace › should keep the empty env, which its version carries
- [ ] `e2e/harmony/add-harmony.e2e.ts:252` add command on Harmony › writing the workspace-root component to the filesystem › importing it onto the root of an empty workspace › should leave the live .bitmap alone rather than overwrite it with the exported one
- [ ] `e2e/harmony/add-harmony.e2e.ts:256` add command on Harmony › writing the workspace-root component to the filesystem › importing it onto the root of an empty workspace › should refuse to move it out of the workspace root, which would take the workspace with it
- [ ] `e2e/harmony/add-harmony.e2e.ts:264` add command on Harmony › writing the workspace-root component to the filesystem › importing it onto the root of an empty workspace › should refuse a second import without --override once the user changed a root file, not overwrite it
- [ ] `e2e/harmony/add-harmony.e2e.ts:272` add command on Harmony › writing the workspace-root component to the filesystem › importing it onto the root of an empty workspace › should refuse to write through a symlink in the way of a root file even with --override, as it does for --path .
- [ ] `e2e/harmony/add-harmony.e2e.ts:291` add command on Harmony › writing the workspace-root component to the filesystem › importing it onto the root of a fresh workspace that has its own files › should refuse to overwrite them without --override, even though nothing is tracked yet
- [ ] `e2e/harmony/add-harmony.e2e.ts:307` add command on Harmony › writing the workspace-root component to the filesystem › importing it onto the root with a directory in the way › should report a directory at a file path as a conflict rather than fail reading it
- [ ] `e2e/harmony/add-harmony.e2e.ts:321` add command on Harmony › writing the workspace-root component to the filesystem › importing it onto the root of a workspace that already tracks components › should refuse to overwrite the root files without --override
- [ ] `e2e/harmony/add-harmony.e2e.ts:327` add command on Harmony › writing the workspace-root component to the filesystem › importing it onto the root of a workspace that already tracks components › should overwrite them with --override
- [ ] `e2e/harmony/add-harmony.e2e.ts:353` add command on Harmony › a member imported on its own into a workspace that has no root › should carry the root it was tagged in as aspect data on the version it imported
- [ ] `e2e/harmony/add-harmony.e2e.ts:356` add command on Harmony › a member imported on its own into a workspace that has no root › should not bring the root component along, the pointer is provenance and not a dependency
- [ ] `e2e/harmony/add-harmony.e2e.ts:364` add command on Harmony › a member imported on its own into a workspace that has no root › tagging it here, where there is no root to record › should drop the root of the workspace it came from, not carry it into the new version
- [ ] `e2e/harmony/add-harmony.e2e.ts:370` add command on Harmony › a member imported on its own into a workspace that has no root › tagging it here, where there is no root to record › should leave the version it was imported at untouched
- [x] `e2e/harmony/add-harmony.e2e.ts:390` add command on Harmony › env of the workspace-root component › should be tracked with the empty env, not the regular default env — `harmony::add::policy::native_root_tracking_keeps_environment_policy_and_dependency_issues_empty`
- [x] `e2e/harmony/add-harmony.e2e.ts:395` add command on Harmony › env of the workspace-root component › should record that env in .bitmap as explicit config — `harmony::add::policy::root_env_is_explicit_empty_while_regular_component_keeps_default_env`
- [x] `e2e/harmony/add-harmony.e2e.ts:399` add command on Harmony › env of the workspace-root component › should get no dependency policy from an env, unlike a regular component — `harmony::add::policy::native_root_tracking_keeps_environment_policy_and_dependency_issues_empty`
- [x] `e2e/harmony/add-harmony.e2e.ts:408` add command on Harmony › env of the workspace-root component › should leave the env of a regular component alone — `harmony::add::policy::native_root_tracking_keeps_environment_policy_and_dependency_issues_empty`
- [x] `e2e/harmony/add-harmony.e2e.ts:411` add command on Harmony › env of the workspace-root component › should not report compiler-derived issues, while a regular component still does — `harmony::add::policy::native_root_tracking_keeps_environment_policy_and_dependency_issues_empty`
- [x] `e2e/harmony/add-harmony.e2e.ts:416` add command on Harmony › env of the workspace-root component › should not report missing links from node_modules, it is never linked there — `harmony::add::policy::native_root_tracking_keeps_environment_policy_and_dependency_issues_empty`
- [x] `e2e/harmony/add-harmony.e2e.ts:420` add command on Harmony › env of the workspace-root component › should not report a duplicate component-and-package issue for the root, it is not a package — `harmony::add::policy::native_root_tracking_keeps_environment_policy_and_dependency_issues_empty`
- [x] `e2e/harmony/add-harmony.e2e.ts:432` add command on Harmony › env of the workspace-root component › when a root file has a relative import into a component and requires a missing package › should report no issue, the root files are not parsed for dependencies — `harmony::add::policy::native_root_tracking_keeps_environment_policy_and_dependency_issues_empty`
- [ ] `e2e/harmony/add-harmony.e2e.ts:437` add command on Harmony › env of the workspace-root component › when a root file has a relative import into a component and requires a missing package › should snap with no dependencies
- [ ] `e2e/harmony/add-harmony.e2e.ts:474` add command on Harmony › trackAllFiles: tracking the files bit treats as generated › cloning the workspace from its root component › should report the root version and the number of components
- [ ] `e2e/harmony/add-harmony.e2e.ts:478` add command on Harmony › trackAllFiles: tracking the files bit treats as generated › cloning the workspace from its root component › should write the root files, the manifests included, so the workspace can be installed and built
- [ ] `e2e/harmony/add-harmony.e2e.ts:484` add command on Harmony › trackAllFiles: tracking the files bit treats as generated › cloning the workspace from its root component › should take the workspace.jsonc of the root over the one the init generates
- [ ] `e2e/harmony/add-harmony.e2e.ts:487` add command on Harmony › trackAllFiles: tracking the files bit treats as generated › cloning the workspace from its root component › should write every component the root lists into the directory it records
- [ ] `e2e/harmony/add-harmony.e2e.ts:492` add command on Harmony › trackAllFiles: tracking the files bit treats as generated › cloning the workspace from its root component › should come out clean, the workspace it reproduces is the one the root was versioned from
- [ ] `e2e/harmony/add-harmony.e2e.ts:500` add command on Harmony › trackAllFiles: tracking the files bit treats as generated › cloning the workspace from its root component › should refuse a component that is not a workspace-root component, leaving no directory behind
- [ ] `e2e/harmony/add-harmony.e2e.ts:507` add command on Harmony › trackAllFiles: tracking the files bit treats as generated › cloning the workspace from its root component › should refuse a component the remote does not have, pointing at the export
- [ ] `e2e/harmony/add-harmony.e2e.ts:561` add command on Harmony › cloning a workspace as it is on a lane › should come out on the lane
- [ ] `e2e/harmony/add-harmony.e2e.ts:564` add command on Harmony › cloning a workspace as it is on a lane › should write the components the lane has at their heads on the lane, the root included
- [ ] `e2e/harmony/add-harmony.e2e.ts:569` add command on Harmony › cloning a workspace as it is on a lane › should write a component the lane does not have at its head on main
- [ ] `e2e/harmony/add-harmony.e2e.ts:572` add command on Harmony › cloning a workspace as it is on a lane › should come out clean, the root converging on the .bitmap the clone built
- [ ] `e2e/harmony/add-harmony.e2e.ts:591` add command on Harmony › cloning a workspace as it is on a lane › with a version on the root id, which pins the root files only › should write the root files of the version asked for, not of its head on the lane
- [ ] `e2e/harmony/add-harmony.e2e.ts:597` add command on Harmony › cloning a workspace as it is on a lane › with a version on the root id, which pins the root files only › should still take the members at their heads on the lane
- [ ] `e2e/harmony/add-harmony.e2e.ts:602` add command on Harmony › cloning a workspace as it is on a lane › with a version on the root id, which pins the root files only › should still come out on the lane

### `e2e/harmony/add-missing-deps-custom-detector.e2e.ts`

- [ ] `e2e/harmony/add-missing-deps-custom-detector.e2e.ts:119` add-missing-deps with custom detector › should show lodash as missing in bit status
- [ ] `e2e/harmony/add-missing-deps-custom-detector.e2e.ts:126` add-missing-deps with custom detector › should add the missing dependency after running bit install --add-missing-deps

### `e2e/harmony/artifacts.e2e.ts`

- [ ] `e2e/harmony/artifacts.e2e.ts:23` bit artifacts command › staged component that was never exported › should not throw an error about missing scope
- [ ] `e2e/harmony/artifacts.e2e.ts:26` bit artifacts command › staged component that was never exported › should be able to work when using the full component-id
- [ ] `e2e/harmony/artifacts.e2e.ts:36` bit artifacts command › running the command on a snap › should not throw an error about non exist component

### `e2e/harmony/aspect.e2e.ts`

- [ ] `e2e/harmony/aspect.e2e.ts:24` aspect › run bit aspect set then generate component.json › should write the aspect into the component.json file
- [ ] `e2e/harmony/aspect.e2e.ts:28` aspect › run bit aspect set then generate component.json › should remove the "config" from the .bitmap file
- [ ] `e2e/harmony/aspect.e2e.ts:36` aspect › run bit aspect set then generate component.json › run bit aspect unset › should remove the aspect from the component.json file
- [ ] `e2e/harmony/aspect.e2e.ts:48` aspect › aspect loading failures › commands with loaders should show a descriptive error
- [ ] `e2e/harmony/aspect.e2e.ts:54` aspect › aspect loading failures › commands without loaders should not show the entire stacktrace
- [ ] `e2e/harmony/aspect.e2e.ts:58` aspect › aspect loading failures › using --log=error it should show the stacktrace
- [ ] `e2e/harmony/aspect.e2e.ts:88` aspect › bit aspect update command › should output the affected components
- [ ] `e2e/harmony/aspect.e2e.ts:91` aspect › bit aspect update command › should not add the previous aspect with minus to .bitmap file
- [ ] `e2e/harmony/aspect.e2e.ts:96` aspect › bit aspect update command › bit show should show the new aspect
- [ ] `e2e/harmony/aspect.e2e.ts:101` aspect › bit aspect update command › running the same command again, should not show a message that no component is using this aspect
- [ ] `e2e/harmony/aspect.e2e.ts:106` aspect › bit aspect update command › bit tag should save only the updated aspect and not the old one
- [ ] `e2e/harmony/aspect.e2e.ts:130` aspect › bit aspect unset command › without specifying the aspect version › should unset the aspect

### `e2e/harmony/babel.e2e.ts`

- [ ] `e2e/harmony/babel.e2e.ts:51` babel compiler › compile with babel › compile simple javascript component › should generate dists on the workspace
- [ ] `e2e/harmony/babel.e2e.ts:55` babel compiler › compile with babel › compile simple javascript component › should generate source maps correctly with the paths to the sources
- [ ] `e2e/harmony/babel.e2e.ts:62` babel compiler › compile with babel › compile simple javascript component › should be able to run the dist file
- [ ] `e2e/harmony/babel.e2e.ts:71` babel compiler › compile with babel › compile simple javascript component › compile on capsules › should generate the dists on the capsule

### `e2e/harmony/binary-files.e2e.ts`

- [x] `e2e/harmony/binary-files.e2e.ts:35` handling binary files in Bit › checkout with a binary file › when there is a conflict › should checkout with no errors and leave the file as is indicating there was a conflict — `harmony::checkout_platform::binary_conflict_strategies_match_node_for_binary_and_text_extensions`
- [x] `e2e/harmony/binary-files.e2e.ts:46` handling binary files in Bit › checkout with a binary file › when there is no conflict › should checkout with no errors and show the binary file as updated — `harmony::checkout_platform::checkout_stored_sources_preserves_binary_and_platform_eol_and_removes_obsolete_files`

### `e2e/harmony/bit-ignore.e2e.ts`

- [ ] `e2e/harmony/bit-ignore.e2e.ts:21` Bit Ignore functionality › adding .bitignore in a comp dir › should respect the .bitignore file and ignore according to the pattern
- [ ] `e2e/harmony/bit-ignore.e2e.ts:35` Bit Ignore functionality › adding .bitignore in the root dir › should respect the .bitignore file and ignore according to the pattern
- [ ] `e2e/harmony/bit-ignore.e2e.ts:49` Bit Ignore functionality › adding .gitignore and an empty .bitignore in the root dir › should only consider the .bitignore and ignore the .gitignore file
- [ ] `e2e/harmony/bit-ignore.e2e.ts:61` Bit Ignore functionality › adding only .gitignore in the component dir › should consider the .gitignore, ignore the patterns in it, but track this .gitignore file
- [ ] `e2e/harmony/bit-ignore.e2e.ts:74` Bit Ignore functionality › using ignoredFiles config in workspace.jsonc › should ignore files matching the configured patterns
- [ ] `e2e/harmony/bit-ignore.e2e.ts:88` Bit Ignore functionality › adding .gitignore and .bitignore in the component dir › .bitignore should take precedence

### `e2e/harmony/build-cmd.e2e.ts`

- [ ] `e2e/harmony/build-cmd.e2e.ts:45` build command › an mdx dependency of a react env › should respect the shouldCopyNonSupportedFiles of the component compiler and ignore compilers of other envs
- [ ] `e2e/harmony/build-cmd.e2e.ts:60` build command › list tasks › should list the publish task in the tagPipeline and in the snapPipeline
- [ ] `e2e/harmony/build-cmd.e2e.ts:82` build command › registering the publish task for the snap pipeline in a new-custom env › should list the publish task in the tagPipeline AND in the snapPipeline as well
- [ ] `e2e/harmony/build-cmd.e2e.ts:116` build command › dist file is deleted from the remote › the error should explain the issue and mention the remote where it is coming from
- [ ] `e2e/harmony/build-cmd.e2e.ts:132` build command › 3 components use 3 different envs › should indicate when executing a build task on a dependency
- [ ] `e2e/harmony/build-cmd.e2e.ts:145` build command › bit build with --loose flag › component with a failing test › bit build --loose should not throw and show the failing test but indicate build success
- [ ] `e2e/harmony/build-cmd.e2e.ts:160` build command › bit build with --loose flag › component with a compilation error › bit build --loose should still throw an error for compilation errors
- [ ] `e2e/harmony/build-cmd.e2e.ts:190` build command › should only create capsules for modified components and their dependents, not for unmodified exported dependencies
- [ ] `e2e/harmony/build-cmd.e2e.ts:267` build command › keeps the transitive package dependency on the capsule side of the graph boundary
- [ ] `e2e/harmony/build-cmd.e2e.ts:284` build command › optimized capsule creation for exported dependencies for self hosting › should create capsules not only for modified components and their dependents, but also for unmodified exported dependencies
- [ ] `e2e/harmony/build-cmd.e2e.ts:315` build command › build should only include workspace components and direct dependents › should only include modified component (comp3) in build, not its dependents through non-workspace components
- [ ] `e2e/harmony/build-cmd.e2e.ts:338` build command › build with --unmodified flag and component pattern › should only build the specified component when using --unmodified with a component pattern
- [ ] `e2e/harmony/build-cmd.e2e.ts:349` build command › build with --unmodified flag and component pattern › should build both components when using --unmodified without a pattern
- [ ] `e2e/harmony/build-cmd.e2e.ts:365` build command › build with invalid --tasks flag › should throw an error when --tasks does not match any available tasks

### `e2e/harmony/checkout-harmony.e2e.ts`

- [ ] `e2e/harmony/checkout-harmony.e2e.ts:28` bit checkout command › for non existing component › show an error saying the component was not found
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:41` bit checkout command › after the component was created › before tagging it should show an error saying the component was not tagged yet
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:50` bit checkout command › after the component was created › after the component was tagged › using a non-exist version › should show an error saying the version does not exist
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:59` bit checkout command › after the component was created › after the component was tagged › and component was modified › should show an error saying the component already uses that version
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:69` bit checkout command › after the component was created › after the component was tagged › and component was modified › and tagged again › should display a successful message
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:74` bit checkout command › after the component was created › after the component was tagged › and component was modified › and tagged again › should revert to v1
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:78` bit checkout command › after the component was created › after the component was tagged › and component was modified › and tagged again › should update bitmap with the used version
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:83` bit checkout command › after the component was created › after the component was tagged › and component was modified › and tagged again › should not show the component as modified
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:87` bit checkout command › after the component was created › after the component was tagged › and component was modified › and tagged again › bit list should show the currently used version and latest local version
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:98` bit checkout command › after the component was created › after the component was tagged › and component was modified › and tagged again › trying to tag when using an old version › should throw an error NewerVersionFound
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:105` bit checkout command › after the component was created › after the component was tagged › and component was modified › and tagged again › trying to tag when using an old version › should allow tagging when --ignore-newest-version flag is used
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:125` bit checkout command › components with dependencies with multiple versions › as an intermediate step, make sure all components have v2
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:136` bit checkout command › components with dependencies with multiple versions › switching to a previous version of the main component › should display a successful message
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:141` bit checkout command › components with dependencies with multiple versions › switching to a previous version of the main component › should write the files of that version for the main component only and not its dependencies
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:145` bit checkout command › components with dependencies with multiple versions › switching to a previous version of the main component › should update bitmap of the main component with the used version
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:148` bit checkout command › components with dependencies with multiple versions › switching to a previous version of the main component › should not change the dependencies in bitmap file
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:152` bit checkout command › components with dependencies with multiple versions › switching to a previous version of the main component › should show the main component as modified because its dependencies are now having different version
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:156` bit checkout command › components with dependencies with multiple versions › switching to a previous version of the main component › should not write package.json and package-lock.json files
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:174` bit checkout command › components with dependencies with multiple versions › missing the latest Version object from the filesystem › should not throw an error
- [x] `e2e/harmony/checkout-harmony.e2e.ts:190` bit checkout command › when the current version has new files › should delete the new files — `harmony::checkout_platform::checkout_stored_sources_preserves_binary_and_platform_eol_and_removes_obsolete_files`
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:207` bit checkout command › when the component is modified and a file was changed in the checked out version › should update the file according to the checked out version
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:233` bit checkout command › when a file was deleted locally but not in the base and the new version › bit checkout head › should leave the file deleted
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:243` bit checkout command › when a file was deleted locally but not in the base and the new version › bit checkout reset › should re-create the file
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:265` bit checkout command › when a file was added in the new version (and not exists locally) › should write the new files
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:287` bit checkout command › modified component with conflicts › using manual strategy › should indicate that the file has conflicts
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:293` bit checkout command › modified component with conflicts › using manual strategy › should rewrite the file with the conflicts segments labeled according to the versions
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:299` bit checkout command › modified component with conflicts › using manual strategy › should not strip the last line
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:303` bit checkout command › modified component with conflicts › using manual strategy › should update bitmap with the specified version
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:306` bit checkout command › modified component with conflicts › using manual strategy › should show the component as modified
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:310` bit checkout command › modified component with conflicts › using manual strategy › should not try to compile the files
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:314` bit checkout command › modified component with conflicts › using manual strategy › should not run the package installation
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:326` bit checkout command › modified component with conflicts › using theirs strategy › should indicate that the file has updated
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:332` bit checkout command › modified component with conflicts › using theirs strategy › should rewrite the file according to the used version
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:336` bit checkout command › modified component with conflicts › using theirs strategy › should update bitmap with the used version
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:339` bit checkout command › modified component with conflicts › using theirs strategy › should not show the component as modified
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:350` bit checkout command › modified component with conflicts › using ours strategy › should indicate that the version was switched
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:355` bit checkout command › modified component with conflicts › using ours strategy › should indicate that the file was not changed
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:358` bit checkout command › modified component with conflicts › using ours strategy › should leave the file intact
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:362` bit checkout command › modified component with conflicts › using ours strategy › should update bitmap with the used version
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:367` bit checkout command › modified component with conflicts › using ours strategy › should show the component as modified
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:384` bit checkout command › modified component with conflicts › when new files are added › using manual strategy › should indicate that a new file was added
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:388` bit checkout command › modified component with conflicts › when new files are added › using manual strategy › should not delete the file
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:398` bit checkout command › modified component with conflicts › when new files are added › using theirs strategy › should indicate that the new file was removed
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:402` bit checkout command › modified component with conflicts › when new files are added › using theirs strategy › should delete the file
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:412` bit checkout command › modified component with conflicts › when new files are added › using ours strategy › should indicate that the new file was not changed
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:415` bit checkout command › modified component with conflicts › when new files are added › using ours strategy › should not delete the file
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:438` bit checkout command › checkout-head when the local head is not up to date › should checkout to the remote head and not to the local head
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:456` bit checkout command › sync new components › bit checkout head should sync the exported components
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:474` bit checkout command › checkout latest vs head › bit status should show both, head and latest
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:480` bit checkout command › checkout latest vs head › bit checkout latest should checkout to the semver latest and not to the head snap
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:485` bit checkout command › checkout latest vs head › bit checkout head should checkout to the head snap and not to the semver latest
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:508` bit checkout command › checkout latest when there is no tag › should checkout to the head
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:527` bit checkout command › checkout to a version that does not exist locally › intermediate step - make sure the import does not bring older versions
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:530` bit checkout command › checkout to a version that does not exist locally › should be able to checkout to a non-exist older version
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:548` bit checkout command › modified component without conflicts › without any flag should merge successfully
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:555` bit checkout command › modified component without conflicts › with --force-ours flag, should keep the file as is
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:563` bit checkout command › modified component without conflicts › with --force-theirs flag, should write the files according to the head
- [x] `e2e/harmony/checkout-harmony.e2e.ts:601` bit checkout command › checkout head with deps having different versions than workspace.jsonc › if the ws has a lower range, it should update workspace.jsonc with the new range
- [x] `e2e/harmony/checkout-harmony.e2e.ts:607` bit checkout command › checkout head with deps having different versions than workspace.jsonc › if the ws has a higher range, it should not update
- [x] `e2e/harmony/checkout-harmony.e2e.ts:613` bit checkout command › checkout head with deps having different versions than workspace.jsonc › if the ws has a lower exact version, it should write a conflict
- [x] `e2e/harmony/checkout-harmony.e2e.ts:622` bit checkout command › checkout head with deps having different versions than workspace.jsonc › if the ws has a lower exact version, and merge strategy is "theirs" it should update according to the head
- [x] `e2e/harmony/checkout-harmony.e2e.ts:628` bit checkout command › checkout head with deps having different versions than workspace.jsonc › if the ws has a lower exact version, and merge strategy is "ours" it should keep the workspace.jsonc intact
- [x] `e2e/harmony/checkout-harmony.e2e.ts:636` bit checkout command › checkout head with deps having different versions than workspace.jsonc › if the ws has an exact version higher than the comp range, it should not throw
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:656` bit checkout command › checkout reset with changes in component.json › status should not show the component as modified
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:672` bit checkout command › checkout with a short hash › bitmap should contain the full hash, not the short one
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:676` bit checkout command › checkout with a short hash › bit status should not throw an error
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:690` bit checkout command › checkout main component when on a lane › should checkout the component successfully
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:705` bit checkout command › checkout reset of main component when on a lane and the component-dir is deleted › should re-write the component
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:708` bit checkout command › checkout reset of main component when on a lane and the component-dir is deleted › status should not have invalid components
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:734` bit checkout command › checkout head --include-new-from-scope › without the flag › should NOT import new components from the scope
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:745` bit checkout command › checkout head --include-new-from-scope › with the flag › should import the new components from the defaultScope
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:749` bit checkout command › checkout head --include-new-from-scope › with the flag › should show the new components in the output
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:754` bit checkout command › checkout head --include-new-from-scope › with the flag › should include the new-from-scope count in the summary
- [ ] `e2e/harmony/checkout-harmony.e2e.ts:762` bit checkout command › checkout head --include-new-from-scope › using the flag with a non-head target › should throw an error

### `e2e/harmony/ci-bitmap-auto-sync.e2e.ts`

- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:133` ci merge with bitmap auto-sync mode › regression: workspace WITHOUT bitmapAutoSync flag › should complete successfully
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:137` ci merge with bitmap auto-sync mode › regression: workspace WITHOUT bitmapAutoSync flag › should still create a CI commit on the default branch (existing behavior)
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:143` ci merge with bitmap auto-sync mode › regression: workspace WITHOUT bitmapAutoSync flag › should still tag the component
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:183` ci merge with bitmap auto-sync mode › with bitmapAutoSync enabled and --no-bitmap-commit flag › should complete successfully
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:187` ci merge with bitmap auto-sync mode › with bitmapAutoSync enabled and --no-bitmap-commit flag › should explicitly indicate the bitmap commit was skipped in output
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:192` ci merge with bitmap auto-sync mode › with bitmapAutoSync enabled and --no-bitmap-commit flag › should NOT push any new commit to origin from the CI side
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:196` ci merge with bitmap auto-sync mode › with bitmapAutoSync enabled and --no-bitmap-commit flag › local HEAD should equal origin HEAD (no extra local commit either)
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:202` ci merge with bitmap auto-sync mode › with bitmapAutoSync enabled and --no-bitmap-commit flag › should still tag the component locally
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:208` ci merge with bitmap auto-sync mode › with bitmapAutoSync enabled and --no-bitmap-commit flag › should still export the new version to the remote scope
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:252` ci merge with bitmap auto-sync mode › downstream developer workspace auto-syncs after git pull › before the developer has run `git pull` › local .bitmap reflects the old version
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:264` ci merge with bitmap auto-sync mode › downstream developer workspace auto-syncs after git pull › after `git pull` brings in the merge commit (no .bitmap delta in git) › the .bitmap on disk has not yet been updated by Bit
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:276` ci merge with bitmap auto-sync mode › downstream developer workspace auto-syncs after git pull › after `git pull` brings in the merge commit (no .bitmap delta in git) › the first bit command after pull (`bit status`) › triggers auto-sync, updating .bitmap to scope HEAD (0.0.2)
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:282` ci merge with bitmap auto-sync mode › downstream developer workspace auto-syncs after git pull › after `git pull` brings in the merge commit (no .bitmap delta in git) › the first bit command after pull (`bit status`) › writes the sentinel file recording the synced git HEAD
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:290` ci merge with bitmap auto-sync mode › downstream developer workspace auto-syncs after git pull › after `git pull` brings in the merge commit (no .bitmap delta in git) › the first bit command after pull (`bit status`) › reports a clean status (no outdated, no modified)
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:294` ci merge with bitmap auto-sync mode › downstream developer workspace auto-syncs after git pull › after `git pull` brings in the merge commit (no .bitmap delta in git) › the first bit command after pull (`bit status`) › leaves .bitmap as a local working-tree modification in git
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:354` ci merge with bitmap auto-sync mode › auto-sync works regardless of which command runs first › `bit list` as first command syncs bitmap
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:359` ci merge with bitmap auto-sync mode › auto-sync works regardless of which command runs first › `bit show` as first command syncs bitmap
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:364` ci merge with bitmap auto-sync mode › auto-sync works regardless of which command runs first › `bit log` as first command syncs bitmap
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:369` ci merge with bitmap auto-sync mode › auto-sync works regardless of which command runs first › `bit compile` as first command syncs bitmap
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:415` ci merge with bitmap auto-sync mode › sentinel caching across commands at the same git HEAD › sentinel file should be untouched after the second command (same git HEAD)
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:453` ci merge with bitmap auto-sync mode › multiple sequential PR cycles › cycle 1: dev syncs to 0.0.2
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:465` ci merge with bitmap auto-sync mode › multiple sequential PR cycles › cycle 2: dev syncs to 0.0.3
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:511` ci merge with bitmap auto-sync mode › continuous developer flow — multiple sync cycles in the same workspace › cycle 1: bitmap syncs to 0.0.2
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:524` ci merge with bitmap auto-sync mode › continuous developer flow — multiple sync cycles in the same workspace › cycle 2: same workspace (already-modified .bitmap from cycle 1), syncs to 0.0.3
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:537` ci merge with bitmap auto-sync mode › continuous developer flow — multiple sync cycles in the same workspace › cycle 3: continues advancing without state corruption
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:550` ci merge with bitmap auto-sync mode › continuous developer flow — multiple sync cycles in the same workspace › the sentinel reflects the latest synced HEAD after the chain of cycles
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:611` ci merge with bitmap auto-sync mode › developer working on a git feature branch (Bit on main) — merging main in › before merging main: dev .bitmap is still at the original 0.0.1
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:621` ci merge with bitmap auto-sync mode › developer working on a git feature branch (Bit on main) — merging main in › dev merges origin/main into their feature branch › git status shows we are still on the feature branch (Bit lane is still main)
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:633` ci merge with bitmap auto-sync mode › developer working on a git feature branch (Bit on main) — merging main in › dev merges origin/main into their feature branch › first bit command on the feature branch after the merge › auto-sync runs and updates .bitmap to scope HEAD (0.0.2)
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:637` ci merge with bitmap auto-sync mode › developer working on a git feature branch (Bit on main) — merging main in › dev merges origin/main into their feature branch › first bit command on the feature branch after the merge › sentinel records the feature branch HEAD (the merge commit)
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:697` ci merge with bitmap auto-sync mode › first bit command is `bit ci pr` on a stale feature branch › starts the test with .bitmap reflecting the post-sync version (0.0.2)
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:704` ci merge with bitmap auto-sync mode › first bit command is `bit ci pr` on a stale feature branch › bit ci pr completes successfully despite the stale starting state
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:708` ci merge with bitmap auto-sync mode › first bit command is `bit ci pr` on a stale feature branch › creates the lane and exports it
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:715` ci merge with bitmap auto-sync mode › first bit command is `bit ci pr` on a stale feature branch › the sentinel was advanced (auto-sync ran during the bit ci pr bootstrap)
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:770` ci merge with bitmap auto-sync mode › first sync after a PR introduces a brand-new component › after pull, .bitmap entry for comp-new has no scope or version yet (it is the merged-but-unsynced state)
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:783` ci merge with bitmap auto-sync mode › first sync after a PR introduces a brand-new component › first bit command after pull triggers auto-sync › comp-new in .bitmap should be promoted to its tagged state (scope + version)
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:790` ci merge with bitmap auto-sync mode › first sync after a PR introduces a brand-new component › first bit command after pull triggers auto-sync › `bit list` shows comp-new at 0.0.1
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:842` ci merge with bitmap auto-sync mode › fresh clone after a PR introduced a brand-new component (workspace2) › the freshly-cloned .bitmap shows comp-new-clone in its untagged form
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:854` ci merge with bitmap auto-sync mode › fresh clone after a PR introduced a brand-new component (workspace2) › first bit command in the fresh clone triggers auto-sync › comp-new-clone in .bitmap should be promoted to its tagged state
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:896` ci merge with bitmap auto-sync mode › developer on a Bit lane — auto-sync is skipped › we are on the Bit lane, not main
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:901` ci merge with bitmap auto-sync mode › developer on a Bit lane — auto-sync is skipped › sentinel did NOT advance to the lane-side git HEAD (lane guard suppressed sync)
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:938` ci merge with bitmap auto-sync mode › --no-bitmap-commit CLI flag without the workspace flag › should skip the commit (CLI flag works standalone)
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:942` ci merge with bitmap auto-sync mode › --no-bitmap-commit CLI flag without the workspace flag › should still tag and export to remote scope
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:948` ci merge with bitmap auto-sync mode › --no-bitmap-commit CLI flag without the workspace flag › should NOT create a sentinel file (workspace flag is off)
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:989` ci merge with bitmap auto-sync mode › multiple components — all bitmap entries mirror scope HEAD after sync › every component in the bitmap should match its scope HEAD
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:1003` ci merge with bitmap auto-sync mode › multiple components — all bitmap entries mirror scope HEAD after sync › the modified components (comp1, comp3) should be at the new tag (0.0.2)
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:1011` ci merge with bitmap auto-sync mode › multiple components — all bitmap entries mirror scope HEAD after sync › status should be clean across all components
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:1031` ci merge with bitmap auto-sync mode › workspace without git: graceful skip › bit status should run successfully without erroring on the missing git
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:1037` ci merge with bitmap auto-sync mode › workspace without git: graceful skip › should NOT create a sentinel file when there is no git
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:1042` ci merge with bitmap auto-sync mode › workspace without git: graceful skip › bit list should report the locally-known version (no sync attempted)
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:1082` ci merge with bitmap auto-sync mode › git HEAD changed but no actual scope-vs-bitmap drift › .bitmap should be byte-identical to before the sync (no spurious rewrites)
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:1087` ci merge with bitmap auto-sync mode › git HEAD changed but no actual scope-vs-bitmap drift › the sentinel should still advance to the current git HEAD
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:1132` ci merge with bitmap auto-sync mode › graceful degradation when remote scope is unreachable › bit status should complete without throwing
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:1137` ci merge with bitmap auto-sync mode › graceful degradation when remote scope is unreachable › local .bitmap should not be corrupted by the failed remote
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:1174` ci merge with bitmap auto-sync mode › bitmapAutoSync enabled but legacy `bit ci merge` (commit + push) used › legacy commit+push still works when --no-bitmap-commit is omitted
- [ ] `e2e/harmony/ci-bitmap-auto-sync.e2e.ts:1180` ci merge with bitmap auto-sync mode › bitmapAutoSync enabled but legacy `bit ci merge` (commit + push) used › component is tagged and exported

### `e2e/harmony/ci-commands.e2e.ts`

- [ ] `e2e/harmony/ci-commands.e2e.ts:78` ci commands › bit ci pr workflow › should complete successfully
- [ ] `e2e/harmony/ci-commands.e2e.ts:81` ci commands › bit ci pr workflow › should use a random-suffix temporary lane (default flow, no --keep-lane)
- [ ] `e2e/harmony/ci-commands.e2e.ts:88` ci commands › bit ci pr workflow › should create a lane with the components and switch back to main
- [ ] `e2e/harmony/ci-commands.e2e.ts:95` ci commands › bit ci pr workflow › should export the lane to the remote
- [ ] `e2e/harmony/ci-commands.e2e.ts:106` ci commands › bit ci pr workflow › importing the lane to a new workspace › should import the lane successfully
- [ ] `e2e/harmony/ci-commands.e2e.ts:110` ci commands › bit ci pr workflow › importing the lane to a new workspace › should save the git message into the snap message
- [ ] `e2e/harmony/ci-commands.e2e.ts:141` ci commands › bit ci pr --skip-cleanup leaves the workspace on the PR lane (default/temp-lane flow) › should complete successfully
- [ ] `e2e/harmony/ci-commands.e2e.ts:144` ci commands › bit ci pr --skip-cleanup leaves the workspace on the PR lane (default/temp-lane flow) › should report that it skipped the workspace restore
- [ ] `e2e/harmony/ci-commands.e2e.ts:148` ci commands › bit ci pr --skip-cleanup leaves the workspace on the PR lane (default/temp-lane flow) › should leave the workspace on the PR lane instead of switching back to main
- [ ] `e2e/harmony/ci-commands.e2e.ts:152` ci commands › bit ci pr --skip-cleanup leaves the workspace on the PR lane (default/temp-lane flow) › should still export the lane to the remote
- [ ] `e2e/harmony/ci-commands.e2e.ts:173` ci commands › bit ci pr --keep-lane --skip-cleanup leaves the workspace on the PR lane › should complete successfully and report skipping the restore
- [ ] `e2e/harmony/ci-commands.e2e.ts:178` ci commands › bit ci pr --keep-lane --skip-cleanup leaves the workspace on the PR lane › should leave the workspace on the PR lane instead of switching back to main
- [ ] `e2e/harmony/ci-commands.e2e.ts:218` ci commands › bit ci pr --skip-tasks omits the named tasks from the snap pipeline › runs ExtractSchema and PublishComponents by default (control)
- [ ] `e2e/harmony/ci-commands.e2e.ts:222` ci commands › bit ci pr --skip-tasks omits the named tasks from the snap pipeline › completes successfully with --skip-tasks
- [ ] `e2e/harmony/ci-commands.e2e.ts:225` ci commands › bit ci pr --skip-tasks omits the named tasks from the snap pipeline › does not run the skipped tasks
- [ ] `e2e/harmony/ci-commands.e2e.ts:229` ci commands › bit ci pr --skip-tasks omits the named tasks from the snap pipeline › still runs the non-skipped pipeline tasks (e.g. PackComponents)
- [ ] `e2e/harmony/ci-commands.e2e.ts:254` ci commands › bit ci pr skips tasks named by a [skip-tasks: ...] commit-message token › reports it is skipping tasks from the commit message
- [ ] `e2e/harmony/ci-commands.e2e.ts:258` ci commands › bit ci pr skips tasks named by a [skip-tasks: ...] commit-message token › does not run the tasks named by the token
- [ ] `e2e/harmony/ci-commands.e2e.ts:263` ci commands › bit ci pr skips tasks named by a [skip-tasks: ...] commit-message token › still runs the non-skipped pipeline tasks (e.g. PackComponents)
- [ ] `e2e/harmony/ci-commands.e2e.ts:267` ci commands › bit ci pr skips tasks named by a [skip-tasks: ...] commit-message token › completes successfully
- [ ] `e2e/harmony/ci-commands.e2e.ts:311` ci commands › bit ci pr reuses the existing remote lane across subsequent PR commits › should report that the lane was reused on the second run
- [ ] `e2e/harmony/ci-commands.e2e.ts:315` ci commands › bit ci pr reuses the existing remote lane across subsequent PR commits › should not log any temp-lane creation in either run
- [ ] `e2e/harmony/ci-commands.e2e.ts:321` ci commands › bit ci pr reuses the existing remote lane across subsequent PR commits › should leave exactly one lane on the remote with that name
- [ ] `e2e/harmony/ci-commands.e2e.ts:326` ci commands › bit ci pr reuses the existing remote lane across subsequent PR commits › should preserve the head of a component that was unchanged in the second run
- [ ] `e2e/harmony/ci-commands.e2e.ts:371` ci commands › bit ci pr merges main into the lane on subsequent runs (config-change propagation) › should propagate main's deps-set config change to comp1 on the lane
- [ ] `e2e/harmony/ci-commands.e2e.ts:441` ci commands › bit ci pr syncs main config even when the fork-point object is not on the filesystem › should not skip config sync with a "was not found on the filesystem" error
- [ ] `e2e/harmony/ci-commands.e2e.ts:447` ci commands › bit ci pr syncs main config even when the fork-point object is not on the filesystem › should still propagate main's deps-set config change to comp1 on the lane
- [ ] `e2e/harmony/ci-commands.e2e.ts:496` ci commands › bit ci pr propagates an env-set on main to the lane on subsequent runs › should propagate main's env-set change to comp1 on the lane
- [ ] `e2e/harmony/ci-commands.e2e.ts:547` ci commands › bit ci pr does NOT merge main into the lane when the PR branch is behind › should report that it skipped merging main because the PR branch is behind
- [ ] `e2e/harmony/ci-commands.e2e.ts:552` ci commands › bit ci pr does NOT merge main into the lane when the PR branch is behind › should NOT propagate main's deps-set change to comp1 on the lane
- [ ] `e2e/harmony/ci-commands.e2e.ts:606` ci commands › bit ci pr keeps the PR's content when main and lane both modified the same component › lane's comp1 should still have the PR's version, not main's
- [ ] `e2e/harmony/ci-commands.e2e.ts:634` ci commands › bit ci merge workflow › should complete successfully
- [ ] `e2e/harmony/ci-commands.e2e.ts:637` ci commands › bit ci merge workflow › should tag the component
- [ ] `e2e/harmony/ci-commands.e2e.ts:643` ci commands › bit ci merge workflow › status should be clean
- [ ] `e2e/harmony/ci-commands.e2e.ts:648` ci commands › bit ci merge workflow › should export tagged components to remote
- [ ] `e2e/harmony/ci-commands.e2e.ts:653` ci commands › bit ci merge workflow › should save the "ci pr" message into the tag message
- [ ] `e2e/harmony/ci-commands.e2e.ts:689` ci commands › bit ci merge with --skip-push flag › should complete successfully
- [ ] `e2e/harmony/ci-commands.e2e.ts:692` ci commands › bit ci merge with --skip-push flag › should show skip-push message in output
- [ ] `e2e/harmony/ci-commands.e2e.ts:695` ci commands › bit ci merge with --skip-push flag › should tag the component
- [ ] `e2e/harmony/ci-commands.e2e.ts:701` ci commands › bit ci merge with --skip-push flag › should export tagged components to remote scope
- [ ] `e2e/harmony/ci-commands.e2e.ts:706` ci commands › bit ci merge with --skip-push flag › should create local git commit but NOT push to remote
- [ ] `e2e/harmony/ci-commands.e2e.ts:714` ci commands › bit ci merge with --skip-push flag › should allow manual push after ci merge
- [ ] `e2e/harmony/ci-commands.e2e.ts:748` ci commands › multi-workspace scenario › should complete successfully
- [ ] `e2e/harmony/ci-commands.e2e.ts:751` ci commands › multi-workspace scenario › should create the specified lane
- [ ] `e2e/harmony/ci-commands.e2e.ts:758` ci commands › multi-workspace scenario › should export the lane to the remote
- [ ] `e2e/harmony/ci-commands.e2e.ts:800` ci commands › bit ci merge with versions file › should complete successfully
- [ ] `e2e/harmony/ci-commands.e2e.ts:803` ci commands › bit ci merge with versions file › should tag components according to the versions file
- [ ] `e2e/harmony/ci-commands.e2e.ts:813` ci commands › bit ci merge with versions file › status should be clean
- [ ] `e2e/harmony/ci-commands.e2e.ts:818` ci commands › bit ci merge with versions file › should export tagged components to remote
- [ ] `e2e/harmony/ci-commands.e2e.ts:855` ci commands › bit ci merge with --auto-tag-increment › should complete successfully
- [ ] `e2e/harmony/ci-commands.e2e.ts:860` ci commands › bit ci merge with --auto-tag-increment › should reach the dependents via auto-tag rather than as modified components
- [ ] `e2e/harmony/ci-commands.e2e.ts:865` ci commands › bit ci merge with --auto-tag-increment › should bump the modified component and its auto-tagged dependents by major
- [ ] `e2e/harmony/ci-commands.e2e.ts:875` ci commands › bit ci merge with --auto-tag-increment › should export the majored components to the remote
- [ ] `e2e/harmony/ci-commands.e2e.ts:910` ci commands › bit ci merge when checked out to a lane › should complete successfully
- [ ] `e2e/harmony/ci-commands.e2e.ts:913` ci commands › bit ci merge when checked out to a lane › should tag the component
- [ ] `e2e/harmony/ci-commands.e2e.ts:919` ci commands › bit ci merge when checked out to a lane › status should be clean
- [ ] `e2e/harmony/ci-commands.e2e.ts:924` ci commands › bit ci merge when checked out to a lane › should export tagged components to remote
- [ ] `e2e/harmony/ci-commands.e2e.ts:929` ci commands › bit ci merge when checked out to a lane › should delete the remote lane
- [ ] `e2e/harmony/ci-commands.e2e.ts:959` ci commands › bit ci merge when lane has config changes (env-set) › should preserve the env config from the lane
- [ ] `e2e/harmony/ci-commands.e2e.ts:963` ci commands › bit ci merge when lane has config changes (env-set) › should tag the component
- [ ] `e2e/harmony/ci-commands.e2e.ts:970` ci commands › bit ci merge when lane has config changes (env-set) › should export tagged components to remote
- [ ] `e2e/harmony/ci-commands.e2e.ts:975` ci commands › bit ci merge when lane has config changes (env-set) › status should be clean
- [ ] `e2e/harmony/ci-commands.e2e.ts:978` ci commands › bit ci merge when lane has config changes (env-set) › should delete the remote lane
- [ ] `e2e/harmony/ci-commands.e2e.ts:1014` ci commands › bit ci merge when components are new to the lane (never existed on main) › should complete successfully
- [ ] `e2e/harmony/ci-commands.e2e.ts:1017` ci commands › bit ci merge when components are new to the lane (never existed on main) › should tag the new components
- [ ] `e2e/harmony/ci-commands.e2e.ts:1026` ci commands › bit ci merge when components are new to the lane (never existed on main) › status should be clean
- [ ] `e2e/harmony/ci-commands.e2e.ts:1029` ci commands › bit ci merge when components are new to the lane (never existed on main) › should export tagged components to remote
- [ ] `e2e/harmony/ci-commands.e2e.ts:1036` ci commands › bit ci merge when components are new to the lane (never existed on main) › should delete the remote lane
- [ ] `e2e/harmony/ci-commands.e2e.ts:1073` ci commands › bit ci merge after lane import --branch › should tag the components that were created on the lane
- [ ] `e2e/harmony/ci-commands.e2e.ts:1132` ci commands › bit ci merge with workspace.jsonc conflicts due to dependency version changes › should fail with clear error message about workspace.jsonc conflicts
- [ ] `e2e/harmony/ci-commands.e2e.ts:1239` ci commands › both runners should complete `bit ci pr` successfully
- [ ] `e2e/harmony/ci-commands.e2e.ts:1246` ci commands › should handle the concurrent push via rebase recovery or lane reuse (no fatal conflict)
- [ ] `e2e/harmony/ci-commands.e2e.ts:1263` ci commands › should leave exactly one final-named lane on the remote
- [ ] `e2e/harmony/ci-commands.e2e.ts:1283` ci commands › after the race, the lane on the remote is healthy › should preserve snaps from BOTH runners chained on the lane
- [ ] `e2e/harmony/ci-commands.e2e.ts:1298` ci commands › after the race, the lane on the remote is healthy › should have no staged or orphaned components after import
- [ ] `e2e/harmony/ci-commands.e2e.ts:1307` ci commands › after the race, the lane on the remote is healthy › should load the lane object with both components present
- [ ] `e2e/harmony/ci-commands.e2e.ts:1316` ci commands › after the race, the lane on the remote is healthy › should have a well-formed VersionHistory for each lane component
- [ ] `e2e/harmony/ci-commands.e2e.ts:1451` ci commands › both runners should complete `bit ci pr` successfully
- [ ] `e2e/harmony/ci-commands.e2e.ts:1458` ci commands › both runners should report reusing the existing remote lane
- [ ] `e2e/harmony/ci-commands.e2e.ts:1465` ci commands › should leave exactly one final-named lane on the remote
- [ ] `e2e/harmony/ci-commands.e2e.ts:1480` ci commands › after the race, the lane on the remote is healthy › should land BOTH runners' new snaps on the lane (no head regression)
- [ ] `e2e/harmony/ci-commands.e2e.ts:1491` ci commands › after the race, the lane on the remote is healthy › should have a clean workspace status
- [ ] `e2e/harmony/ci-commands.e2e.ts:1495` ci commands › after the race, the lane on the remote is healthy › should load the lane object with all three components present
- [ ] `e2e/harmony/ci-commands.e2e.ts:1503` ci commands › after the race, the lane on the remote is healthy › should have a well-formed VersionHistory for each lane component
- [ ] `e2e/harmony/ci-commands.e2e.ts:1622` ci commands › both runners should complete `bit ci pr` successfully
- [ ] `e2e/harmony/ci-commands.e2e.ts:1629` ci commands › the loser should rebase its snap onto the winner's head
- [ ] `e2e/harmony/ci-commands.e2e.ts:1647` ci commands › after the race, the lane on the remote is healthy › should preserve BOTH conflicting snaps of comp1 (winner in history, loser as head)
- [ ] `e2e/harmony/ci-commands.e2e.ts:1655` ci commands › after the race, the lane on the remote is healthy › should have a well-formed VersionHistory chain for comp1

### `e2e/harmony/ci-sync-branch-ownership.e2e.ts`

- [ ] `e2e/harmony/ci-sync-branch-ownership.e2e.ts:93` bit ci sync: branch ownership and first contact › branch ownership decides what close-pr may delete › should ignore a branch that INHERITED a sync trailer, on the structural evidence, twice over
- [ ] `e2e/harmony/ci-sync-branch-ownership.e2e.ts:113` bit ci sync: branch ownership and first contact › branch ownership decides what close-pr may delete › own-superseded (sync history merged, tip is not): should close the PR but keep the branch, unmoved
- [ ] `e2e/harmony/ci-sync-branch-ownership.e2e.ts:133` bit ci sync: branch ownership and first contact › branch ownership decides what close-pr may delete › own-merged (fully merged into the default branch): should close the PR and delete the branch
- [ ] `e2e/harmony/ci-sync-branch-ownership.e2e.ts:167` bit ci sync: branch ownership and first contact › a branch that advances between the ownership read and the delete is kept, not deleted › should keep the branch, name the race, and leave the racing commit as the tip
- [ ] `e2e/harmony/ci-sync-branch-ownership.e2e.ts:213` bit ci sync: branch ownership and first contact › a branch adopted into an existing lane on first contact (bit ci pr --keep-lane, then sync) › starts with no lane pointer at all on the branch — the exact pre-adoption shape
- [ ] `e2e/harmony/ci-sync-branch-ownership.e2e.ts:217` bit ci sync: branch ownership and first contact › a branch adopted into an existing lane on first contact (bit ci pr --keep-lane, then sync) › adopts the branch instead of halting, and writes the lane pointer to it
- [ ] `e2e/harmony/ci-sync-branch-ownership.e2e.ts:228` bit ci sync: branch ownership and first contact › a branch adopted into an existing lane on first contact (bit ci pr --keep-lane, then sync) › a second run sees the pair as converged and does nothing further
- [ ] `e2e/harmony/ci-sync-branch-ownership.e2e.ts:265` bit ci sync: branch ownership and first contact › a branch whose content would change the lane at first contact halts instead of adopting › halts instead of adopting, and leaves the lane content untouched
- [ ] `e2e/harmony/ci-sync-branch-ownership.e2e.ts:277` bit ci sync: branch ownership and first contact › a branch whose content would change the lane at first contact halts instead of adopting › leaves the local scope byte-clean — a repeat halt attempt creates no additional objects
- [ ] `e2e/harmony/ci-sync-branch-ownership.e2e.ts:313` bit ci sync: branch ownership and first contact › one lane halting during adoption does not affect a healthy lane in the same --all run › the healthy lane converges and the halting one is left untouched, in the same run
- [ ] `e2e/harmony/ci-sync-branch-ownership.e2e.ts:322` bit ci sync: branch ownership and first contact › one lane halting during adoption does not affect a healthy lane in the same --all run › a follow-up targeted run confirms the healthy lane converged cleanly — no residue tripped it

### `e2e/harmony/ci-sync-convergence.e2e.ts`

- [ ] `e2e/harmony/ci-sync-convergence.e2e.ts:71` bit ci sync: what counts as work, and what converges › a rejected sync-commit push reports a benign race, not a conflict › reports a plain race instead of halting, and a follow-up run converges cleanly
- [ ] `e2e/harmony/ci-sync-convergence.e2e.ts:149` bit ci sync: what counts as work, and what converges › a commit bundling a source edit with a .bitmap write is dev work, not convergence › exports the bundled edit onto the lane instead of declaring convergence
- [ ] `e2e/harmony/ci-sync-convergence.e2e.ts:157` bit ci sync: what counts as work, and what converges › a commit bundling a source edit with a .bitmap write is dev work, not convergence › a second run reads the truly converged pair as converged
- [ ] `e2e/harmony/ci-sync-convergence.e2e.ts:193` bit ci sync: what counts as work, and what converges › a probe that finds nothing pending settles without writing anything › exports nothing and pushes nothing — the developer commit stays the tip
- [ ] `e2e/harmony/ci-sync-convergence.e2e.ts:200` bit ci sync: what counts as work, and what converges › a probe that finds nothing pending settles without writing anything › the repeat probe is just as write-free
- [ ] `e2e/harmony/ci-sync-convergence.e2e.ts:252` bit ci sync: what counts as work, and what converges › a squash commit whose body quotes the sync marker is dev work, not convergence › exports the squashed work onto the lane instead of declaring convergence
- [ ] `e2e/harmony/ci-sync-convergence.e2e.ts:260` bit ci sync: what counts as work, and what converges › a squash commit whose body quotes the sync marker is dev work, not convergence › a second run converges without pushing anything to the branch
- [ ] `e2e/harmony/ci-sync-convergence.e2e.ts:288` bit ci sync: what counts as work, and what converges › a commit that touches no bit-tracked file probes without writing, run after run › finds nothing to export and pushes nothing — twice, the docs commit staying the tip
- [ ] `e2e/harmony/ci-sync-convergence.e2e.ts:302` bit ci sync: what counts as work, and what converges › a commit that touches no bit-tracked file probes without writing, run after run › a real dev commit on top of the settled tip exports again
- [ ] `e2e/harmony/ci-sync-convergence.e2e.ts:333` bit ci sync: what counts as work, and what converges › sync.onConflict resolves a same-line divergence without a human (git-wins / lane-wins) › git-wins: should keep the branch’s contested line, take the lane’s rest, advance the lane, converge
- [ ] `e2e/harmony/ci-sync-convergence.e2e.ts:369` bit ci sync: what counts as work, and what converges › sync.onConflict resolves a same-line divergence without a human (git-wins / lane-wins) › lane-wins: should take the LANE’s version of the contested line onto the branch, with no markers
- [ ] `e2e/harmony/ci-sync-convergence.e2e.ts:417` bit ci sync: what counts as work, and what converges › a lane component that the workspace tracks as new and unexported (first lane export) › imports the lane instead of halting on "the component was not found"

### `e2e/harmony/ci-sync-lane-cycle.e2e.ts`

- [ ] `e2e/harmony/ci-sync-lane-cycle.e2e.ts:66` bit ci sync: the lane/branch reconcile cycle › lane <-> branch reconcile cycle (scenarios A, B, C, D1, D2, lane-deleted) › A: a remote lane with no branch is imported onto a new branch, PR-less, content and pointer committed
- [ ] `e2e/harmony/ci-sync-lane-cycle.e2e.ts:91` bit ci sync: the lane/branch reconcile cycle › lane <-> branch reconcile cycle (scenarios A, B, C, D1, D2, lane-deleted) › B: re-running with nothing moved is a converged no-op that pushes nothing
- [ ] `e2e/harmony/ci-sync-lane-cycle.e2e.ts:101` bit ci sync: the lane/branch reconcile cycle › lane <-> branch reconcile cycle (scenarios A, B, C, D1, D2, lane-deleted) › C: a dev commit on the branch is snapped onto the lane under a fresh trailer, then converges
- [ ] `e2e/harmony/ci-sync-lane-cycle.e2e.ts:128` bit ci sync: the lane/branch reconcile cycle › lane <-> branch reconcile cycle (scenarios A, B, C, D1, D2, lane-deleted) › D1: both sides moved on DIFFERENT files -> merged into the branch before snapping, then converges
- [ ] `e2e/harmony/ci-sync-lane-cycle.e2e.ts:160` bit ci sync: the lane/branch reconcile cycle › lane <-> branch reconcile cycle (scenarios A, B, C, D1, D2, lane-deleted) › D2: both sides edited the SAME line -> halts non-zero, naming the component, writing to neither side
- [ ] `e2e/harmony/ci-sync-lane-cycle.e2e.ts:190` bit ci sync: the lane/branch reconcile cycle › lane <-> branch reconcile cycle (scenarios A, B, C, D1, D2, lane-deleted) › a lane removed remotely while its branch holds unexported work: close-pr keeps the branch, twice
- [ ] `e2e/harmony/ci-sync-lane-cycle.e2e.ts:251` bit ci sync: the lane/branch reconcile cycle › --all across two lanes (deleted-lane cleanup, halt isolation, cross-lane isolation) › should import both lanes onto their own branches, leaving an ordinary developer branch alone
- [ ] `e2e/harmony/ci-sync-lane-cycle.e2e.ts:275` bit ci sync: the lane/branch reconcile cycle › --all across two lanes (deleted-lane cleanup, halt isolation, cross-lane isolation) › should halt the conflicting lane, leave it untouched, and still reconcile the lane after it
- [ ] `e2e/harmony/ci-sync-lane-cycle.e2e.ts:306` bit ci sync: the lane/branch reconcile cycle › --all across two lanes (deleted-lane cleanup, halt isolation, cross-lane isolation) › should retire a lane deleted on bit.cloud, keep the rest of the run, and drop it from the next run
- [ ] `e2e/harmony/ci-sync-lane-cycle.e2e.ts:352` bit ci sync: the lane/branch reconcile cycle › --all across two lanes (deleted-lane cleanup, halt isolation, cross-lane isolation) › should read the branch’s OWN sync commit when a Bit-Lane-Head commit is merged in from elsewhere

### `e2e/harmony/ci-sync-main.e2e.ts`

- [ ] `e2e/harmony/ci-sync-main.e2e.ts:79` bit ci sync: main-scope reconciliation › main-scope sync and --dry-run (scenarios E, F) › F: --all --dry-run plans an action per target and leaves every ref on the git remote untouched
- [ ] `e2e/harmony/ci-sync-main.e2e.ts:96` bit ci sync: main-scope reconciliation › main-scope sync and --dry-run (scenarios E, F) › F2: a --dry-run that plans a first-contact adoption reports it and exits 0
- [ ] `e2e/harmony/ci-sync-main.e2e.ts:118` bit ci sync: main-scope reconciliation › main-scope sync and --dry-run (scenarios E, F) › E: --main pushes the scope-resolved drift onto the sync branch, never the default branch, then converges
- [ ] `e2e/harmony/ci-sync-main.e2e.ts:147` bit ci sync: main-scope reconciliation › main-scope sync and --dry-run (scenarios E, F) › --all reconciles the lane and the main scope in one run
- [ ] `e2e/harmony/ci-sync-main.e2e.ts:159` bit ci sync: main-scope reconciliation › main-scope sync and --dry-run (scenarios E, F) › --main --dry-run over uncommitted work refuses, and leaves that work exactly as it was
- [ ] `e2e/harmony/ci-sync-main.e2e.ts:212` bit ci sync: main-scope reconciliation › main sync recovers from a .bitmap entry whose main file no longer exists › should repair both entries instead of failing, and open the sync PR
- [ ] `e2e/harmony/ci-sync-main.e2e.ts:226` bit ci sync: main-scope reconciliation › main sync recovers from a .bitmap entry whose main file no longer exists › should leave a loadable workspace on the sync branch: comp1 in place, comp2 re-imported
- [ ] `e2e/harmony/ci-sync-main.e2e.ts:236` bit ci sync: main-scope reconciliation › main sync recovers from a .bitmap entry whose main file no longer exists › a second run is converged - the heal is not re-applied every run
- [ ] `e2e/harmony/ci-sync-main.e2e.ts:259` bit ci sync: main-scope reconciliation › main-scope direct push (mainSync: direct-push) › should push the drift onto the default branch itself, never creating the sync branch, then converge
- [ ] `e2e/harmony/ci-sync-main.e2e.ts:311` bit ci sync: main-scope reconciliation › a stale bit-sync/main that conflicts with the default branch › re-forks the machine-owned branch from the default branch and pushes the remaining drift
- [ ] `e2e/harmony/ci-sync-main.e2e.ts:331` bit ci sync: main-scope reconciliation › a stale bit-sync/main that conflicts with the default branch › keeps the halt when a human commit sits on the sync branch
- [ ] `e2e/harmony/ci-sync-main.e2e.ts:371` bit ci sync: main-scope reconciliation › bit ci sync --init (onboarding scaffolding) › scaffolds both workflow files with the real default branch substituted, adds the sync config block, prints the checklist, and exits 0
- [ ] `e2e/harmony/ci-sync-main.e2e.ts:399` bit ci sync: main-scope reconciliation › bit ci sync --init (onboarding scaffolding) › is idempotent: a second run skips both files and the config block, and still exits 0
- [ ] `e2e/harmony/ci-sync-main.e2e.ts:413` bit ci sync: main-scope reconciliation › bit ci sync --init (onboarding scaffolding) › should write the workflows at the REPOSITORY root when the workspace is in a subdirectory

### `e2e/harmony/ci-sync-scopes.e2e.ts`

- [ ] `e2e/harmony/ci-sync-scopes.e2e.ts:108` bit ci sync: lanes whose scopes differ from this repository › a lane whose components span two scopes is mirrored over its own-scope slice › targeted explicitly: mirrors the own-scope slice onto a branch and leaves the foreign component out
- [ ] `e2e/harmony/ci-sync-scopes.e2e.ts:126` bit ci sync: lanes whose scopes differ from this repository › a lane whose components span two scopes is mirrored over its own-scope slice › a lane change that touches only the foreign component leaves the mirror untouched, converged and green
- [ ] `e2e/harmony/ci-sync-scopes.e2e.ts:135` bit ci sync: lanes whose scopes differ from this repository › a lane whose components span two scopes is mirrored over its own-scope slice › a lane change to an own component moves the mirror, still leaving the foreign component out
- [ ] `e2e/harmony/ci-sync-scopes.e2e.ts:149` bit ci sync: lanes whose scopes differ from this repository › a lane whose components span two scopes is mirrored over its own-scope slice › a dev commit on the branch exports only own components; the foreign lane entry keeps its head
- [ ] `e2e/harmony/ci-sync-scopes.e2e.ts:162` bit ci sync: lanes whose scopes differ from this repository › a lane whose components span two scopes is mirrored over its own-scope slice › a lane with NO own-scope components, targeted explicitly: refused, nothing written
- [ ] `e2e/harmony/ci-sync-scopes.e2e.ts:186` bit ci sync: lanes whose scopes differ from this repository › a lane whose components span two scopes is mirrored over its own-scope slice › an --all run: the mirrored lane converges, the foreign-only one is skipped, and the run stays green
- [ ] `e2e/harmony/ci-sync-scopes.e2e.ts:198` bit ci sync: lanes whose scopes differ from this repository › a lane whose components span two scopes is mirrored over its own-scope slice › a lane whose configured branch is the default branch: should be skipped before it is even read
- [ ] `e2e/harmony/ci-sync-scopes.e2e.ts:240` bit ci sync: lanes whose scopes differ from this repository › a lane hosted on another scope, with content in this repo scope, syncs when targeted by its id › targeted by its scope-qualified id: should mirror onto the branch its NAME maps to, id and all
- [ ] `e2e/harmony/ci-sync-scopes.e2e.ts:267` bit ci sync: lanes whose scopes differ from this repository › a lane hosted on another scope, with content in this repo scope, syncs when targeted by its id › the same branch reached by NAME: should leave it alone rather than retire it
- [ ] `e2e/harmony/ci-sync-scopes.e2e.ts:277` bit ci sync: lanes whose scopes differ from this repository › a lane hosted on another scope, with content in this repo scope, syncs when targeted by its id › a same-named lane in THIS scope: should halt under --dry-run and for real, leaving the owner’s branch

### `e2e/harmony/ci-sync-state.e2e.ts`

- [ ] `e2e/harmony/ci-sync-state.e2e.ts:63` bit ci sync — state model v2 › a developer who snaps and exports from the branch advances the branch's own state › should read the pair as CONVERGED when the developer already did the sync, and write nothing
- [ ] `e2e/harmony/ci-sync-state.e2e.ts:96` bit ci sync — state model v2 › a developer who snaps and exports from the branch advances the branch's own state › should still export a plain dev commit made on top of that new state, then settle
- [ ] `e2e/harmony/ci-sync-state.e2e.ts:122` bit ci sync — state model v2 › a developer who snaps and exports from the branch advances the branch's own state › should export an unsnapped edit riding along with a .bitmap commit, immediately
- [ ] `e2e/harmony/ci-sync-state.e2e.ts:147` bit ci sync — state model v2 › a developer who snaps and exports from the branch advances the branch's own state › should settle a plain non-component commit with a ledger commit, moving nothing on the lane
- [ ] `e2e/harmony/ci-sync-state.e2e.ts:186` bit ci sync — state model v2 › a source edit hidden under a later .bitmap-only commit is dev work, not convergence › exports the hidden edit onto the lane instead of declaring convergence
- [ ] `e2e/harmony/ci-sync-state.e2e.ts:194` bit ci sync — state model v2 › a source edit hidden under a later .bitmap-only commit is dev work, not convergence › a second run converges without pushing anything
- [ ] `e2e/harmony/ci-sync-state.e2e.ts:217` bit ci sync — state model v2 › a developer's own .bitmap commit must not launder a branch into deletion › should KEEP a branch whose tip is a developer’s .bitmap commit when the lane is removed, twice
- [ ] `e2e/harmony/ci-sync-state.e2e.ts:256` bit ci sync — state model v2 › a developer's own .bitmap commit must not launder a branch into deletion › should ignore a branch whose .bitmap points at a never-exported lane, not read it as removed
- [ ] `e2e/harmony/ci-sync-state.e2e.ts:299` bit ci sync — state model v2 › a cold runner (fresh clone, empty local scope) reconciles a diverged pair › should merge both sides on a scope that had never seen the lane, then converge warm
- [ ] `e2e/harmony/ci-sync-state.e2e.ts:335` bit ci sync — state model v2 › a cold runner (fresh clone, empty local scope) reconciles a diverged pair › should bring the lane onto the existing branch, also cold, instead of halting
- [ ] `e2e/harmony/ci-sync-state.e2e.ts:350` bit ci sync — state model v2 › a cold runner (fresh clone, empty local scope) reconciles a diverged pair › should export the branch, also cold, instead of halting on a phantom failed switch
- [ ] `e2e/harmony/ci-sync-state.e2e.ts:393` bit ci sync — state model v2 › a single-branch clone reconciles a lane branch its refspec never tracked › should converge on a remote-tracking ref the refspec omitted, populating it and carrying the move
- [ ] `e2e/harmony/ci-sync-state.e2e.ts:437` bit ci sync — state model v2 › untracked files in the workspace are discarded rather than pushed onto the branch › should discard the planted paths from the branch and the working tree, keeping the local scope

### `e2e/harmony/compile.e2e.ts`

- [ ] `e2e/harmony/compile.e2e.ts:33` compile extension › workspace with a new compile extension › compile from the cmd (compilation for development) › should not create a capsule as it is not needed for development
- [ ] `e2e/harmony/compile.e2e.ts:38` compile extension › workspace with a new compile extension › compile from the cmd (compilation for development) › should write the dists files inside the node-modules of the component
- [ ] `e2e/harmony/compile.e2e.ts:50` compile extension › workspace with a new compile extension › compile from the cmd (compilation for development) › the app should work
- [ ] `e2e/harmony/compile.e2e.ts:59` compile extension › workspace with a new compile extension › tag the components (compilation for release) › should write dists files inside the capsule as it is needed for release
- [ ] `e2e/harmony/compile.e2e.ts:64` compile extension › workspace with a new compile extension › tag the components (compilation for release) › should delete previous capsules before the tag (this test is not related to compile)
- [ ] `e2e/harmony/compile.e2e.ts:67` compile extension › workspace with a new compile extension › tag the components (compilation for release) › should save the dists in the objects
- [ ] `e2e/harmony/compile.e2e.ts:84` compile extension › workspace with a new compile extension › tag the components (compilation for release) › export and import to another scope › should not show the component as modified
- [ ] `e2e/harmony/compile.e2e.ts:87` compile extension › workspace with a new compile extension › tag the components (compilation for release) › export and import to another scope › should save the artifacts and package.json on node_modules
- [ ] `e2e/harmony/compile.e2e.ts:93` compile extension › workspace with a new compile extension › tag the components (compilation for release) › export and import to another scope › running compile on the imported component › should generate dists also after deleting the dists from the workspace
- [ ] `e2e/harmony/compile.e2e.ts:120` compile extension › workspace with a new compile extension › add another component that does not need any compilation › should be able to tag
- [ ] `e2e/harmony/compile.e2e.ts:123` compile extension › workspace with a new compile extension › add another component that does not need any compilation › should still save the dists on the component with the compiler
- [ ] `e2e/harmony/compile.e2e.ts:143` compile extension › component with unsupported compiler files › should copy non-supported files to the dists
- [ ] `e2e/harmony/compile.e2e.ts:163` compile extension › component with unsupported compiler files › tag the components › should copy unsupported files inside the capsule
- [ ] `e2e/harmony/compile.e2e.ts:177` compile extension › component with nested directories › the sourceMap should include the path to the nested dir properly
- [ ] `e2e/harmony/compile.e2e.ts:192` compile extension › compile by directory path › should compile a component when given its rootDir path
- [ ] `e2e/harmony/compile.e2e.ts:196` compile extension › compile by directory path › should compile when mixing directory path and component id
- [ ] `e2e/harmony/compile.e2e.ts:201` compile extension › compile by directory path › should compile when path has ./ prefix
- [ ] `e2e/harmony/compile.e2e.ts:214` compile extension › a component whose env provides no compiler › should say the component was not compiled and why, and not report a successful compilation

### `e2e/harmony/component-config.e2e.ts`

- [ ] `e2e/harmony/component-config.e2e.ts:30` component config › eject config › eject for new component › expect to output the path of the config
- [ ] `e2e/harmony/component-config.e2e.ts:40` component config › eject config › eject for new component › component json content › expect to have the component id
- [ ] `e2e/harmony/component-config.e2e.ts:46` component config › eject config › eject for new component › component json content › expect to have the propagate false by default
- [ ] `e2e/harmony/component-config.e2e.ts:49` component config › eject config › eject for new component › component json content › expect to write a component json with no extensions
- [ ] `e2e/harmony/component-config.e2e.ts:61` component config › eject config › eject for new component › using propagate true flag › expect to have the propagate true
- [ ] `e2e/harmony/component-config.e2e.ts:71` component config › eject config › eject for new component › when file already existing › should throw error if override not used
- [ ] `e2e/harmony/component-config.e2e.ts:77` component config › eject config › eject for new component › when file already existing › should success if override used
- [ ] `e2e/harmony/component-config.e2e.ts:92` component config › eject config › eject for new component › when there are variant extensions defined › should not have extensions from models in component.json
- [ ] `e2e/harmony/component-config.e2e.ts:113` component config › eject config › eject for tagged component › should have extensions from models in component.json
- [ ] `e2e/harmony/component-config.e2e.ts:157` component config › propagation › stop on component.json - component.json propagate false › should only has extensions defined in component.json
- [ ] `e2e/harmony/component-config.e2e.ts:170` component config › propagation › stop on variant - component.json propagate true and variant propagate false › should not contain extension from workspace defaults
- [ ] `e2e/harmony/component-config.e2e.ts:173` component config › propagation › stop on variant - component.json propagate true and variant propagate false › should prefer config from component json when there is conflict
- [ ] `e2e/harmony/component-config.e2e.ts:177` component config › propagation › stop on variant - component.json propagate true and variant propagate false › should has extensions from the variant
- [ ] `e2e/harmony/component-config.e2e.ts:189` component config › propagation › propagate all the way - component.json propagate true and variant propagate true › should contain extension from all sources
- [ ] `e2e/harmony/component-config.e2e.ts:192` component config › propagation › propagate all the way - component.json propagate true and variant propagate true › should prefer config from component json when there is conflicts with variant or with workspace defaults
- [ ] `e2e/harmony/component-config.e2e.ts:196` component config › propagation › propagate all the way - component.json propagate true and variant propagate true › should prefer config from variant when there is conflicts with workspace defaults
- [ ] `e2e/harmony/component-config.e2e.ts:200` component config › propagation › propagate all the way - component.json propagate true and variant propagate true › should has extensions from the workspace defaults

### `e2e/harmony/corrupted-objects.e2e.ts`

- [ ] `e2e/harmony/corrupted-objects.e2e.ts:24` objects in scope are corrupted › objects are empty, which are invalid zlib › bit status should throw an error with a suggestion how to fix
- [ ] `e2e/harmony/corrupted-objects.e2e.ts:27` objects in scope are corrupted › objects are empty, which are invalid zlib › bit import --all-history should fix it

### `e2e/harmony/create.e2e.ts`

- [ ] `e2e/harmony/create.e2e.ts:19` create extension › when running outside the workspace › should throw ConsumerNotFound error
- [ ] `e2e/harmony/create.e2e.ts:30` create extension › name with namespace as part of the name and namespace flag › should create the directories properly
- [ ] `e2e/harmony/create.e2e.ts:37` create extension › name with namespace as part of the name and namespace flag › should add the component correctly
- [ ] `e2e/harmony/create.e2e.ts:47` create extension › when a component already exist on that dir › should throw an error
- [ ] `e2e/harmony/create.e2e.ts:62` create extension › when an error is thrown during the add/track phase › should not leave the generated component in the filesystem
- [ ] `e2e/harmony/create.e2e.ts:71` create extension › with an invalid scope-name › should throw InvalidScopeName error
- [ ] `e2e/harmony/create.e2e.ts:83` create extension › with --scope flag › should add the component to the .bitmap file with a new defaultScope prop
- [ ] `e2e/harmony/create.e2e.ts:89` create extension › with --scope flag › bit show should show this scope as the defaultScope
- [ ] `e2e/harmony/create.e2e.ts:100` create extension › with --scope flag › exporting the component › should delete the defaultScope prop from .bitmap
- [ ] `e2e/harmony/create.e2e.ts:114` create extension › with scope as part of the component name (bit.cloud format) › should create the directories properly under the parsed scope
- [ ] `e2e/harmony/create.e2e.ts:121` create extension › with scope as part of the component name (bit.cloud format) › should add the component with the correct name (without scope prefix)
- [ ] `e2e/harmony/create.e2e.ts:125` create extension › with scope as part of the component name (bit.cloud format) › should set the defaultScope to the parsed scope from the component name
- [ ] `e2e/harmony/create.e2e.ts:137` create extension › with env defined inside the template different than the variants › should set the env according to the variant
- [ ] `e2e/harmony/create.e2e.ts:148` create extension › with env defined inside the template when there is no variant › should set the env according to the template env
- [ ] `e2e/harmony/create.e2e.ts:159` create extension › from an inner dir › should not throw
- [ ] `e2e/harmony/create.e2e.ts:179` create extension › external package manager mode › should write dependencies of the component to package.json
- [ ] `e2e/harmony/create.e2e.ts:182` create extension › external package manager mode › should not write dependencies of the env to package.json
- [ ] `e2e/harmony/create.e2e.ts:185` create extension › external package manager mode › should not run installation

### `e2e/harmony/custom-aspects.e2e.ts`

- [ ] `e2e/harmony/custom-aspects.e2e.ts:70` custom aspects › should load the env correctly and use it for the consuming component
- [ ] `e2e/harmony/custom-aspects.e2e.ts:78` custom aspects › when the aspect dependency is loaded from the workspace but the main dependency is loaded from the scope › should load the env correctly and use it for the consuming component
- [ ] `e2e/harmony/custom-aspects.e2e.ts:109` custom aspects › aspect with another aspect as regular dep › when the dep aspect is not configured in workspace.jsonc › should run main aspect provider
- [ ] `e2e/harmony/custom-aspects.e2e.ts:112` custom aspects › aspect with another aspect as regular dep › when the dep aspect is not configured in workspace.jsonc › should not load nor run aspect which is static dep but not configured in workspace.jsonc
- [ ] `e2e/harmony/custom-aspects.e2e.ts:116` custom aspects › aspect with another aspect as regular dep › when the dep aspect is not configured in workspace.jsonc › should not load nor run aspect which is regular dep provider
- [ ] `e2e/harmony/custom-aspects.e2e.ts:127` custom aspects › aspect with another aspect as regular dep › when the dep aspect is configured in workspace.jsonc › should run main aspect provider
- [ ] `e2e/harmony/custom-aspects.e2e.ts:130` custom aspects › aspect with another aspect as regular dep › when the dep aspect is configured in workspace.jsonc › should load and run aspect dep provider
- [ ] `e2e/harmony/custom-aspects.e2e.ts:134` custom aspects › aspect with another aspect as regular dep › when the dep aspect is configured in workspace.jsonc › should not load nor run aspect which is regular dep provider
- [ ] `e2e/harmony/custom-aspects.e2e.ts:166` custom aspects › bit use › should save the aspect in the workspace.jsonc with a version
- [ ] `e2e/harmony/custom-aspects.e2e.ts:228` custom aspects › should load slot-owner once, in the version app-aspect depends on
- [ ] `e2e/harmony/custom-aspects.e2e.ts:232` custom aspects › should let app-aspect read what registrar registered

### `e2e/harmony/custom-env-operations.e2e.ts`

- [ ] `e2e/harmony/custom-env-operations.e2e.ts:30` custom env (config and versioning scenarios) › when the env is tagged and set in workspace.jsonc without exporting it › should be able to re-tag with no errors
- [ ] `e2e/harmony/custom-env-operations.e2e.ts:49` custom env (config and versioning scenarios) › when the env is exported to a remote scope and is not exist locally › bit env-set should not throw any error
- [ ] `e2e/harmony/custom-env-operations.e2e.ts:71` custom env (config and versioning scenarios) › custom-env is 0.0.2 on the workspace, but comp1 is using it in the model with 0.0.1 › bit show should show the correct env
- [ ] `e2e/harmony/custom-env-operations.e2e.ts:75` custom env (config and versioning scenarios) › custom-env is 0.0.2 on the workspace, but comp1 is using it in the model with 0.0.1 › bit show should not show the previous version of the env
- [ ] `e2e/harmony/custom-env-operations.e2e.ts:89` custom env (config and versioning scenarios) › rename custom env › should update components using the custom-env with the new name
- [ ] `e2e/harmony/custom-env-operations.e2e.ts:105` custom env (config and versioning scenarios) › tag custom env then env-set the comp uses it to another non-core env › bit status should not show it as an issue because the previous env was removed
- [ ] `e2e/harmony/custom-env-operations.e2e.ts:122` custom env (config and versioning scenarios) › circular dependencies between an env and a component › should not enter into an infinite loop on any command
- [ ] `e2e/harmony/custom-env-operations.e2e.ts:174` custom env (config and versioning scenarios) › circular dependencies between an env and a theme component used in env mounter › bit status should not enter into an infinite loop
- [ ] `e2e/harmony/custom-env-operations.e2e.ts:188` custom env (config and versioning scenarios) › ejecting conf when current env exists locally › should write the env aspect without a version to the component.json file
- [ ] `e2e/harmony/custom-env-operations.e2e.ts:205` custom env (config and versioning scenarios) › an empty env. nothing is configured, not even a compiler › bit compile should not compile the component and should say why
- [ ] `e2e/harmony/custom-env-operations.e2e.ts:211` custom env (config and versioning scenarios) › an empty env. nothing is configured, not even a compiler › should not create dist dir in the node_modules
- [ ] `e2e/harmony/custom-env-operations.e2e.ts:215` custom env (config and versioning scenarios) › an empty env. nothing is configured, not even a compiler › bit build should not fail
- [ ] `e2e/harmony/custom-env-operations.e2e.ts:219` custom env (config and versioning scenarios) › an empty env. nothing is configured, not even a compiler › bit format should not show an error
- [ ] `e2e/harmony/custom-env-operations.e2e.ts:223` custom env (config and versioning scenarios) › an empty env. nothing is configured, not even a compiler › bit lint should not show an error
- [ ] `e2e/harmony/custom-env-operations.e2e.ts:227` custom env (config and versioning scenarios) › an empty env. nothing is configured, not even a compiler › bit test should not show an error
- [ ] `e2e/harmony/custom-env-operations.e2e.ts:245` custom env (config and versioning scenarios) › an env with a preview/bundler but without a compiler › bit build should not fail generating the preview, and the GeneratePreview task should have run
- [ ] `e2e/harmony/custom-env-operations.e2e.ts:264` custom env (config and versioning scenarios) › custom env with invalid env.jsonc › should throw a descriptive error when a policy entry is not an object
- [ ] `e2e/harmony/custom-env-operations.e2e.ts:280` custom env (config and versioning scenarios) › custom env with invalid env.jsonc › should throw a descriptive error when a policy entry object has no "version" field

### `e2e/harmony/custom-env.e2e.ts`

- [ ] `e2e/harmony/custom-env.e2e.ts:29` custom env › non existing env › bit status should show a descriptive error
- [ ] `e2e/harmony/custom-env.e2e.ts:48` custom env › non loaded env › should show the correct env in bit show (with no loaded indication)
- [ ] `e2e/harmony/custom-env.e2e.ts:54` custom env › non loaded env › should show the correct env in bit envs (with no loaded indication)
- [ ] `e2e/harmony/custom-env.e2e.ts:58` custom env › non loaded env › should show a component issue in bit status
- [ ] `e2e/harmony/custom-env.e2e.ts:79` custom env › custom env with 3 components › tag › should have the correct env in the envs aspect data
- [ ] `e2e/harmony/custom-env.e2e.ts:89` custom env › custom env with 3 components › tag › tag again › should have the correct env in the envs aspect data after additional tag
- [ ] `e2e/harmony/custom-env.e2e.ts:102` custom env › custom env with 3 components › untag › should untag successfully
- [ ] `e2e/harmony/custom-env.e2e.ts:114` custom env › custom env with 3 components › out-of-sync scenario where the id is changed during the process › bit status should not throw ComponentNotFound error
- [ ] `e2e/harmony/custom-env.e2e.ts:131` custom env › change an env after tag › bit status should show it as an issue because the previous env was not removed
- [ ] `e2e/harmony/custom-env.e2e.ts:152` custom env › change an env after tag2 and then change it back to the custom-env in the workspace › should have the correct env
- [ ] `e2e/harmony/custom-env.e2e.ts:204` custom env › should load the env without issue
- [ ] `e2e/harmony/custom-env.e2e.ts:210` custom env › should have the env installed in its root
- [ ] `e2e/harmony/custom-env.e2e.ts:218` custom env › should not create scope aspect capsule
- [ ] `e2e/harmony/custom-env.e2e.ts:229` custom env › another component uses an env version that is not installed › bit status should show the NonLoadedEnv issue rather than loading the installed 0.0.1 as 0.0.2
- [ ] `e2e/harmony/custom-env.e2e.ts:232` custom env › another component uses an env version that is not installed › bit snap should be blocked
- [ ] `e2e/harmony/custom-env.e2e.ts:236` custom env › another component uses an env version that is not installed › bit install should install the requested version and fix the issue
- [ ] `e2e/harmony/custom-env.e2e.ts:273` custom env › setting up the external env without a version › should show a descriptive error when tagging the component
- [ ] `e2e/harmony/custom-env.e2e.ts:286` custom env › set up the env using bit env set without a version › should save it with the latest version in root
- [ ] `e2e/harmony/custom-env.e2e.ts:298` custom env › set up the env using bit env set with a version › should save it with a version in root but without version in envs/envs
- [ ] `e2e/harmony/custom-env.e2e.ts:310` custom env › set up the env using bit create --env with a version › should save it with a version in root but without version in envs/envs
- [ ] `e2e/harmony/custom-env.e2e.ts:324` custom env › set up the env and then unset it › should remove the env not only from envs/envs but also from root
- [ ] `e2e/harmony/custom-env.e2e.ts:339` custom env › set up the env and then replace it with another env without mentioning the version › should save it with a version in root but without version in envs/envs
- [ ] `e2e/harmony/custom-env.e2e.ts:355` custom env › set up the same env with two different versions, then replace with another env › should replace the env for both components
- [ ] `e2e/harmony/custom-env.e2e.ts:372` custom env › tag and change the env version › bit status should show it as modified
- [ ] `e2e/harmony/custom-env.e2e.ts:390` custom env › snapping the env on the lane and then deleting it › bit status should show the RemovedEnv issue
- [ ] `e2e/harmony/custom-env.e2e.ts:393` custom env › snapping the env on the lane and then deleting it › bit envs should show the env as deleted
- [ ] `e2e/harmony/custom-env.e2e.ts:398` custom env › snapping the env on the lane and then deleting it › replacing the env should fix the issue
- [ ] `e2e/harmony/custom-env.e2e.ts:415` custom env › missing modules in the env capsule › should re-create the capsule dir and should not show any warning/error about loading the env
- [ ] `e2e/harmony/custom-env.e2e.ts:419` custom env › missing modules in the env capsule › bit show should show the correct env
- [ ] `e2e/harmony/custom-env.e2e.ts:436` custom env › core-env was set in previous tag and another non-core env is set now › bit status should not show it as an issue

### `e2e/harmony/debug-load.e2e.ts`

- [ ] `e2e/harmony/debug-load.e2e.ts:25` bit debug-load command › component with an env set via workspace variants › human output › should print all four sections
- [ ] `e2e/harmony/debug-load.e2e.ts:31` bit debug-load command › component with an env set via workspace variants › human output › should attribute the env to the variants source
- [ ] `e2e/harmony/debug-load.e2e.ts:35` bit debug-load command › component with an env set via workspace variants › human output › should show load stages with cache info
- [ ] `e2e/harmony/debug-load.e2e.ts:46` bit debug-load command › component with an env set via workspace variants › json output › should emit a valid trace tree with durations
- [ ] `e2e/harmony/debug-load.e2e.ts:51` bit debug-load command › component with an env set via workspace variants › json output › should emit extension sources, env resolution and issues
- [ ] `e2e/harmony/debug-load.e2e.ts:59` bit debug-load command › component with an env set via workspace variants › unknown component id › should fail with a clear error and no stack trace

### `e2e/harmony/deduplication.e2e.ts`

- [ ] `e2e/harmony/deduplication.e2e.ts:120` complex scenario › should install the package version specified in the root workspace manifest to the root node_modules directory
- [ ] `e2e/harmony/deduplication.e2e.ts:123` complex scenario › should install the component version specified in the root workspace manifest to the root node_modules directory
- [ ] `e2e/harmony/deduplication.e2e.ts:128` complex scenario › should install the component version specified in the dependent's policy to the dependent's node_modules directory
- [ ] `e2e/harmony/deduplication.e2e.ts:133` complex scenario › should not install a component to the dependent's node_modules directory if the resolved version matches the version from the root manifest
- [ ] `e2e/harmony/deduplication.e2e.ts:146` complex scenario › should not install a package to the dependent's node_modules directory if the resolved version matches the version from the root manifest
- [ ] `e2e/harmony/deduplication.e2e.ts:151` complex scenario › should install the package from the component's policy, even if a different version of the same package is in the root manifest
- [ ] `e2e/harmony/deduplication.e2e.ts:155` complex scenario › should install the package from the root manifest when the component doesn't have a policy for it

### `e2e/harmony/delete.e2e.ts`

- [ ] `e2e/harmony/delete.e2e.ts:48` bit delete command › bit status should not show RemovedDependencies issues
- [ ] `e2e/harmony/delete.e2e.ts:51` bit delete command › bit snap should not fail due to removedDependencies error, also it should save the correct dep version
- [ ] `e2e/harmony/delete.e2e.ts:58` bit delete command › bit snap output should be relevant for lanes when --lane command used
- [ ] `e2e/harmony/delete.e2e.ts:91` bit delete command › should pin the deleted component to its main version in the workspace policy
- [ ] `e2e/harmony/delete.e2e.ts:98` bit delete command › a plain "bit install" should succeed without the manual "bit install <pkg>" workaround
- [ ] `e2e/harmony/delete.e2e.ts:101` bit delete command › bit status should not show RemovedDependencies issues
- [ ] `e2e/harmony/delete.e2e.ts:123` bit delete command › should not add the deleted component to the workspace policy (no dependents to fix)
- [ ] `e2e/harmony/delete.e2e.ts:144` bit delete command › import a scope with deleted components › should not include deleted components
- [ ] `e2e/harmony/delete.e2e.ts:152` bit delete command › import a scope with deleted components › importing the deleted component explicitly › should import successfully
- [ ] `e2e/harmony/delete.e2e.ts:173` bit delete command › bit checkout reset after local delete › should bring the component back
- [ ] `e2e/harmony/delete.e2e.ts:200` bit delete command › bit checkout head after local delete › should checkout also the deleted component same as it checks out any other modified component
- [ ] `e2e/harmony/delete.e2e.ts:203` bit delete command › bit checkout head after local delete › should write the deleted component files to the filesystem
- [ ] `e2e/harmony/delete.e2e.ts:207` bit delete command › bit checkout head after local delete › bit status should still show the component as deleted
- [ ] `e2e/harmony/delete.e2e.ts:239` bit delete command › deleted component that is also diverged (merge pending) › bit checkout head › should block the checkout as any other diverged component
- [ ] `e2e/harmony/delete.e2e.ts:245` bit delete command › deleted component that is also diverged (merge pending) › bit status › should show the component as both, deleted and merge-pending
- [ ] `e2e/harmony/delete.e2e.ts:255` bit delete command › deleted component that is also diverged (merge pending) › bit reset › should reset the component successfully
- [ ] `e2e/harmony/delete.e2e.ts:280` bit delete command › delete specific snaps › should not show the current snap as deleted
- [ ] `e2e/harmony/delete.e2e.ts:285` bit delete command › delete specific snaps › should show the specific snap as deleted in bit log
- [ ] `e2e/harmony/delete.e2e.ts:293` bit delete command › delete specific snaps › bit list should show the component, because it is not deleted in head
- [ ] `e2e/harmony/delete.e2e.ts:298` bit delete command › delete specific snaps › recovering the component should remove the snaps data
- [ ] `e2e/harmony/delete.e2e.ts:313` bit delete command › delete specific snaps › multiple snaps deletion › should mark multiple snaps as deleted
- [ ] `e2e/harmony/delete.e2e.ts:327` bit delete command › delete specific snaps › importing deleted snaps › should show deleted status for the specific snap when imported
- [ ] `e2e/harmony/delete.e2e.ts:331` bit delete command › delete specific snaps › importing deleted snaps › should not show deleted status for non-deleted snaps
- [ ] `e2e/harmony/delete.e2e.ts:348` bit delete command › delete previous versions › should not show the current version as deleted
- [ ] `e2e/harmony/delete.e2e.ts:353` bit delete command › delete previous versions › should show the previous version as deleted
- [ ] `e2e/harmony/delete.e2e.ts:358` bit delete command › delete previous versions › bit log should show only 0.0.1 as deleted
- [ ] `e2e/harmony/delete.e2e.ts:365` bit delete command › delete previous versions › bit list should show the component, because it is not deleted in head
- [ ] `e2e/harmony/delete.e2e.ts:370` bit delete command › delete previous versions › recovering the component should remove the range data
- [ ] `e2e/harmony/delete.e2e.ts:382` bit delete command › delete previous versions › importing the component › import the latest version should not show the deleted message
- [ ] `e2e/harmony/delete.e2e.ts:386` bit delete command › delete previous versions › importing the component › import the previous version should show the deleted message
- [ ] `e2e/harmony/delete.e2e.ts:400` bit delete command › deleting with --range when it overlaps the current version › should show the component as deleted
- [ ] `e2e/harmony/delete.e2e.ts:405` bit delete command › deleting with --range when it overlaps the current version › when the range is outside the current version it should not show as deleted
- [ ] `e2e/harmony/delete.e2e.ts:427` bit delete command › reset after delete on lane › should reset the deleted component
- [ ] `e2e/harmony/delete.e2e.ts:430` bit delete command › reset after delete on lane › should revert the .bitmap entry of the deleted component as it was before
- [ ] `e2e/harmony/delete.e2e.ts:451` bit delete command › deleting component then creating a new one with the same name › should throw a descriptive error
- [ ] `e2e/harmony/delete.e2e.ts:470` bit delete command › delete and then remove › bit status should not throw an error
- [ ] `e2e/harmony/delete.e2e.ts:481` bit delete command › hard-delete guard in non-interactive sessions › should fail with guidance instead of hanging when a confirmation is needed but there is no TTY
- [ ] `e2e/harmony/delete.e2e.ts:485` bit delete command › hard-delete guard in non-interactive sessions › should block --hard when non-interactive and the hard-delete feature is not enabled, even with --silent
- [ ] `e2e/harmony/delete.e2e.ts:493` bit delete command › hard-delete guard in non-interactive sessions › should allow --hard when the hard-delete feature is explicitly enabled

### `e2e/harmony/dependencies-cmd.e2e.ts`

- [ ] `e2e/harmony/dependencies-cmd.e2e.ts:21` bit dependencies command › bit deps get › running the command on a new component › should not throw an error saying the id is missing from the graph
- [ ] `e2e/harmony/dependencies-cmd.e2e.ts:33` bit dependencies command › bit deps set › adding prod dep › bit show should show the newly added dep
- [ ] `e2e/harmony/dependencies-cmd.e2e.ts:37` bit dependencies command › bit deps set › adding prod dep › bit status should not show a package with a version set in the config as a pinned dependency
- [ ] `e2e/harmony/dependencies-cmd.e2e.ts:46` bit dependencies command › bit deps set › adding prod dep › adding another dep as a devDep › should save the dev in the devDependencies
- [ ] `e2e/harmony/dependencies-cmd.e2e.ts:51` bit dependencies command › bit deps set › adding prod dep › adding another dep as a devDep › should not remove the dep that was added before
- [ ] `e2e/harmony/dependencies-cmd.e2e.ts:61` bit dependencies command › bit deps set › adding prod dep › adding another dep as a devDep › ejecting config and changing a dependency › should not remove the dep that was added before
- [ ] `e2e/harmony/dependencies-cmd.e2e.ts:74` bit dependencies command › bit deps set › adding multiple deps › should set them all
- [ ] `e2e/harmony/dependencies-cmd.e2e.ts:85` bit dependencies command › bit deps set › adding multiple deps › removing them with and without version › should remove them all
- [ ] `e2e/harmony/dependencies-cmd.e2e.ts:100` bit dependencies command › bit deps set › adding scoped package › should set it correctly
- [ ] `e2e/harmony/dependencies-cmd.e2e.ts:113` bit dependencies command › bit deps set › adding prod dep, tagging then adding devDep › should not remove the previously added dependencies
- [ ] `e2e/harmony/dependencies-cmd.e2e.ts:126` bit dependencies command › bit deps set › adding itself as a dep › should ignore it and not consider it as a dependency
- [ ] `e2e/harmony/dependencies-cmd.e2e.ts:141` bit dependencies command › bit deps set › setting an old version of a workspace component › should keep the version from the config when tagging the dependency with it
- [ ] `e2e/harmony/dependencies-cmd.e2e.ts:146` bit dependencies command › bit deps set › setting an old version of a workspace component › bit status should show the version set by the config as an issue that does not block the tag
- [ ] `e2e/harmony/dependencies-cmd.e2e.ts:153` bit dependencies command › bit deps set › setting an old version of a workspace component › tagging the dependency › should not auto-tag the dependent
- [ ] `e2e/harmony/dependencies-cmd.e2e.ts:157` bit dependencies command › bit deps set › setting an old version of a workspace component › tagging the dependency › should show the dependent that was not auto-tagged and the version it keeps
- [ ] `e2e/harmony/dependencies-cmd.e2e.ts:191` bit dependencies command › bit deps set › adding a component dependency when it is not installed locally › bit status should show it as missing
- [ ] `e2e/harmony/dependencies-cmd.e2e.ts:194` bit dependencies command › bit deps set › adding a component dependency when it is not installed locally › bit install should fix it
- [ ] `e2e/harmony/dependencies-cmd.e2e.ts:198` bit dependencies command › bit deps set › adding a component dependency when it is not installed locally › should recognize it as a component after the installation
- [ ] `e2e/harmony/dependencies-cmd.e2e.ts:213` bit dependencies command › bit deps remove - removing components › removing a component › should support component-id syntax
- [ ] `e2e/harmony/dependencies-cmd.e2e.ts:219` bit dependencies command › bit deps remove - removing components › removing a component › should support package-name syntax
- [ ] `e2e/harmony/dependencies-cmd.e2e.ts:234` bit dependencies command › bit deps remove - when other deps were set previously before tag › should remove only the dependency specified and leave the rest
- [ ] `e2e/harmony/dependencies-cmd.e2e.ts:254` bit dependencies command › bit deps unset › one dep was specifically set and one dep was auto-detected › unset the auto-detected › should not remove the dependency
- [ ] `e2e/harmony/dependencies-cmd.e2e.ts:265` bit dependencies command › bit deps unset › one dep was specifically set and one dep was auto-detected › unset the previously deps-set › should remove the dependency
- [ ] `e2e/harmony/dependencies-cmd.e2e.ts:280` bit dependencies command › bit deps usage › finding a dependnecy › should return paths to subdependency

### `e2e/harmony/dependencies.e2e.ts`

- [ ] `e2e/harmony/dependencies.e2e.ts:41` dependencies › import without --fetch-deps › should bring only the imported component, not its dependencies
- [ ] `e2e/harmony/dependencies.e2e.ts:45` dependencies › import without --fetch-deps › bit status should not bring the dependencies during find-cycle process
- [ ] `e2e/harmony/dependencies.e2e.ts:56` dependencies › import with --fetch-deps › should bring not only the imported component, but also its dependencies
- [ ] `e2e/harmony/dependencies.e2e.ts:78` dependencies › a dependency is both in the workspace and set with deps-set › should show the dependency according to the deps-set and not the .bitmap
- [ ] `e2e/harmony/dependencies.e2e.ts:94` dependencies › new dependent using exported dependency › should convert the flattened edge of itself to an id with scope-name
- [ ] `e2e/harmony/dependencies.e2e.ts:114` dependencies › ignoring a dependency using // @bit-ignore › without bit-ignore it should show an issue
- [ ] `e2e/harmony/dependencies.e2e.ts:117` dependencies › ignoring a dependency using // @bit-ignore › with bit-ignore it should not show an issue
- [ ] `e2e/harmony/dependencies.e2e.ts:125` dependencies › ignoring a dependency using // @bit-ignore › with bit-no-check it should ignore the entire file
- [ ] `e2e/harmony/dependencies.e2e.ts:145` dependencies › a file-dependency exists with a different extension › should not show an issue of missing-files because the file could exist later in the dist
- [ ] `e2e/harmony/dependencies.e2e.ts:164` dependencies › changing files to be dev-files from env.jsonc › should clear all components caches and show the dep as a dev-dep

### `e2e/harmony/dependencies/allow-scripts.e2e.ts`

- [ ] `e2e/harmony/dependencies/allow-scripts.e2e.ts:26` by default all scripts are blocked › should not build the dependency
- [ ] `e2e/harmony/dependencies/allow-scripts.e2e.ts:63` setting allow scripts via workspace.jsonc › should build the dependency that is allowed to run scripts
- [ ] `e2e/harmony/dependencies/allow-scripts.e2e.ts:100` setting allow scripts via flags › should have updated the allowScripts setting in workspace.jsonc
- [ ] `e2e/harmony/dependencies/allow-scripts.e2e.ts:106` setting allow scripts via flags › should build the dependency that is allowed to run scripts
- [ ] `e2e/harmony/dependencies/allow-scripts.e2e.ts:157` setting allow scripts via env variable › should not have updated the allowScripts setting in workspace.jsonc
- [ ] `e2e/harmony/dependencies/allow-scripts.e2e.ts:163` setting allow scripts via env variable › should build the dependency that is allowed to run scripts

### `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts`

- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:154` env-jsonc-policies › env-jsonc base policies › affect env › should add peers as runtime deps of the env
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:165` env-jsonc-policies › env-jsonc base policies › affect component › peers effect › should take supported range from env.jsonc for used peers
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:168` env-jsonc-policies › env-jsonc base policies › affect component › peers effect › should not add unused peer deps from env.jsonc
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:177` env-jsonc-policies › env-jsonc base policies › affect component › devs effect › used deps › should remove hidden devs deps configured by env.jsonc
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:183` env-jsonc-policies › env-jsonc base policies › affect component › devs effect › used deps › should save used dep as hidden in the deps resolver deps
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:192` env-jsonc-policies › env-jsonc base policies › affect component › devs effect › used deps › should have used dev deps with the version configured in the env.jsonc in the legacy dev deps
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:195` env-jsonc-policies › env-jsonc base policies › affect component › devs effect › used deps › should install used dev deps specified by the env dev deps
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:203` env-jsonc-policies › env-jsonc base policies › affect component › devs effect › not used deps › should save forced unused dep as hidden in the deps resolver deps
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:212` env-jsonc-policies › env-jsonc base policies › affect component › devs effect › not used deps › should have forced unused dev deps with the version configured in the env.jsonc in the legacy dev deps
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:215` env-jsonc-policies › env-jsonc base policies › affect component › devs effect › not used deps › should install forced unused dev deps specified by the env dev deps
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:227` env-jsonc-policies › env-jsonc base policies › runtime effect › not forced › detected (used) deps › should take version from env.jsonc for used deps without force
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:230` env-jsonc-policies › env-jsonc base policies › runtime effect › not forced › detected (used) deps › should install is-positive specified by the env
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:239` env-jsonc-policies › env-jsonc base policies › runtime effect › not forced › not detected (not used) deps › should not add the dep to the component deps
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:247` env-jsonc-policies › env-jsonc base policies › runtime effect › forced › should take version from env.jsonc for unused deps
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:250` env-jsonc-policies › env-jsonc base policies › runtime effect › forced › should install is-odd specified by the env
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:327` env-jsonc-policies › env-jsonc-extends › new envs › patterns merges › should respect patterns that exists only on first level env
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:330` env-jsonc-policies › env-jsonc-extends › new envs › patterns merges › should respect patterns that exists only on second level env
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:333` env-jsonc-policies › env-jsonc-extends › new envs › patterns merges › should respect (custom) patterns that exists only on third level env
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:337` env-jsonc-policies › env-jsonc-extends › new envs › patterns merges › should not use patterns that defined by the second level and overriden by third level
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:340` env-jsonc-policies › env-jsonc-extends › new envs › patterns merges › should respect patterns that overriden by the third level
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:345` env-jsonc-policies › env-jsonc-extends › new envs › policies merges › should respect peers that exists only on first level env
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:348` env-jsonc-policies › env-jsonc-extends › new envs › policies merges › should respect dev deps that exists only on first level env
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:351` env-jsonc-policies › env-jsonc-extends › new envs › policies merges › should respect peers that overriden by the second level
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:354` env-jsonc-policies › env-jsonc-extends › new envs › policies merges › should respect deps that only defined by the second level
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:357` env-jsonc-policies › env-jsonc-extends › new envs › policies merges › should respect deps that defined by first and overridden by third but not by second
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:360` env-jsonc-policies › env-jsonc-extends › new envs › policies merges › should remove deps added by second, and removed by third
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:363` env-jsonc-policies › env-jsonc-extends › new envs › policies merges › should respect removed by third that added as different dep type
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:390` env-jsonc-policies › env-jsonc-extends › tagged envs › store resolved env manifest (env.jsonc) in the model › first level env › should store the resolved env.jsonc in the model
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:395` env-jsonc-policies › env-jsonc-extends › tagged envs › store resolved env manifest (env.jsonc) in the model › second level env › should have entries resolved from first level
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:403` env-jsonc-policies › env-jsonc-extends › tagged envs › store resolved env manifest (env.jsonc) in the model › second level env › should have entries resolved from self
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:414` env-jsonc-policies › env-jsonc-extends › tagged envs › store resolved env manifest (env.jsonc) in the model › second level env › should not have extends in resolved manifest
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:419` env-jsonc-policies › env-jsonc-extends › tagged envs › store resolved env manifest (env.jsonc) in the model › third level env › should have entries resolved from first level
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:425` env-jsonc-policies › env-jsonc-extends › tagged envs › store resolved env manifest (env.jsonc) in the model › third level env › should have entries resolved from second level
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:431` env-jsonc-policies › env-jsonc-extends › tagged envs › store resolved env manifest (env.jsonc) in the model › third level env › should have entries resolved from self
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:448` env-jsonc-policies › env-jsonc-extends › tagged envs › store resolved env manifest (env.jsonc) in the model › third level env › should not have extends in resolved manifest
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:463` env-jsonc-policies › env-jsonc-extends › tagged envs › change tagged envs › should update the resolved env.jsonc in the ws data
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:472` env-jsonc-policies › env-jsonc-extends › tagged envs › change tagged envs › re-tag modified env (only) › should have the updated version in the model
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:488` env-jsonc-policies › env-jsonc-extends › tagged envs › change tagged envs › re-tag modified env (only) › after import › extends old version of env level2 › should use the old version (and policy) of the env
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:501` env-jsonc-policies › env-jsonc-extends › tagged envs › change tagged envs › re-tag modified env (only) › after import › when importing the updated version of env level2 › should use the old version (and policy) of the env
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:545` env-jsonc-policies › bit update › should update env.jsonc dependency to latest version
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:556` env-jsonc-policies › bit update › should update supportedRange for peerDependencies when new version is outside existing range
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:615` env-jsonc-policies › @types/* package listed as a peer in env.jsonc › should still add regular (non-@types/*) peer deps from env.jsonc to the component
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:618` env-jsonc-policies › @types/* package listed as a peer in env.jsonc › should not add auto-detected @types/* peers to the component peer deps
- [ ] `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts:621` env-jsonc-policies › @types/* package listed as a peer in env.jsonc › should not leak auto-detected @types/* peers into the component runtime or dev deps

### `e2e/harmony/dependencies/forked-env-missing-deps.e2e.ts`

- [ ] `e2e/harmony/dependencies/forked-env-missing-deps.e2e.ts:91` forked env with "+" dependency markers (PR #10150 regression) › fork an env whose dep-resolver config has "+" entries for env peer packages › bit status should not have MissingManuallyConfiguredPackages issue for the forked env
- [ ] `e2e/harmony/dependencies/forked-env-missing-deps.e2e.ts:95` forked env with "+" dependency markers (PR #10150 regression) › fork an env whose dep-resolver config has "+" entries for env peer packages › bit status should not have any component issues

### `e2e/harmony/dependencies/hoisting.e2e.ts`

- [ ] `e2e/harmony/dependencies/hoisting.e2e.ts:28` pnpm with hoisted node linker, when there is a dependency that has the same name as a workspace component › should not override the linked local component with a dependency from the registry
- [ ] `e2e/harmony/dependencies/hoisting.e2e.ts:32` pnpm with hoisted node linker, when there is a dependency that has the same name as a workspace component › should nest the dependency from the registry into the dependent package's node_modules

### `e2e/harmony/dependencies/never-built-dependencies.e2e.ts`

- [ ] `e2e/harmony/dependencies/never-built-dependencies.e2e.ts:30` using pnpm › should not build the dependency

### `e2e/harmony/dependencies/node-gyp.e2e.ts`

- [ ] `e2e/harmony/dependencies/node-gyp.e2e.ts:67` should run its install script through node-gyp

### `e2e/harmony/dependencies/optional-dependencies.e2e.ts`

- [ ] `e2e/harmony/dependencies/optional-dependencies.e2e.ts:51` optional dependencies › affect component › should add optional dependency with optional=true to the model
- [ ] `e2e/harmony/dependencies/optional-dependencies.e2e.ts:55` optional dependencies › affect component › should add optional peer dependency with optional=true to the model
- [ ] `e2e/harmony/dependencies/optional-dependencies.e2e.ts:59` optional dependencies › affect component › should add optionalDependencies and peerDependenciesMeta to package.json
- [ ] `e2e/harmony/dependencies/optional-dependencies.e2e.ts:72` optional dependencies › affect component › should mark optional dependencies in the show command
- [ ] `e2e/harmony/dependencies/optional-dependencies.e2e.ts:88` optional dependencies › affect capsule › should add optionalDependencies and peerDependenciesMeta to package.json
- [ ] `e2e/harmony/dependencies/optional-dependencies.e2e.ts:105` optional dependencies › deps set --optional › should add new dependency to optional dependencies
- [ ] `e2e/harmony/dependencies/optional-dependencies.e2e.ts:108` optional dependencies › deps set --optional › should keep existing optional dependency in optional dependencies
- [ ] `e2e/harmony/dependencies/optional-dependencies.e2e.ts:117` optional dependencies › deps set --optional › deps set --optional after snap › should keep existing optional dependency in optional dependencies
- [ ] `e2e/harmony/dependencies/optional-dependencies.e2e.ts:121` optional dependencies › deps set --optional › deps set --optional after snap › should add new dependency to optional dependencies

### `e2e/harmony/dependencies/policies-order.e2e.ts`

- [ ] `e2e/harmony/dependencies/policies-order.e2e.ts:39` policies order › deps set order › should install is-positive specified by the deps set
- [ ] `e2e/harmony/dependencies/policies-order.e2e.ts:75` policies order › env own dependency › should install react specified in env itself

### `e2e/harmony/dependency-resolver.e2e.ts`

- [ ] `e2e/harmony/dependency-resolver.e2e.ts:55` dependency-resolver extension › policies changes › policies added by the user › should have the updated dependencies for bar/foo
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:60` dependency-resolver extension › policies changes › policies added by the user › should not put the dependencies for not configured component
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:79` dependency-resolver extension › policies changes › policies added by an env › policies added core env › should have the updated dependencies for bar/foo from the env
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:103` dependency-resolver extension › policies changes › policies added by an env › policies added by custom env › should have the updated dependencies for bar/foo from the env
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:107` dependency-resolver extension › policies changes › policies added by an env › policies added by custom env › auto detect peers policy › should resolve version for auto detected peers when used by the component from the env
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:110` dependency-resolver extension › policies changes › policies added by an env › policies added by custom env › auto detect peers policy › should not add peers when component is not using them
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:143` dependency-resolver extension › policies changes › policies added by extension › extension that add simple dependency policy › should have the updated dependencies for bar/foo
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:148` dependency-resolver extension › policies changes › policies added by extension › extension that add simple dependency policy › should not put the dependencies for not configured component
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:168` dependency-resolver extension › should save the packageName data into the dependencyResolver extension in the model
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:183` dependency-resolver extension › exporting the component › should change the component id to include the scope name
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:225` dependency-resolver extension › overrides › using pnpm as a package manager › should force a newer version of a subdependency using just the dependency name
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:229` dependency-resolver extension › overrides › using pnpm as a package manager › should force a newer version of a subdependency using the dependency name and version
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:232` dependency-resolver extension › overrides › using pnpm as a package manager › should not change the version of the package if the parent package does not match the pattern
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:235` dependency-resolver extension › overrides › using pnpm as a package manager › should change the version of the package if the parent package matches the pattern
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:254` dependency-resolver extension › hoist patterns › should run pnpm with the specified hoist pattern
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:264` dependency-resolver extension › hoist patterns › hoist injected dependencies › should run pnpm with the specified hoist pattern
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:283` dependency-resolver extension › install without readPackage hooks › should record no pnpmfileChecksum
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:286` dependency-resolver extension › install without readPackage hooks › should record the override that removes @teambit/legacy from the dependencies
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:289` dependency-resolver extension › install without readPackage hooks › should not mark a readPackage hook as untracked
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:339` dependency-resolver extension › should not break and save the policy correctly with the plus
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:347` dependency-resolver extension › making a new version of the env dep › should update the dep in the env model
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:350` dependency-resolver extension › making a new version of the env dep › should be able to install the env on a new workspace with no errors
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:361` dependency-resolver extension › making a new version of the env dep › should be able to import the env on a new workspace and tag with no errors
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:393` dependency-resolver extension › env.jsonc with policy.peer version="+" and a dependent › should not break bit build and should resolve the "+" version to the actual component version in the manifest
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:447` dependency-resolver extension › should not break and save the policy correctly with the *
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:456` dependency-resolver extension › publishing a new version of the package and re-tagging › should update the dep in the env model
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:459` dependency-resolver extension › publishing a new version of the package and re-tagging › should be able to install the env on a new workspace with no errors and install the latest of the pkg dep
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:503` dependency-resolver extension › should save the dependencies with rangePrefix
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:510` dependency-resolver extension › installing a component should have the dependencies with range in the package.json
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:528` dependency-resolver extension › workspace with only the dependent › should keep the dependency with the range
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:551` dependency-resolver extension › component-package exists in workspace.jsonc › should keep the dependency with the range
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:565` dependency-resolver extension › removing componentRangePrefix from the workspace › should keep the dependency with the range
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:579` dependency-resolver extension › revert the range by setting the prefix to minus › should save the dependency without the range
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:598` dependency-resolver extension › range in config conflicts the actual range in policy › the range in policy should win
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:638` dependency-resolver extension › tagging the dependent only › should save the prefix according to how the user saved it via bit-deps-set
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:652` dependency-resolver extension › tagging both the dependent and the dependency › should not save any prefix
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:672` dependency-resolver extension › component range support with snaps › when snapping with ^ prefix › should not apply ^ prefix to snap versions in dependency data
- [ ] `e2e/harmony/dependency-resolver.e2e.ts:682` dependency-resolver extension › component range support with snaps › when snapping with ^ prefix › generated package.json should not have invalid semver with ^ prefix

### `e2e/harmony/deprecate.e2e.ts`

- [x] `e2e/harmony/deprecate.e2e.ts:22` bit deprecate and undeprecate commands › deprecate tagged component › bit show should show the component as deprecated — `harmony::deprecation::tagged_deprecation_marks_the_component_modified_and_survives_tagging`
- [x] `e2e/harmony/deprecate.e2e.ts:26` bit deprecate and undeprecate commands › deprecate tagged component › bit status should show the component as modified — `harmony::deprecation::tagged_deprecation_marks_the_component_modified_and_survives_tagging`
- [x] `e2e/harmony/deprecate.e2e.ts:35` bit deprecate and undeprecate commands › deprecate tagged component › tagging the component › the component should not be modified — `harmony::deprecation::tagged_deprecation_marks_the_component_modified_and_survives_tagging`
- [x] `e2e/harmony/deprecate.e2e.ts:39` bit deprecate and undeprecate commands › deprecate tagged component › tagging the component › bit show should show the component as deprecated — `harmony::deprecation::tagged_deprecation_marks_the_component_modified_and_survives_tagging`
- [x] `e2e/harmony/deprecate.e2e.ts:43` bit deprecate and undeprecate commands › deprecate tagged component › tagging the component › .bitmap should not containing the config — `harmony::deprecation::tagged_deprecation_marks_the_component_modified_and_survives_tagging`
- [x] `e2e/harmony/deprecate.e2e.ts:47` bit deprecate and undeprecate commands › deprecate tagged component › tagging the component › bit list should show the component as deprecated — `harmony::deprecation::tagged_deprecation_marks_the_component_modified_and_survives_tagging`
- [x] `e2e/harmony/deprecate.e2e.ts:56` bit deprecate and undeprecate commands › deprecate tagged component › tagging the component › exporting the component › should delete the config from the .bitmap file. — `harmony::deprecation::lifecycle::exported_deprecation_clears_bitmap_config_and_is_reported_by_remote_list_and_import`
- [ ] `e2e/harmony/deprecate.e2e.ts:67` bit deprecate and undeprecate commands › deprecate tagged component › tagging the component › exporting the component › testing some config-merge › should not delete the deprecation data from the config — Upstream `it.skip`: the documented config-merge bug is not claimed as a successful port.
- [x] `e2e/harmony/deprecate.e2e.ts:79` bit deprecate and undeprecate commands › deprecate tagged component › tagging the component › exporting the component › importing a deprecated component › should indicate that the component is deprecated — `harmony::deprecation::lifecycle::exported_deprecation_clears_bitmap_config_and_is_reported_by_remote_list_and_import`
- [x] `e2e/harmony/deprecate.e2e.ts:88` bit deprecate and undeprecate commands › deprecate tagged component › tagging the component › exporting the component › bit list of a remote deprecated component › should indicate that the component is deprecated — `harmony::deprecation::lifecycle::exported_deprecation_clears_bitmap_config_and_is_reported_by_remote_list_and_import`
- [x] `e2e/harmony/deprecate.e2e.ts:101` bit deprecate and undeprecate commands › deprecate tagged component › tagging the component › exporting the component › importing all scope › should not include deprecated by default — `harmony::deprecation::lifecycle::wildcard_import_excludes_deprecated_components_unless_requested`
- [x] `e2e/harmony/deprecate.e2e.ts:112` bit deprecate and undeprecate commands › deprecate tagged component › tagging the component › exporting the component › importing all scope with --include-deprecated flag › should include deprecated — `harmony::deprecation::lifecycle::wildcard_import_excludes_deprecated_components_unless_requested`
- [x] `e2e/harmony/deprecate.e2e.ts:130` bit deprecate and undeprecate commands › deprecate and undeprecate multiple components by pattern › deprecating all components with a wildcard pattern › should indicate that multiple components were deprecated — `harmony::deprecation::wildcard_deprecation_and_undeprecation_change_every_matched_component`
- [x] `e2e/harmony/deprecate.e2e.ts:133` bit deprecate and undeprecate commands › deprecate and undeprecate multiple components by pattern › deprecating all components with a wildcard pattern › should mark all matched components as deprecated — `harmony::deprecation::wildcard_deprecation_and_undeprecation_change_every_matched_component`
- [x] `e2e/harmony/deprecate.e2e.ts:145` bit deprecate and undeprecate commands › deprecate and undeprecate multiple components by pattern › undeprecating multiple components with a wildcard pattern › should indicate that multiple components were undeprecated — `harmony::deprecation::wildcard_deprecation_and_undeprecation_change_every_matched_component`
- [x] `e2e/harmony/deprecate.e2e.ts:148` bit deprecate and undeprecate commands › deprecate and undeprecate multiple components by pattern › undeprecating multiple components with a wildcard pattern › should remove the deprecation status from all of them — `harmony::deprecation::wildcard_deprecation_and_undeprecation_change_every_matched_component`
- [x] `e2e/harmony/deprecate.e2e.ts:156` bit deprecate and undeprecate commands › deprecate and undeprecate multiple components by pattern › using --new-id when the pattern matches more than one component › should throw an error — `harmony::deprecation::wildcard_replacement_and_invalid_range_errors_do_not_publish_invalid_config`
- [x] `e2e/harmony/deprecate.e2e.ts:170` bit deprecate and undeprecate commands › undeprecating components that are not deprecated by pattern › should indicate that no changes were made — `harmony::deprecation::undeprecating_unmodified_components_is_a_noop_and_checkout_reset_clears_staged_deprecation`
- [x] `e2e/harmony/deprecate.e2e.ts:173` bit deprecate and undeprecate commands › undeprecating components that are not deprecated by pattern › should not write a deprecation config nor mark the components as modified — `harmony::deprecation::undeprecating_unmodified_components_is_a_noop_and_checkout_reset_clears_staged_deprecation`
- [x] `e2e/harmony/deprecate.e2e.ts:188` bit deprecate and undeprecate commands › undeprecating a range-deprecation by pattern › should undeprecate the range-deprecated component (not bucket it as "not deprecated") — `harmony::deprecation::ranges::undeprecation_clears_a_range_even_when_deprecate_boolean_is_false`
- [x] `e2e/harmony/deprecate.e2e.ts:191` bit deprecate and undeprecate commands › undeprecating a range-deprecation by pattern › should clear the range from the deprecation config — `harmony::deprecation::ranges::undeprecation_clears_a_range_even_when_deprecate_boolean_is_false`
- [x] `e2e/harmony/deprecate.e2e.ts:209` bit deprecate and undeprecate commands › reverting the deprecation by "bit checkout reset" › should remove the deprecation config — `harmony::deprecation::undeprecating_unmodified_components_is_a_noop_and_checkout_reset_clears_staged_deprecation`
- [x] `e2e/harmony/deprecate.e2e.ts:224` bit deprecate and undeprecate commands › deprecate previous versions › should not show the current version as deprecated — `harmony::deprecation::ranges::persisted_ranges_deprecate_only_selected_versions_and_imports_report_them`
- [x] `e2e/harmony/deprecate.e2e.ts:229` bit deprecate and undeprecate commands › deprecate previous versions › should show the previous version as deprecated — `harmony::deprecation::ranges::persisted_ranges_deprecate_only_selected_versions_and_imports_report_them`
- [x] `e2e/harmony/deprecate.e2e.ts:234` bit deprecate and undeprecate commands › deprecate previous versions › bit list should not show the component as deprecated — `harmony::deprecation::ranges::persisted_ranges_deprecate_only_selected_versions_and_imports_report_them`
- [x] `e2e/harmony/deprecate.e2e.ts:239` bit deprecate and undeprecate commands › deprecate previous versions › un-deprecating the component should remove the range data — `harmony::deprecation::ranges::persisted_ranges_deprecate_only_selected_versions_and_imports_report_them`
- [x] `e2e/harmony/deprecate.e2e.ts:251` bit deprecate and undeprecate commands › deprecate previous versions › importing the component › import the latest version should not show the deprecated message — `harmony::deprecation::ranges::persisted_ranges_deprecate_only_selected_versions_and_imports_report_them`
- [x] `e2e/harmony/deprecate.e2e.ts:255` bit deprecate and undeprecate commands › deprecate previous versions › importing the component › import the previous version should show the deprecated message — `harmony::deprecation::ranges::persisted_ranges_deprecate_only_selected_versions_and_imports_report_them`
- [x] `e2e/harmony/deprecate.e2e.ts:271` bit deprecate and undeprecate commands › deprecate previous versions with --range before snapping (staged) › bit log should show the in-range version as deprecated even before snapping — `harmony::deprecation::ranges::unstaged_ranges_are_reflected_in_log_and_undeprecation_clears_them`
- [x] `e2e/harmony/deprecate.e2e.ts:282` bit deprecate and undeprecate commands › deprecate previous versions with --range before snapping (staged) › un-deprecating before snapping › bit log should no longer show the version as deprecated — `harmony::deprecation::ranges::unstaged_ranges_are_reflected_in_log_and_undeprecation_clears_them`
- [x] `e2e/harmony/deprecate.e2e.ts:295` bit deprecate and undeprecate commands › deprecate with an invalid --range › should throw a clear error instead of persisting an invalid range — `harmony::deprecation::wildcard_replacement_and_invalid_range_errors_do_not_publish_invalid_config`
- [x] `e2e/harmony/deprecate.e2e.ts:307` bit deprecate and undeprecate commands › deprecating with --range when it overlaps the current version › should show the component as deprecated — `harmony::deprecation::ranges::ranges_covering_current_version_stop_applying_after_a_major_release`
- [x] `e2e/harmony/deprecate.e2e.ts:312` bit deprecate and undeprecate commands › deprecating with --range when it overlaps the current version › when the range is outside the current version it should not show as deprecated — `harmony::deprecation::ranges::ranges_covering_current_version_stop_applying_after_a_major_release`
- [x] `e2e/harmony/deprecate.e2e.ts:327` bit deprecate and undeprecate commands › using deprecated components › bit status should show the DeprecatedDependencies component-issue — `harmony::deprecation::lifecycle::deprecated_dependency_issues_follow_the_dependent_and_dependency_status`
- [x] `e2e/harmony/deprecate.e2e.ts:334` bit deprecate and undeprecate commands › using deprecated components › deprecating the dependent component as well (before tag) › bit status should not show the DeprecatedDependencies component-issue — `harmony::deprecation::lifecycle::deprecated_dependency_issues_follow_the_dependent_and_dependency_status`
- [x] `e2e/harmony/deprecate.e2e.ts:347` bit deprecate and undeprecate commands › using deprecated components › deprecating the dependent component as well (after tag and export) › bit status should not show the DeprecatedDependencies component-issue — `harmony::deprecation::lifecycle::deprecated_dependency_issues_follow_the_dependent_and_dependency_status`
- [x] `e2e/harmony/deprecate.e2e.ts:360` bit deprecate and undeprecate commands › using deprecated components › un-deprecating it › bit status should not show the DeprecatedDependencies component-issue anymore — `harmony::deprecation::lifecycle::deprecated_dependency_issues_follow_the_dependent_and_dependency_status`

### `e2e/harmony/deps-graph-isolation.e2e.ts`

- [ ] `e2e/harmony/deps-graph-isolation.e2e.ts:92` dev and optional dependencies round-trip through the graph › should record the dev-only dependency in the graph with lifecycle=dev
- [ ] `e2e/harmony/deps-graph-isolation.e2e.ts:98` dev and optional dependencies round-trip through the graph › should record the runtime dependency in the graph with lifecycle=runtime
- [ ] `e2e/harmony/deps-graph-isolation.e2e.ts:104` dev and optional dependencies round-trip through the graph › should restore the lockfile from the graph
- [ ] `e2e/harmony/deps-graph-isolation.e2e.ts:183` isolating components when only some model graphs exist › should populate missing component graphs from the capsule lockfile
- [ ] `e2e/harmony/deps-graph-isolation.e2e.ts:194` isolating components when only some model graphs exist › should save the regenerated graph to the model when the original component is enriched
- [ ] `e2e/harmony/deps-graph-isolation.e2e.ts:223` snap/tag with --no-lock-deps › should attach the dependencies graph to the snap by default
- [ ] `e2e/harmony/deps-graph-isolation.e2e.ts:226` snap/tag with --no-lock-deps › should not attach the dependencies graph to the snap when --no-lock-deps is set
- [ ] `e2e/harmony/deps-graph-isolation.e2e.ts:229` snap/tag with --no-lock-deps › should attach the dependencies graph to the tag by default
- [ ] `e2e/harmony/deps-graph-isolation.e2e.ts:232` snap/tag with --no-lock-deps › should not attach the dependencies graph to the tag when --no-lock-deps is set

### `e2e/harmony/deps-graph-reimport.e2e.ts`

- [ ] `e2e/harmony/deps-graph-reimport.e2e.ts:85` re-importing an updated version of an already-imported component › should preserve comp2 dependency versions that are unrelated to the re-imported component
- [ ] `e2e/harmony/deps-graph-reimport.e2e.ts:171` three components sharing a peer dependency › should restore the lockfile from the merged graphs
- [ ] `e2e/harmony/deps-graph-reimport.e2e.ts:176` three components sharing a peer dependency › should include the highest version of the shared peer dependency across all three graphs

### `e2e/harmony/deps-graph.e2e.ts`

- [ ] `e2e/harmony/deps-graph.e2e.ts:141` two components with different peer dependencies › should save dependencies graph to the model of comp1
- [ ] `e2e/harmony/deps-graph.e2e.ts:156` two components with different peer dependencies › should save dependencies graph to the model comp2
- [ ] `e2e/harmony/deps-graph.e2e.ts:175` two components with different peer dependencies › should replace pending version in direct dependency
- [ ] `e2e/harmony/deps-graph.e2e.ts:184` two components with different peer dependencies › should update integrity of dependency component
- [ ] `e2e/harmony/deps-graph.e2e.ts:188` two components with different peer dependencies › should add component ID to the deps graph
- [ ] `e2e/harmony/deps-graph.e2e.ts:201` two components with different peer dependencies › importing a component that depends on another component and was export together with that component › should generate a lockfile
- [ ] `e2e/harmony/deps-graph.e2e.ts:205` two components with different peer dependencies › importing a component that depends on another component and was export together with that component › should import the component with its own resolved versions
- [ ] `e2e/harmony/deps-graph.e2e.ts:277` two components exported with different peer dependencies using the same env › should generate a lockfile
- [ ] `e2e/harmony/deps-graph.e2e.ts:281` two components exported with different peer dependencies using the same env › should resolve to one version of the peer dependency, the highest one
- [ ] `e2e/harmony/deps-graph.e2e.ts:287` two components exported with different peer dependencies using the same env › imported component is not installed as a dependency
- [ ] `e2e/harmony/deps-graph.e2e.ts:351` importing a component into a workspace that already has an installed component › first import should restore the lockfile from comp1 graph
- [ ] `e2e/harmony/deps-graph.e2e.ts:355` importing a component into a workspace that already has an installed component › second import should include comp2 deps at the versions stored in its graph
- [ ] `e2e/harmony/deps-graph.e2e.ts:361` importing a component into a workspace that already has an installed component › second import should preserve comp1 deps at their previously-locked versions
- [ ] `e2e/harmony/deps-graph.e2e.ts:415` bit install --restore rebuilds the lockfile from workspace component graphs › should mark the regenerated lockfile as restoredFromModel
- [ ] `e2e/harmony/deps-graph.e2e.ts:418` bit install --restore rebuilds the lockfile from workspace component graphs › should keep both components locked to the versions stored in their graphs
- [ ] `e2e/harmony/deps-graph.e2e.ts:474` bit install --restore works when the DEPS_GRAPH feature toggle is disabled › should still restore the lockfile from the stored graph

### `e2e/harmony/deps-in-capsules.e2e.ts`

- [ ] `e2e/harmony/deps-in-capsules.e2e.ts:58` using pnpm › bit show should show the correct env
- [ ] `e2e/harmony/deps-in-capsules.e2e.ts:64` using pnpm › all packages are correctly installed inside capsules
- [ ] `e2e/harmony/deps-in-capsules.e2e.ts:68` using pnpm › should add self-references to components

### `e2e/harmony/deps-write.e2e.ts`

- [ ] `e2e/harmony/deps-write.e2e.ts:35` dependencies write › using deps write command › should add dependencies to workspace.jsonc
- [ ] `e2e/harmony/deps-write.e2e.ts:38` dependencies write › using deps write command › should add dependencies to package.json
- [ ] `e2e/harmony/deps-write.e2e.ts:48` dependencies write › using import command › should add dependencies to package.json

### `e2e/harmony/dev-files.e2e.ts`

- [ ] `e2e/harmony/dev-files.e2e.ts:38` dev files › custom env that changes dev files patterns › should show registered custom dev file as dev file
- [ ] `e2e/harmony/dev-files.e2e.ts:44` dev files › custom env that changes dev files patterns › test files › should show registered custom test file as dev file
- [ ] `e2e/harmony/dev-files.e2e.ts:48` dev files › custom env that changes dev files patterns › test files › should not show default test file as dev file
- [ ] `e2e/harmony/dev-files.e2e.ts:53` dev files › custom env that changes dev files patterns › should show registered custom docs file as dev file
- [ ] `e2e/harmony/dev-files.e2e.ts:57` dev files › custom env that changes dev files patterns › should show registered custom composition file as dev file

### `e2e/harmony/diff-component-peer.e2e.ts`

- [ ] `e2e/harmony/diff-component-peer.e2e.ts:27` bit diff with a component-level peer dependency › bit status should not show the component as modified
- [ ] `e2e/harmony/diff-component-peer.e2e.ts:30` bit diff with a component-level peer dependency › bit diff should not show a phantom peer-dependency change

### `e2e/harmony/eject-harmony.e2e.ts`

- [ ] `e2e/harmony/eject-harmony.e2e.ts:45` eject command on Harmony › eject with the default options › should indicate that the eject was successful
- [ ] `e2e/harmony/eject-harmony.e2e.ts:48` eject command on Harmony › eject with the default options › should save the component in workspace.jsonc
- [ ] `e2e/harmony/eject-harmony.e2e.ts:54` eject command on Harmony › eject with the default options › should have the component files as a package (in node_modules)
- [ ] `e2e/harmony/eject-harmony.e2e.ts:58` eject command on Harmony › eject with the default options › should delete the original component files from the file-system
- [ ] `e2e/harmony/eject-harmony.e2e.ts:61` eject command on Harmony › eject with the default options › should delete the component from bit.map
- [ ] `e2e/harmony/eject-harmony.e2e.ts:65` eject command on Harmony › eject with the default options › bit status should show a clean state
- [ ] `e2e/harmony/eject-harmony.e2e.ts:68` eject command on Harmony › eject with the default options › should not delete the objects from the scope
- [ ] `e2e/harmony/eject-harmony.e2e.ts:81` eject command on Harmony › eject with --keep-files flag › should keep the original component files from the file-system intact

### `e2e/harmony/env.e2e.ts`

- [ ] `e2e/harmony/env.e2e.ts:45` env command › bit env set › run bit env set and then tag when the variants points to another env › should not be modified
- [ ] `e2e/harmony/env.e2e.ts:49` env command › bit env set › run bit env set and then tag when the variants points to another env › should not change the env to the variants one
- [ ] `e2e/harmony/env.e2e.ts:53` env command › bit env set › run bit env set and then tag when the variants points to another env › ejecting the conf to component.json should not write internal fields
- [ ] `e2e/harmony/env.e2e.ts:66` env command › bit env set › run bit env set X and then bit env set Y › should replace the env with the last one and remove the first one
- [ ] `e2e/harmony/env.e2e.ts:78` env command › bit env set › run bit env set when there is a component.json › should write the env into the component.json file
- [ ] `e2e/harmony/env.e2e.ts:82` env command › bit env set › run bit env set when there is a component.json › should not add "config" to the .bitmap file
- [ ] `e2e/harmony/env.e2e.ts:86` env command › bit env set › run bit env set when there is a component.json › should set the new env correctly
- [ ] `e2e/harmony/env.e2e.ts:94` env command › bit env set › run bit env set when there is a component.json › run bit env unset › should unset the env correctly
- [ ] `e2e/harmony/env.e2e.ts:98` env command › bit env set › run bit env set when there is a component.json › run bit env unset › should remove the env from the component.json file
- [ ] `e2e/harmony/env.e2e.ts:111` env command › bit env set › run bit env unset on component without env config in .bitmap › should indicate that there was no env config in .bitmap to remove
- [ ] `e2e/harmony/env.e2e.ts:117` env command › bit env set › run bit env unset on component without env config in .bitmap › should not change the bitmap file
- [ ] `e2e/harmony/env.e2e.ts:134` env command › env defined only by a .bit-env plugin file, before it was ever loaded › bit env set should recognize it as an env
- [ ] `e2e/harmony/env.e2e.ts:137` env command › env defined only by a .bit-env plugin file, before it was ever loaded › the env should be loaded as an aspect and set as the component env
- [ ] `e2e/harmony/env.e2e.ts:140` env command › env defined only by a .bit-env plugin file, before it was ever loaded › bit snap should work
- [ ] `e2e/harmony/env.e2e.ts:156` env command › component using a .bit-env plugin-file env should have a clean status › should not warn that the env is not of type env
- [ ] `e2e/harmony/env.e2e.ts:162` env command › component using a .bit-env plugin-file env should have a clean status › should have no component issues at all
- [ ] `e2e/harmony/env.e2e.ts:178` env command › bit env replace › replacing a failed-loaded env › should be able to replace with no errors
- [ ] `e2e/harmony/env.e2e.ts:234` the env should use the empty-env and the components should use the env
- [ ] `e2e/harmony/env.e2e.ts:238` should apply the env to the components in the workspace
- [ ] `e2e/harmony/env.e2e.ts:243` should run in the workspace without compilation
- [ ] `e2e/harmony/env.e2e.ts:246` should have no component issues
- [ ] `e2e/harmony/env.e2e.ts:254` tag, publish and export › should generate a package.json with the env props, main pointing to the source and the component deps
- [ ] `e2e/harmony/env.e2e.ts:261` tag, publish and export › should work when installed as a package in a new workspace
- [ ] `e2e/harmony/env.e2e.ts:275` tag, publish and export › importing the component into a new workspace › should load the env from its package, with no issues
- [ ] `e2e/harmony/env.e2e.ts:279` tag, publish and export › importing the component into a new workspace › should run the imported component
- [ ] `e2e/harmony/env.e2e.ts:292` tag, publish and export › importing the component into a new workspace › when the workspace loads its envs from the scope › should load the env, with no issues
- [ ] `e2e/harmony/env.e2e.ts:296` tag, publish and export › importing the component into a new workspace › when the workspace loads its envs from the scope › should apply the env when tagging the imported component

### `e2e/harmony/export-harmony.e2e.ts`

- [ ] `e2e/harmony/export-harmony.e2e.ts:26` export functionality on Harmony › export, re-init the remote scope, tag and export › should throw ExportMissingVersions error on export
- [ ] `e2e/harmony/export-harmony.e2e.ts:31` export functionality on Harmony › export, re-init the remote scope, tag and export › should enable exporting with --all-versions flag
- [ ] `e2e/harmony/export-harmony.e2e.ts:45` export functionality on Harmony › export, tag and export › should not delete the first version
- [ ] `e2e/harmony/export-harmony.e2e.ts:48` export functionality on Harmony › export, tag and export › should update the VersionHistory on the remote
- [ ] `e2e/harmony/export-harmony.e2e.ts:56` export functionality on Harmony › export, tag and export › should enable un-tagging after a new tag
- [ ] `e2e/harmony/export-harmony.e2e.ts:80` export functionality on Harmony › when version history is out of date › bit export should not throw about missing data

### `e2e/harmony/extensions-config-diff.e2e.ts`

- [ ] `e2e/harmony/extensions-config-diff.e2e.ts:40` extensions config diff › component status and diff › add new extension › should make the component modified
- [ ] `e2e/harmony/extensions-config-diff.e2e.ts:44` extensions config diff › component status and diff › add new extension › should show it in bit diff
- [ ] `e2e/harmony/extensions-config-diff.e2e.ts:56` extensions config diff › component status and diff › add new extension › bit diff should not show internal config fields
- [ ] `e2e/harmony/extensions-config-diff.e2e.ts:67` extensions config diff › component status and diff › remove extension › should make the component modified
- [ ] `e2e/harmony/extensions-config-diff.e2e.ts:71` extensions config diff › component status and diff › remove extension › should show it in bit diff
- [ ] `e2e/harmony/extensions-config-diff.e2e.ts:87` extensions config diff › component status and diff › change extension config › should make the component modified
- [ ] `e2e/harmony/extensions-config-diff.e2e.ts:91` extensions config diff › component status and diff › change extension config › should show it in bit diff

### `e2e/harmony/extensions-config.e2e.ts`

- [ ] `e2e/harmony/extensions-config.e2e.ts:38` harmony extension config › persist extension config (provided by the user)to models › core extensions › should persist core extension config during tag
- [ ] `e2e/harmony/extensions-config.e2e.ts:42` harmony extension config › persist extension config (provided by the user)to models › core extensions › should not have version for core extension in the models
- [ ] `e2e/harmony/extensions-config.e2e.ts:45` harmony extension config › persist extension config (provided by the user)to models › core extensions › should not insert core extensions into the component dev deps
- [ ] `e2e/harmony/extensions-config.e2e.ts:70` harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › should not allow tagging the component without tagging the extensions
- [ ] `e2e/harmony/extensions-config.e2e.ts:89` harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › removing the extension with "-" › should have the extension defined on the component
- [ ] `e2e/harmony/extensions-config.e2e.ts:92` harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › removing the extension with "-" › should not have the extension defined on the component
- [ ] `e2e/harmony/extensions-config.e2e.ts:107` harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › tagging extension and component together › should have version for extension in the component models when tagging with the component
- [ ] `e2e/harmony/extensions-config.e2e.ts:110` harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › tagging extension and component together › should persist extension config during tag
- [ ] `e2e/harmony/extensions-config.e2e.ts:113` harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › tagging extension and component together › should not insert extensions into the component dev deps
- [ ] `e2e/harmony/extensions-config.e2e.ts:116` harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › tagging extension and component together › should insert extensions flattened dependencies into the component flattened dependencies
- [ ] `e2e/harmony/extensions-config.e2e.ts:120` harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › tagging extension and component together › should auto tag the component when tagging the extension again
- [ ] `e2e/harmony/extensions-config.e2e.ts:138` harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › tagging extension then component › should have version for extension in the component models when tagging the extension before component
- [ ] `e2e/harmony/extensions-config.e2e.ts:141` harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › tagging extension then component › should not insert the pre-tagged extension into the component dev deps
- [ ] `e2e/harmony/extensions-config.e2e.ts:157` harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › exporting component with extension › should block exporting component without exporting the extension
- [ ] `e2e/harmony/extensions-config.e2e.ts:171` harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › exporting component with extension › exporting extension and component together › should update extension scope in the component when exporting together
- [ ] `e2e/harmony/extensions-config.e2e.ts:186` harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › exporting component with extension › exporting extension then exporting component › should update extension scope in the component when exporting component after exporting the extension
- [ ] `e2e/harmony/extensions-config.e2e.ts:208` harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › imported component › should auto-import the extensions as well
- [ ] `e2e/harmony/extensions-config.e2e.ts:233` harmony extension config › changing config after the component had been cached › should show the updated dependency data and not the old data from the cache

### `e2e/harmony/fork.e2e.ts`

- [ ] `e2e/harmony/fork.e2e.ts:22` bit fork command › fork a local component › should create a new component
- [ ] `e2e/harmony/fork.e2e.ts:26` bit fork command › fork a local component › bit show should show the forked component
- [ ] `e2e/harmony/fork.e2e.ts:31` bit fork command › fork a local component › .bitmap should not have internal config fields
- [ ] `e2e/harmony/fork.e2e.ts:40` bit fork command › fork a component with --no-link › bit show should not show the forked component
- [ ] `e2e/harmony/fork.e2e.ts:51` bit fork command › fork a remote component with no --target-id flag › should create a new component
- [ ] `e2e/harmony/fork.e2e.ts:55` bit fork command › fork a remote component with no --target-id flag › should name the new component, same as the old one
- [ ] `e2e/harmony/fork.e2e.ts:59` bit fork command › fork a remote component with no --target-id flag › bit show should show the forked component
- [ ] `e2e/harmony/fork.e2e.ts:77` bit fork command › fork multiple components using pattern › validation errors › should throw an error when target-component-name is provided with pattern
- [ ] `e2e/harmony/fork.e2e.ts:94` bit fork command › fork multiple components using pattern › fork with --scope flag › should fork all matching components
- [ ] `e2e/harmony/fork.e2e.ts:98` bit fork command › fork multiple components using pattern › fork with --scope flag › should fork components with same names to the target scope
- [ ] `e2e/harmony/fork.e2e.ts:105` bit fork command › fork multiple components using pattern › fork with --scope flag › bit show should show the forked components with reference to original
- [ ] `e2e/harmony/fork.e2e.ts:124` bit fork command › fork multiple components using pattern › fork with comma-separated pattern for specific component IDs › should fork the specified components
- [ ] `e2e/harmony/fork.e2e.ts:128` bit fork command › fork multiple components using pattern › fork with comma-separated pattern for specific component IDs › should fork components with same names to the target scope
- [ ] `e2e/harmony/fork.e2e.ts:133` bit fork command › fork multiple components using pattern › fork with comma-separated pattern for specific component IDs › bit show should show the forked components with reference to original

### `e2e/harmony/git-worktree.e2e.ts`

- [ ] `e2e/harmony/git-worktree.e2e.ts:68` git worktree support › running bit commands from a git worktree › the worktree should have .git as a file, not a directory (sanity)
- [ ] `e2e/harmony/git-worktree.e2e.ts:73` git worktree support › running bit commands from a git worktree › the first bit command should not throw ENOTDIR
- [ ] `e2e/harmony/git-worktree.e2e.ts:77` git worktree support › running bit commands from a git worktree › should auto-init a standalone ".bit" scope inside the worktree (never compose .git/bit)
- [ ] `e2e/harmony/git-worktree.e2e.ts:89` git worktree support › running bit commands from a git worktree › bit import and bit status in the worktree › bit status should run successfully (no ENOTDIR crash)
- [ ] `e2e/harmony/git-worktree.e2e.ts:93` git worktree support › running bit commands from a git worktree › bit import and bit status in the worktree › bit list should show the components with their exported version
- [ ] `e2e/harmony/git-worktree.e2e.ts:112` git worktree support › running bit commands from a git worktree › snapping in the worktree › the snap should land in the worktree scope
- [ ] `e2e/harmony/git-worktree.e2e.ts:117` git worktree support › running bit commands from a git worktree › snapping in the worktree › the main workspace scope should be unaffected
- [ ] `e2e/harmony/git-worktree.e2e.ts:122` git worktree support › running bit commands from a git worktree › snapping in the worktree › the main workspace status should remain clean
- [ ] `e2e/harmony/git-worktree.e2e.ts:132` git worktree support › running bit commands from a git worktree › lanes are independent per worktree › the worktree should be on the new lane
- [ ] `e2e/harmony/git-worktree.e2e.ts:137` git worktree support › running bit commands from a git worktree › lanes are independent per worktree › the main workspace should stay on main and not know the lane
- [ ] `e2e/harmony/git-worktree.e2e.ts:151` git worktree support › running bit commands from a git worktree › git worktree remove cleans up the scope › the worktree directory (including its .bit scope) should be gone
- [ ] `e2e/harmony/git-worktree.e2e.ts:175` git worktree support › a worktree nested inside the main workspace directory › bit init --reset-scope as the first command in the fresh worktree should not wipe the main scope
- [ ] `e2e/harmony/git-worktree.e2e.ts:183` git worktree support › a worktree nested inside the main workspace directory › bit commands in the nested worktree should use its own scope, not the main one

### `e2e/harmony/global-virtual-store.e2e.ts`

- [ ] `e2e/harmony/global-virtual-store.e2e.ts:37` installing with the global virtual store › a workspace with a component › should not create the dependency directories inside the workspace
- [ ] `e2e/harmony/global-virtual-store.e2e.ts:47` installing with the global virtual store › a workspace with a component › should link the dependency from the global virtual store
- [ ] `e2e/harmony/global-virtual-store.e2e.ts:54` installing with the global virtual store › a workspace with a component › should still record the installed dependencies in the current lockfile
- [ ] `e2e/harmony/global-virtual-store.e2e.ts:57` installing with the global virtual store › a workspace with a component › should load the component without issues
- [ ] `e2e/harmony/global-virtual-store.e2e.ts:61` installing with the global virtual store › a workspace with a component › should compile the component into its package directory
- [ ] `e2e/harmony/global-virtual-store.e2e.ts:85` installing with the global virtual store › building an aspect › should type-check the aspect against the types a store slot cannot reach by walking up
- [ ] `e2e/harmony/global-virtual-store.e2e.ts:118` installing with the global virtual store › patched dependencies › should apply the patch to the copy in the global virtual store

### `e2e/harmony/graph-harmony.e2e.ts`

- [ ] `e2e/harmony/graph-harmony.e2e.ts:38` graph aspect › tag a few components › ask the graph aspect for the graph ids › should include the dependencies correctly

### `e2e/harmony/harmony-workspace.e2e.ts`

- [ ] `e2e/harmony/harmony-workspace.e2e.ts:40` workspace aspect › tag a component twice › ask the workspace for the first tag › should contain the files of the first tag not the second

### `e2e/harmony/http.e2e.ts`

- [ ] `e2e/harmony/http.e2e.ts:29` export lane › lane list -r --json should show the remote lanes
- [ ] `e2e/harmony/http.e2e.ts:34` export lane › lane list -r should show the remote lanes
- [ ] `e2e/harmony/http.e2e.ts:38` export lane › bit import on a local lane tracked to a valid remote scope should not throw an error
- [ ] `e2e/harmony/http.e2e.ts:44` export lane › bit lane remove -r should not remove the remote lane without --force flag as it was not fully merged
- [ ] `e2e/harmony/http.e2e.ts:49` export lane › bit lane remove -r -f should remove the remote lane
- [ ] `e2e/harmony/http.e2e.ts:55` export lane › bit lane remove -r of a non-existing lane should throw a descriptive error
- [ ] `e2e/harmony/http.e2e.ts:78` export with deleted components › bit list should not show the removed component
- [ ] `e2e/harmony/http.e2e.ts:83` export with deleted components › bit list --include-deleted should show the removed component
- [ ] `e2e/harmony/http.e2e.ts:89` export with deleted components › bit import of the entire scope should not bring in the deleted components
- [ ] `e2e/harmony/http.e2e.ts:116` export › should export successfully
- [ ] `e2e/harmony/http.e2e.ts:124` export › bit log › should show the log correctly
- [ ] `e2e/harmony/http.e2e.ts:137` export › bit import › should import successfully
- [ ] `e2e/harmony/http.e2e.ts:145` export › bit remove --remote › should show descriptive error when removing component that has dependents
- [ ] `e2e/harmony/http.e2e.ts:150` export › bit remove --remote › should remove successfully components that has no dependents
- [ ] `e2e/harmony/http.e2e.ts:185` import with pattern matching for nested namespaces › should only import components directly under examples/ when using "examples/**" pattern

### `e2e/harmony/import-harmony.e2e.ts`

- [ ] `e2e/harmony/import-harmony.e2e.ts:53` import functionality on Harmony › workspace with TS components › installing dependencies as packages, requiring them and then running build-one-graph › the scope should have the dependencies and the flattened dependencies
- [ ] `e2e/harmony/import-harmony.e2e.ts:64` import functionality on Harmony › workspace with TS components › importing the components › should not save the dependencies as components
- [ ] `e2e/harmony/import-harmony.e2e.ts:70` import functionality on Harmony › workspace with TS components › importing the components › bit status should be clean with no errors
- [ ] `e2e/harmony/import-harmony.e2e.ts:87` import functionality on Harmony › workspace with TS components › installing a component as a package and then importing it directly › should remove the package from workspace.jsonc
- [ ] `e2e/harmony/import-harmony.e2e.ts:101` import functionality on Harmony › workspace with TS components › importing a component, modify it and then importing its dependent › should not throw an error asking to use --override flag
- [ ] `e2e/harmony/import-harmony.e2e.ts:119` import functionality on Harmony › tag, export, clean scope objects, tag and export › should export with no errors about missing artifacts (pkg file) from the first tag
- [ ] `e2e/harmony/import-harmony.e2e.ts:141` import functionality on Harmony › import delta (bit import without ids) when local is behind › should not fetch existing versions, only the missing
- [ ] `e2e/harmony/import-harmony.e2e.ts:167` import functionality on Harmony › import into a non-empty directory that is not tracked in .bitmap (with --write-to-empty-dir) › without the flag › should throw an error about the directory not being empty
- [ ] `e2e/harmony/import-harmony.e2e.ts:172` import functionality on Harmony › import into a non-empty directory that is not tracked in .bitmap (with --write-to-empty-dir) › combined with --override › should throw an error that the two flags cannot be used together
- [ ] `e2e/harmony/import-harmony.e2e.ts:179` import functionality on Harmony › import into a non-empty directory that is not tracked in .bitmap (with --write-to-empty-dir) › combined with --path › should throw an error that the two flags cannot be used together
- [ ] `e2e/harmony/import-harmony.e2e.ts:190` import functionality on Harmony › import into a non-empty directory that is not tracked in .bitmap (with --write-to-empty-dir) › with --write-to-empty-dir flag › should import the component successfully
- [ ] `e2e/harmony/import-harmony.e2e.ts:193` import functionality on Harmony › import into a non-empty directory that is not tracked in .bitmap (with --write-to-empty-dir) › with --write-to-empty-dir flag › should import into an incremented empty dir
- [ ] `e2e/harmony/import-harmony.e2e.ts:196` import functionality on Harmony › import into a non-empty directory that is not tracked in .bitmap (with --write-to-empty-dir) › with --write-to-empty-dir flag › should leave the original directory untouched
- [ ] `e2e/harmony/import-harmony.e2e.ts:220` import functionality on Harmony › multiple components some are directory of others › import them all at the same time › should change the parent directory path and add _1 to the path
- [ ] `e2e/harmony/import-harmony.e2e.ts:232` import functionality on Harmony › multiple components some are directory of others › import the parent dir first and then the child › should not throw when importing the child and should increment its base-path and preserve the suffix
- [ ] `e2e/harmony/import-harmony.e2e.ts:242` import functionality on Harmony › multiple components some are directory of others › import the child dir first and then the parent › should not throw when importing the parent and should increment the path
- [ ] `e2e/harmony/import-harmony.e2e.ts:271` import functionality on Harmony › install as packages › should be able to install the package with no errors
- [ ] `e2e/harmony/import-harmony.e2e.ts:283` import functionality on Harmony › importing the components › should import the component with the pre-release correctly
- [ ] `e2e/harmony/import-harmony.e2e.ts:287` import functionality on Harmony › importing the components › bit status should be clean with no errors
- [ ] `e2e/harmony/import-harmony.e2e.ts:304` import functionality on Harmony › controlling where the component is written (defaultDirectory placeholders and --path) › should import with no errors when defaultDirectory has "{owner}" placeholder
- [ ] `e2e/harmony/import-harmony.e2e.ts:308` import functionality on Harmony › controlling where the component is written (defaultDirectory placeholders and --path) › should import with no errors when defaultDirectory has "{scope-id}" placeholder
- [ ] `e2e/harmony/import-harmony.e2e.ts:313` import functionality on Harmony › controlling where the component is written (defaultDirectory placeholders and --path) › should throw an error when the placeholder is not supported
- [ ] `e2e/harmony/import-harmony.e2e.ts:318` import functionality on Harmony › controlling where the component is written (defaultDirectory placeholders and --path) › should write to the given path when --path is used
- [ ] `e2e/harmony/import-harmony.e2e.ts:343` import functionality on Harmony › importing a component with @types dependency when current workspace does not have it › bit status should not show it as modified
- [ ] `e2e/harmony/import-harmony.e2e.ts:346` import functionality on Harmony › importing a component with @types dependency when current workspace does not have it › bit show should show the typed dependency
- [ ] `e2e/harmony/import-harmony.e2e.ts:368` import functionality on Harmony › with --track-only flag › should only add the entries to the .bitmap without writing files
- [ ] `e2e/harmony/import-harmony.e2e.ts:398` import functionality on Harmony › import with deps having different versions than workspace.jsonc › if the ws has a lower range, it should update workspace.jsonc with the new range
- [ ] `e2e/harmony/import-harmony.e2e.ts:404` import functionality on Harmony › import with deps having different versions than workspace.jsonc › if the ws has a higher range, it should not update
- [ ] `e2e/harmony/import-harmony.e2e.ts:410` import functionality on Harmony › import with deps having different versions than workspace.jsonc › if the ws has a lower exact version, it should write a conflict
- [ ] `e2e/harmony/import-harmony.e2e.ts:456` import functionality on Harmony › import with --dependents › without "through" should import all graphs between the given component and the workspace
- [ ] `e2e/harmony/import-harmony.e2e.ts:466` import functionality on Harmony › import with --dependents › with --dependents-via should limit to graph traversing through the given id
- [ ] `e2e/harmony/import-harmony.e2e.ts:492` import functionality on Harmony › import when component.json has a local env › should not modified the component.json of the other component to add invalid env info
- [ ] `e2e/harmony/import-harmony.e2e.ts:511` import functionality on Harmony › flattened dependencies saved in a separate object › the remote should have only the ref to the flattened dependencies in the Version
- [ ] `e2e/harmony/import-harmony.e2e.ts:516` import functionality on Harmony › flattened dependencies saved in a separate object › should import the object with the flattened dependencies
- [ ] `e2e/harmony/import-harmony.e2e.ts:521` import functionality on Harmony › flattened dependencies saved in a separate object › should import the flattened dependencies into the scope

### `e2e/harmony/import-non-main-files.e2e.ts`

- [ ] `e2e/harmony/import-non-main-files.e2e.ts:24` importing internal files flow (component imports from a non-index file of another component) › importing of a non-main .js file › bit status should show it as an invalid component
- [ ] `e2e/harmony/import-non-main-files.e2e.ts:29` importing internal files flow (component imports from a non-index file of another component) › importing of a non-main .js file › bit status should print the path for the non-main file
- [ ] `e2e/harmony/import-non-main-files.e2e.ts:43` importing internal files flow (component imports from a non-index file of another component) › importing from a main file when the dependency was not compiled yet › should not show the import-non-main-file issue
- [ ] `e2e/harmony/import-non-main-files.e2e.ts:55` importing internal files flow (component imports from a non-index file of another component) › importing of a non-main json file (or any not .js(x)/.ts(x) file) › bit status should not show it as an invalid component

### `e2e/harmony/import-resolves-missing-deps-from-model.e2e.ts`

- [ ] `e2e/harmony/import-resolves-missing-deps-from-model.e2e.ts:37` bit import: missing-package issue suppressed when the model lists the package › does not report MissingPackagesDependenciesOnFs for a package present in the model

### `e2e/harmony/imported-component-deps.e2e.ts`

- [ ] `e2e/harmony/imported-component-deps.e2e.ts:44` should install component dependencies from their respective models to the imported components
- [ ] `e2e/harmony/imported-component-deps.e2e.ts:53` should install package dependencies from their respective models to the imported components
- [ ] `e2e/harmony/imported-component-deps.e2e.ts:103` should not show the imported component as modified

### `e2e/harmony/init-harmony.e2e.ts`

- [ ] `e2e/harmony/init-harmony.e2e.ts:24` init command on Harmony › init --reset-new › should change the .bitmap entries as if they are new
- [ ] `e2e/harmony/init-harmony.e2e.ts:30` init command on Harmony › init --reset-new › should remove all objects from the scope
- [ ] `e2e/harmony/init-harmony.e2e.ts:47` init command on Harmony › delete "objects" dir from the scope after initiating with git › should show a descriptive error
- [ ] `e2e/harmony/init-harmony.e2e.ts:50` init command on Harmony › delete "objects" dir from the scope after initiating with git › bit init should fix it
- [ ] `e2e/harmony/init-harmony.e2e.ts:63` init command on Harmony › when workspace.jsonc exist, but not .bitmap nor .bit › should show a descriptive error
- [ ] `e2e/harmony/init-harmony.e2e.ts:72` init command on Harmony › workspace.jsonc is missing › bit init should fix it
- [ ] `e2e/harmony/init-harmony.e2e.ts:81` init command on Harmony › init with an invalid default-scope › should throw a descriptive error and should not create the workspace

### `e2e/harmony/install-and-compile.e2e.ts`

- [ ] `e2e/harmony/install-and-compile.e2e.ts:70` all custom envs are compiled during installation › should use the compiled custom env to build the component
- [ ] `e2e/harmony/install-and-compile.e2e.ts:75` all custom envs are compiled during installation › should install the dependencies dynamically added by the custom envs
- [ ] `e2e/harmony/install-and-compile.e2e.ts:123` should not run install indefinitely
- [ ] `e2e/harmony/install-and-compile.e2e.ts:141` skipping compilation on install › should link the component
- [ ] `e2e/harmony/install-and-compile.e2e.ts:146` skipping compilation on install › should not compile the component
- [ ] `e2e/harmony/install-and-compile.e2e.ts:158` do not fail on environment loading files from a location inside node_modules that does not exist › should not fail

### `e2e/harmony/install-missing-dependencies.e2e.ts`

- [ ] `e2e/harmony/install-missing-dependencies.e2e.ts:38` install missing dependencies › when all packages exist › should install the missing peer dependencies to node_modules
- [ ] `e2e/harmony/install-missing-dependencies.e2e.ts:42` install missing dependencies › when all packages exist › should add the missing peer dependencies to workspace.jsonc
- [ ] `e2e/harmony/install-missing-dependencies.e2e.ts:61` install missing dependencies › skip unavailable packages › should install the missing available dependencies to node_modules
- [ ] `e2e/harmony/install-missing-dependencies.e2e.ts:64` install missing dependencies › skip unavailable packages › should not install the unavailable packages

### `e2e/harmony/install.e2e.ts`

- [ ] `e2e/harmony/install.e2e.ts:41` install command › bit status should show it with DuplicateComponentAndPackage issue
- [ ] `e2e/harmony/install.e2e.ts:66` install command › install with old envs in the workspace › without --recurring-install › should show a warning that the workspace has old env without env.jsonc so another install might be required
- [ ] `e2e/harmony/install.e2e.ts:70` install command › install with old envs in the workspace › without --recurring-install › should not install deps that were configured in the env in first install
- [ ] `e2e/harmony/install.e2e.ts:77` install command › install with old envs in the workspace › without --recurring-install › without --recurring-install - second install › should not show a warning that the workspace has old env without env.jsonc so another install might be required
- [ ] `e2e/harmony/install.e2e.ts:81` install command › install with old envs in the workspace › without --recurring-install › without --recurring-install - second install › should install deps that were configured in the env in second install
- [ ] `e2e/harmony/install.e2e.ts:91` install command › install with old envs in the workspace › with --recurring-install › should install deps that were configured in the env
- [ ] `e2e/harmony/install.e2e.ts:113` install generator configured envs › should install custom envs configured for the generator aspect
- [ ] `e2e/harmony/install.e2e.ts:138` using pnpm › should not install optional dependencies
- [ ] `e2e/harmony/install.e2e.ts:171` using pnpm › should update direct dependency inside existing range
- [ ] `e2e/harmony/install.e2e.ts:177` using pnpm › should update subdependency inside existing range
- [ ] `e2e/harmony/install.e2e.ts:203` install new dependencies › should add new dependency preserving the ~ prefix
- [ ] `e2e/harmony/install.e2e.ts:208` install new dependencies › should add new dependency with exact version if the dependency was installed by specifying the exact version
- [ ] `e2e/harmony/install.e2e.ts:214` install new dependencies › should add new dependency with ^ prefix if the dependency was installed by specifying a range not using ~
- [ ] `e2e/harmony/install.e2e.ts:219` install new dependencies › should add new dependency with ^ prefix by default
- [ ] `e2e/harmony/install.e2e.ts:224` install new dependencies › should add prerelease version as exact version
- [ ] `e2e/harmony/install.e2e.ts:246` named install › should override already existing dependency with the latest version
- [ ] `e2e/harmony/install.e2e.ts:267` install with --lockfile-only › should update workspace.jsonc
- [ ] `e2e/harmony/install.e2e.ts:272` install with --lockfile-only › should create pnpm-lock.yaml
- [ ] `e2e/harmony/install.e2e.ts:275` install with --lockfile-only › should not write dependencies to node_modules
- [ ] `e2e/harmony/install.e2e.ts:369` comment preservation during install › should preserve comments in workspace.jsonc when installing a new dependency
- [ ] `e2e/harmony/install.e2e.ts:372` comment preservation during install › should preserve block comments in workspace.jsonc
- [ ] `e2e/harmony/install.e2e.ts:376` comment preservation during install › should have added the lodash dependency to policy
- [ ] `e2e/harmony/install.e2e.ts:380` comment preservation during install › should preserve a comment attached to a dependency inside the policy
- [ ] `e2e/harmony/install.e2e.ts:400` repeat install with nothing changed › should let the package manager return early instead of reinstalling
- [ ] `e2e/harmony/install.e2e.ts:466` install when the package manager re-creates the injected copy of a workspace env › should restore the env files before compiling with it

### `e2e/harmony/installing-component-dependency.e2e.ts`

- [ ] `e2e/harmony/installing-component-dependency.e2e.ts:35` should install the version of the component dependency from the model, when it is not in the workspace policies
- [ ] `e2e/harmony/installing-component-dependency.e2e.ts:38` should not install the version of the component dependency from the model, when the component dependency is in the workspace policies
- [ ] `e2e/harmony/installing-component-dependency.e2e.ts:45` should not install the version of the component dependency from the model, when the component dependency is in the bitmap config

### `e2e/harmony/internalize.e2e.ts`

- [ ] `e2e/harmony/internalize.e2e.ts:21` bit internalize command › internalize a tagged component › bit show should show the component as internal
- [ ] `e2e/harmony/internalize.e2e.ts:25` bit internalize command › internalize a tagged component › the "internal" show-fragment should report isInternal true
- [ ] `e2e/harmony/internalize.e2e.ts:29` bit internalize command › internalize a tagged component › bit status should show the component as modified
- [ ] `e2e/harmony/internalize.e2e.ts:34` bit internalize command › internalize a tagged component › bit internalize --list should include only the internal component
- [ ] `e2e/harmony/internalize.e2e.ts:39` bit internalize command › internalize a tagged component › the "$internal" pattern should match the internal component
- [ ] `e2e/harmony/internalize.e2e.ts:48` bit internalize command › internalize a tagged component › tagging the component › the component should not be modified
- [ ] `e2e/harmony/internalize.e2e.ts:52` bit internalize command › internalize a tagged component › tagging the component › .bitmap should not contain the config
- [ ] `e2e/harmony/internalize.e2e.ts:56` bit internalize command › internalize a tagged component › tagging the component › bit show should still show the component as internal
- [ ] `e2e/harmony/internalize.e2e.ts:67` bit internalize command › internalize a tagged component › tagging the component › exporting and importing into a new workspace › the imported (remote) component should be marked as internal
- [ ] `e2e/harmony/internalize.e2e.ts:82` bit internalize command › uninternalize a component (--revert) › bit show should show the component as not internal
- [ ] `e2e/harmony/internalize.e2e.ts:86` bit internalize command › uninternalize a component (--revert) › bit internalize --list should be empty
- [ ] `e2e/harmony/internalize.e2e.ts:103` bit internalize command › reverting the internalize by "bit checkout reset" › should remove the internalize config

### `e2e/harmony/isolate-cyclic-deps.e2e.ts`

- [ ] `e2e/harmony/isolate-cyclic-deps.e2e.ts:31` isolating cyclic dependencies › two components requiring each other, isolated seeders-only › should isolate the cyclic dependency as a capsule, not only the seeder
- [ ] `e2e/harmony/isolate-cyclic-deps.e2e.ts:60` isolating cyclic dependencies › a dependency-only cycle, seeder not part of the cycle, isolated seeders-only › should isolate only the seeder, not the dependency-only cycle members
- [ ] `e2e/harmony/isolate-cyclic-deps.e2e.ts:127` isolating cyclic dependencies › env in a cycle with a component, loaded from scope (aspect isolation) › should isolate the cyclic snap dependency as a capsule instead of fetching it from the registry

### `e2e/harmony/jest.e2e.ts`

- [ ] `e2e/harmony/jest.e2e.ts:23` Jest Tester › component without any test file › bit test should indicate that no tests found
- [ ] `e2e/harmony/jest.e2e.ts:27` Jest Tester › component without any test file › bit build should not fail
- [ ] `e2e/harmony/jest.e2e.ts:42` Jest Tester › bit test should show the passing component via Jest output
- [ ] `e2e/harmony/jest.e2e.ts:46` Jest Tester › bit build should show the passing component via Jest output
- [ ] `e2e/harmony/jest.e2e.ts:57` Jest Tester › bit test should exit with non-zero code
- [ ] `e2e/harmony/jest.e2e.ts:60` Jest Tester › bit test should show the failing component via Jest output
- [ ] `e2e/harmony/jest.e2e.ts:64` Jest Tester › bit build should show the failing component via Jest output
- [ ] `e2e/harmony/jest.e2e.ts:68` Jest Tester › bit build should not show the failing component if --skip-tests was entered
- [ ] `e2e/harmony/jest.e2e.ts:84` Jest Tester › should run only the tests of the given file
- [ ] `e2e/harmony/jest.e2e.ts:89` Jest Tester › should test only the component that owns the given file
- [ ] `e2e/harmony/jest.e2e.ts:92` Jest Tester › should support multiple test-file paths
- [ ] `e2e/harmony/jest.e2e.ts:107` Jest Tester › component with an errored test › bit test should exit with non-zero code
- [ ] `e2e/harmony/jest.e2e.ts:110` Jest Tester › component with an errored test › bit test should show the error
- [ ] `e2e/harmony/jest.e2e.ts:115` Jest Tester › component with an errored test › bit build should show the error
- [ ] `e2e/harmony/jest.e2e.ts:136` Jest Tester › env with an incorrect Jest config › bit test should exit with non-zero code
- [ ] `e2e/harmony/jest.e2e.ts:139` Jest Tester › env with an incorrect Jest config › bit test should show the error
- [ ] `e2e/harmony/jest.e2e.ts:143` Jest Tester › env with an incorrect Jest config › bit build should show the error
- [ ] `e2e/harmony/jest.e2e.ts:174` Jest Tester › env with custom spec resolver › bit test command › bit test should mentions the custom resolved spec file
- [ ] `e2e/harmony/jest.e2e.ts:183` Jest Tester › env with custom spec resolver › bit test command › bit test should not mentions the default spec file
- [ ] `e2e/harmony/jest.e2e.ts:186` Jest Tester › env with custom spec resolver › bit test command › bit test should NOT show the passing component for default specs via Jest output
- [ ] `e2e/harmony/jest.e2e.ts:195` Jest Tester › env with custom spec resolver › bit build command › bit build should mentions the custom resolved spec file
- [ ] `e2e/harmony/jest.e2e.ts:204` Jest Tester › env with custom spec resolver › bit build command › bit build should not mentions the default spec file
- [ ] `e2e/harmony/jest.e2e.ts:207` Jest Tester › env with custom spec resolver › bit build command › bit build should NOT show the passing component for default specs via Jest output

### `e2e/harmony/lanes/abort-merge-lane.e2e.ts`

- [ ] `e2e/harmony/lanes/abort-merge-lane.e2e.ts:34` bit lane merge-abort command › when the lane was merged successfully without conflicts or diverged › should revert the .bitmap to the state before the merge
- [ ] `e2e/harmony/lanes/abort-merge-lane.e2e.ts:39` bit lane merge-abort command › when the lane was merged successfully without conflicts or diverged › should revert the lane object to the state before the merge
- [ ] `e2e/harmony/lanes/abort-merge-lane.e2e.ts:45` bit lane merge-abort command › when the lane was merged successfully without conflicts or diverged › should reset the source code to pre-merge
- [ ] `e2e/harmony/lanes/abort-merge-lane.e2e.ts:69` bit lane merge-abort command › when the merged lane introduced new components › should delete the newly introduced component root-dirs

### `e2e/harmony/lanes/bit-checkout-on-lanes.e2e.ts`

- [ ] `e2e/harmony/lanes/bit-checkout-on-lanes.e2e.ts:39` bit checkout command when on a lane › checkout head when some components are merge-pending › should leave the merge-pending component with the current version
- [ ] `e2e/harmony/lanes/bit-checkout-on-lanes.e2e.ts:43` bit checkout command when on a lane › checkout head when some components are merge-pending › should not update the non-merge-pending component to the latest
- [ ] `e2e/harmony/lanes/bit-checkout-on-lanes.e2e.ts:48` bit checkout command when on a lane › checkout head when some components are merge-pending › should not write the files of the non-merge-pending component
- [ ] `e2e/harmony/lanes/bit-checkout-on-lanes.e2e.ts:78` bit checkout command when on a lane › checkout head on main when some components are not available on main › should make them available on main even without running bit-import before

### `e2e/harmony/lanes/bit-import-on-lanes.e2e.ts`

- [ ] `e2e/harmony/lanes/bit-import-on-lanes.e2e.ts:32` bit lane command › importing a component when checked out to a lane › without --save-in-lane flag › the component should not be part of the lane
- [ ] `e2e/harmony/lanes/bit-import-on-lanes.e2e.ts:36` bit lane command › importing a component when checked out to a lane › without --save-in-lane flag › the component should be available on the lane as part of main
- [ ] `e2e/harmony/lanes/bit-import-on-lanes.e2e.ts:44` bit lane command › importing a component when checked out to a lane › without --save-in-lane flag › switching to main › bit list should show the component
- [ ] `e2e/harmony/lanes/bit-import-on-lanes.e2e.ts:55` bit lane command › importing a component when checked out to a lane › with --save-in-lane flag › the component should be part of the current lane
- [ ] `e2e/harmony/lanes/bit-import-on-lanes.e2e.ts:63` bit lane command › importing a component when checked out to a lane › with --save-in-lane flag › switching to main › bit list should show the component, because it has head
- [ ] `e2e/harmony/lanes/bit-import-on-lanes.e2e.ts:100` bit lane command › importing a (non-lane) component from another scope when checked out to a lane › should import the component into the current lane
- [ ] `e2e/harmony/lanes/bit-import-on-lanes.e2e.ts:118` bit lane command › import a non-lane component that has dependencies into a lane › should not save all the dependencies into the lane, only the imported component
- [ ] `e2e/harmony/lanes/bit-import-on-lanes.e2e.ts:133` bit lane command › bit-import with no params when checked out to a lane › when the lane is new › should indicate that there is nothing to import because the lane is new
- [ ] `e2e/harmony/lanes/bit-import-on-lanes.e2e.ts:153` bit lane command › bit-import with no params when checked out to a lane › when the lane is exported › should import the remote lane successfully
- [ ] `e2e/harmony/lanes/bit-import-on-lanes.e2e.ts:178` bit lane command › bit-import with no params when checked out to a lane › when the objects were deleted and a workspace has an aspect with deps › bit import should not throw
- [ ] `e2e/harmony/lanes/bit-import-on-lanes.e2e.ts:203` bit lane command › bit-import with no params when checked out to a lane › when the components on the lane have history other than head on main › should not bring main (for performance reasons)
- [ ] `e2e/harmony/lanes/bit-import-on-lanes.e2e.ts:212` bit lane command › bit-import with no params when checked out to a lane › when the components on the lane have history other than head on main › should bring all history if fetch --lanes --all-history was used
- [ ] `e2e/harmony/lanes/bit-import-on-lanes.e2e.ts:218` bit lane command › bit-import with no params when checked out to a lane › when the components on the lane have history other than head on main › should import the history if "bit log" was running
- [ ] `e2e/harmony/lanes/bit-import-on-lanes.e2e.ts:259` bit lane command › import objects for multiple lanes › bit fetch --lane should bring updates for all lanes
- [ ] `e2e/harmony/lanes/bit-import-on-lanes.e2e.ts:283` bit lane command › import previous version from main when on a lane › bit status should not show the component as pending-updates because it does not exits on the remote lane
- [ ] `e2e/harmony/lanes/bit-import-on-lanes.e2e.ts:301` bit lane command › import with wildcards when a component exists on both, main and lane › should not checkout to the main version
- [ ] `e2e/harmony/lanes/bit-import-on-lanes.e2e.ts:327` bit lane command › import with wildcard when a component is on main and user is checked out to a lane › when the wildcard is parsed to only main › should import from main
- [ ] `e2e/harmony/lanes/bit-import-on-lanes.e2e.ts:339` bit lane command › import with wildcard when a component is on main and user is checked out to a lane › when the wildcard is parsed to components in the lane and in main › should import components from both lane and main (lane versions preferred)
- [ ] `e2e/harmony/lanes/bit-import-on-lanes.e2e.ts:352` bit lane command › import with wildcard when a component is on main and user is checked out to a lane › when using --lane-only flag › should import only components from the lane, not main

### `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts`

- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:30` bit lane command › remove components when on a lane › as an intermediate step, make sure the snapped components are part of the lane
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:39` bit lane command › remove components when on a lane › removing a component that has no dependents › should remove the component from .bitmap
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:43` bit lane command › remove components when on a lane › removing a component that has no dependents › should delete the files from the filesystem
- [x] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:61` bit lane command › soft remove on lane › bit status should be clean — `cli/tests/e2e/harmony/status_lanes.rs::soft_removed_component_on_lane_matches_node`
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:70` bit lane command › soft remove on lane › merge a lane with removed component to main › should not merge the removed component
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:75` bit lane command › soft remove on lane › merge a lane with removed component to main › should explain why it was not merged
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:85` bit lane command › soft remove on lane › importing the lane to a new workspace › should not bring the removed components
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:101` bit lane command › soft remove on lane › forking the lane and exporting › should not export the soft-removed
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:115` bit lane command › remove a new component on a lane › should remove from the lane object as well
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:122` bit lane command › remove a new component on a lane › bit export should not throw
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:136` bit lane command › delete main component when on a lane › should throw an error suggesting to switch to main or using --update-main flag
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:143` bit lane command › delete main component when on a lane › using --update-main flag › should remove the component from the workspace
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:172` bit lane command › soft remove on lane when a forked lane is merging this lane › bit status --lanes should show updates from lane-a
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:182` bit lane command › soft remove on lane when a forked lane is merging this lane › merge the original lane › should indicate that the component was removed
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:185` bit lane command › soft remove on lane when a forked lane is merging this lane › merge the original lane › should remove the soft-removed component from .bitmap
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:189` bit lane command › soft remove on lane when a forked lane is merging this lane › merge the original lane › should remove the component files from the filesystem
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:192` bit lane command › soft remove on lane when a forked lane is merging this lane › merge the original lane › should leave the component on the lane and update it according to lane-a to make it soft-removed in lane-b as well
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:197` bit lane command › soft remove on lane when a forked lane is merging this lane › merge the original lane › bit show should show the component as removed
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:201` bit lane command › soft remove on lane when a forked lane is merging this lane › merge the original lane › bit status should show the component as staged
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:211` bit lane command › soft remove on lane when a forked lane is merging this lane › merge the original lane › abort the lane-merge › should indicate that a component has been added
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:214` bit lane command › soft remove on lane when a forked lane is merging this lane › merge the original lane › abort the lane-merge › should add the previously removed component
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:251` bit lane command › soft remove on lane when a forked lane changed it (diverged) and is now merging this lane › when merging with auto-snap › should indicate that the component was removed
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:254` bit lane command › soft remove on lane when a forked lane changed it (diverged) and is now merging this lane › when merging with auto-snap › should remove the soft-removed component from .bitmap
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:258` bit lane command › soft remove on lane when a forked lane changed it (diverged) and is now merging this lane › when merging with auto-snap › should remove the component files from the filesystem
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:261` bit lane command › soft remove on lane when a forked lane changed it (diverged) and is now merging this lane › when merging with auto-snap › should leave the component on the lane and update it according to lane-a to make it soft-removed in lane-b as well
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:266` bit lane command › soft remove on lane when a forked lane changed it (diverged) and is now merging this lane › when merging with auto-snap › bit show should show the component as removed
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:270` bit lane command › soft remove on lane when a forked lane changed it (diverged) and is now merging this lane › when merging with auto-snap › bit status should show the component as staged
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:281` bit lane command › soft remove on lane when a forked lane changed it (diverged) and is now merging this lane › when merging with --no-auto-snap › bit status should not show the component as soft-removed from remote
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:285` bit lane command › soft remove on lane when a forked lane changed it (diverged) and is now merging this lane › when merging with --no-auto-snap › should not remove the component from the filesystem
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:293` bit lane command › soft remove on lane when a forked lane changed it (diverged) and is now merging this lane › when merging with --no-auto-snap › snapping the components › should indicate that components were removed
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:296` bit lane command › soft remove on lane when a forked lane changed it (diverged) and is now merging this lane › when merging with --no-auto-snap › snapping the components › should remove the soft-removed component from .bitmap
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:300` bit lane command › soft remove on lane when a forked lane changed it (diverged) and is now merging this lane › when merging with --no-auto-snap › snapping the components › should remove the component files from the filesystem
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:303` bit lane command › soft remove on lane when a forked lane changed it (diverged) and is now merging this lane › when merging with --no-auto-snap › snapping the components › should leave the component on the lane and update it according to lane-a to make it soft-removed in lane-b as well
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:308` bit lane command › soft remove on lane when a forked lane changed it (diverged) and is now merging this lane › when merging with --no-auto-snap › snapping the components › bit show should show the component as removed
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:312` bit lane command › soft remove on lane when a forked lane changed it (diverged) and is now merging this lane › when merging with --no-auto-snap › snapping the components › bit status should show the component as staged
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:345` bit lane command › soft remove on lane when a forked lane does not have this comp and is merging this lane › should show why the component was not merged
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:348` bit lane command › soft remove on lane when a forked lane does not have this comp and is merging this lane › should not bring the marked-removed component to the workspace
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:352` bit lane command › soft remove on lane when a forked lane does not have this comp and is merging this lane › should not bring the marked-removed component to the lane
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:377` bit lane command › soft remove on lane when another user of the same lane is checking out head › should indicate that the component was removed
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:380` bit lane command › soft remove on lane when another user of the same lane is checking out head › should remove the soft-removed component from .bitmap
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:384` bit lane command › soft remove on lane when another user of the same lane is checking out head › should remove the component files from the filesystem
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:401` bit lane command › exporting a lane after snapping and then removing a component › should be able to import the lane with no errors
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:421` bit lane command › soft remove on lane-a, then re-creating the component on lane-b › the forked lane should not include the soft-removed components
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:441` bit lane command › remove on lane with --update-main then merge to main › should be marked as removed on main
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:445` bit lane command › remove on lane with --update-main then merge to main › bit status should show the component as staged
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:449` bit lane command › remove on lane with --update-main then merge to main › bitmap should not have the component
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:460` bit lane command › remove on lane with --update-main then merge to main › export and import the component to a new workspace › should show the component as removed
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:483` bit lane command › remove on lane with --update-main then merge to another lane › should bring the removed component into the other lane
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:488` bit lane command › remove on lane with --update-main then merge to another lane › should be marked with removed on main
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:515` bit lane command › delete on a lane then merging the deleted component from main › should not merge the deleted component although main is ahead
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:542` bit lane command › delete on a lane with --update-main then merging the deleted component from main when main is ahead › should merge the deleted component because it was deleted with --update-main
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:547` bit lane command › delete on a lane with --update-main then merging the deleted component from main when main is ahead › should keep the component marked as removed
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:551` bit lane command › delete on a lane with --update-main then merging the deleted component from main when main is ahead › should keep the component marked with removeOnMain
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:583` bit lane command › delete on a lane, re-import the deleted component, then merge from main › import output should warn that the component is deleted
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:586` bit lane command › delete on a lane, re-import the deleted component, then merge from main › import output should suggest running bit recover
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:593` bit lane command › delete on a lane, re-import the deleted component, then merge from main › lane merge main › should mention that the removed component was skipped
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:596` bit lane command › delete on a lane, re-import the deleted component, then merge from main › lane merge main › should suggest running bit recover
- [ ] `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts:604` bit lane command › delete on a lane, re-import the deleted component, then merge from main › lane merge main › after recovering and re-merging › should successfully merge the component from main

### `e2e/harmony/lanes/bit-reset-after-merge-main.e2e.ts`

- [ ] `e2e/harmony/lanes/bit-reset-after-merge-main.e2e.ts:57` bit reset after merging main into a lane › diverged with no conflicts (auto-snap after merge) › merge should have created a new snap with two parents
- [ ] `e2e/harmony/lanes/bit-reset-after-merge-main.e2e.ts:69` bit reset after merging main into a lane › diverged with no conflicts (auto-snap after merge) › after running bit reset › should revert the lane head to its pre-merge state
- [ ] `e2e/harmony/lanes/bit-reset-after-merge-main.e2e.ts:74` bit reset after merging main into a lane › diverged with no conflicts (auto-snap after merge) › after running bit reset › should not change the files (merged content remains on disk)
- [ ] `e2e/harmony/lanes/bit-reset-after-merge-main.e2e.ts:79` bit reset after merging main into a lane › diverged with no conflicts (auto-snap after merge) › after running bit reset › should show the component as modified since files do not match the reverted lane head
- [ ] `e2e/harmony/lanes/bit-reset-after-merge-main.e2e.ts:124` bit reset after merging main into a lane › true fast-forward (component born on lane, merged to main, main advanced) › merge should be a fast-forward (no merge snap with 2 parents)
- [ ] `e2e/harmony/lanes/bit-reset-after-merge-main.e2e.ts:136` bit reset after merging main into a lane › true fast-forward (component born on lane, merged to main, main advanced) › after running bit reset › should revert the lane head to its pre-merge state
- [ ] `e2e/harmony/lanes/bit-reset-after-merge-main.e2e.ts:141` bit reset after merging main into a lane › true fast-forward (component born on lane, merged to main, main advanced) › after running bit reset › should not change the files (main content remains on disk)
- [ ] `e2e/harmony/lanes/bit-reset-after-merge-main.e2e.ts:146` bit reset after merging main into a lane › true fast-forward (component born on lane, merged to main, main advanced) › after running bit reset › should show the component as modified since files do not match the reverted lane head
- [ ] `e2e/harmony/lanes/bit-reset-after-merge-main.e2e.ts:183` bit reset after merging main into a lane › with --no-snap (no snap, no head change) › lane head should not have changed
- [ ] `e2e/harmony/lanes/bit-reset-after-merge-main.e2e.ts:188` bit reset after merging main into a lane › with --no-snap (no snap, no head change) › files should have the merged content and show as modified
- [ ] `e2e/harmony/lanes/bit-reset-after-merge-main.e2e.ts:195` bit reset after merging main into a lane › with --no-snap (no snap, no head change) › bit reset should throw because there is nothing to reset

### `e2e/harmony/lanes/bit-reset-on-lanes.e2e.ts`

- [ ] `e2e/harmony/lanes/bit-reset-on-lanes.e2e.ts:32` bit reset when on lane › snapping on a lane, switching to main, snapping and running "bit reset" › should not delete the head of the lane
- [ ] `e2e/harmony/lanes/bit-reset-on-lanes.e2e.ts:35` bit reset when on lane › snapping on a lane, switching to main, snapping and running "bit reset" › bit status should not throw after switching to the lane
- [ ] `e2e/harmony/lanes/bit-reset-on-lanes.e2e.ts:49` bit reset when on lane › reset on lane after export from main › bit reset should not throw
- [ ] `e2e/harmony/lanes/bit-reset-on-lanes.e2e.ts:63` bit reset when on lane › reset on lane after fork from another exported lane › bit status should show only one version as staged, not two
- [ ] `e2e/harmony/lanes/bit-reset-on-lanes.e2e.ts:67` bit reset when on lane › reset on lane after fork from another exported lane › bit reset should not throw
- [ ] `e2e/harmony/lanes/bit-reset-on-lanes.e2e.ts:84` bit reset when on lane › reset on a new lane after merging from another lane › bit status should show not only one version as staged, but two
- [ ] `e2e/harmony/lanes/bit-reset-on-lanes.e2e.ts:91` bit reset when on lane › reset on a new lane after merging from another lane › bit reset should throw a descriptive error suggesting either removing the component or the lane
- [ ] `e2e/harmony/lanes/bit-reset-on-lanes.e2e.ts:117` bit reset when on lane › reset after merge where it snapped multiple snaps on the other lane › bit reset should not throw
- [ ] `e2e/harmony/lanes/bit-reset-on-lanes.e2e.ts:131` bit reset when on lane › reset a component that was just introduced to the lane › should remove the component from the lane

### `e2e/harmony/lanes/diverged-from-forked.e2e.ts`

- [x] `e2e/harmony/lanes/diverged-from-forked.e2e.ts:37` lane-b was forked from lane-a and they are now diverged › bit status should have the diverged component in the updatesFromForked section — `cli/tests/e2e/harmony/status_lanes.rs::forked_lane_updates_match_node`
- [ ] `e2e/harmony/lanes/diverged-from-forked.e2e.ts:42` lane-b was forked from lane-a and they are now diverged › the file added on lane-a should not be on the filesystem while on lane-b
- [ ] `e2e/harmony/lanes/diverged-from-forked.e2e.ts:52` lane-b was forked from lane-a and they are now diverged › merging lane-a into lane-b › should keep both parents (current lane first, merged lane second) and record no squash data
- [ ] `e2e/harmony/lanes/diverged-from-forked.e2e.ts:61` lane-b was forked from lane-a and they are now diverged › merging lane-a into lane-b › should write the file that was newly added on lane-a

### `e2e/harmony/lanes/diverged-from-remote-lane.e2e.ts`

- [ ] `e2e/harmony/lanes/diverged-from-remote-lane.e2e.ts:30` local is diverged from the remote › snap first then import › bit status should show it as merge-pending
- [ ] `e2e/harmony/lanes/diverged-from-remote-lane.e2e.ts:34` local is diverged from the remote › snap first then import › bit reset should not throw
- [ ] `e2e/harmony/lanes/diverged-from-remote-lane.e2e.ts:47` local is diverged from the remote › import first then snap › parent of the snap should be the previous local snap, not the remote snap
- [ ] `e2e/harmony/lanes/diverged-from-remote-lane.e2e.ts:54` local is diverged from the remote › import first then snap › bit status should show it as merge-pending
- [ ] `e2e/harmony/lanes/diverged-from-remote-lane.e2e.ts:96` local is diverged from the remote and another lane has a more recent snap › bit status should show it as merge-pending

### `e2e/harmony/lanes/import-lanes.e2e.ts`

- [ ] `e2e/harmony/lanes/import-lanes.e2e.ts:38` import lanes › importing lanes › fetching lanes objects › should not write the components to the filesystem
- [ ] `e2e/harmony/lanes/import-lanes.e2e.ts:41` import lanes › importing lanes › fetching lanes objects › bitmap should be empty
- [ ] `e2e/harmony/lanes/import-lanes.e2e.ts:45` import lanes › importing lanes › fetching lanes objects › should import components objects on that lane
- [ ] `e2e/harmony/lanes/import-lanes.e2e.ts:49` import lanes › importing lanes › fetching lanes objects › bit status should show a clean state
- [ ] `e2e/harmony/lanes/import-lanes.e2e.ts:54` import lanes › importing lanes › fetching lanes objects › bit fetch with no args should not throw errors
- [ ] `e2e/harmony/lanes/import-lanes.e2e.ts:64` import lanes › importing lanes › importing the lane and checking out by bit switch › should write the components to the filesystem
- [ ] `e2e/harmony/lanes/import-lanes.e2e.ts:69` import lanes › importing lanes › importing the lane and checking out by bit switch › .bitmap should save the remote lane
- [ ] `e2e/harmony/lanes/import-lanes.e2e.ts:74` import lanes › importing lanes › importing the lane and checking out by bit switch › bit lane should show the component in the checked out lane
- [ ] `e2e/harmony/lanes/import-lanes.e2e.ts:78` import lanes › importing lanes › importing the lane and checking out by bit switch › bit status should show clean state
- [ ] `e2e/harmony/lanes/import-lanes.e2e.ts:82` import lanes › importing lanes › importing the lane and checking out by bit switch › bit lane should show the checked out lane as the active one
- [ ] `e2e/harmony/lanes/import-lanes.e2e.ts:86` import lanes › importing lanes › importing the lane and checking out by bit switch › .bitmap should save the component as belong to the lane
- [ ] `e2e/harmony/lanes/import-lanes.e2e.ts:91` import lanes › importing lanes › importing the lane and checking out by bit switch › .bitmap should set the onLanesOnly for forward compatibility
- [ ] `e2e/harmony/lanes/import-lanes.e2e.ts:96` import lanes › importing lanes › importing the lane and checking out by bit switch › should save the lane object with the same hash as the original lane
- [ ] `e2e/harmony/lanes/import-lanes.e2e.ts:104` import lanes › importing lanes › importing the lane and checking out by bit switch › switching to main › should remove the lane key from the .bitmap
- [ ] `e2e/harmony/lanes/import-lanes.e2e.ts:108` import lanes › importing lanes › importing the lane and checking out by bit switch › switching to main › should switch successfully
- [ ] `e2e/harmony/lanes/import-lanes.e2e.ts:111` import lanes › importing lanes › importing the lane and checking out by bit switch › switching to main › should set the isAvailableOnCurrentLane to false
- [ ] `e2e/harmony/lanes/import-lanes.e2e.ts:124` import lanes › importing lanes › importing the lane and checking out with a different local lane-name › bit lane should show the component in the checked out lane
- [ ] `e2e/harmony/lanes/import-lanes.e2e.ts:128` import lanes › importing lanes › importing the lane and checking out with a different local lane-name › bit lane should show the checked out lane as the active one
- [ ] `e2e/harmony/lanes/import-lanes.e2e.ts:132` import lanes › importing lanes › importing the lane and checking out with a different local lane-name › should write the components to the filesystem
- [ ] `e2e/harmony/lanes/import-lanes.e2e.ts:137` import lanes › importing lanes › importing the lane and checking out with a different local lane-name › .bitmap should save the remote lane

### `e2e/harmony/lanes/lane-basic-operations.e2e.ts`

- [ ] `e2e/harmony/lanes/lane-basic-operations.e2e.ts:26` bit lane basic operations › creating a new lane without any component › bit lane should show the active lane
- [ ] `e2e/harmony/lanes/lane-basic-operations.e2e.ts:31` bit lane basic operations › creating a new lane without any component › should set the remote-scope to the default-scope and remote-name to the local-lane
- [ ] `e2e/harmony/lanes/lane-basic-operations.e2e.ts:40` bit lane basic operations › creating a new lane without any component › changing the tracking data › should output the changes
- [ ] `e2e/harmony/lanes/lane-basic-operations.e2e.ts:45` bit lane basic operations › creating a new lane without any component › changing the tracking data › bit lane show should show the changed values
- [ ] `e2e/harmony/lanes/lane-basic-operations.e2e.ts:61` bit lane basic operations › main => lane => main => lane › should be able to switch back to the lane with no error
- [ ] `e2e/harmony/lanes/lane-basic-operations.e2e.ts:80` bit lane basic operations › lane-a => lane-b › bit status should be clean
- [ ] `e2e/harmony/lanes/lane-basic-operations.e2e.ts:87` bit lane basic operations › lane-a => lane-b › lane-a (exported) => lane-b (not-exported) => lane-c › forkedFrom should be of lane-a and not lane-b because this is the last exported one
- [ ] `e2e/harmony/lanes/lane-basic-operations.e2e.ts:96` bit lane basic operations › lane-a => lane-b › switching back to lane-a › bitmap should show the lane as exported
- [ ] `e2e/harmony/lanes/lane-basic-operations.e2e.ts:110` bit lane basic operations › creating components on lanes, that do not exist on main › should add "onLanesOnly" prop
- [ ] `e2e/harmony/lanes/lane-basic-operations.e2e.ts:121` bit lane basic operations › creating a new lane to a different scope than main › should not throw even when --fork-lane-new-scope was not used
- [ ] `e2e/harmony/lanes/lane-basic-operations.e2e.ts:131` bit lane basic operations › bit lane current › when on main › should print "main"
- [ ] `e2e/harmony/lanes/lane-basic-operations.e2e.ts:135` bit lane basic operations › bit lane current › when on main › --json should return isDefault true
- [ ] `e2e/harmony/lanes/lane-basic-operations.e2e.ts:145` bit lane basic operations › bit lane current › when on a lane › should print the full lane id
- [ ] `e2e/harmony/lanes/lane-basic-operations.e2e.ts:149` bit lane basic operations › bit lane current › when on a lane › --json should return isDefault false with scope and name

### `e2e/harmony/lanes/lane-diff.e2e.ts`

- [ ] `e2e/harmony/lanes/lane-diff.e2e.ts:40` bit lane diff operations › diffing the current lane against main › with no args › should show the diff correctly
- [ ] `e2e/harmony/lanes/lane-diff.e2e.ts:43` bit lane diff operations › diffing the current lane against main › with no args › should not show the id field as it is redundant
- [ ] `e2e/harmony/lanes/lane-diff.e2e.ts:53` bit lane diff operations › diffing the current lane against main › with {toLane} being the default lane › should show the diff correctly
- [ ] `e2e/harmony/lanes/lane-diff.e2e.ts:62` bit lane diff operations › diffing the current lane against main › with {fromLane} {toLane} › should show the diff correctly
- [ ] `e2e/harmony/lanes/lane-diff.e2e.ts:72` bit lane diff operations › diffing the current lane against main › on the scope, after exporting the lane › should show the diff correctly
- [ ] `e2e/harmony/lanes/lane-diff.e2e.ts:96` bit lane diff operations › bit lane diff {toLane - non default} on the workspace › should show the diff correctly
- [ ] `e2e/harmony/lanes/lane-diff.e2e.ts:103` bit lane diff operations › bit lane diff {toLane - non default} on the workspace › should not show the id field as it is redundant

### `e2e/harmony/lanes/lane-eject.e2e.ts`

- [ ] `e2e/harmony/lanes/lane-eject.e2e.ts:43` bit lane command › eject with the default options › should indicate that the eject was successful
- [ ] `e2e/harmony/lanes/lane-eject.e2e.ts:46` bit lane command › eject with the default options › should save the component in workspace.jsonc
- [ ] `e2e/harmony/lanes/lane-eject.e2e.ts:52` bit lane command › eject with the default options › should mark the component as deleted on the lane
- [ ] `e2e/harmony/lanes/lane-eject.e2e.ts:56` bit lane command › eject with the default options › should have the component files as a package (in node_modules)
- [ ] `e2e/harmony/lanes/lane-eject.e2e.ts:60` bit lane command › eject with the default options › should delete the original component files from the file-system
- [ ] `e2e/harmony/lanes/lane-eject.e2e.ts:63` bit lane command › eject with the default options › bit status should show no issues
- [ ] `e2e/harmony/lanes/lane-eject.e2e.ts:66` bit lane command › eject with the default options › should not delete the objects from the scope
- [ ] `e2e/harmony/lanes/lane-eject.e2e.ts:81` bit lane command › eject when there is no main version › should throw an error saying it has no main version

### `e2e/harmony/lanes/lane-env-jsonc-dep.e2e.ts`

- [ ] `e2e/harmony/lanes/lane-env-jsonc-dep.e2e.ts:84` env with workspace component as peer dep in env.jsonc on lane › snap on a lane with env-own dep that is also in the workspace › should not show the env as modified after snapping on lane
- [ ] `e2e/harmony/lanes/lane-env-jsonc-dep.e2e.ts:90` env with workspace component as peer dep in env.jsonc on lane › snap on a lane with env-own dep that is also in the workspace › bit diff should not show dependency version changes between snap and tag for the env
- [ ] `e2e/harmony/lanes/lane-env-jsonc-dep.e2e.ts:102` env with workspace component as peer dep in env.jsonc on lane › snap on a lane with env-own dep that is also in the workspace › after a second snap on the lane › should not show the env as modified
- [ ] `e2e/harmony/lanes/lane-env-jsonc-dep.e2e.ts:108` env with workspace component as peer dep in env.jsonc on lane › snap on a lane with env-own dep that is also in the workspace › after a second snap on the lane › bit diff should not show dependency version changes for the env
- [ ] `e2e/harmony/lanes/lane-env-jsonc-dep.e2e.ts:120` env with workspace component as peer dep in env.jsonc on lane › snap on a lane with env-own dep that is also in the workspace › after a third snap on the lane (verifying no flip-flop) › should not show the env as modified
- [ ] `e2e/harmony/lanes/lane-env-jsonc-dep.e2e.ts:126` env with workspace component as peer dep in env.jsonc on lane › snap on a lane with env-own dep that is also in the workspace › after a third snap on the lane (verifying no flip-flop) › bit diff should not show dependency version changes for the env

### `e2e/harmony/lanes/lane-export-skip-main-history-http.e2e.ts`

- [ ] `e2e/harmony/lanes/lane-export-skip-main-history-http.e2e.ts:127` lane scope served over HTTP, components home scope on fs › the HTTP-served lane scope should hold the merge and lane snaps
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history-http.e2e.ts:132` lane scope served over HTTP, components home scope on fs › the HTTP-served lane scope should NOT contain pre-lane main Version objects
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history-http.e2e.ts:149` lane scope served over HTTP, components home scope on fs › fresh consumer imports the lane over HTTP › bit status should not throw
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history-http.e2e.ts:153` lane scope served over HTTP, components home scope on fs › fresh consumer imports the lane over HTTP › bit log should reach into main history transparently (fetched from home scope)

### `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts`

- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:82` lane export skips main history objects › lane in scope-L with components in scope-C, main advances, merge main into lane › what was pushed to lane scope (scope-L) › should contain the merge snap
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:86` lane export skips main history objects › lane in scope-L with components in scope-C, main advances, merge main into lane › what was pushed to lane scope (scope-L) › should contain the lane-only snap
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:90` lane export skips main history objects › lane in scope-L with components in scope-C, main advances, merge main into lane › what was pushed to lane scope (scope-L) › should NOT contain pre-lane main Version objects (the lean part stays lean)
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:97` lane export skips main history objects › lane in scope-L with components in scope-C, main advances, merge main into lane › what was pushed to lane scope (scope-L) › SHOULD contain the home-scope head Versions at each export point (one per export)
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:109` lane export skips main history objects › lane in scope-L with components in scope-C, main advances, merge main into lane › what stayed on component home scope (scope-C) › should still contain all main snaps
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:125` lane export skips main history objects › lane in scope-L with components in scope-C, main advances, merge main into lane › fresh consumer imports the lane › bit status should not throw
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:129` lane export skips main history objects › lane in scope-L with components in scope-C, main advances, merge main into lane › fresh consumer imports the lane › checkout HEAD should not throw
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:133` lane export skips main history objects › lane in scope-L with components in scope-C, main advances, merge main into lane › fresh consumer imports the lane › bit log should not throw and should show the full history including main snaps
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:151` lane export skips main history objects › lane in scope-L with components in scope-C, main advances, merge main into lane › fresh consumer imports the lane › bit lane diff <lean-lane> main should not throw on a fresh consumer
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:159` lane export skips main history objects › lane in scope-L with components in scope-C, main advances, merge main into lane › fresh consumer imports the lane › bit checkout HEAD~N to a main-only ancestor should not crash on a lean lane consumer
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:177` lane export skips main history objects › lane in scope-L with components in scope-C, main advances, merge main into lane › fresh consumer imports the lane › VersionHistory on the component home scope should contain the full main chain
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:186` lane export skips main history objects › lane in scope-L with components in scope-C, main advances, merge main into lane › fresh consumer imports the lane › VersionHistory on the lane scope is a closed graph (covers main + lane snaps)
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:270` lane export skips main history objects › fork a lean lane to a third scope, then re-import in a fresh workspace › fork the lane to scope-F and snap further › scope-F should hold the forked lane head (snapOnFork)
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:274` lane export skips main history objects › fork a lean lane to a third scope, then re-import in a fresh workspace › fork the lane to scope-F and snap further › scope-F's VersionHistory should be a closed graph
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:285` lane export skips main history objects › fork a lean lane to a third scope, then re-import in a fresh workspace › fork the lane to scope-F and snap further › a fresh consumer can import the forked lane without errors
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:293` lane export skips main history objects › fork a lean lane to a third scope, then re-import in a fresh workspace › fork the lane to scope-F and snap further › bit status and bit log should work in the fresh consumer of the forked lane
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:324` lane export skips main history objects › fork a lean lane to a third scope, then re-import in a fresh workspace › fork the lane to scope-F and snap further › traversal-dependent commands on a fresh consumer of the forked lane › bit lane merge main should succeed (traversal finds the common ancestor)
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:334` lane export skips main history objects › fork a lean lane to a third scope, then re-import in a fresh workspace › fork the lane to scope-F and snap further › traversal-dependent commands on a fresh consumer of the forked lane › consumer VersionHistory should be a closed graph (no dangling parent refs)
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:395` lane export skips main history objects › fresh consumer of a lean lane: create new lane + change-scope › bit status should not throw
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:399` lane export skips main history objects › fresh consumer of a lean lane: create new lane + change-scope › bit status should NOT report the entire history as staged — only true local snaps
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:464` lane export skips main history objects › lane with multiple components and deep main history merged repeatedly › lane scope holds both merge snaps plus the home-scope head at each export point
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:474` lane export skips main history objects › lane with multiple components and deep main history merged repeatedly › the component home scope retains all main snaps for all components
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:491` lane export skips main history objects › lane with multiple components and deep main history merged repeatedly › fresh consumer imports the multi-merge lane › bit status should not throw for any component
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:495` lane export skips main history objects › lane with multiple components and deep main history merged repeatedly › fresh consumer imports the multi-merge lane › bit log should reach both merge snaps and their main history for every component
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:503` lane export skips main history objects › lane with multiple components and deep main history merged repeatedly › fresh consumer imports the multi-merge lane › comp1 log should contain both merge snaps explicitly (sanity for the lane head)
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:537` lane export skips main history objects › sanity: regular (non-merge) lane export still includes lane-only history fully › lane scope should contain all lane-origin snaps
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:570` lane export skips main history objects › sanity: existing main-merge with no scope split still works (lane and components share scope) › the shared remote scope should contain both the merge snap and the old main snap (same-scope case)
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:577` lane export skips main history objects › sanity: existing main-merge with no scope split still works (lane and components share scope) › bit log should work without errors
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:634` lane export skips main history objects › chained local forks: lane-a (exported) → lane-b (local) → lane-c (exported) › exporting lane-c should succeed because forkedFrom is resolved to the nearest exported ancestor
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:641` lane export skips main history objects › chained local forks: lane-a (exported) → lane-b (local) → lane-c (exported) › scope-C should contain the lane-c head Version
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:645` lane export skips main history objects › chained local forks: lane-a (exported) → lane-b (local) → lane-c (exported) › scope-C VersionHistory should be a closed graph despite the local-fork chain
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:696` lane export skips main history objects › a lane far behind main, after merging main in › bit status staged versions should match what bit export will push (lane-origin only)
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:714` lane export skips main history objects › a lane far behind main, after merging main in › running bit reset › should leave the merged-in main tag (0.0.2) intact in the component versions
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:801` lane export skips main history objects › cross-scope chained lane forks: lane-A on scope-L → lane-B on scope-M → lane-C on scope-N › scope-N should hold the lane-C head Version
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:805` lane export skips main history objects › cross-scope chained lane forks: lane-A on scope-L → lane-B on scope-M → lane-C on scope-N › scope-N VersionHistory should be a closed graph across the cross-scope chain
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:815` lane export skips main history objects › cross-scope chained lane forks: lane-A on scope-L → lane-B on scope-M → lane-C on scope-N › scope-N's VH should include lane-A's snap (the deepest ancestor in the fork chain)
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:833` lane export skips main history objects › cross-scope chained lane forks: lane-A on scope-L → lane-B on scope-M → lane-C on scope-N › fresh consumer of lane-C › bit status should not throw
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:837` lane export skips main history objects › cross-scope chained lane forks: lane-A on scope-L → lane-B on scope-M → lane-C on scope-N › fresh consumer of lane-C › bit lane merge main should find the common ancestor across the three-fork chain
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:909` lane export skips main history objects › forked-from lane deleted upstream — export degrades to home-scope fetch › exporting lane-B should not fail even though the forked-from lane was deleted upstream
- [ ] `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts:913` lane export skips main history objects › forked-from lane deleted upstream — export degrades to home-scope fetch › scope-M's VersionHistory for comp2 should be closed (home-scope fetch satisfied closure)

### `e2e/harmony/lanes/lane-export.e2e.ts`

- [x] `e2e/harmony/lanes/lane-export.e2e.ts:29` bit lane export operations › exporting the lane › should export components on that lane — `cli/tests/e2e/commands/export.rs::fresh_lane_component_export_matches_node`
- [x] `e2e/harmony/lanes/lane-export.e2e.ts:33` bit lane export operations › exporting the lane › bit status should show a clean state — `cli/tests/e2e/commands/export.rs::fresh_lane_component_export_matches_node`
- [x] `e2e/harmony/lanes/lane-export.e2e.ts:36` bit lane export operations › exporting the lane › should change .bitmap to have the remote lane — `cli/tests/e2e/commands/export.rs::fresh_lane_component_export_matches_node`
- [ ] `e2e/harmony/lanes/lane-export.e2e.ts:40` bit lane export operations › exporting the lane › bit lane --remote should show the exported lane
- [ ] `e2e/harmony/lanes/lane-export.e2e.ts:49` bit lane export operations › exporting the lane › importing the component › should not set the onLaneOnly to true as it exists also on main
- [ ] `e2e/harmony/lanes/lane-export.e2e.ts:73` bit lane export operations › exporting a lane to a different scope than the component scope › bit import in a new workspace should not throw an error
- [ ] `e2e/harmony/lanes/lane-export.e2e.ts:94` bit lane export operations › snap on lane, export, clear project, snap and export › should export with no errors about missing artifact files from the first snap
- [ ] `e2e/harmony/lanes/lane-export.e2e.ts:109` bit lane export operations › tag on main, export, create lane and snap › bit status should show the correct staged versions
- [ ] `e2e/harmony/lanes/lane-export.e2e.ts:138` bit lane export operations › export on main then on a lane › bit status should not complain about outdated objects
- [ ] `e2e/harmony/lanes/lane-export.e2e.ts:158` bit lane export operations › export when previous versions have deleted dependencies › should not throw ComponentNotFound on export
- [ ] `e2e/harmony/lanes/lane-export.e2e.ts:176` bit lane export operations › export on lane with tiny cache › should not throw
- [ ] `e2e/harmony/lanes/lane-export.e2e.ts:193` bit lane export operations › export multiple snaps on lane when the remote has it already › bit export should not throw ParentNotFound
- [ ] `e2e/harmony/lanes/lane-export.e2e.ts:217` bit lane export operations › export interrupted, reset, snap then import › bit status should show the components as merge-pending
- [ ] `e2e/harmony/lanes/lane-export.e2e.ts:221` bit lane export operations › export interrupted, reset, snap then import › bit export should fail
- [ ] `e2e/harmony/lanes/lane-export.e2e.ts:224` bit lane export operations › export interrupted, reset, snap then import › reset, checkout-head and re-snap should fix it and make it possible to export

### `e2e/harmony/lanes/lane-forking.e2e.ts`

- [ ] `e2e/harmony/lanes/lane-forking.e2e.ts:35` bit lane forking › multiple scopes - fork the lane and export to another scope › should be able to import the forked lane with no errors
- [ ] `e2e/harmony/lanes/lane-forking.e2e.ts:78` bit lane forking › multiple scopes - fork the lane, then original lane progresses and squashed to main › should not throw NoCommonSnap on bit status
- [ ] `e2e/harmony/lanes/lane-forking.e2e.ts:81` bit lane forking › multiple scopes - fork the lane, then original lane progresses and squashed to main › should be able to export with no error
- [ ] `e2e/harmony/lanes/lane-forking.e2e.ts:112` bit lane forking › exporting a component on a lane when the staged snaps exist already on the remote (from another lane) › bit export should not throw

### `e2e/harmony/lanes/lane-from-lane.e2e.ts`

- [ ] `e2e/harmony/lanes/lane-from-lane.e2e.ts:46` bit lane command › main => lane-a => lane-b, so laneB branched from laneA › lane-a should not contain components from main
- [ ] `e2e/harmony/lanes/lane-from-lane.e2e.ts:50` bit lane command › main => lane-a => lane-b, so laneB branched from laneA › laneB object should include components from laneA, but not from main
- [ ] `e2e/harmony/lanes/lane-from-lane.e2e.ts:54` bit lane command › main => lane-a => lane-b, so laneB branched from laneA › bit list should show all components available to lane-b
- [ ] `e2e/harmony/lanes/lane-from-lane.e2e.ts:63` bit lane command › main => lane-a => lane-b, so laneB branched from laneA › checking out to lane-a › should indicate that it switched to the new lane
- [ ] `e2e/harmony/lanes/lane-from-lane.e2e.ts:70` bit lane command › main => lane-a => lane-b, so laneB branched from laneA › checking out to lane-a › bit status should not show neither lane-b nor main components as staged
- [ ] `e2e/harmony/lanes/lane-from-lane.e2e.ts:76` bit lane command › main => lane-a => lane-b, so laneB branched from laneA › checking out to lane-a › bit list should not show lane-b components
- [ ] `e2e/harmony/lanes/lane-from-lane.e2e.ts:87` bit lane command › main => lane-a => lane-b, so laneB branched from laneA › checking out from lane-b to main › bit list should only show main components
- [ ] `e2e/harmony/lanes/lane-from-lane.e2e.ts:91` bit lane command › main => lane-a => lane-b, so laneB branched from laneA › checking out from lane-b to main › bit status should show only main components as staged
- [ ] `e2e/harmony/lanes/lane-from-lane.e2e.ts:105` bit lane command › main => lane-a => lane-b, so laneB branched from laneA › switching to lane-a then to main › bit list should only show main components
- [ ] `e2e/harmony/lanes/lane-from-lane.e2e.ts:109` bit lane command › main => lane-a => lane-b, so laneB branched from laneA › switching to lane-a then to main › bit status should show only main components as staged
- [ ] `e2e/harmony/lanes/lane-from-lane.e2e.ts:140` bit lane command › creating a lane from main after merging another lane into main locally › the new lane should include the merged snaps
- [ ] `e2e/harmony/lanes/lane-from-lane.e2e.ts:167` bit lane command › snapping on lane-b when the components are checked out to lane-a snaps › bit snap should throw because comp1 depends on comp2 snap from lane-a
- [ ] `e2e/harmony/lanes/lane-from-lane.e2e.ts:198` bit lane command › creating lane-b from lane-a when lane-a is out-of-date › should add the component from the current/first snap (from .bitmap) and not from the head (lane-a object)
- [ ] `e2e/harmony/lanes/lane-from-lane.e2e.ts:214` bit lane command › creating a lane from a lane when it has staged components › bit lane create should succeed and the new lane should include the local snap
- [ ] `e2e/harmony/lanes/lane-from-lane.e2e.ts:252` bit lane command › creating a lane when the current lane has diverged from the remote › should allow creating a new lane and include the local diverged snap
- [ ] `e2e/harmony/lanes/lane-from-lane.e2e.ts:261` bit lane command › creating a lane when the current lane has diverged from the remote › after creating the new lane, check the old lane state › should show the old lane still has the local snap as head
- [ ] `e2e/harmony/lanes/lane-from-lane.e2e.ts:265` bit lane command › creating a lane when the current lane has diverged from the remote › after creating the new lane, check the old lane state › without importing, bit status shows the component as staged (does not know about remote divergence)
- [ ] `e2e/harmony/lanes/lane-from-lane.e2e.ts:269` bit lane command › creating a lane when the current lane has diverged from the remote › after creating the new lane, check the old lane state › after importing, bit status still shows as staged (not ideal but acceptable - user can reset or delete the lane)
- [ ] `e2e/harmony/lanes/lane-from-lane.e2e.ts:289` bit lane command › fork a lane when the default-scope is different than the original lane's scope › should set the scope-name to be the same as the original lane

### `e2e/harmony/lanes/lane-history-diff.e2e.ts`

- [ ] `e2e/harmony/lanes/lane-history-diff.e2e.ts:49` lane history-diff › bit reset removes the lane-history entry of the reset snap › should not have a lane-history entry for the reset snap
- [ ] `e2e/harmony/lanes/lane-history-diff.e2e.ts:56` lane history-diff › bit reset removes the lane-history entry of the reset snap › no args: should diff latest against its predecessor without errors
- [ ] `e2e/harmony/lanes/lane-history-diff.e2e.ts:63` lane history-diff › bit reset removes the lane-history entry of the reset snap › with one arg (latest id): should diff against predecessor without errors
- [ ] `e2e/harmony/lanes/lane-history-diff.e2e.ts:71` lane history-diff › bit reset removes the lane-history entry of the reset snap › with one arg (first id): should throw since it has no predecessor

### `e2e/harmony/lanes/lane-history-merge.e2e.ts`

- [ ] `e2e/harmony/lanes/lane-history-merge.e2e.ts:45` lane history with merge operations › merging a lane when the target lane is behind (fast-forward merge, no snap) › should have added a history entry for the merge operation
- [ ] `e2e/harmony/lanes/lane-history-merge.e2e.ts:50` lane history with merge operations › merging a lane when the target lane is behind (fast-forward merge, no snap) › should have a history entry with "merge" message
- [ ] `e2e/harmony/lanes/lane-history-merge.e2e.ts:55` lane history with merge operations › merging a lane when the target lane is behind (fast-forward merge, no snap) › should include the full source lane identifier in the merge history message

### `e2e/harmony/lanes/lane-history-with-deleted-components.e2e.ts`

- [ ] `e2e/harmony/lanes/lane-history-with-deleted-components.e2e.ts:48` lane history with deleted components › a lane where two of three components were deleted with bit delete --lane › bit lane checkout to the entry before the deletion › should checkout without errors about missing components
- [ ] `e2e/harmony/lanes/lane-history-with-deleted-components.e2e.ts:52` lane history with deleted components › a lane where two of three components were deleted with bit delete --lane › bit lane checkout to the entry before the deletion › should restore all deleted components
- [ ] `e2e/harmony/lanes/lane-history-with-deleted-components.e2e.ts:70` lane history with deleted components › a lane where two of three components were deleted with bit delete --lane › bit lane revert to that entry, without --restore-deleted-components › should not throw (revert leaves deleted components deleted)
- [ ] `e2e/harmony/lanes/lane-history-with-deleted-components.e2e.ts:81` lane history with deleted components › a lane where two of three components were deleted with bit delete --lane › bit lane revert to that entry, with --restore-deleted-components › should restore the deleted components
- [ ] `e2e/harmony/lanes/lane-history-with-deleted-components.e2e.ts:123` lane history with deleted components › reverting with a mixed scenario: one component modified, two deleted › should keep modified component version in bitmap but restore its files

### `e2e/harmony/lanes/lane-import-git-branch.e2e.ts`

- [ ] `e2e/harmony/lanes/lane-import-git-branch.e2e.ts:36` bit lane import with --branch flag › importing an exported lane into a git repo › when no git branch with the lane name exists › should import the lane successfully
- [ ] `e2e/harmony/lanes/lane-import-git-branch.e2e.ts:39` bit lane import with --branch flag › importing an exported lane into a git repo › when no git branch with the lane name exists › should checkout to the branch with the same name as the lane id
- [ ] `e2e/harmony/lanes/lane-import-git-branch.e2e.ts:61` bit lane import with --branch flag › importing an exported lane into a git repo › when the git branch already exists › should warn that the git branch could not be created
- [ ] `e2e/harmony/lanes/lane-import-git-branch.e2e.ts:65` bit lane import with --branch flag › importing an exported lane into a git repo › when the git branch already exists › should still import the lane successfully
- [ ] `e2e/harmony/lanes/lane-import-git-branch.e2e.ts:114` bit lane import with --branch flag › import lane after remote lane changes › switching git back to main should switch the lane as well to main and keep status clean

### `e2e/harmony/lanes/lane-import.e2e.ts`

- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:38` bit lane import operations › switching to a new lane › should not show all components are staged
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:68` bit lane import operations › update components from remote lane › running "bit import" when the local is behind › bit import should not only bring the components but also merge the lane object
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:73` bit lane import operations › update components from remote lane › running "bit import" when the local is behind › bit status should show the components as pending-updates
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:77` bit lane import operations › update components from remote lane › running "bit import" when the local is behind › bit checkout head --all should update them all to the head version
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:88` bit lane import operations › update components from remote lane › running "bit import" when the remote is behind › bit import should not change the heads with the older snaps
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:93` bit lane import operations › update components from remote lane › running "bit import" when the remote is behind › bit status should still show the components as staged
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:108` bit lane import operations › update components from remote lane › running "bit import" when the remote and the local have diverged › bit import should not change the heads with the older snaps
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:113` bit lane import operations › update components from remote lane › running "bit import" when the remote and the local have diverged › bit status should show the components as pending-merge
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:117` bit lane import operations › update components from remote lane › running "bit import" when the remote and the local have diverged › bit merge with no args should merge them
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:138` bit lane import operations › some components are on a lane some are not › bit list should not show components from the lanes
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:142` bit lane import operations › some components are on a lane some are not › bit import should not throw
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:158` bit lane import operations › deleting the local scope after exporting a lane › should re-create scope.json with checkout to the lane specified in the .bitmap file
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:162` bit lane import operations › deleting the local scope after exporting a lane › bit import should not throw an error
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:185` bit lane import operations › import from one lane to another directly › should block the import
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:209` bit lane import operations › importing a lane-a snap from a workspace that is not on lane-a › when on main › should block the import
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:221` bit lane import operations › importing a lane-a snap from a workspace that is not on lane-a › when on another lane that does not have the component › should block the import
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:252` bit lane import operations › import from one lane to another directly when current lane does have the component › should not bring that snap
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:256` bit lane import operations › import from one lane to another directly when current lane does have the component › should not not change .bitmap
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:287` bit lane import operations › checking out to a different version from main › bit import should bring the version in the bitmap
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:290` bit lane import operations › checking out to a different version from main › bit status should not throw ComponentsPendingImport
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:308` bit lane import operations › create comp on a lane then same on main › bit status should not throw
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:349` bit lane import operations › lane import with env using "+" version for component peer dependency (snaps) › should resolve "+" version and not pass it directly to pnpm
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:384` bit lane import operations › getting new components from the lane › bit checkout with --workspace-only flag should not add the component and should suggest omitting --workspace-only flag
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:390` bit lane import operations › getting new components from the lane › bit checkout without --workspace-only flag should add the new components
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:407` bit lane import operations › getting new components from the lane › when the new component is soft-removed › bit checkout with --workspace-only flag, should not suggest omitting it
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:412` bit lane import operations › getting new components from the lane › when the new component is soft-removed › bit checkout head should not add it
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:440` bit lane import operations › "bit lane import" current-lane behavior › when on the default lane (main) › should switch to the imported lane
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:460` bit lane import operations › "bit lane import" current-lane behavior › when on a different lane with an uncommitted edit to a tracked component › should not switch lanes
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:463` bit lane import operations › "bit lane import" current-lane behavior › when on a different lane with an uncommitted edit to a tracked component › should preserve the uncommitted edit to the tracked component
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:466` bit lane import operations › "bit lane import" current-lane behavior › when on a different lane with an uncommitted edit to a tracked component › should keep the lane-b component in the workspace
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:471` bit lane import operations › "bit lane import" current-lane behavior › when on a different lane with an uncommitted edit to a tracked component › should print a hint instructing the user to run "bit switch" to actually switch
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:475` bit lane import operations › "bit lane import" current-lane behavior › when on a different lane with an uncommitted edit to a tracked component › should make the imported lane appear in "bit lane list"
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:510` bit lane import operations › "bit lane import" current-lane behavior › when on the same lane being imported › running "bit lane import" for the current lane › should keep the same current lane
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:513` bit lane import operations › "bit lane import" current-lane behavior › when on the same lane being imported › running "bit lane import" for the current lane › should preserve uncommitted local file changes
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:516` bit lane import operations › "bit lane import" current-lane behavior › when on the same lane being imported › running "bit lane import" for the current lane › should fetch the latest lane head from the remote
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:520` bit lane import operations › "bit lane import" current-lane behavior › when on the same lane being imported › running "bit lane import" for the current lane › should make it clear the user is already on the lane and the workspace was not updated
- [ ] `e2e/harmony/lanes/lane-import.e2e.ts:525` bit lane import operations › "bit lane import" current-lane behavior › when on the same lane being imported › running "bit lane import" for the current lane › should prominently tell the user to run "bit checkout head" to update the workspace

### `e2e/harmony/lanes/lane-management.e2e.ts`

- [ ] `e2e/harmony/lanes/lane-management.e2e.ts:29` bit lane management › rename an exported lane that has an alias › should rename the lane locally
- [ ] `e2e/harmony/lanes/lane-management.e2e.ts:34` bit lane management › rename an exported lane that has an alias › should change the current lane
- [ ] `e2e/harmony/lanes/lane-management.e2e.ts:38` bit lane management › rename an exported lane that has an alias › bit status should not throw
- [ ] `e2e/harmony/lanes/lane-management.e2e.ts:43` bit lane management › rename an exported lane that has an alias › should update .bitmap with the new name
- [ ] `e2e/harmony/lanes/lane-management.e2e.ts:47` bit lane management › rename an exported lane that has an alias › should not change the remote lane name before export
- [ ] `e2e/harmony/lanes/lane-management.e2e.ts:52` bit lane management › rename an exported lane that has an alias › should change the remote lane name after export
- [ ] `e2e/harmony/lanes/lane-management.e2e.ts:71` bit lane management › a new lane with a snapped component › bit lane --details should show the lanes, mark the current one and list its components
- [ ] `e2e/harmony/lanes/lane-management.e2e.ts:77` bit lane management › a new lane with a snapped component › change-scope should throw InvalidScopeName for an invalid scope-name
- [ ] `e2e/harmony/lanes/lane-management.e2e.ts:87` bit lane management › a new lane with a snapped component › once the lane is exported › change-scope should be blocked

### `e2e/harmony/lanes/lane-merge.e2e.ts`

- [ ] `e2e/harmony/lanes/lane-merge.e2e.ts:32` bit lane merge operations › export the lane, then switch back to main › status should not show the components as pending updates
- [ ] `e2e/harmony/lanes/lane-merge.e2e.ts:39` bit lane merge operations › export the lane, then switch back to main › switch the lane back to dev › should change the version prop in .bitmap
- [ ] `e2e/harmony/lanes/lane-merge.e2e.ts:48` bit lane merge operations › export the lane, then switch back to main › switch the lane back to dev › switch back to main › should change the version prop in .bitmap
- [ ] `e2e/harmony/lanes/lane-merge.e2e.ts:52` bit lane merge operations › export the lane, then switch back to main › switch the lane back to dev › switch back to main › status should not show the components as pending updates
- [ ] `e2e/harmony/lanes/lane-merge.e2e.ts:62` bit lane merge operations › export the lane, then switch back to main › merging the dev lane when the lane is ahead (no diverge) › should merge the lane
- [ ] `e2e/harmony/lanes/lane-merge.e2e.ts:66` bit lane merge operations › export the lane, then switch back to main › merging the dev lane when the lane is ahead (no diverge) › should show the merged components as staged
- [ ] `e2e/harmony/lanes/lane-merge.e2e.ts:70` bit lane merge operations › export the lane, then switch back to main › merging the dev lane when the lane is ahead (no diverge) › bit import should not reset the component to the remote-state but should keep the merged data
- [ ] `e2e/harmony/lanes/lane-merge.e2e.ts:80` bit lane merge operations › export the lane, then switch back to main › merging the dev lane when the lane is ahead (no diverge) › tagging the components › should be able to export with no errors
- [ ] `e2e/harmony/lanes/lane-merge.e2e.ts:93` bit lane merge operations › export the lane, then switch back to main › merging the dev lane when the lane has diverged from main › should merge the lane
- [ ] `e2e/harmony/lanes/lane-merge.e2e.ts:97` bit lane merge operations › export the lane, then switch back to main › merging the dev lane when the lane has diverged from main › should show the merged components as staged
- [ ] `e2e/harmony/lanes/lane-merge.e2e.ts:105` bit lane merge operations › export the lane, then switch back to main › merging the dev lane when the lane has diverged from main › tagging the components › should be able to export with no errors
- [ ] `e2e/harmony/lanes/lane-merge.e2e.ts:132` bit lane merge operations › branching out when a component is checked out to an older version › should checkout to the head of the origin branch
- [ ] `e2e/harmony/lanes/lane-merge.e2e.ts:135` bit lane merge operations › branching out when a component is checked out to an older version › bit status should be clean
- [ ] `e2e/harmony/lanes/lane-merge.e2e.ts:152` bit lane merge operations › head on the lane is not in the filesystem › bit status should not throw

### `e2e/harmony/lanes/lane-multiple-scopes.e2e.ts`

- [ ] `e2e/harmony/lanes/lane-multiple-scopes.e2e.ts:50` bit lane multiple scopes › multiple scopes › exporting the lane to the remote › should not throw an error
- [ ] `e2e/harmony/lanes/lane-multiple-scopes.e2e.ts:54` bit lane multiple scopes › multiple scopes › exporting the lane to the remote › should remove the content of the staged-config
- [ ] `e2e/harmony/lanes/lane-multiple-scopes.e2e.ts:59` bit lane multiple scopes › multiple scopes › exporting the lane to the remote › the components scope should not be changed on the remote
- [ ] `e2e/harmony/lanes/lane-multiple-scopes.e2e.ts:77` bit lane multiple scopes › multiple scopes › when artifacts from older versions are missing locally › should not throw an error
- [ ] `e2e/harmony/lanes/lane-multiple-scopes.e2e.ts:94` bit lane multiple scopes › multiple scopes › importing the lane › should not show the component as staged
- [ ] `e2e/harmony/lanes/lane-multiple-scopes.e2e.ts:125` bit lane multiple scopes › multiple scopes when the components are new › exporting the lane to the remote › should not change the scope of the components in .bitmap
- [ ] `e2e/harmony/lanes/lane-multiple-scopes.e2e.ts:130` bit lane multiple scopes › multiple scopes when the components are new › exporting the lane to the remote › should not change the scope-name in the lane object
- [ ] `e2e/harmony/lanes/lane-multiple-scopes.e2e.ts:142` bit lane multiple scopes › multiple scopes when the components are new › exporting the lane to the remote › importing the lane › should not show the component as staged
- [ ] `e2e/harmony/lanes/lane-multiple-scopes.e2e.ts:183` bit lane multiple scopes › multiple scopes when main is ahead › should be able to export
- [ ] `e2e/harmony/lanes/lane-multiple-scopes.e2e.ts:211` bit lane multiple scopes › multiple scopes when a component in the origin is different than on the lane › bit export should throw an error
- [ ] `e2e/harmony/lanes/lane-multiple-scopes.e2e.ts:226` bit lane multiple scopes › multiple scopes when a scope of the component does not exist › bit export should succeed
- [ ] `e2e/harmony/lanes/lane-multiple-scopes.e2e.ts:246` bit lane multiple scopes › multiple scopes when the origin-scope exits but does not have the component. only lane-scope has it › bit import should not throw an error
- [ ] `e2e/harmony/lanes/lane-multiple-scopes.e2e.ts:292` bit lane multiple scopes › multiple scopes - fetching missing history into the lane-scope › using the FetchMissingHistory action › the remote should have the history of a component from the other remote
- [ ] `e2e/harmony/lanes/lane-multiple-scopes.e2e.ts:318` bit lane multiple scopes › multiple scopes - fetching missing history into the lane-scope › using the FetchVersionHistory action › the remote should have the VersionHistory object with populated versions
- [ ] `e2e/harmony/lanes/lane-multiple-scopes.e2e.ts:324` bit lane multiple scopes › multiple scopes - fetching missing history into the lane-scope › using the FetchVersionHistory action › the remote should NOT have the Version object (only VersionHistory was fetched)
- [ ] `e2e/harmony/lanes/lane-multiple-scopes.e2e.ts:360` bit lane multiple scopes › multiple scopes - lane-scope does not have main tags › bit status should show only the last snap of the imported component as staged
- [ ] `e2e/harmony/lanes/lane-multiple-scopes.e2e.ts:366` bit lane multiple scopes › multiple scopes - lane-scope does not have main tags › bit export should not throw an error

### `e2e/harmony/lanes/lane-snapping.e2e.ts`

- [ ] `e2e/harmony/lanes/lane-snapping.e2e.ts:28` bit lane snapping and tagging › create a snap on main then on a new lane › bit status should show the component only once as staged
- [ ] `e2e/harmony/lanes/lane-snapping.e2e.ts:37` bit lane snapping and tagging › create a snap on main then on a new lane › bit log should show both snaps
- [ ] `e2e/harmony/lanes/lane-snapping.e2e.ts:44` bit lane snapping and tagging › create a snap on main then on a new lane › bit log --parents should show the parents
- [ ] `e2e/harmony/lanes/lane-snapping.e2e.ts:62` bit lane snapping and tagging › tagging on a lane › should block the tag and suggest to switch to main and merge the changes
- [ ] `e2e/harmony/lanes/lane-snapping.e2e.ts:90` bit lane snapping and tagging › auto-snap when on a lane › should auto snap the dependencies and the nested dependencies
- [ ] `e2e/harmony/lanes/lane-snapping.e2e.ts:93` bit lane snapping and tagging › auto-snap when on a lane › should update the dependencies and the flattenedDependencies of the dependent with the new versions
- [ ] `e2e/harmony/lanes/lane-snapping.e2e.ts:104` bit lane snapping and tagging › auto-snap when on a lane › should update the dependencies and the flattenedDependencies of the dependent of the dependent with the new versions
- [ ] `e2e/harmony/lanes/lane-snapping.e2e.ts:120` bit lane snapping and tagging › auto-snap when on a lane › bit-status should show them all as staged and not modified
- [ ] `e2e/harmony/lanes/lane-snapping.e2e.ts:141` bit lane snapping and tagging › snapping and un-tagging on a lane › should report the component as reset
- [ ] `e2e/harmony/lanes/lane-snapping.e2e.ts:144` bit lane snapping and tagging › snapping and un-tagging on a lane › bit status should show the component as new
- [ ] `e2e/harmony/lanes/lane-snapping.e2e.ts:148` bit lane snapping and tagging › snapping and un-tagging on a lane › bit lane show should not show the component as belong to the lane anymore
- [ ] `e2e/harmony/lanes/lane-snapping.e2e.ts:153` bit lane snapping and tagging › snapping and un-tagging on a lane › bit list should not show the currentVersion as the untagged version
- [ ] `e2e/harmony/lanes/lane-snapping.e2e.ts:161` bit lane snapping and tagging › snapping and un-tagging on a lane › switching to main › bit status should show the component as new
- [ ] `e2e/harmony/lanes/lane-snapping.e2e.ts:172` bit lane snapping and tagging › snapping and un-tagging on a lane › add another snap and then untag only the last snap › should not show the component as new
- [ ] `e2e/harmony/lanes/lane-snapping.e2e.ts:183` bit lane snapping and tagging › snapping and un-tagging on a lane › un-snap by specifying the component name › should not throw an error
- [ ] `e2e/harmony/lanes/lane-snapping.e2e.ts:203` bit lane snapping and tagging › bit checkout to a previous snap › should not show the component as modified
- [ ] `e2e/harmony/lanes/lane-snapping.e2e.ts:207` bit lane snapping and tagging › bit checkout to a previous snap › bit list should show the scope-version as latest and workspace-version as the checked out one

### `e2e/harmony/lanes/lanes-with-issues.e2e.ts`

- [ ] `e2e/harmony/lanes/lanes-with-issues.e2e.ts:30` lanes with various issues › issue - object of head of main is missing from the filesystem and remote › bit diff diff should not throw
- [ ] `e2e/harmony/lanes/lanes-with-issues.e2e.ts:35` lanes with various issues › issue - object of head of main is missing from the filesystem and remote › bit diff main should not throw

### `e2e/harmony/lanes/merge-lane-to-main-stale-dep-ref.e2e.ts`

- [ ] `e2e/harmony/lanes/merge-lane-to-main-stale-dep-ref.e2e.ts:99` merge lane to main when a component pins a non-head (squashed-out) snap of its dependency › the stale pinned dependency lives in another scope (cross-scope pin) › the export should succeed — the remote integrity check skips cross-scope deps
- [ ] `e2e/harmony/lanes/merge-lane-to-main-stale-dep-ref.e2e.ts:102` merge lane to main when a component pins a non-head (squashed-out) snap of its dependency › the stale pinned dependency lives in another scope (cross-scope pin) › the stale snap should not exist on the dependency home scope, only on the lane scope
- [ ] `e2e/harmony/lanes/merge-lane-to-main-stale-dep-ref.e2e.ts:119` merge lane to main when a component pins a non-head (squashed-out) snap of its dependency › the stale pinned dependency lives in another scope (cross-scope pin) › importing the dependent component later from a fresh workspace › bit import of the dependent should work — the missing pinned dep version is tolerated
- [ ] `e2e/harmony/lanes/merge-lane-to-main-stale-dep-ref.e2e.ts:123` merge lane to main when a component pins a non-head (squashed-out) snap of its dependency › the stale pinned dependency lives in another scope (cross-scope pin) › importing the dependent component later from a fresh workspace › bit status should not report invalid components
- [ ] `e2e/harmony/lanes/merge-lane-to-main-stale-dep-ref.e2e.ts:127` merge lane to main when a component pins a non-head (squashed-out) snap of its dependency › the stale pinned dependency lives in another scope (cross-scope pin) › importing the dependent component later from a fresh workspace › bit import --dependencies should work — the missing pinned dep version is skipped silently
- [ ] `e2e/harmony/lanes/merge-lane-to-main-stale-dep-ref.e2e.ts:130` merge lane to main when a component pins a non-head (squashed-out) snap of its dependency › the stale pinned dependency lives in another scope (cross-scope pin) › importing the dependent component later from a fresh workspace › importing the pinned dep version explicitly should soft-fail as missing and not fetch it
- [ ] `e2e/harmony/lanes/merge-lane-to-main-stale-dep-ref.e2e.ts:151` merge lane to main when a component pins a non-head (squashed-out) snap of its dependency › the referenced snap is only on the lane scope (fresh import; not local before the merge) › the referenced snap should not be present locally before the merge
- [ ] `e2e/harmony/lanes/merge-lane-to-main-stale-dep-ref.e2e.ts:154` merge lane to main when a component pins a non-head (squashed-out) snap of its dependency › the referenced snap is only on the lane scope (fresh import; not local before the merge) › the merge should import it from the lane scope and the export should succeed

### `e2e/harmony/lanes/merge-lanes-diverge.e2e.ts`

- [ ] `e2e/harmony/lanes/merge-lanes-diverge.e2e.ts:37` merge lanes - diverge functionality › getting updates from main when lane is diverge › bit import should not bring the latest main objects
- [ ] `e2e/harmony/lanes/merge-lanes-diverge.e2e.ts:41` merge lanes - diverge functionality › getting updates from main when lane is diverge › bit status should indicate that the main is ahead
- [ ] `e2e/harmony/lanes/merge-lanes-diverge.e2e.ts:53` merge lanes - diverge functionality › getting updates from main when lane is diverge › merging the lane › bit status should show one staging version (the merge-snap)
- [ ] `e2e/harmony/lanes/merge-lanes-diverge.e2e.ts:58` merge lanes - diverge functionality › getting updates from main when lane is diverge › merging the lane › bit status should not show the components in pending-merge
- [ ] `e2e/harmony/lanes/merge-lanes-diverge.e2e.ts:66` merge lanes - diverge functionality › getting updates from main when lane is diverge › merging the lane › switching to main and merging the lane to main without squash › head should have two parents
- [ ] `e2e/harmony/lanes/merge-lanes-diverge.e2e.ts:72` merge lanes - diverge functionality › getting updates from main when lane is diverge › merging the lane › switching to main and merging the lane to main without squash › bit reset should not throw
- [ ] `e2e/harmony/lanes/merge-lanes-diverge.e2e.ts:84` merge lanes - diverge functionality › getting updates from main when lane is diverge › merging the lane › switching to main and merging the lane to main (with squash) › head should have one parents, which is the previous main head
- [ ] `e2e/harmony/lanes/merge-lanes-diverge.e2e.ts:96` merge lanes - diverge functionality › getting updates from main when lane is diverge › merge the lane without snapping › should show the during-merge as modified
- [ ] `e2e/harmony/lanes/merge-lanes-diverge.e2e.ts:100` merge lanes - diverge functionality › getting updates from main when lane is diverge › merge the lane without snapping › bit diff should show the diff between the .bitmap version and the currently merged version
- [ ] `e2e/harmony/lanes/merge-lanes-diverge.e2e.ts:129` merge lanes - diverge functionality › merge file changes from one lane to another › should save the latest versions from that lane into the local lane
- [ ] `e2e/harmony/lanes/merge-lanes-diverge.e2e.ts:134` merge lanes - diverge functionality › merge file changes from one lane to another › should write a file that was added only on the merged remote lane

### `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts`

- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:36` merge lanes - edge cases and special scenarios (part 2) › naming conflict introduced during the merge › should merge without error by prefix "_1" to the dir-name
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:66` merge lanes - edge cases and special scenarios (part 2) › merge lane-a to main with squashing then from main to lane-b which forked from lane-a › bit-lane-merge should not throw
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:95` merge lanes - edge cases and special scenarios (part 2) › renaming files from uppercase to lowercase › merging › should get the rename from the other lane
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:105` merge lanes - edge cases and special scenarios (part 2) › renaming files from uppercase to lowercase › switching › should remove the file from the current lane and write the file according to the switch-to lane
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:126` merge lanes - edge cases and special scenarios (part 2) › multiple files, some are not changes › expect to have all files as unchanged, not updated
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:134` merge lanes - edge cases and special scenarios (part 2) › multiple files, some are not changes › merge the lane › expect to have all files as unchanged, not updated
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:156` merge lanes - edge cases and special scenarios (part 2) › merging from main when main is ahead so then a snap of an existing tag is in .bitmap › bit status should not show the component as modified
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:160` merge lanes - edge cases and special scenarios (part 2) › merging from main when main is ahead so then a snap of an existing tag is in .bitmap › the dependency should use the tag not the snap
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:168` merge lanes - edge cases and special scenarios (part 2) › merging from main when main is ahead so then a snap of an existing tag is in .bitmap › snapping the dependent › should save the dependency with tag, not snap
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:202` merge lanes - edge cases and special scenarios (part 2) › when a file exists in local and others but not in base › should write the file with the conflicts
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:233` merge lanes - edge cases and special scenarios (part 2) › merging lane with a component newly introduced where it was a package before › should remove the package from workspace.jsonc
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:266` merge lanes - edge cases and special scenarios (part 2) › bit lane merge-move command › should create a new lane
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:270` merge lanes - edge cases and special scenarios (part 2) › bit lane merge-move command › the new lane should have the new local snaps created on the original lane
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:276` merge lanes - edge cases and special scenarios (part 2) › bit lane merge-move command › the new lane should have the same components as the original lane
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:281` merge lanes - edge cases and special scenarios (part 2) › bit lane merge-move command › the filesystem should stay the same
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:287` merge lanes - edge cases and special scenarios (part 2) › bit lane merge-move command › the original lane should be reverted to the before-merge state
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:317` merge lanes - edge cases and special scenarios (part 2) › --no-snap vs --no-auto-snap › with --no-auto-snap › should update current lane according to the merged one
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:321` merge lanes - edge cases and special scenarios (part 2) › --no-snap vs --no-auto-snap › with --no-auto-snap › should not leave the components as modified
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:331` merge lanes - edge cases and special scenarios (part 2) › --no-snap vs --no-auto-snap › with --no-snap › should not update current lane according to the merged one
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:336` merge lanes - edge cases and special scenarios (part 2) › --no-snap vs --no-auto-snap › with --no-snap › should leave the components as modified
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:344` merge lanes - edge cases and special scenarios (part 2) › --no-snap vs --no-auto-snap › with --no-snap › after snapping › should save two parents, from the current lane and from the merged lane
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:362` merge lanes - edge cases and special scenarios (part 2) › merging from lane with --no-snap when there is no base-snap › should not throw an error
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:393` merge lanes - edge cases and special scenarios (part 2) › merge with --detach-head › should not change the head
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:398` merge lanes - edge cases and special scenarios (part 2) › merge with --detach-head › should save the detached head
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:402` merge lanes - edge cases and special scenarios (part 2) › merge with --detach-head › should continue the history from the common snap, not from the head
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:408` merge lanes - edge cases and special scenarios (part 2) › merge with --detach-head › should squash successfully
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:439` merge lanes - edge cases and special scenarios (part 2) › merge with --build --loose › should succeed despite test failures
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases-2.e2e.ts:442` merge lanes - edge cases and special scenarios (part 2) › merge with --build --loose › should indicate that the test failed

### `e2e/harmony/lanes/merge-lanes-edge-cases.e2e.ts`

- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases.e2e.ts:29` merge lanes - edge cases and special scenarios › merge a diverged lane into main with --tag › should merge-tag instead of merge-snap
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases.e2e.ts:34` merge lanes - edge cases and special scenarios › merge a diverged lane into main with --tag › expect head to have two parents
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases.e2e.ts:55` merge lanes - edge cases and special scenarios › auto-snap during merge when the snap is failing › should not change the .bitmap with the failed-snap version
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases.e2e.ts:72` merge lanes - edge cases and special scenarios › merge lane with comp-1 to an empty lane with .bitmap has the component › should merge
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases.e2e.ts:94` merge lanes - edge cases and special scenarios › merge from main when a component head is a tag on main and was not changed on lane › bit status should not throw
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases.e2e.ts:127` merge lanes - edge cases and special scenarios › conflict when the same file exist in base, deleted on the lane and modified on main › when the lane is merged to main, so currently on the FS the file exits › should not remove the file
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases.e2e.ts:138` merge lanes - edge cases and special scenarios › conflict when the same file exist in base, deleted on the lane and modified on main › when main is merged to the lane, so currently on the FS the file is removed › should add the file
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases.e2e.ts:172` merge lanes - edge cases and special scenarios › merging from a lane to main when it changed Version object with squashed property and then re-imported it › should not override the squashed property
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases.e2e.ts:177` merge lanes - edge cases and special scenarios › merging from a lane to main when it changed Version object with squashed property and then re-imported it › bit export should not throw
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases.e2e.ts:202` merge lanes - edge cases and special scenarios › merging from a lane to main when it has a long history which does not exist locally › merging one component › should not throw
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases.e2e.ts:214` merge lanes - edge cases and special scenarios › merging from a lane to main when it has a long history which does not exist locally › merging the entire lane › bit export should not throw
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases.e2e.ts:237` merge lanes - edge cases and special scenarios › merge introduces a new component to a lane › should update the remote lane with the newly merged component
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases.e2e.ts:275` merge lanes - edge cases and special scenarios › merge from main when on a forked-new-lane from another scope › should not throw ComponentNotFound on export
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases.e2e.ts:302` merge lanes - edge cases and special scenarios › merge an out-of-date component from another lane › should not show the component as pending-merge
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases.e2e.ts:327` merge lanes - edge cases and special scenarios › merge from one lane to another with --squash › bit log should not include previous versions from lane-b
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases.e2e.ts:331` merge lanes - edge cases and special scenarios › merge from one lane to another with --squash › Version object should include the squash data
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases.e2e.ts:364` merge lanes - edge cases and special scenarios › merge from one lane to another with --squash when it has history in main › bit status should not throw
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases.e2e.ts:369` merge lanes - edge cases and special scenarios › merge from one lane to another with --squash when it has history in main › Version object should have the main head as the parent and hold the squash data
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases.e2e.ts:401` merge lanes - edge cases and special scenarios › when a file was deleted on the other lane but exist current and on the base › when main is still at the base (fast-forward) › should indicate that this file was removed in the output
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases.e2e.ts:404` merge lanes - edge cases and special scenarios › when a file was deleted on the other lane but exist current and on the base › when main is still at the base (fast-forward) › should remove this file from the filesystem
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases.e2e.ts:416` merge lanes - edge cases and special scenarios › when a file was deleted on the other lane but exist current and on the base › when both lanes are diverged › should indicate that this file was removed in the output
- [ ] `e2e/harmony/lanes/merge-lanes-edge-cases.e2e.ts:419` merge lanes - edge cases and special scenarios › when a file was deleted on the other lane but exist current and on the base › when both lanes are diverged › should remove this file from the filesystem

### `e2e/harmony/lanes/merge-lanes-main.e2e.ts`

- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:26` merge lanes - main lane operations › merging main into local lane › should not throw an error that main lane doesn't exist
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:45` merge lanes - main lane operations › merge main into a lane when it is locally deleted on the lane › should show a descriptive error explaining why it cannot be merged
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:63` merge lanes - main lane operations › merging main into local lane when main has tagged versions › should not throw an error that main lane doesn't exist
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:108` merge lanes - main lane operations › merging main when on lane and some workspace components belong to the lane, some belong to main › with --exclude-non-lane-comps flag › should not add non-lane components into the lane
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:112` merge lanes - main lane operations › merging main when on lane and some workspace components belong to the lane, some belong to main › with --exclude-non-lane-comps flag › should update comp1 on the lane because it is part of the lane
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:116` merge lanes - main lane operations › merging main when on lane and some workspace components belong to the lane, some belong to main › with --exclude-non-lane-comps flag › should not update non-lane components in the .bitmap
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:120` merge lanes - main lane operations › merging main when on lane and some workspace components belong to the lane, some belong to main › with --exclude-non-lane-comps flag › should update the component files only for lane components
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:132` merge lanes - main lane operations › merging main when on lane and some workspace components belong to the lane, some belong to main › without --exclude-non-lane-comps flag › should not add non-lane components into the lane
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:136` merge lanes - main lane operations › merging main when on lane and some workspace components belong to the lane, some belong to main › without --exclude-non-lane-comps flag › should update comp1 on the lane because it is part of the lane
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:140` merge lanes - main lane operations › merging main when on lane and some workspace components belong to the lane, some belong to main › without --exclude-non-lane-comps flag › should update non-lane components in the .bitmap to the head of main
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:144` merge lanes - main lane operations › merging main when on lane and some workspace components belong to the lane, some belong to main › without --exclude-non-lane-comps flag › should update the component files in the filesystem for all of them
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:150` merge lanes - main lane operations › merging main when on lane and some workspace components belong to the lane, some belong to main › without --exclude-non-lane-comps flag › should import the head of main
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:153` merge lanes - main lane operations › merging main when on lane and some workspace components belong to the lane, some belong to main › without --exclude-non-lane-comps flag › should not import the main-history gap between the common-snap and the head of main
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:160` merge lanes - main lane operations › merging main when on lane and some workspace components belong to the lane, some belong to main › without --exclude-non-lane-comps flag › should not import the history of workspace components that are not on the lane
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:165` merge lanes - main lane operations › merging main when on lane and some workspace components belong to the lane, some belong to main › without --exclude-non-lane-comps flag › should export the lane successfully after the merge
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:179` merge lanes - main lane operations › merging main lane with no snapped components › should not throw an error about missing objects
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:196` merge lanes - main lane operations › merging a lane into main when main is empty › should not throw an error that head is empty
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:199` merge lanes - main lane operations › merging a lane into main when main is empty › the component should be available on main
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:225` merge lanes - main lane operations › merge main to lane when they are diverged with dependencies update (auto) after deleted deps-set › should remove the dependency that was unset in main from the config.policy
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:232` merge lanes - main lane operations › merge main to lane when they are diverged with dependencies update (auto) after deleted deps-set › should update the dependencies according to main
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:242` merge lanes - main lane operations › merge main to lane when they are diverged with dependencies update (auto) after deleted deps-set › should keep other DependencyResolver data fields, such as packageName
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:273` merge lanes - main lane operations › bit merge on main when the remote main has advanced by multiple snaps (diverged) › should generate a snap-merge snap with two parents, the local and the remote
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:278` merge lanes - main lane operations › bit merge on main when the remote main has advanced by multiple snaps (diverged) › should not import the gap between the common-snap and the remote head
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:283` merge lanes - main lane operations › bit merge on main when the remote main has advanced by multiple snaps (diverged) › should export the merge-snap successfully
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:286` merge lanes - main lane operations › bit merge on main when the remote main has advanced by multiple snaps (diverged) › bit log should show the full history including the gap snap
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:326` merge lanes - main lane operations › merging main into a lane when main added a new package dependency › should install the dependency added on main and complete the auto-snap
- [ ] `e2e/harmony/lanes/merge-lanes-main.e2e.ts:332` merge lanes - main lane operations › merging main into a lane when main added a new package dependency › should have the new dependency in node_modules

### `e2e/harmony/lanes/merge-lanes-partial.e2e.ts`

- [ ] `e2e/harmony/lanes/merge-lanes-partial.e2e.ts:34` merge lanes - partial merge functionality › partial merge › from a lane to main › without --include-deps › should throw an error asking to enter --include-deps flag
- [ ] `e2e/harmony/lanes/merge-lanes-partial.e2e.ts:43` merge lanes - partial merge functionality › partial merge › from a lane to main › with --include-deps › should not merge components that were not part of the patterns nor part of the pattern dependencies
- [ ] `e2e/harmony/lanes/merge-lanes-partial.e2e.ts:47` merge lanes - partial merge functionality › partial merge › from a lane to main › with --include-deps › should merge components that merge the pattern
- [ ] `e2e/harmony/lanes/merge-lanes-partial.e2e.ts:51` merge lanes - partial merge functionality › partial merge › from a lane to main › with --include-deps › should merge components that are dependencies of the given pattern

### `e2e/harmony/lanes/merge-lanes-remote.e2e.ts`

- [ ] `e2e/harmony/lanes/merge-lanes-remote.e2e.ts:35` merge lanes - remote lane operations › export a local lane into a remote scope › merging remote lane into main › should save the files to the filesystem
- [ ] `e2e/harmony/lanes/merge-lanes-remote.e2e.ts:40` merge lanes - remote lane operations › export a local lane into a remote scope › merging remote lane into main › bit status should show the components as staged
- [ ] `e2e/harmony/lanes/merge-lanes-remote.e2e.ts:44` merge lanes - remote lane operations › export a local lane into a remote scope › merging remote lane into main › bit lane should show that all components are belong to main
- [ ] `e2e/harmony/lanes/merge-lanes-remote.e2e.ts:54` merge lanes - remote lane operations › export a local lane into a remote scope › merging remote lane into main › exporting the components to the remote › should indicate that the components were exported successfully
- [ ] `e2e/harmony/lanes/merge-lanes-remote.e2e.ts:57` merge lanes - remote lane operations › export a local lane into a remote scope › merging remote lane into main › exporting the components to the remote › the remote should have the updated component objects
- [ ] `e2e/harmony/lanes/merge-lanes-remote.e2e.ts:74` merge lanes - remote lane operations › export a local lane into a remote scope › merging remote lane into main when components are not in workspace using --workspace flag › should indicate that the components were not merge because they are not in the workspace
- [ ] `e2e/harmony/lanes/merge-lanes-remote.e2e.ts:81` merge lanes - remote lane operations › export a local lane into a remote scope › merging remote lane into main when components are not in workspace using --workspace flag › bitmap should not save any component
- [ ] `e2e/harmony/lanes/merge-lanes-remote.e2e.ts:85` merge lanes - remote lane operations › export a local lane into a remote scope › merging remote lane into main when components are not in workspace using --workspace flag › bit status should show clean state
- [ ] `e2e/harmony/lanes/merge-lanes-remote.e2e.ts:89` merge lanes - remote lane operations › export a local lane into a remote scope › merging remote lane into main when components are not in workspace using --workspace flag › bit lane should not show the components as if they belong to main
- [ ] `e2e/harmony/lanes/merge-lanes-remote.e2e.ts:113` merge lanes - remote lane operations › export a local lane into a remote scope › importing a remote lane which is ahead of the local lane › bit status should show all components as pending update
- [ ] `e2e/harmony/lanes/merge-lanes-remote.e2e.ts:121` merge lanes - remote lane operations › export a local lane into a remote scope › importing a remote lane which is ahead of the local lane › merging the remote lane › should save the latest versions from the remote into the local
- [ ] `e2e/harmony/lanes/merge-lanes-remote.e2e.ts:126` merge lanes - remote lane operations › export a local lane into a remote scope › importing a remote lane which is ahead of the local lane › merging the remote lane › bit status should show clean state
- [ ] `e2e/harmony/lanes/merge-lanes-remote.e2e.ts:130` merge lanes - remote lane operations › export a local lane into a remote scope › importing a remote lane which is ahead of the local lane › merging the remote lane › bit lane should show that all components are belong to the local lane
- [ ] `e2e/harmony/lanes/merge-lanes-remote.e2e.ts:134` merge lanes - remote lane operations › export a local lane into a remote scope › importing a remote lane which is ahead of the local lane › merging the remote lane › bit lane --merged should not show the lane as it was not merged into main yet
- [ ] `e2e/harmony/lanes/merge-lanes-remote.e2e.ts:139` merge lanes - remote lane operations › export a local lane into a remote scope › importing a remote lane which is ahead of the local lane › merging the remote lane › bit lane --unmerged should show the lane
- [ ] `e2e/harmony/lanes/merge-lanes-remote.e2e.ts:157` merge lanes - remote lane operations › export a local lane into a remote scope › creating a new lane with the same name on a different workspace › should not merge the two lanes on the remote, instead, it should throw

### `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts`

- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:51` merge lanes - squash on diverged › single scope: two diverged lanes, --squash on merge › merge snap should have a single parent pointing to lane-a head
- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:57` merge lanes - squash on diverged › single scope: two diverged lanes, --squash on merge › merge snap should record squash metadata with the dropped lane-b head
- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:64` merge lanes - squash on diverged › single scope: two diverged lanes, --squash on merge › bit log should show a clean history without lane-b intermediate snaps
- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:119` merge lanes - squash on diverged › multi scope: lane-a on scope-a, lane-b on scope-b, diverged, --squash › merge snap should have a single parent pointing to lane-a head
- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:125` merge lanes - squash on diverged › multi scope: lane-a on scope-a, lane-b on scope-b, diverged, --squash › merge snap squash metadata should record the dropped lane-b head
- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:132` merge lanes - squash on diverged › multi scope: lane-a on scope-a, lane-b on scope-b, diverged, --squash › scope-a should NOT contain lane-b intermediate snaps after export
- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:138` merge lanes - squash on diverged › multi scope: lane-a on scope-a, lane-b on scope-b, diverged, --squash › scope-a should contain the merge snap
- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:142` merge lanes - squash on diverged › multi scope: lane-a on scope-a, lane-b on scope-b, diverged, --squash › scope-b should still contain lane-b intermediate snaps
- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:154` merge lanes - squash on diverged › multi scope: lane-a on scope-a, lane-b on scope-b, diverged, --squash › fresh consumer imports lane-a from scope-a › bit log should show the merge snap and lane-a chain, not lane-b intermediates
- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:162` merge lanes - squash on diverged › multi scope: lane-a on scope-a, lane-b on scope-b, diverged, --squash › fresh consumer imports lane-a from scope-a › bit status should not throw
- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:188` merge lanes - squash on diverged › multi scope: lane-a on scope-a, lane-b on scope-b, diverged, --squash › re-merge of lane-b after it advances with new snaps › second merge snap should have a single parent pointing to the previous merge snap
- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:194` merge lanes - squash on diverged › multi scope: lane-a on scope-a, lane-b on scope-b, diverged, --squash › re-merge of lane-b after it advances with new snaps › second merge snap should record the new dropped lane-b head (B5), not B3
- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:203` merge lanes - squash on diverged › multi scope: lane-a on scope-a, lane-b on scope-b, diverged, --squash › re-merge of lane-b after it advances with new snaps › bit log after re-merge should show two merge snaps in the chain, no lane-b intermediates
- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:212` merge lanes - squash on diverged › multi scope: lane-a on scope-a, lane-b on scope-b, diverged, --squash › re-merge of lane-b after it advances with new snaps › re-merge should export to scope-a without errors
- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:254` merge lanes - squash on diverged › lane into main, diverged, --squash › merge snap on main should have a single parent pointing to the previous main head
- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:260` merge lanes - squash on diverged › lane into main, diverged, --squash › merge snap should record squash metadata with the dropped lane head
- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:267` merge lanes - squash on diverged › lane into main, diverged, --squash › bit log on main should show the main chain + merge snap, not the lane intermediates
- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:277` merge lanes - squash on diverged › lane into main, diverged, --squash › exporting main after the merge should succeed
- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:331` merge lanes - squash on diverged › lane into main, cross-scope, diverged, --squash with fresh consumer › merge snap on main should have a single parent pointing to the previous main head
- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:337` merge lanes - squash on diverged › lane into main, cross-scope, diverged, --squash with fresh consumer › merge snap should record squash metadata pointing at the dropped lane head (L3)
- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:353` merge lanes - squash on diverged › lane into main, cross-scope, diverged, --squash with fresh consumer › fresh consumer imports comp1 from scope-a (no scope-b in remotes) › bit status should not throw
- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:357` merge lanes - squash on diverged › lane into main, cross-scope, diverged, --squash with fresh consumer › fresh consumer imports comp1 from scope-a (no scope-b in remotes) › bit log should show common ancestor + main chain + merge snap
- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:365` merge lanes - squash on diverged › lane into main, cross-scope, diverged, --squash with fresh consumer › fresh consumer imports comp1 from scope-a (no scope-b in remotes) › bit log should NOT include the dev lane intermediates (they live only on scope-b)
- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:401` merge lanes - squash on diverged › sanity: squash on non-diverged (fast-forward) lane-to-lane merge › squashed snap on lane-a should have a single parent pointing to the common head
- [ ] `e2e/harmony/lanes/merge-lanes-squash-diverge.e2e.ts:407` merge lanes - squash on diverged › sanity: squash on non-diverged (fast-forward) lane-to-lane merge › bit log should not throw

### `e2e/harmony/lanes/merge-lanes-squash.e2e.ts`

- [ ] `e2e/harmony/lanes/merge-lanes-squash.e2e.ts:39` merge lanes - squash functionality › merge with squash › when the lane is ahead by only 1 snap, so there is nothing to squash › should not add the squashed prop into the version object
- [ ] `e2e/harmony/lanes/merge-lanes-squash.e2e.ts:56` merge lanes - squash functionality › merge with squash › when the lane is ahead by 3 snaps › should squash the snaps and leave only the last one
- [ ] `e2e/harmony/lanes/merge-lanes-squash.e2e.ts:83` merge lanes - squash functionality › merge with squash after exporting and importing the lane to a new workspace › should be able to run bit-import
- [ ] `e2e/harmony/lanes/merge-lanes-squash.e2e.ts:86` merge lanes - squash functionality › merge with squash after exporting and importing the lane to a new workspace › should show only one snap as staged
- [ ] `e2e/harmony/lanes/merge-lanes-squash.e2e.ts:91` merge lanes - squash functionality › merge with squash after exporting and importing the lane to a new workspace › exporting › should export with no errors
- [ ] `e2e/harmony/lanes/merge-lanes-squash.e2e.ts:94` merge lanes - squash functionality › merge with squash after exporting and importing the lane to a new workspace › exporting › should update the VersionHistory on the remote with the new squash data

### `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts`

- [ ] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:50` merge lanes - unrelated components › multiple scopes when a component in the origin is different than on the lane › bit status should have the component as pendingUpdatesFromMain with an noCommonSnap error
- [ ] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:56` merge lanes - unrelated components › multiple scopes when a component in the origin is different than on the lane › bit lane merge without --resolve-unrelated flag › should throw
- [ ] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:65` merge lanes - unrelated components › multiple scopes when a component in the origin is different than on the lane › bit lane merge with --resolve-unrelated › should merge successfully
- [ ] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:68` merge lanes - unrelated components › multiple scopes when a component in the origin is different than on the lane › bit lane merge with --resolve-unrelated › bit status should show the component as staged and not everywhere else
- [ ] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:71` merge lanes - unrelated components › multiple scopes when a component in the origin is different than on the lane › bit lane merge with --resolve-unrelated › should not change the file content because the default merge-strategy is "ours"
- [ ] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:76` merge lanes - unrelated components › multiple scopes when a component in the origin is different than on the lane › bit lane merge with --resolve-unrelated › head on lane should point to the main head to preserve the history of the origin
- [ ] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:81` merge lanes - unrelated components › multiple scopes when a component in the origin is different than on the lane › bit lane merge with --resolve-unrelated › version object should hold a reference for the abandoned component
- [ ] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:86` merge lanes - unrelated components › multiple scopes when a component in the origin is different than on the lane › bit lane merge with --resolve-unrelated › should export the component successfully
- [ ] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:97` merge lanes - unrelated components › multiple scopes when a component in the origin is different than on the lane › bit lane merge with --resolve-unrelated and --no-auto-snap › bit status should show the component as during-merge and staged and not everywhere else
- [ ] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:100` merge lanes - unrelated components › multiple scopes when a component in the origin is different than on the lane › bit lane merge with --resolve-unrelated and --no-auto-snap › bit import should not throw
- [ ] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:107` merge lanes - unrelated components › multiple scopes when a component in the origin is different than on the lane › bit lane merge with --resolve-unrelated and --no-auto-snap › snapping the component › head on lane should point to the main head to preserve the history of the origin
- [ ] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:112` merge lanes - unrelated components › multiple scopes when a component in the origin is different than on the lane › bit lane merge with --resolve-unrelated and --no-auto-snap › snapping the component › version object should hold a reference for the abandoned component
- [ ] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:117` merge lanes - unrelated components › multiple scopes when a component in the origin is different than on the lane › bit lane merge with --resolve-unrelated and --no-auto-snap › snapping the component › should export the component successfully
- [ ] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:131` merge lanes - unrelated components › multiple scopes when a component in the origin is different than on the lane › bit lane merge with --resolve-unrelated and "theirs" merge-strategy › should take the file content from the other side, as asked by the "theirs" strategy
- [ ] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:154` merge lanes - unrelated components › multiple scopes when a component in the origin is different than on the lane › bit lane merge of another lane that was not resolved yet › should keep the local history and not the dev2 history because the current history has been already resolved
- [ ] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:160` merge lanes - unrelated components › multiple scopes when a component in the origin is different than on the lane › bit lane merge of another lane that was not resolved yet › bit status should not show components as pendingUpdatesFromMain
- [ ] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:179` merge lanes - unrelated components › multiple scopes when a component in the origin is different than on the lane › bit lane merge of another lane that was not resolved yet › when main got another tag meanwhile › should be able to merge with no errors
- [ ] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:191` merge lanes - unrelated components › multiple scopes when a component in the origin is different than on the lane › switching to main and checking out to head › should make the component available and checkout to main version
- [ ] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:209` merge lanes - unrelated components › multiple scopes when a component in the origin is different than on the lane › bit lane merge after soft-removed the unrelated component › should not throw
- [ ] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:230` merge lanes - unrelated components › multiple scopes when a component in the origin is different than on the lane › when the resolved unrelated is not a direct parent › bit status should not throw
- [ ] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:262` merge lanes - unrelated components › multiple scopes when a component in the origin is different than on the lane and the lane is forked › should not throw during bit-import because it tries to import comp1 from the original scope instead of the lane scope
- [x] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:292` merge lanes - unrelated components › merge unrelated between two lanes with --resolve-unrelated › without specifying strategy, which defaults to "ours" › should resolve by default by ours — `harmony::merge_history::unrelated_merge_automatically_snaps_canonical_ancestry`
- [x] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:297` merge lanes - unrelated components › merge unrelated between two lanes with --resolve-unrelated › without specifying strategy, which defaults to "ours" › should populate the unrelated property correctly on the Version object — `harmony::merge_history::unrelated_merge_automatically_snaps_canonical_ancestry`
- [x] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:302` merge lanes - unrelated components › merge unrelated between two lanes with --resolve-unrelated › without specifying strategy, which defaults to "ours" › should populate the parents according to the current lane — `harmony::merge_history::unrelated_merge_automatically_snaps_canonical_ancestry`
- [x] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:312` merge lanes - unrelated components › merge unrelated between two lanes with --resolve-unrelated › with strategy theirs › should get the file content according to their — `harmony::merge_history::unrelated_merge_automatically_snaps_canonical_ancestry`
- [x] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:317` merge lanes - unrelated components › merge unrelated between two lanes with --resolve-unrelated › with strategy theirs › should populate the unrelated property correctly on the Version object — `harmony::merge_history::unrelated_merge_automatically_snaps_canonical_ancestry`
- [x] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:322` merge lanes - unrelated components › merge unrelated between two lanes with --resolve-unrelated › with strategy theirs › should populate the parents according to the other lane — `harmony::merge_history::unrelated_merge_automatically_snaps_canonical_ancestry`
- [ ] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:346` merge lanes - unrelated components › merge lanes when local-lane has soft-removed components and the other lane is behind › should not bring the removed components
- [ ] `e2e/harmony/lanes/merge-lanes-unrelated.e2e.ts:372` merge lanes - unrelated components › merge lanes when local-lane has soft-removed components and the other lane is diverge › bit log should not show duplications

### `e2e/harmony/lanes/merge-main-env-policy.e2e.ts`

- [ ] `e2e/harmony/lanes/merge-main-env-policy.e2e.ts:64` bit status should not show the component as modified before the merge
- [ ] `e2e/harmony/lanes/merge-main-env-policy.e2e.ts:73` bit lane merge main › should not fail with a "config changes" false positive
- [ ] `e2e/harmony/lanes/merge-main-env-policy.e2e.ts:77` bit lane merge main › should snap the diverged component

### `e2e/harmony/lanes/multiple-comps-same-name-on-lane.e2e.ts`

- [ ] `e2e/harmony/lanes/multiple-comps-same-name-on-lane.e2e.ts:44` lane with multiple components with the same name but different scope-name › should not replace the component in the remote-lane, but keep both of them
- [ ] `e2e/harmony/lanes/multiple-comps-same-name-on-lane.e2e.ts:54` lane with multiple components with the same name but different scope-name › importing the lane into a new workspace without excluding any component › should not fail due to duplication of the same name in the same workspace
- [ ] `e2e/harmony/lanes/multiple-comps-same-name-on-lane.e2e.ts:57` lane with multiple components with the same name but different scope-name › importing the lane into a new workspace without excluding any component › bit status should not show the components as invalid
- [ ] `e2e/harmony/lanes/multiple-comps-same-name-on-lane.e2e.ts:67` lane with multiple components with the same name but different scope-name › importing the lane into a new workspace by excluding one of the duplicate names › should import successfully

### `e2e/harmony/lanes/remove-lanes.e2e.ts`

- [ ] `e2e/harmony/lanes/remove-lanes.e2e.ts:27` remove lanes › switching to a new lane and snapping › as an intermediate step, make sure the snapped components are part of the lane
- [ ] `e2e/harmony/lanes/remove-lanes.e2e.ts:31` remove lanes › switching to a new lane and snapping › should not alow removing the current lane
- [ ] `e2e/harmony/lanes/remove-lanes.e2e.ts:35` remove lanes › switching to a new lane and snapping › should not alow removing the default lane
- [ ] `e2e/harmony/lanes/remove-lanes.e2e.ts:50` remove lanes › switching to a new lane and snapping › switching back to default lane › then removing without --force flag › should throw an error saying it is not fully merged
- [ ] `e2e/harmony/lanes/remove-lanes.e2e.ts:59` remove lanes › switching to a new lane and snapping › switching back to default lane › then removing with --force flag › should remove the lane successfully
- [ ] `e2e/harmony/lanes/remove-lanes.e2e.ts:62` remove lanes › switching to a new lane and snapping › switching back to default lane › then removing with --force flag › bit lane should not show the lane anymore
- [ ] `e2e/harmony/lanes/remove-lanes.e2e.ts:73` remove lanes › switching to a new lane and snapping › switching back to default lane › removing with --force flag and the full id › should remove the lane successfully
- [ ] `e2e/harmony/lanes/remove-lanes.e2e.ts:84` remove lanes › switching to a new lane and snapping › switching back to default lane › merge the lane, then remove without --force › should remove the lane successfully
- [ ] `e2e/harmony/lanes/remove-lanes.e2e.ts:98` remove lanes › removing a remote lane › as an intermediate step, make sure the lane is on the remote
- [ ] `e2e/harmony/lanes/remove-lanes.e2e.ts:102` remove lanes › removing a remote lane › should not remove without --force flag as the lane is not merged
- [ ] `e2e/harmony/lanes/remove-lanes.e2e.ts:111` remove lanes › removing a remote lane › remove with --force flag › should remove successfully
- [ ] `e2e/harmony/lanes/remove-lanes.e2e.ts:114` remove lanes › removing a remote lane › remove with --force flag › the remote should not have the lane anymore
- [ ] `e2e/harmony/lanes/remove-lanes.e2e.ts:121` remove lanes › removing a remote lane › remove with --force flag › removing again after the lane was removed › should indicate that the lane was not found

### `e2e/harmony/lanes/rename-lane.e2e.ts`

- [ ] `e2e/harmony/lanes/rename-lane.e2e.ts:27` rename lanes › rename local lane, switch to main and then switch back to the lane › bit import should not throw
- [ ] `e2e/harmony/lanes/rename-lane.e2e.ts:30` rename lanes › rename local lane, switch to main and then switch back to the lane › should not show the lane as if it was exported

### `e2e/harmony/lanes/skip-publish-unpublished-dep.e2e.ts`

- [ ] `e2e/harmony/lanes/skip-publish-unpublished-dep.e2e.ts:53` builds the unpublished dependency from source instead of failing to install it

### `e2e/harmony/lanes/switch-lanes.e2e.ts`

- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:37` bit lane command › switching lanes › importing the lane objects and switching to that lane › should write the component to the filesystem with the same version as the lane
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:41` bit lane command › switching lanes › importing the lane objects and switching to that lane › .bitmap should save the remote lane
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:45` bit lane command › switching lanes › importing the lane objects and switching to that lane › bit lane should show the component in the checked out lane
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:50` bit lane command › switching lanes › importing the lane objects and switching to that lane › bit status should not show the component as pending updates
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:54` bit lane command › switching lanes › importing the lane objects and switching to that lane › bit status should show clean state
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:58` bit lane command › switching lanes › importing the lane objects and switching to that lane › bit lane should show the checked out lane as the active one
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:68` bit lane command › switching lanes › importing the lane objects and switching to that lane › changing the component and running bit diff › should show the diff between the filesystem and the lane
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:72` bit lane command › switching lanes › importing the lane objects and switching to that lane › changing the component and running bit diff › should not show the diff between the filesystem and main
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:82` bit lane command › switching lanes › importing the lane objects and switching to that lane › snapping the component (so, it's an imported lane with local snaps) › bit status should show the component as staged
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:86` bit lane command › switching lanes › importing the lane objects and switching to that lane › snapping the component (so, it's an imported lane with local snaps) › bit status --verbose should show the staged hash
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:97` bit lane command › switching lanes › importing the lane objects and switching to that lane › switching with a different lane name › should save the remote-lane data into a local with the specified name
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:101` bit lane command › switching lanes › importing the lane objects and switching to that lane › switching with a different lane name › should be able to retrieve the lane using the remote-name
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:112` bit lane command › switching lanes › importing the lane objects and switching to that lane › switching to a local lane › should switch successfully
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:118` bit lane command › switching lanes › importing the lane objects and switching to that lane › switching to a local lane › should not save the local lane in bitmap
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:139` bit lane command › switching lanes with deleted files › should delete the comp1/comp1.spec.js file
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:166` bit lane command › switching lanes and importing in a new scope from remote scope › should import the latest from main when on main
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:174` bit lane command › switching lanes and importing in a new scope from remote scope › should only import comp2 from the lane when on a lane
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:182` bit lane command › switching lanes and importing in a new scope from remote scope › should only import comp1 from the lane when on a lane
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:211` bit lane command › switch to main after importing a lane › .bitmap should have the component with the main version
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:215` bit lane command › switch to main after importing a lane › should list the component as 0.0.1 and not with a hash
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:238` bit lane command › switch to main after merging the lane somewhere else › should not make the component available on main
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:242` bit lane command › switch to main after merging the lane somewhere else › bit status should show a section of unavailable components on main
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:246` bit lane command › switch to main after merging the lane somewhere else › bit checkout should make it available
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:264` bit lane command › switch from main to a lane when main has staged components › should block the switch and suggest to export or reset
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:310` bit lane command › should use the dep from main and not from the previous lane
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:333` bit lane command › switch to main when main has updates on the remote › by default, it should fetch and switch to the head of main
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:338` bit lane command › switch to main when main has updates on the remote › when --skip-fetch is used, it should switch to where the main was before
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:370` bit lane command › switch to main when main has updates on the remote and the lane is on another scope › should fetch and switch to the head of main
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:398` bit lane command › switch to a lane when it has updates on the remote › by default, it should fetch and switch to the head of the lane
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:404` bit lane command › switch to a lane when it has updates on the remote › when --skip-fetch is used, it should switch to where the lane was before
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:422` bit lane command › switch with --skip-fetch when the lane is not in the local scope › should throw a clear error directing the user to drop --skip-fetch
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:440` bit lane command › switch with deprecated --head flag › should still switch successfully (no-op)
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:456` bit lane command › switch with --force-ours › should switch successfully
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:459` bit lane command › switch with --force-ours › should not change the files and keep them same as the lane
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:478` bit lane command › switch to main when only one component was snapped on a lane › should switch the component on the lane only
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:483` bit lane command › switch to main when only one component was snapped on a lane › bit details should show the full list of skipped components
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:511` bit lane command › switching lanes while a component file has uncommitted local changes › should block the switch with an automatic-merge-failed error
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:516` bit lane command › switching lanes while a component file has uncommitted local changes › should preserve the uncommitted local file changes
- [ ] `e2e/harmony/lanes/switch-lanes.e2e.ts:519` bit lane command › switching lanes while a component file has uncommitted local changes › should not change the current lane

### `e2e/harmony/lanes/unrelated-and-removed.e2e.ts`

- [ ] `e2e/harmony/lanes/unrelated-and-removed.e2e.ts:40` current lane a comp is removed, merging a lane that has this comp with different history › should get the file content according to their
- [ ] `e2e/harmony/lanes/unrelated-and-removed.e2e.ts:47` current lane a comp is removed, merging a lane that has this comp with different history › should populate the unrelated property from the current head and the parents from the other lane

### `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts`

- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:91` updateDependents cascade - import, fetch and promotion › scenario 13: workspace `bit lane merge main` refreshes updateDependents when main advances › lane.updateDependents[comp2] should point at a NEW hash after the workspace merge
- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:98` updateDependents cascade - import, fetch and promotion › scenario 13: workspace `bit lane merge main` refreshes updateDependents when main advances › lane.updateDependents[comp2] should descend from main`s advanced head (proper 3-way merge)
- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:105` updateDependents cascade - import, fetch and promotion › scenario 13: workspace `bit lane merge main` refreshes updateDependents when main advances › cascaded comp2 must absorb main-side content (file ref equals main`s)
- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:116` updateDependents cascade - import, fetch and promotion › scenario 13: workspace `bit lane merge main` refreshes updateDependents when main advances › comp2 must stay in lane.updateDependents, NOT be promoted to lane.components
- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:161` updateDependents cascade - import, fetch and promotion › scenario 16: workspace fetch picks up a producer hidden cascade › the workspace`s local lane reflects the producer`s cascade after fetch
- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:193` updateDependents cascade - import, fetch and promotion › scenario 17: fetch reflects origin-side removeUpdateDependents (Cloud UI mutation) › local lane.updateDependents should be cleared after fetch
- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:236` updateDependents cascade - import, fetch and promotion › scenario 18: export does not resurrect entries the origin dropped via UI › origin lane.updateDependents stays empty (stale workspace entry not resurrected)
- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:241` updateDependents cascade - import, fetch and promotion › scenario 18: export does not resurrect entries the origin dropped via UI › origin lane.components still receives the cascaded comp3 head (visible export unaffected)
- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:278` updateDependents cascade - import, fetch and promotion › scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly › bitmap.comp2 should land at main's tag (0.0.1), not the lane's cascade snap
- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:285` updateDependents cascade - import, fetch and promotion › scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly › comp2 stays hidden on the remote (import alone does not promote)
- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:291` updateDependents cascade - import, fetch and promotion › scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly › bit status runs cleanly (no thrown errors, no invalid components)
- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:297` updateDependents cascade - import, fetch and promotion › scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly › bit list reports comp2 with a resolvable version
- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:303` updateDependents cascade - import, fetch and promotion › scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly › the lane`s visible components list still has comp3 only (no leak from the import)
- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:311` updateDependents cascade - import, fetch and promotion › scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly › a no-op export after the import leaves the remote lane untouched
- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:332` updateDependents cascade - import, fetch and promotion › scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly › after editing and snapping the imported comp2 › comp2 lands in lane.components on the remote (promoted from hidden)
- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:338` updateDependents cascade - import, fetch and promotion › scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly › after editing and snapping the imported comp2 › comp2 is removed from lane.updateDependents (no duplicate across both buckets)
- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:344` updateDependents cascade - import, fetch and promotion › scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly › after editing and snapping the imported comp2 › the promoted snap descends from main's head, not the prior cascade snap
- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:373` updateDependents cascade - import, fetch and promotion › scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly › after editing and snapping the imported comp2 › a fresh workspace then imports the exported lane › the imported lane object lists comp2 under components (visible, not hidden)
- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:380` updateDependents cascade - import, fetch and promotion › scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly › after editing and snapping the imported comp2 › a fresh workspace then imports the exported lane › the imported lane does NOT carry comp2 in updateDependents
- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:386` updateDependents cascade - import, fetch and promotion › scenario 19: bit import of hidden updateDependent lands main version; snap promotes cleanly › after editing and snapping the imported comp2 › a fresh workspace then imports the exported lane › comp2 lands in the fresh workspace bitmap at the promoted lane head
- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:453` updateDependents cascade - import, fetch and promotion › scenario 20: import a lane with a cross-scope updateDependent › seeds comp2 from the other scope as a hidden updateDependent (precondition)
- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:457` updateDependents cascade - import, fetch and promotion › scenario 20: import a lane with a cross-scope updateDependent › the cross-scope updateDependent`s lane-only cascade snap is fetched into the local scope
- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:462` updateDependents cascade - import, fetch and promotion › scenario 20: import a lane with a cross-scope updateDependent › the updateDependent stays hidden — only comp3 is in the workspace bitmap
- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:526` updateDependents cascade - import, fetch and promotion › comp2 stays a hidden updateDependent — only comp1 is in the bitmap
- [ ] `e2e/harmony/lanes/update-dependents-cascade-import.e2e.ts:532` updateDependents cascade - import, fetch and promotion › bit install fails with an actionable error naming the component and the bit import remediation

### `e2e/harmony/lanes/update-dependents-cascade-reset.e2e.ts`

- [ ] `e2e/harmony/lanes/update-dependents-cascade-reset.e2e.ts:90` updateDependents cascade - reset, history and checkout › scenario 7: local cascade survives a `bit fetch --lanes` before export › local lane.updateDependents still points at the cascaded comp2 hash (not reverted to the remote version)
- [ ] `e2e/harmony/lanes/update-dependents-cascade-reset.e2e.ts:98` updateDependents cascade - reset, history and checkout › scenario 7: local cascade survives a `bit fetch --lanes` before export › bit export still publishes the cascade to the remote afterward
- [ ] `e2e/harmony/lanes/update-dependents-cascade-reset.e2e.ts:106` updateDependents cascade - reset, history and checkout › scenario 7: local cascade survives a `bit fetch --lanes` before export › cascaded comp2 on the remote points at the new comp3 head
- [ ] `e2e/harmony/lanes/update-dependents-cascade-reset.e2e.ts:146` updateDependents cascade - reset, history and checkout › scenario 8: bit reset reverts the cascade, not just the direct snap › comp3 on the lane should rewind to its pre-snap head
- [ ] `e2e/harmony/lanes/update-dependents-cascade-reset.e2e.ts:151` updateDependents cascade - reset, history and checkout › scenario 8: bit reset reverts the cascade, not just the direct snap › lane.updateDependents should revert to the pre-cascade comp2 hash
- [ ] `e2e/harmony/lanes/update-dependents-cascade-reset.e2e.ts:157` updateDependents cascade - reset, history and checkout › scenario 8: bit reset reverts the cascade, not just the direct snap › a subsequent export should leave the remote lane unchanged from its pre-snap state
- [ ] `e2e/harmony/lanes/update-dependents-cascade-reset.e2e.ts:210` updateDependents cascade - reset, history and checkout › scenario 9: bit reset --head rewinds only the last snap, and leaves status clean › lane.updateDependents should point at the FIRST-snap cascade comp2 hash (not reverted to pre-cascade)
- [ ] `e2e/harmony/lanes/update-dependents-cascade-reset.e2e.ts:217` updateDependents cascade - reset, history and checkout › scenario 9: bit reset --head rewinds only the last snap, and leaves status clean › bit status should not throw ComponentsPendingImport for the visible component
- [ ] `e2e/harmony/lanes/update-dependents-cascade-reset.e2e.ts:222` updateDependents cascade - reset, history and checkout › scenario 9: bit reset --head rewinds only the last snap, and leaves status clean › bit status should not list hidden updateDependents under stagedComponents
- [ ] `e2e/harmony/lanes/update-dependents-cascade-reset.e2e.ts:232` updateDependents cascade - reset, history and checkout › scenario 9: bit reset --head rewinds only the last snap, and leaves status clean › bit status should surface the locally-cascaded comp2 under pendingUpdateDependents
- [ ] `e2e/harmony/lanes/update-dependents-cascade-reset.e2e.ts:276` updateDependents cascade - reset, history and checkout › scenario 14: bit lane history on a lane with hidden updateDependents › bit lane history runs cleanly on a lane that has hidden updateDependents
- [ ] `e2e/harmony/lanes/update-dependents-cascade-reset.e2e.ts:284` updateDependents cascade - reset, history and checkout › scenario 14: bit lane history on a lane with hidden updateDependents › history entries created BEFORE the workspace snap include the seeded comp2 hash under updateDependents
- [ ] `e2e/harmony/lanes/update-dependents-cascade-reset.e2e.ts:291` updateDependents cascade - reset, history and checkout › scenario 14: bit lane history on a lane with hidden updateDependents › a workspace cascade snap appends a new history entry
- [ ] `e2e/harmony/lanes/update-dependents-cascade-reset.e2e.ts:295` updateDependents cascade - reset, history and checkout › scenario 14: bit lane history on a lane with hidden updateDependents › the new history entry records the advanced comp3 head among its components
- [ ] `e2e/harmony/lanes/update-dependents-cascade-reset.e2e.ts:304` updateDependents cascade - reset, history and checkout › scenario 14: bit lane history on a lane with hidden updateDependents › the new history entry records the cascaded comp2 hash under updateDependents (separate from components)
- [ ] `e2e/harmony/lanes/update-dependents-cascade-reset.e2e.ts:364` updateDependents cascade - reset, history and checkout › scenario 15: bit lane checkout leaves hidden updateDependents untouched on the lane › lane.updateDependents should stay at the post-cascade hash (lane is not mutated by checkout)
- [ ] `e2e/harmony/lanes/update-dependents-cascade-reset.e2e.ts:370` updateDependents cascade - reset, history and checkout › scenario 15: bit lane checkout leaves hidden updateDependents untouched on the lane › comp2 must stay hidden (not promoted to lane.components)
- [ ] `e2e/harmony/lanes/update-dependents-cascade-reset.e2e.ts:376` updateDependents cascade - reset, history and checkout › scenario 15: bit lane checkout leaves hidden updateDependents untouched on the lane › comp2 must NOT appear in the workspace bitmap after the checkout

### `e2e/harmony/lanes/update-dependents-cascade.e2e.ts`

- [ ] `e2e/harmony/lanes/update-dependents-cascade.e2e.ts:138` local snap cascades updateDependents on the lane › comp2 (B) enters lane.updateDependents
- [ ] `e2e/harmony/lanes/update-dependents-cascade.e2e.ts:144` local snap cascades updateDependents on the lane › comp1 (A) on the lane should be re-snapped with its comp2 dep pointing at the new updateDependent
- [ ] `e2e/harmony/lanes/update-dependents-cascade.e2e.ts:159` local snap cascades updateDependents on the lane › comp1 stays in lane.components (it was never a hidden updateDependent)
- [ ] `e2e/harmony/lanes/update-dependents-cascade.e2e.ts:223` local snap cascades updateDependents on the lane › scenario 5: transitive cascade inside updateDependents › both comp1 and comp2 are cascaded to new hashes in updateDependents
- [ ] `e2e/harmony/lanes/update-dependents-cascade.e2e.ts:234` local snap cascades updateDependents on the lane › scenario 5: transitive cascade inside updateDependents › cascaded comp2 depends on the new comp3 head
- [ ] `e2e/harmony/lanes/update-dependents-cascade.e2e.ts:242` local snap cascades updateDependents on the lane › scenario 5: transitive cascade inside updateDependents › cascaded comp1 depends on the cascaded comp2 (not the old updDep comp2)
- [ ] `e2e/harmony/lanes/update-dependents-cascade.e2e.ts:254` local snap cascades updateDependents on the lane › scenario 5: transitive cascade inside updateDependents › the cascaded components should NOT appear in the workspace bitmap (still hidden updateDependents)
- [ ] `e2e/harmony/lanes/update-dependents-cascade.e2e.ts:302` local snap cascades updateDependents on the lane › scenario 6: promote-on-import — importing an updateDependent then snapping it moves it to lane.components › comp2 should be in lane.components with a fresh snap
- [ ] `e2e/harmony/lanes/update-dependents-cascade.e2e.ts:309` local snap cascades updateDependents on the lane › scenario 6: promote-on-import — importing an updateDependent then snapping it moves it to lane.components › comp2 should NOT appear in lane.updateDependents (the stale entry must be cleared)
- [ ] `e2e/harmony/lanes/update-dependents-cascade.e2e.ts:348` local snap cascades updateDependents on the lane › scenario 3: divergence — two users snap the same lane concurrently › user A`s export should advance the comp2 entry in updateDependents past the initial state
- [ ] `e2e/harmony/lanes/update-dependents-cascade.e2e.ts:352` local snap cascades updateDependents on the lane › scenario 3: divergence — two users snap the same lane concurrently › user B`s export should be rejected because the lane is diverged

### `e2e/harmony/link.e2e.ts`

- [ ] `e2e/harmony/link.e2e.ts:25` linking components to a target, with and without a pattern › should link the scecified component to the target directory
- [ ] `e2e/harmony/link.e2e.ts:28` linking components to a target, with and without a pattern › should not link the not specified component to the target directory
- [ ] `e2e/harmony/link.e2e.ts:31` linking components to a target, with and without a pattern › without a pattern, it should link every component to the target directory
- [ ] `e2e/harmony/link.e2e.ts:49` linking to a target including peers › should link the components to the target directory
- [ ] `e2e/harmony/link.e2e.ts:52` linking to a target including peers › should link the peers of the component components to the target directory

### `e2e/harmony/load-bit.e2e.ts`

- [ ] `e2e/harmony/load-bit.e2e.ts:24` loadBit() › should load a valid workspace and create and load three different scopes
- [ ] `e2e/harmony/load-bit.e2e.ts:38` loadBit() › should throw when defaultScope is invalid

### `e2e/harmony/load-extensions.e2e.ts`

- [ ] `e2e/harmony/load-extensions.e2e.ts:34` load extensions › workspace extensions › loading simple extension › should load the extension when loading the workspace
- [ ] `e2e/harmony/load-extensions.e2e.ts:56` load extensions › workspace extensions › non requireable extension › when config set to ignore error on failed extensions › should show the workspace status without exception
- [ ] `e2e/harmony/load-extensions.e2e.ts:59` load extensions › workspace extensions › non requireable extension › when config set to ignore error on failed extensions › should show a warning about the problematic extension
- [ ] `e2e/harmony/load-extensions.e2e.ts:83` load extensions › workspace extensions › extension with provider error › when config set to ignore error on failed extensions › should show the workspace status without exception
- [ ] `e2e/harmony/load-extensions.e2e.ts:86` load extensions › workspace extensions › extension with provider error › when config set to ignore error on failed extensions › should show a warning about the problematic extension
- [ ] `e2e/harmony/load-extensions.e2e.ts:123` load extensions › variants extensions › loading simple extension › should load the extension when loading an affected component
- [ ] `e2e/harmony/load-extensions.e2e.ts:128` load extensions › variants extensions › loading simple extension › should not load the extension when loading a not affected component

### `e2e/harmony/load-failures-issue.e2e.ts`

- [ ] `e2e/harmony/load-failures-issue.e2e.ts:26` surfacing swallowed load errors as component issues › an aspect that throws on require, configured on a component › bit status should complete without throwing
- [ ] `e2e/harmony/load-failures-issue.e2e.ts:29` surfacing swallowed load errors as component issues › an aspect that throws on require, configured on a component › the failing aspect component itself should have a LoadFailures issue
- [ ] `e2e/harmony/load-failures-issue.e2e.ts:36` surfacing swallowed load errors as component issues › an aspect that throws on require, configured on a component › components using the failing aspect should NOT each carry the issue (avoid noise)
- [ ] `e2e/harmony/load-failures-issue.e2e.ts:42` surfacing swallowed load errors as component issues › an aspect that throws on require, configured on a component › instead, a single workspace-level issue should aggregate the affected components
- [ ] `e2e/harmony/load-failures-issue.e2e.ts:49` surfacing swallowed load errors as component issues › an aspect that throws on require, configured on a component › the LoadFailures issue should not block tagging

### `e2e/harmony/local-head-not-found.e2e.ts`

- [ ] `e2e/harmony/local-head-not-found.e2e.ts:37` local head Version object is missing from scope › head ref points to a missing snap while bitmap is pinned to a valid older version › bit status should surface LocalHeadNotFound with actionable "bit import --objects" instead of the raw graph error
- [ ] `e2e/harmony/local-head-not-found.e2e.ts:42` local head Version object is missing from scope › head ref points to a missing snap while bitmap is pinned to a valid older version › bit checkout head should fail early with LocalHeadNotFound (not a later ComponentNotFound) and suggest "bit import --objects"
- [ ] `e2e/harmony/local-head-not-found.e2e.ts:68` local head Version object is missing from scope › the head Version object is missing locally while the remote has it › should fetch the missing Version object rather than fail
- [ ] `e2e/harmony/local-head-not-found.e2e.ts:72` local head Version object is missing from scope › the head Version object is missing locally while the remote has it › should write the fetched Version object to the local scope
- [ ] `e2e/harmony/local-head-not-found.e2e.ts:86` local head Version object is missing from scope › the head Version object is missing locally while the remote has it › and the remote head has moved on since › should load the version it fetched rather than fail on the newer head
- [ ] `e2e/harmony/local-head-not-found.e2e.ts:97` local head Version object is missing from scope › bit envs with a component on a core env › should not fetch the core env component into the local scope, it ships with bit

### `e2e/harmony/log.e2e.ts`

- [x] `e2e/harmony/log.e2e.ts:17` log › logging with global --log flag › should log successfully — `harmony::log::known_failures::the_global_log_flag_logs` (known failure)

### `e2e/harmony/merge-config.e2e.ts`

- [ ] `e2e/harmony/merge-config.e2e.ts:60` merge config scenarios › merging the lane to main › should keep the configuration from the lane
- [ ] `e2e/harmony/merge-config.e2e.ts:71` merge config scenarios › switching to the lane › should not show the component as modified
- [ ] `e2e/harmony/merge-config.e2e.ts:75` merge config scenarios › switching to the lane › should be able to install the correct versions after deleting node-modules
- [ ] `e2e/harmony/merge-config.e2e.ts:85` merge config scenarios › switching to the lane › merge from main to the lane › bit status should show all components as componentsDuringMergeState and not in pendingUpdatesFromMain
- [ ] `e2e/harmony/merge-config.e2e.ts:115` merge config scenarios › diverge with config that is possible to merge › bit status should not show the component with an issue of MergeConfigHasConflict
- [ ] `e2e/harmony/merge-config.e2e.ts:118` merge config scenarios › diverge with config that is possible to merge › should show the component deprecated due to the successful merge-config
- [ ] `e2e/harmony/merge-config.e2e.ts:122` merge config scenarios › diverge with config that is possible to merge › should not generate merge-conflict file, instead, the merge data should be in unmerged file
- [ ] `e2e/harmony/merge-config.e2e.ts:156` merge config scenarios › diverge with conflicted config › bit status should show the component with an issue of MergeConfigHasConflict
- [ ] `e2e/harmony/merge-config.e2e.ts:163` merge config scenarios › diverge with conflicted config › fixing the conflict with ours › should show the component deprecated
- [ ] `e2e/harmony/merge-config.e2e.ts:173` merge config scenarios › diverge with conflicted config › fixing the conflict with theirs › should show the component as undeprecated
- [ ] `e2e/harmony/merge-config.e2e.ts:180` merge config scenarios › diverge with conflicted config › fixing the conflict with theirs › should delete the config-merge file after snapping
- [ ] `e2e/harmony/merge-config.e2e.ts:220` merge config scenarios › diverge with different dependencies config › bit status should show the component with an issue of MergeConfigHasConflict
- [ ] `e2e/harmony/merge-config.e2e.ts:227` merge config scenarios › diverge with different dependencies config › fixing the conflict with ours › should show the dev-dependency as it was set on the lane
- [ ] `e2e/harmony/merge-config.e2e.ts:239` merge config scenarios › diverge with different dependencies config › fixing the conflict with theirs › should show the dev-dependency as it was set on main
- [ ] `e2e/harmony/merge-config.e2e.ts:244` merge config scenarios › diverge with different dependencies config › fixing the conflict with theirs › running bit deps set of another pkg, should work
- [ ] `e2e/harmony/merge-config.e2e.ts:259` merge config scenarios › diverge with different dependencies config › merging with --auto-merge-resolve ours › should not generate the config-merge file
- [ ] `e2e/harmony/merge-config.e2e.ts:263` merge config scenarios › diverge with different dependencies config › merging with --auto-merge-resolve ours › should show the dev-dependency as it was set on the lane
- [ ] `e2e/harmony/merge-config.e2e.ts:278` merge config scenarios › diverge with different dependencies config › merging with --auto-merge-resolve theirs › should not generate the config-merge file
- [ ] `e2e/harmony/merge-config.e2e.ts:282` merge config scenarios › diverge with different dependencies config › merging with --auto-merge-resolve theirs › should show the dev-dependency as it was set on main
- [ ] `e2e/harmony/merge-config.e2e.ts:311` merge config scenarios › diverge with different dependencies config when "other" adds a package (current === base) › should not remove the packages it had previously via deps set
- [ ] `e2e/harmony/merge-config.e2e.ts:349` merge config scenarios › diverge with different auto-detected dependencies config › bit status should show the component with an issue of MergeConfigHasConflict
- [ ] `e2e/harmony/merge-config.e2e.ts:356` merge config scenarios › diverge with different auto-detected dependencies config › fixing the conflict with ours › should show the dev-dependency as it was set on the lane
- [ ] `e2e/harmony/merge-config.e2e.ts:368` merge config scenarios › diverge with different auto-detected dependencies config › fixing the conflict with theirs › should show the dev-dependency as it was set on main
- [ ] `e2e/harmony/merge-config.e2e.ts:412` merge config scenarios › diverge with envs changes › bit status should show the component with an issue of MergeConfigHasConflict
- [ ] `e2e/harmony/merge-config.e2e.ts:415` merge config scenarios › diverge with envs changes › the conflict file should only contain env data and not dependencyResolver data
- [ ] `e2e/harmony/merge-config.e2e.ts:425` merge config scenarios › diverge with envs changes › fixing the conflict with ours › should set the env according to the lane
- [ ] `e2e/harmony/merge-config.e2e.ts:435` merge config scenarios › diverge with envs changes › fixing the conflict with ours › should show the dev-dependency as it was set on the lane
- [ ] `e2e/harmony/merge-config.e2e.ts:450` merge config scenarios › diverge with envs changes › fixing the conflict with theirs › should set the env according to the lane
- [ ] `e2e/harmony/merge-config.e2e.ts:462` merge config scenarios › diverge with envs changes › fixing the conflict with theirs › should show the dev-dependency as it was set on main
- [ ] `e2e/harmony/merge-config.e2e.ts:512` merge config scenarios › other lane bumped the env VERSION only, current lane kept a workspace env › should NOT sync the other lane's env version onto the lane (keep the workspace env version)
- [ ] `e2e/harmony/merge-config.e2e.ts:578` merge config scenarios › when the dep was updated on the lane only, not on main › when the dep is in workspace.jsonc › should change workspace.jsonc with the updated dependency
- [ ] `e2e/harmony/merge-config.e2e.ts:589` merge config scenarios › when the dep was updated on the lane only, not on main › when the dep is not in the workspace.jsonc › should auto-update the dependency according to the lane, because only there it was changed
- [ ] `e2e/harmony/merge-config.e2e.ts:598` merge config scenarios › when the dep was updated on the lane only, not on main › when the dep is not in the workspace.jsonc › when installing a different version than the resolved one › should resolve from workspace.jsonc and not from unmerged file
- [ ] `e2e/harmony/merge-config.e2e.ts:624` merge config scenarios › when the dep was updated in both, the lane and main so there is a conflict › when the dep is in workspace.jsonc › should not write config-merge file
- [ ] `e2e/harmony/merge-config.e2e.ts:628` merge config scenarios › when the dep was updated in both, the lane and main so there is a conflict › when the dep is in workspace.jsonc › should show the versions as conflicted in workspace.jsonc file
- [ ] `e2e/harmony/merge-config.e2e.ts:636` merge config scenarios › when the dep was updated in both, the lane and main so there is a conflict › when the dep is in workspace.jsonc › should throw for any command until the conflicts are resolved
- [ ] `e2e/harmony/merge-config.e2e.ts:646` merge config scenarios › when the dep was updated in both, the lane and main so there is a conflict › when the dep is not in the workspace.jsonc › bit status should not show a workspace issue
- [ ] `e2e/harmony/merge-config.e2e.ts:650` merge config scenarios › when the dep was updated in both, the lane and main so there is a conflict › when the dep is not in the workspace.jsonc › bit status should show it as a component conflict
- [ ] `e2e/harmony/merge-config.e2e.ts:722` merge config scenarios › when the dep was updated on the lane only, not on main › when the dep is in workspace.jsonc › should not update workspace.jsonc
- [ ] `e2e/harmony/merge-config.e2e.ts:726` merge config scenarios › when the dep was updated on the lane only, not on main › when the dep is in workspace.jsonc › should tell why workspace.jsonc was not updated
- [ ] `e2e/harmony/merge-config.e2e.ts:767` merge config scenarios › diverge with merge-able auto-detected dependencies config and pre-config explicitly set › should not delete the previously deps set
- [ ] `e2e/harmony/merge-config.e2e.ts:811` merge config scenarios › diverge: lane merges main when config unchanged but auto-dep bumped (deps set via variants) › should preserve the manual devDependency (force:true) in the merged config
- [ ] `e2e/harmony/merge-config.e2e.ts:818` merge config scenarios › diverge: lane merges main when config unchanged but auto-dep bumped (deps set via variants) › should also include the bumped auto dependency from main

### `e2e/harmony/mocha-tester-spec-files.e2e.ts`

- [ ] `e2e/harmony/mocha-tester-spec-files.e2e.ts:54` Mocha Tester - spec files handling › typescript component › should not throw an error compilation errors
- [ ] `e2e/harmony/mocha-tester-spec-files.e2e.ts:94` Mocha Tester - spec files handling › component with multiple spec files and .only in one spec › bit test should only run the test with .only and skip the entire second spec file
- [ ] `e2e/harmony/mocha-tester-spec-files.e2e.ts:124` Mocha Tester - spec files handling › testing a single spec file › should run only the tests of the given file, and only test the component that owns it
- [ ] `e2e/harmony/mocha-tester-spec-files.e2e.ts:132` Mocha Tester - spec files handling › testing a single spec file › should support multiple test-file paths

### `e2e/harmony/mocha-tester.e2e.ts`

- [ ] `e2e/harmony/mocha-tester.e2e.ts:56` Mocha Tester › component that use Mocha as a tester › component without any test file › bit test should not throw and should indicate that no tests found
- [ ] `e2e/harmony/mocha-tester.e2e.ts:60` Mocha Tester › component that use Mocha as a tester › component without any test file › bit build should not fail
- [ ] `e2e/harmony/mocha-tester.e2e.ts:68` Mocha Tester › component that use Mocha as a tester › component with a passing test › bit test should show the passing component via Mocha output
- [ ] `e2e/harmony/mocha-tester.e2e.ts:72` Mocha Tester › component that use Mocha as a tester › component with a passing test › bit build should show the passing component via Mocha output
- [ ] `e2e/harmony/mocha-tester.e2e.ts:81` Mocha Tester › component that use Mocha as a tester › component with a failing test › bit test should exit with non-zero code and show the failing component via Mocha output
- [ ] `e2e/harmony/mocha-tester.e2e.ts:85` Mocha Tester › component that use Mocha as a tester › component with a failing test › bit build should show the failing component via Mocha output
- [ ] `e2e/harmony/mocha-tester.e2e.ts:94` Mocha Tester › component that use Mocha as a tester › component with an errored test › bit test should exit with non-zero code and show the error
- [ ] `e2e/harmony/mocha-tester.e2e.ts:98` Mocha Tester › component that use Mocha as a tester › component with an errored test › bit build should show the error

### `e2e/harmony/multiple-compilers.e2e.ts`

- [ ] `e2e/harmony/multiple-compilers.e2e.ts:39` multiple compilers - babel and typescript › compile with babel and ts › compile simple ts component › should generate dists on the workspace and be able to run the dist file
- [ ] `e2e/harmony/multiple-compilers.e2e.ts:55` multiple compilers - babel and typescript › compile with babel and ts › compile simple ts component › tagging the component › should save the .js files under "dist" artifact
- [ ] `e2e/harmony/multiple-compilers.e2e.ts:63` multiple compilers - babel and typescript › compile with babel and ts › compile simple ts component › tagging the component › should save the .d.ts files under "declaration" artifact
- [ ] `e2e/harmony/multiple-compilers.e2e.ts:87` multiple compilers - babel and typescript › different envs in the dependency graph › should successfully build
- [ ] `e2e/harmony/multiple-compilers.e2e.ts:90` multiple compilers - babel and typescript › different envs in the dependency graph › should indicate that pre-build and post-build were running
- [ ] `e2e/harmony/multiple-compilers.e2e.ts:94` multiple compilers - babel and typescript › different envs in the dependency graph › should write .npmignore with TS entries even when getCompiler() is Babel
- [ ] `e2e/harmony/multiple-compilers.e2e.ts:98` multiple compilers - babel and typescript › different envs in the dependency graph › typescript should not override Babel dist files
- [ ] `e2e/harmony/multiple-compilers.e2e.ts:105` multiple compilers - babel and typescript › different envs in the dependency graph › Babel should not override typescript dist files

### `e2e/harmony/multiple-envs.e2e.ts`

- [ ] `e2e/harmony/multiple-envs.e2e.ts:58` multiple envs › bit status should not show the MultipleEnvs issue because the previous env was replaced
- [ ] `e2e/harmony/multiple-envs.e2e.ts:61` multiple envs › the env should be the newly set one
- [ ] `e2e/harmony/multiple-envs.e2e.ts:79` multiple envs › env in the variants and env in the .bitmap › bit status should not show it as an issue because the previous env was removed
- [ ] `e2e/harmony/multiple-envs.e2e.ts:82` multiple envs › env in the variants and env in the .bitmap › expect the env to be the one that was set in the .bitmap file
- [ ] `e2e/harmony/multiple-envs.e2e.ts:95` multiple envs › env in the variants global (*) and env in the variants more specific › bit status should show it as an issue
- [ ] `e2e/harmony/multiple-envs.e2e.ts:98` multiple envs › env in the variants global (*) and env in the variants more specific › bit env set should fix the issue

### `e2e/harmony/multiple-testers.e2e.ts`

- [ ] `e2e/harmony/multiple-testers.e2e.ts:46` multi testers › bit test command › bit test should run spec files in separate runs
- [ ] `e2e/harmony/multiple-testers.e2e.ts:54` multi testers › bit test command › bit test should run and pass the custom-pattern-1 spec via Jest output
- [ ] `e2e/harmony/multiple-testers.e2e.ts:58` multi testers › bit test command › bit test should run and pass the custom-pattern-2 spec via Jest output
- [ ] `e2e/harmony/multiple-testers.e2e.ts:68` multi testers › bit build command › test task should run spec files in separate runs
- [ ] `e2e/harmony/multiple-testers.e2e.ts:76` multi testers › bit build command › bit build should run and pass the custom-pattern-1 spec via Jest output
- [ ] `e2e/harmony/multiple-testers.e2e.ts:80` multi testers › bit build command › bit build should run and pass the custom-pattern-2 spec via Jest output

### `e2e/harmony/new-component-id-exists-on-remote.e2e.ts`

- [ ] `e2e/harmony/new-component-id-exists-on-remote.e2e.ts:27` creating a new component whose id already exists on the remote › bit add of a component with the same id as an existing remote component (unrelated history) › should warn that the component already exists on the remote scope
- [ ] `e2e/harmony/new-component-id-exists-on-remote.e2e.ts:30` creating a new component whose id already exists on the remote › bit add of a component with the same id as an existing remote component (unrelated history) › should suggest "bit import" to adopt the existing component
- [ ] `e2e/harmony/new-component-id-exists-on-remote.e2e.ts:33` creating a new component whose id already exists on the remote › bit add of a component with the same id as an existing remote component (unrelated history) › should suggest "bit rename" to keep it as a separate component
- [ ] `e2e/harmony/new-component-id-exists-on-remote.e2e.ts:36` creating a new component whose id already exists on the remote › bit add of a component with the same id as an existing remote component (unrelated history) › should still track the component (the warning is non-blocking)
- [ ] `e2e/harmony/new-component-id-exists-on-remote.e2e.ts:62` creating a new component whose id already exists on the remote › bit add when the id does not legitimately collide › should not warn for an already-exported component
- [ ] `e2e/harmony/new-component-id-exists-on-remote.e2e.ts:65` creating a new component whose id already exists on the remote › bit add when the id does not legitimately collide › should not warn for a brand new id that does not exist on the remote

### `e2e/harmony/new.e2e.ts`

- [ ] `e2e/harmony/new.e2e.ts:14` new command › entering a non-exist workspace, should throw a descriptive error
- [ ] `e2e/harmony/new.e2e.ts:52` new command › export a workspace-template aspect › should generate a new workspace, import components and add with no issues
- [ ] `e2e/harmony/new.e2e.ts:58` new command › export a workspace-template aspect › should not add env dependencies to the workspace.jsonc
- [ ] `e2e/harmony/new.e2e.ts:71` new command › running inside workspace › should throw an error
- [ ] `e2e/harmony/new.e2e.ts:80` new command › creating a new react workspace › bit status should be clean

### `e2e/harmony/no-files.e2e.ts`

- [ ] `e2e/harmony/no-files.e2e.ts:21` component files are missing › component directory were deleted › bit list should not throw an error
- [ ] `e2e/harmony/no-files.e2e.ts:24` component files are missing › component directory were deleted › bit status should show the issue without throwing an error
- [ ] `e2e/harmony/no-files.e2e.ts:42` component files are missing › component files were deleted › bit list should not throw an error
- [ ] `e2e/harmony/no-files.e2e.ts:45` component files are missing › component files were deleted › bit status should show the issue without throwing an error
- [ ] `e2e/harmony/no-files.e2e.ts:61` component files are missing › component directory is ignored by .gitignore › bit list should not throw an error
- [ ] `e2e/harmony/no-files.e2e.ts:64` component files are missing › component directory is ignored by .gitignore › bit status should show the issue without throwing an error

### `e2e/harmony/node-linker.e2e.ts`

- [ ] `e2e/harmony/node-linker.e2e.ts:22` installing with non-default nodeLinker › using pnpm as a package manager › setting nodeLinker to "hoisted" › should create a hoisted node_modules
- [ ] `e2e/harmony/node-linker.e2e.ts:34` installing with non-default nodeLinker › using pnpm as a package manager › setting nodeLinker to "isolated" › should symlink into the virtual store rather than hoisting

### `e2e/harmony/out-of-sync-components-harmony.e2e.ts`

- [ ] `e2e/harmony/out-of-sync-components-harmony.e2e.ts:30` components that are not synced between the scope and the consumer › consumer with a new component and scope with the same component as exported with defaultScope configured › bit tag › should tag the component to the next version of what the scope has
- [ ] `e2e/harmony/out-of-sync-components-harmony.e2e.ts:40` components that are not synced between the scope and the consumer › consumer with a new component and scope with the same component as exported with defaultScope configured › bit status › should sync .bitmap according to the scope
- [ ] `e2e/harmony/out-of-sync-components-harmony.e2e.ts:58` components that are not synced between the scope and the consumer › consumer with a tagged component and scope with no components › bit build › should build the component successfully
- [ ] `e2e/harmony/out-of-sync-components-harmony.e2e.ts:68` components that are not synced between the scope and the consumer › consumer with a tagged component and scope with no components › bit status › should show the component as new
- [ ] `e2e/harmony/out-of-sync-components-harmony.e2e.ts:78` components that are not synced between the scope and the consumer › consumer with a tagged component and scope with no components › bit show › should not show the component with the version
- [ ] `e2e/harmony/out-of-sync-components-harmony.e2e.ts:96` components that are not synced between the scope and the consumer › consumer with a tagged exported component and scope with no components › bit import should not throw
- [ ] `e2e/harmony/out-of-sync-components-harmony.e2e.ts:99` components that are not synced between the scope and the consumer › consumer with a tagged exported component and scope with no components › bit import followed by bit status should sync .bitmap
- [ ] `e2e/harmony/out-of-sync-components-harmony.e2e.ts:116` components that are not synced between the scope and the consumer › new lane got deleted › should recrate the lane

### `e2e/harmony/patched-dependencies.e2e.ts`

- [ ] `e2e/harmony/patched-dependencies.e2e.ts:50` patched dependencies › a patch configured with a workspace-relative path › should apply the patch in the workspace
- [ ] `e2e/harmony/patched-dependencies.e2e.ts:54` patched dependencies › a patch configured with a workspace-relative path › should apply the patch in the capsule too

### `e2e/harmony/pkg-manager-config.e2e.ts`

- [ ] `e2e/harmony/pkg-manager-config.e2e.ts:50` using pnpm › workspace pnpm config is taken into account when running install in the capsule

### `e2e/harmony/pkg-manager-errors.e2e.ts`

- [ ] `e2e/harmony/pkg-manager-errors.e2e.ts:27` commands that install, when the package-manager fails › component with a non-exist package dependency which triggers the package-manager to fail › bit checkout › should not throw, instead, should show the error in the output
- [ ] `e2e/harmony/pkg-manager-errors.e2e.ts:41` commands that install, when the package-manager fails › component with a non-exist package dependency which triggers the package-manager to fail › bit switch › should not throw
- [ ] `e2e/harmony/pkg-manager-errors.e2e.ts:52` commands that install, when the package-manager fails › component with a non-exist package dependency which triggers the package-manager to fail › bit import › should not throw

### `e2e/harmony/pkg.e2e.ts`

- [ ] `e2e/harmony/pkg.e2e.ts:38` pkg extension › config added by the user › should have the updated config in the package.json of the configured component in capsule
- [ ] `e2e/harmony/pkg.e2e.ts:42` pkg extension › config added by the user › should not have the updated config in the package.json of another component in capsule
- [ ] `e2e/harmony/pkg.e2e.ts:54` pkg extension › config added by the user › after import › should have the updated config in the package.json of the configured component in capsule
- [ ] `e2e/harmony/pkg.e2e.ts:93` pkg extension › config added by extension › extension that add simple config › should have the updated config in the package.json of the component with the defined extension in capsule
- [ ] `e2e/harmony/pkg.e2e.ts:97` pkg extension › config added by extension › extension that add simple config › should not have the updated config in the package.json of another component without the defined extension in capsule

### `e2e/harmony/pnpm-default-hoisting.e2e.ts`

- [ ] `e2e/harmony/pnpm-default-hoisting.e2e.ts:21` pnpm install with default settings › should run pnpm with hoist-pattern=*
- [ ] `e2e/harmony/pnpm-default-hoisting.e2e.ts:24` pnpm install with default settings › should run pnpm with public-hoist-pattern set

### `e2e/harmony/preview.e2e.ts`

- [ ] `e2e/harmony/preview.e2e.ts:41` preview feature (during build) › jsx component › bit build should run successfully without preview errors

### `e2e/harmony/publish.e2e.ts`

- [ ] `e2e/harmony/publish.e2e.ts:29` publish functionality › workspace with TS components › publishing before tag › should throw an error
- [ ] `e2e/harmony/publish.e2e.ts:49` publish functionality › workspace with TS components › automatically by tag pipeline › should publish them successfully and be able to consume them by installing the packages
- [ ] `e2e/harmony/publish.e2e.ts:67` publish functionality › workspace with TS components › automatically by snap pipeline › should publish them successfully using the 0.0.0-snap version and not changing the "latest" tag
- [ ] `e2e/harmony/publish.e2e.ts:74` publish functionality › workspace with TS components › automatically by snap pipeline › should publish them successfully and be able to consume them by installing the packages
- [ ] `e2e/harmony/publish.e2e.ts:96` publish functionality › workspace with TS components › using "bit publish" › should publish them successfully and be able to consume them by installing the packages
- [ ] `e2e/harmony/publish.e2e.ts:113` publish functionality › workspace with TS components › with pre-release › should publish with the tag flag and be able to npm install them by the tag name
- [ ] `e2e/harmony/publish.e2e.ts:148` publish functionality › should publish them successfully
- [ ] `e2e/harmony/publish.e2e.ts:157` publish functionality › installing the component as a package › should be able to consume them by installing the packages
- [ ] `e2e/harmony/publish.e2e.ts:167` publish functionality › installing the component as a package › requiring the package from another component › should recognize that the package is a component
- [ ] `e2e/harmony/publish.e2e.ts:187` publish functionality › prevent publishing to npm when custom-package-name is needed › should not publish to npm

### `e2e/harmony/readme-env.e2e.ts`

- [ ] `e2e/harmony/readme-env.e2e.ts:26` readme env › set readme env › should not identify the .docs. file as the docs file
- [ ] `e2e/harmony/readme-env.e2e.ts:29` readme env › set readme env › should have the index as the docs file entry point
- [ ] `e2e/harmony/readme-env.e2e.ts:40` readme env › set readme env › unset readme env and set default env › should identify the .docs. file as the docs file

### `e2e/harmony/recover.e2e.ts`

- [ ] `e2e/harmony/recover.e2e.ts:26` bit recover command › recover before snapping › bit status should not show a section of removed components
- [ ] `e2e/harmony/recover.e2e.ts:30` bit recover command › recover before snapping › bit status should not show the dependent component with an issue because the dependency is now back to the workspace
- [ ] `e2e/harmony/recover.e2e.ts:33` bit recover command › recover before snapping › bit list should show the removed component
- [x] `e2e/harmony/recover.e2e.ts:50` bit recover command › recover after snapping › should put it back in .bitmap file — `commands::recover::batch::locally_snapped_removal_imports_from_its_staged_model_without_remote_publication`
- [ ] `e2e/harmony/recover.e2e.ts:54` bit recover command › recover after snapping › bit status should not show the component as remotelySoftRemoved
- [ ] `e2e/harmony/recover.e2e.ts:58` bit recover command › recover after snapping › bit list should show the component
- [ ] `e2e/harmony/recover.e2e.ts:62` bit recover command › recover after snapping › bit status should show the component as modified because the RemoveAspect has changed
- [x] `e2e/harmony/recover.e2e.ts:83` bit recover command › export the soft-remove component, start a new workspace and recover from there › should import the component — `commands::recover::remote::deleted_remote_component_is_imported_then_its_removal_is_overridden`
- [ ] `e2e/harmony/recover.e2e.ts:89` bit recover command › export the soft-remove component, start a new workspace and recover from there › bit status should show the component as modified because the RemoveAspect has changed
- [ ] `e2e/harmony/recover.e2e.ts:110` bit recover command › import soft-removed component › bit status should show the component as soft-removed
- [ ] `e2e/harmony/recover.e2e.ts:114` bit recover command › import soft-removed component › bit status should not show the component as modified
- [ ] `e2e/harmony/recover.e2e.ts:122` bit recover command › import soft-removed component › recover the component › should make the component modified
- [ ] `e2e/harmony/recover.e2e.ts:126` bit recover command › import soft-removed component › recover the component › bit status should not show the component as soft-removed anymore
- [ ] `e2e/harmony/recover.e2e.ts:147` bit recover command › recover on a lane › recover before snapping › bit status should not show a section of removed components
- [ ] `e2e/harmony/recover.e2e.ts:151` bit recover command › recover on a lane › recover before snapping › bit status should not show the dependent component with an issue because the dependency is now back to the workspace
- [ ] `e2e/harmony/recover.e2e.ts:154` bit recover command › recover on a lane › recover before snapping › bit list should show the removed component
- [ ] `e2e/harmony/recover.e2e.ts:172` bit recover command › recover on a lane › recover after snapping › should put it back in .bitmap file
- [ ] `e2e/harmony/recover.e2e.ts:176` bit recover command › recover on a lane › recover after snapping › bit status should not show the component as remotelySoftRemoved
- [ ] `e2e/harmony/recover.e2e.ts:180` bit recover command › recover on a lane › recover after snapping › bit list should show the component
- [ ] `e2e/harmony/recover.e2e.ts:184` bit recover command › recover on a lane › recover after snapping › bit status should show the component as modified because the RemoveAspect has changed
- [ ] `e2e/harmony/recover.e2e.ts:207` bit recover command › recover on a lane › export the soft-remove component, start a new workspace and recover from there › should import the component
- [ ] `e2e/harmony/recover.e2e.ts:213` bit recover command › recover on a lane › export the soft-remove component, start a new workspace and recover from there › bit status should show the component as modified because the RemoveAspect has changed
- [ ] `e2e/harmony/recover.e2e.ts:235` bit recover command › remove after recovering › bit show should show the component as removed
- [ ] `e2e/harmony/recover.e2e.ts:265` bit recover command › remove in one lane, recover in other lane, then merged to the first lane › should bring back the previously removed component
- [ ] `e2e/harmony/recover.e2e.ts:284` bit recover command › remove in one lane, recover in an empty lane › should show a descriptive error
- [ ] `e2e/harmony/recover.e2e.ts:306` bit recover command › recover diverged component before snapping › should not throw
- [ ] `e2e/harmony/recover.e2e.ts:326` bit recover command › recover multiple components using pattern › recover multiple components before snapping › should recover all three components
- [ ] `e2e/harmony/recover.e2e.ts:332` bit recover command › recover multiple components using pattern › recover multiple components before snapping › bit status should not show removed components
- [ ] `e2e/harmony/recover.e2e.ts:336` bit recover command › recover multiple components using pattern › recover multiple components before snapping › bit list should show all components
- [ ] `e2e/harmony/recover.e2e.ts:354` bit recover command › recover multiple components using pattern › recover multiple components after snapping › should recover both components
- [ ] `e2e/harmony/recover.e2e.ts:360` bit recover command › recover multiple components using pattern › recover multiple components after snapping › bit status should not show the components as remotelySoftRemoved
- [ ] `e2e/harmony/recover.e2e.ts:373` bit recover command › recover multiple components using pattern › recover with pattern when no components match › should throw an error when no soft-deleted components match

### `e2e/harmony/recovery-after-deletion.e2e.ts`

- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:87` recovery after component/scope deletion › indirect dependency is missing (import comp1 while comp3 is missing) › an intermediate check. the scope should not have the comp3 object
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:98` recovery after component/scope deletion › indirect dependency is missing (import comp1 while comp3 is missing) › the indirect dependency exists as cache inside the dependent scope › bit tag without --rebuild-deps-graph › should succeed
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:101` recovery after component/scope deletion › indirect dependency is missing (import comp1 while comp3 is missing) › the indirect dependency exists as cache inside the dependent scope › bit tag without --rebuild-deps-graph › should not bring the missing dep from the dependent
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:112` recovery after component/scope deletion › indirect dependency is missing (import comp1 while comp3 is missing) › the indirect dependency exists as cache inside the dependent scope › bit tag with --rebuild-deps-graph › should succeed
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:115` recovery after component/scope deletion › indirect dependency is missing (import comp1 while comp3 is missing) › the indirect dependency exists as cache inside the dependent scope › bit tag with --rebuild-deps-graph › should bring the missing dep from the dependent
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:126` recovery after component/scope deletion › indirect dependency is missing (import comp1 while comp3 is missing) › the indirect dependency exists as cache inside the dependent scope › bit import › should bring the missing dep from the dependent
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:151` recovery after component/scope deletion › indirect dependency is missing (import comp1 while comp3 is missing) › the indirect dependency exists as cache inside the dependent scope › bit export to another remote › this new remote should bring the flattened dependency (comp3) from the dependent scope
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:166` recovery after component/scope deletion › indirect dependency is missing (import comp1 while comp3 is missing) › the indirect dependency is missing in the dependent scope as well › an intermediate check. the scope should not have the comp3 object
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:176` recovery after component/scope deletion › indirect dependency is missing (import comp1 while comp3 is missing) › the indirect dependency is missing in the dependent scope as well › bit import › should not throw an error and not bring the missing dep
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:183` recovery after component/scope deletion › indirect dependency is missing (import comp1 while comp3 is missing) › the indirect dependency is missing in the dependent scope as well › bit tag --rebuild-deps-graph › should throw an error about missing dependencies
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:194` recovery after component/scope deletion › indirect dependency is missing (import comp1 while comp3 is missing) › the indirect dependency is missing in the dependent scope as well › bit tag without --rebuild-deps-graph › should succeed
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:218` recovery after component/scope deletion › indirect dependency scope is down (import comp1 while remote2 is down) › an intermediate check. the scope should not have the comp3 object
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:229` recovery after component/scope deletion › indirect dependency scope is down (import comp1 while remote2 is down) › the indirect dependency exists as cache inside the dependent scope › bit tag without --rebuild-deps-graph › should succeed
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:232` recovery after component/scope deletion › indirect dependency scope is down (import comp1 while remote2 is down) › the indirect dependency exists as cache inside the dependent scope › bit tag without --rebuild-deps-graph › should not bring the missing dep from the dependent
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:243` recovery after component/scope deletion › indirect dependency scope is down (import comp1 while remote2 is down) › the indirect dependency exists as cache inside the dependent scope › bit tag with --rebuild-deps-graph › should succeed
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:246` recovery after component/scope deletion › indirect dependency scope is down (import comp1 while remote2 is down) › the indirect dependency exists as cache inside the dependent scope › bit tag with --rebuild-deps-graph › should bring the missing dep from the dependent
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:257` recovery after component/scope deletion › indirect dependency scope is down (import comp1 while remote2 is down) › the indirect dependency exists as cache inside the dependent scope › bit import › should bring the missing dep from the dependent
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:271` recovery after component/scope deletion › indirect dependency scope is down (import comp1 while remote2 is down) › the indirect dependency is missing in the dependent scope as well › an intermediate check. the scope should not have the comp3 object
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:281` recovery after component/scope deletion › indirect dependency scope is down (import comp1 while remote2 is down) › the indirect dependency is missing in the dependent scope as well › bit import › should not throw an error and not bring the missing dep
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:288` recovery after component/scope deletion › indirect dependency scope is down (import comp1 while remote2 is down) › the indirect dependency is missing in the dependent scope as well › bit tag --rebuild-deps-graph › should throw an error about missing dependencies
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:299` recovery after component/scope deletion › indirect dependency scope is down (import comp1 while remote2 is down) › the indirect dependency is missing in the dependent scope as well › bit tag without --rebuild-deps-graph › should succeed
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:319` recovery after component/scope deletion › direct dependency is missing (import comp2 while comp3 is missing) › an intermediate check. the scope should not have the comp3 object
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:330` recovery after component/scope deletion › direct dependency is missing (import comp2 while comp3 is missing) › the direct dependency exists as cache inside the dependent scope › bit import › should bring the missing dep from the dependent
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:342` recovery after component/scope deletion › direct dependency is missing (import comp2 while comp3 is missing) › the direct dependency exists as cache inside the dependent scope › bit tag › should succeed
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:345` recovery after component/scope deletion › direct dependency is missing (import comp2 while comp3 is missing) › the direct dependency exists as cache inside the dependent scope › bit tag › should bring the missing dep from the dependent
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:361` recovery after component/scope deletion › direct dependency is missing (import comp2 while comp3 is missing) › the direct dependency is missing in the dependent scope as well › an intermediate check. the scope should not have the comp3 object
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:371` recovery after component/scope deletion › direct dependency is missing (import comp2 while comp3 is missing) › the direct dependency is missing in the dependent scope as well › bit import › should not throw an error and not bring the missing dep
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:376` recovery after component/scope deletion › direct dependency is missing (import comp2 while comp3 is missing) › the direct dependency is missing in the dependent scope as well › bit import › should indicate the dependencies are missing
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:386` recovery after component/scope deletion › direct dependency is missing (import comp2 while comp3 is missing) › the direct dependency is missing in the dependent scope as well › bit tag --rebuild-deps-graph › should throw ComponentNotFound error because it is a direct dependency
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:418` recovery after component/scope deletion › indirect dependency (comp3) has re-created with a different version › should import comp1 successfully and bring comp3@0.0.1 from the cache of comp1
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:426` recovery after component/scope deletion › indirect dependency (comp3) has re-created with a different version › should import comp2 successfully and bring comp3@0.0.1 from the cache of comp2
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:436` recovery after component/scope deletion › indirect dependency (comp3) has re-created with a different version › comp3: should save 0.0.1 of in the orphanedVersions prop
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:441` recovery after component/scope deletion › indirect dependency (comp3) has re-created with a different version › comp3: should not have 0.0.1 in the versions object, only 0.0.2
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:446` recovery after component/scope deletion › indirect dependency (comp3) has re-created with a different version › comp3: the head should be the same as 0.0.2 not as 0.0.1
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:451` recovery after component/scope deletion › indirect dependency (comp3) has re-created with a different version › comp3: the remote ref hash should be the same as 0.0.2 not as 0.0.1
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:518` recovery after component/scope deletion › indirect dependency (comp3) has re-created with a different version › importing both: comp2 and direct-dep comp3 to the same workspace › importing comp3 and comp2 at the same time › should be able to tag
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:534` recovery after component/scope deletion › indirect dependency (comp3) has re-created with a different version › the remote of comp1 imports the new version of comp3 (via importMany of exporting comp1) › comp3: should save 0.0.1 of in the orphanedVersions prop on the remote
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:539` recovery after component/scope deletion › indirect dependency (comp3) has re-created with a different version › the remote of comp1 imports the new version of comp3 (via importMany of exporting comp1) › comp3: should not have 0.0.1 in the versions object, only 0.0.2 on the remote
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:544` recovery after component/scope deletion › indirect dependency (comp3) has re-created with a different version › the remote of comp1 imports the new version of comp3 (via importMany of exporting comp1) › comp3: the head should be the same as 0.0.2 not as 0.0.1 on the remote
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:549` recovery after component/scope deletion › indirect dependency (comp3) has re-created with a different version › the remote of comp1 imports the new version of comp3 (via importMany of exporting comp1) › should not change the remote of comp3
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:562` recovery after component/scope deletion › indirect dependency (comp3) has re-created with a different version › the remote of comp1 imports the new version of comp3 (via importMany of exporting comp1) › importing comp3 and then comp1 which brings comp3 with orphaned › should not indicate that dependencies are missing
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:565` recovery after component/scope deletion › indirect dependency (comp3) has re-created with a different version › the remote of comp1 imports the new version of comp3 (via importMany of exporting comp1) › importing comp3 and then comp1 which brings comp3 with orphaned › should save the orphaned version of comp3 locally
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:570` recovery after component/scope deletion › indirect dependency (comp3) has re-created with a different version › the remote of comp1 imports the new version of comp3 (via importMany of exporting comp1) › importing comp3 and then comp1 which brings comp3 with orphaned › should not throw an error on bit-tag of comp1
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:585` recovery after component/scope deletion › indirect dependency (comp3) has re-created with a different version › re-export comp3 when locally it has orphanedVersions prop › the remote of comp3 should not get this orphanedVersions prop
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:622` recovery after component/scope deletion › dealing with snaps, indirect dependency (comp3) has re-created with a new snap › should import comp1 successfully and bring comp3@0.0.1 from the cache of comp1
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:630` recovery after component/scope deletion › dealing with snaps, indirect dependency (comp3) has re-created with a new snap › should import comp2 successfully and bring comp3@0.0.1 from the cache of comp2
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:640` recovery after component/scope deletion › dealing with snaps, indirect dependency (comp3) has re-created with a new snap › comp3: should save 0.0.1 of in the orphanedVersions prop
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:645` recovery after component/scope deletion › dealing with snaps, indirect dependency (comp3) has re-created with a new snap › comp3: should not have 0.0.1 in the versions object
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:649` recovery after component/scope deletion › dealing with snaps, indirect dependency (comp3) has re-created with a new snap › comp3: the head should be different than 0.0.1
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:654` recovery after component/scope deletion › dealing with snaps, indirect dependency (comp3) has re-created with a new snap › comp3: the remote ref hash should be the same as the current head, not as 0.0.1
- [ ] `e2e/harmony/recovery-after-deletion.e2e.ts:718` recovery after component/scope deletion › dealing with snaps, indirect dependency (comp3) has re-created with a new snap › importing both: comp2 and direct-dep comp3 to the same workspace › importing comp3 and comp2 at the same time › should be able to tag

### `e2e/harmony/refactor.e2e.ts`

- [ ] `e2e/harmony/refactor.e2e.ts:19` bit refactor command and flag › refactoring with refactor command › should throw when specifying the non-exist component-id
- [ ] `e2e/harmony/refactor.e2e.ts:24` bit refactor command and flag › refactoring with refactor command › should change the dependency in the source code to the new package-name
- [ ] `e2e/harmony/refactor.e2e.ts:36` bit refactor command and flag › rename a new component with --refactor flag › should change the dependency in the source code to the new package-name
- [ ] `e2e/harmony/refactor.e2e.ts:49` bit refactor command and flag › rename an exported component with --refactor flag › should change the dependency in the source code to the new package-name
- [ ] `e2e/harmony/refactor.e2e.ts:65` bit refactor command and flag › fork command with --refactor flag › fork a local component › should change the dependency in the source code to the new package-name
- [ ] `e2e/harmony/refactor.e2e.ts:76` bit refactor command and flag › fork command with --refactor flag › fork a remote component with no --target-id flag › should throw

### `e2e/harmony/relative-paths.e2e.ts`

- [ ] `e2e/harmony/relative-paths.e2e.ts:23` relative paths flow (components requiring each other by relative paths) › adding directories and using relative-paths › bit status should show it as an invalid component
- [ ] `e2e/harmony/relative-paths.e2e.ts:28` relative paths flow (components requiring each other by relative paths) › adding directories and using relative-paths › should block bit tag
- [ ] `e2e/harmony/relative-paths.e2e.ts:39` relative paths flow (components requiring each other by relative paths) › adding directories and using relative-paths › replacing relative paths by module paths › should rewire successfully
- [ ] `e2e/harmony/relative-paths.e2e.ts:42` relative paths flow (components requiring each other by relative paths) › adding directories and using relative-paths › replacing relative paths by module paths › should not show the component as an invalid anymore
- [ ] `e2e/harmony/relative-paths.e2e.ts:52` relative paths flow (components requiring each other by relative paths) › adding directories and using relative-paths › replacing relative paths by module paths › tagging the component › should allow tagging the component
- [ ] `e2e/harmony/relative-paths.e2e.ts:55` relative paths flow (components requiring each other by relative paths) › adding directories and using relative-paths › replacing relative paths by module paths › tagging the component › bitmap record should have rootDir and files relative to the rootDir
- [ ] `e2e/harmony/relative-paths.e2e.ts:61` relative paths flow (components requiring each other by relative paths) › adding directories and using relative-paths › replacing relative paths by module paths › tagging the component › app should work after rewiring
- [ ] `e2e/harmony/relative-paths.e2e.ts:72` relative paths flow (components requiring each other by relative paths) › adding directories and using relative-paths › replacing relative paths by module paths › tagging the component › should work after importing to another workspace › should write the component files with the short dirs (without rootDir)
- [ ] `e2e/harmony/relative-paths.e2e.ts:75` relative paths flow (components requiring each other by relative paths) › adding directories and using relative-paths › replacing relative paths by module paths › tagging the component › should work after importing to another workspace › should not generate link files
- [ ] `e2e/harmony/relative-paths.e2e.ts:78` relative paths flow (components requiring each other by relative paths) › adding directories and using relative-paths › replacing relative paths by module paths › tagging the component › should work after importing to another workspace › app should work

### `e2e/harmony/released-bit-core-exports.e2e.ts`

- [ ] `e2e/harmony/released-bit-core-exports.e2e.ts:55` bit build (TypescriptCompile) should not fail from type-checking ${CORE_ASPECT_PKG}

### `e2e/harmony/rename.e2e.ts`

- [x] `e2e/harmony/rename.e2e.ts:31` bit rename command › rename an exported component with --deprecate › rename with no flag › should create a new component — `harmony::rename::exported::exported_deprecating_rename_creates_new_identity_and_bidirectional_provenance`
- [x] `e2e/harmony/rename.e2e.ts:35` bit rename command › rename an exported component with --deprecate › rename with no flag › should deprecate the original component — `harmony::rename::exported::exported_deprecating_rename_creates_new_identity_and_bidirectional_provenance`
- [x] `e2e/harmony/rename.e2e.ts:41` bit rename command › rename an exported component with --deprecate › rename with no flag › should reference the original component in the new component — `harmony::rename::exported::exported_deprecating_rename_creates_new_identity_and_bidirectional_provenance`
- [x] `e2e/harmony/rename.e2e.ts:46` bit rename command › rename an exported component with --deprecate › rename with no flag › should list both components — `harmony::rename::exported::exported_deprecating_rename_creates_new_identity_and_bidirectional_provenance`
- [x] `e2e/harmony/rename.e2e.ts:58` bit rename command › rename an exported component with --deprecate › rename with --scope › should save the entered scope as the defaultScope — `harmony::rename::exported::exported_rename_can_change_the_new_scope_and_delete_the_old_component`
- [x] `e2e/harmony/rename.e2e.ts:65` bit rename command › rename an exported component with --deprecate › rename with invalid name › should delete the newly created component-dir — `harmony::rename::exported::invalid_name_and_occupied_destination_do_not_leave_new_component_directories`
- [x] `e2e/harmony/rename.e2e.ts:78` bit rename command › rename an exported component with --deprecate › rename when the path is not empty › should throw an error — `harmony::rename::exported::invalid_name_and_occupied_destination_do_not_leave_new_component_directories`
- [x] `e2e/harmony/rename.e2e.ts:89` bit rename command › rename an exported component with --deprecate › rename with --delete flag › should create a new component — `harmony::rename::exported::exported_rename_can_change_the_new_scope_and_delete_the_old_component`
- [x] `e2e/harmony/rename.e2e.ts:93` bit rename command › rename an exported component with --deprecate › rename with --delete flag › should delete the original component — `harmony::rename::exported::exported_rename_can_change_the_new_scope_and_delete_the_old_component`
- [x] `e2e/harmony/rename.e2e.ts:105` bit rename command › rename a new component › should remove the source component — `harmony::rename::new_component_rename_replaces_the_identity_and_retains_one_component`
- [x] `e2e/harmony/rename.e2e.ts:109` bit rename command › rename a new component › should rename the source to the target id — `harmony::rename::new_component_rename_replaces_the_identity_and_retains_one_component`
- [x] `e2e/harmony/rename.e2e.ts:113` bit rename command › rename a new component › workspace should have one component only — `harmony::rename::new_component_rename_replaces_the_identity_and_retains_one_component`
- [x] `e2e/harmony/rename.e2e.ts:126` bit rename command › rename a new component when the scope is different than the defaultScope › should rename successfully — `harmony::rename::new_component_scope_namespace_and_nondefault_source_scope_are_respected`
- [x] `e2e/harmony/rename.e2e.ts:138` bit rename command › rename a new component scope-name › should change the defaultScope of the component — `harmony::rename::new_component_scope_namespace_and_nondefault_source_scope_are_respected`
- [x] `e2e/harmony/rename.e2e.ts:155` bit rename command › rename with refactoring when the code has other non-import occurrences › should only replace the exact occurrence of the import statement, not others — `harmony::rename::refactoring_replaces_exact_package_imports_without_replacing_longer_names`
- [x] `e2e/harmony/rename.e2e.ts:170` bit rename command › wrong rename with scope-name inside the name › bit rename should throw — `harmony::rename::invalid_scope_inside_target_name_is_rejected_without_partial_files`
- [x] `e2e/harmony/rename.e2e.ts:181` bit rename command › rename scope-name without refactoring › bit status should show an issue because the code points to the renamed component — `harmony::rename::scope_refactoring_controls_missing_package_dependency_issues`
- [x] `e2e/harmony/rename.e2e.ts:193` bit rename command › rename scope-name with refactoring › bit status should not show an issue because the source code has changed to the new package-name — `harmony::rename::scope_refactoring_controls_missing_package_dependency_issues`
- [x] `e2e/harmony/rename.e2e.ts:203` bit rename command › rename a new aspect without --preserve flag › should rename the root-dir — `harmony::rename::aspects::new_aspect_rename_changes_directory_filenames_and_classes_unless_preserved`
- [x] `e2e/harmony/rename.e2e.ts:207` bit rename command › rename a new aspect without --preserve flag › should rename the files — `harmony::rename::aspects::new_aspect_rename_changes_directory_filenames_and_classes_unless_preserved`
- [x] `e2e/harmony/rename.e2e.ts:213` bit rename command › rename a new aspect without --preserve flag › should rename the class-name — `harmony::rename::aspects::new_aspect_rename_changes_directory_filenames_and_classes_unless_preserved`
- [x] `e2e/harmony/rename.e2e.ts:225` bit rename command › rename a new aspect with --preserve flag › should not rename the root-dir — `harmony::rename::aspects::new_aspect_rename_changes_directory_filenames_and_classes_unless_preserved`
- [x] `e2e/harmony/rename.e2e.ts:229` bit rename command › rename a new aspect with --preserve flag › should not rename the files — `harmony::rename::aspects::new_aspect_rename_changes_directory_filenames_and_classes_unless_preserved`
- [x] `e2e/harmony/rename.e2e.ts:237` bit rename command › rename a new aspect with --preserve flag › should not rename the class-name — `harmony::rename::aspects::new_aspect_rename_changes_directory_filenames_and_classes_unless_preserved`
- [x] `e2e/harmony/rename.e2e.ts:252` bit rename command › rename an exported aspect › should rename the files — `harmony::rename::aspects::exported_aspect_rename_changes_only_the_new_component_sources`
- [x] `e2e/harmony/rename.e2e.ts:258` bit rename command › rename an exported aspect › should rename the class-name — `harmony::rename::aspects::exported_aspect_rename_changes_only_the_new_component_sources`
- [x] `e2e/harmony/rename.e2e.ts:263` bit rename command › rename an exported aspect › should not rename the class-name of the original component — `harmony::rename::aspects::exported_aspect_rename_changes_only_the_new_component_sources`
- [x] `e2e/harmony/rename.e2e.ts:274` bit rename command › rename a new component including the namespace and the scope-name › should not throw ComponentNotFound — `harmony::rename::new_component_scope_namespace_and_nondefault_source_scope_are_respected`
- [x] `e2e/harmony/rename.e2e.ts:301` bit rename command › rename an exported component from a lane › should merge the component to main — `harmony::rename::lanes::lane_rename_removal_merges_to_main_only_when_the_source_exists_on_main`
- [x] `e2e/harmony/rename.e2e.ts:305` bit rename command › rename an exported component from a lane › should delete the component from main — `harmony::rename::lanes::lane_rename_removal_merges_to_main_only_when_the_source_exists_on_main`
- [x] `e2e/harmony/rename.e2e.ts:325` bit rename command › rename an exported component from a lane that does not exist on main › should not merge the component to main — `harmony::rename::lanes::lane_rename_removal_merges_to_main_only_when_the_source_exists_on_main`

### `e2e/harmony/require-resolve.e2e.ts`

- [ ] `e2e/harmony/require-resolve.e2e.ts:23` require.resolve detection › when a dependency is inside require.resolve statement › should detect it

### `e2e/harmony/revert.e2e.ts`

- [x] `e2e/harmony/revert.e2e.ts:24` bit revert command › basic revert › should change the code to the specified version — `harmony::revert::known_failures::revert_changes_the_code_and_keeps_the_version` (known failure)
- [x] `e2e/harmony/revert.e2e.ts:28` bit revert command › basic revert › should keep the version in .bitmap intact — `harmony::revert::known_failures::revert_changes_the_code_and_keeps_the_version` (known failure)
- [x] `e2e/harmony/revert.e2e.ts:38` bit revert command › basic revert › when the component is modified › should still change the code to the specified version — `harmony::revert::known_failures::revert_overrides_a_modified_component` (known failure)
- [x] `e2e/harmony/revert.e2e.ts:58` bit revert command › revert from lane to main › should change the code according to main — `harmony::revert::revert_from_a_lane_to_main`
- [x] `e2e/harmony/revert.e2e.ts:64` bit revert command › revert from lane to main › should keep the versions intact — `harmony::revert::revert_from_a_lane_to_main`

### `e2e/harmony/root-components.e2e.ts`

- [ ] `e2e/harmony/root-components.e2e.ts:96` app root components › pnpm isolated linker › should install root components
- [ ] `e2e/harmony/root-components.e2e.ts:104` app root components › pnpm isolated linker › should not link components into node_modules directories of other components
- [ ] `e2e/harmony/root-components.e2e.ts:109` app root components › pnpm isolated linker › should hoist dependencies to the root of the workspace
- [ ] `e2e/harmony/root-components.e2e.ts:112` app root components › pnpm isolated linker › should not nest a dependency to a component directory if it is already in the root
- [ ] `e2e/harmony/root-components.e2e.ts:116` app root components › pnpm isolated linker › should install the dependencies of the root component that has react 17 in the dependencies with react 17
- [ ] `e2e/harmony/root-components.e2e.ts:137` app root components › pnpm isolated linker › should install the dependencies of the root component that has react 16 in the dependencies with react 16
- [ ] `e2e/harmony/root-components.e2e.ts:158` app root components › pnpm isolated linker › should install the non-root components with their default React versions
- [ ] `e2e/harmony/root-components.e2e.ts:192` app root components › pnpm isolated linker › should create package.json file in every variation of the component
- [ ] `e2e/harmony/root-components.e2e.ts:224` app root components › pnpm isolated linker › repeat install › should not add new or remove old deps
- [ ] `e2e/harmony/root-components.e2e.ts:227` app root components › pnpm isolated linker › repeat install › should install the dependencies of the root component that has react 17 in the dependencies with react 17
- [ ] `e2e/harmony/root-components.e2e.ts:248` app root components › pnpm isolated linker › repeat install › should install the dependencies of the root component that has react 16 in the dependencies with react 16
- [ ] `e2e/harmony/root-components.e2e.ts:269` app root components › pnpm isolated linker › repeat install › should install the non-root components with their default React versions
- [ ] `e2e/harmony/root-components.e2e.ts:303` app root components › pnpm isolated linker › repeat install › should create package.json file in every variation of the component
- [ ] `e2e/harmony/root-components.e2e.ts:336` app root components › pnpm isolated linker › compilation › should create the dist folder in the linked directories
- [ ] `e2e/harmony/root-components.e2e.ts:344` app root components › pnpm isolated linker › compilation › should create the dist folder in the root injected folder
- [ ] `e2e/harmony/root-components.e2e.ts:349` app root components › pnpm isolated linker › compilation › should create the dist folders in nested injected directories of the components
- [ ] `e2e/harmony/root-components.e2e.ts:401` app root components › pnpm isolated linker › build › should create root components for workspace capsules
- [ ] `e2e/harmony/root-components.e2e.ts:420` app root components › pnpm isolated linker › build › should link build side-effects to all instances of the component in the capsule directory
- [ ] `e2e/harmony/root-components.e2e.ts:515` app root components › pnpm hoisted linker › should install root components
- [ ] `e2e/harmony/root-components.e2e.ts:519` app root components › pnpm hoisted linker › should install the dependencies of the root component that has react 17 in the dependencies with react 17
- [ ] `e2e/harmony/root-components.e2e.ts:540` app root components › pnpm hoisted linker › should install the dependencies of the root component that has react 16 in the dependencies with react 16
- [ ] `e2e/harmony/root-components.e2e.ts:561` app root components › pnpm hoisted linker › should install the non-root components with their default React versions
- [ ] `e2e/harmony/root-components.e2e.ts:595` app root components › pnpm hoisted linker › should create package.json file in every variation of the component
- [ ] `e2e/harmony/root-components.e2e.ts:626` app root components › pnpm hoisted linker › repeat install › should install the dependencies of the root component that has react 17 in the dependencies with react 17
- [ ] `e2e/harmony/root-components.e2e.ts:647` app root components › pnpm hoisted linker › repeat install › should install the dependencies of the root component that has react 16 in the dependencies with react 16
- [ ] `e2e/harmony/root-components.e2e.ts:668` app root components › pnpm hoisted linker › repeat install › should install the non-root components with their default React versions
- [ ] `e2e/harmony/root-components.e2e.ts:702` app root components › pnpm hoisted linker › repeat install › should create package.json file in every variation of the component
- [ ] `e2e/harmony/root-components.e2e.ts:735` app root components › pnpm hoisted linker › compilation › should create the dist folder in the linked directories
- [ ] `e2e/harmony/root-components.e2e.ts:743` app root components › pnpm hoisted linker › compilation › should create the dist folder in the root injected folder
- [ ] `e2e/harmony/root-components.e2e.ts:748` app root components › pnpm hoisted linker › compilation › should create the dist folders in nested injected directories of the components
- [ ] `e2e/harmony/root-components.e2e.ts:800` app root components › pnpm hoisted linker › build › should create root components for workspace capsules
- [ ] `e2e/harmony/root-components.e2e.ts:819` app root components › pnpm hoisted linker › build › should link build side-effects to all instances of the component in the capsule directory
- [ ] `e2e/harmony/root-components.e2e.ts:960` env root components › pnpm isolated linker › should install root components
- [ ] `e2e/harmony/root-components.e2e.ts:964` env root components › pnpm isolated linker › should install the right version of react to components that have a custom react environment
- [ ] `e2e/harmony/root-components.e2e.ts:996` env root components › pnpm isolated linker › should install the right version of react to custom environment components
- [ ] `e2e/harmony/root-components.e2e.ts:1095` using pnpm › should install components with the right peer dependencies
- [ ] `e2e/harmony/root-components.e2e.ts:1180` env peer dependencies hoisting › pnpm isolated linker › should hoist react to the root of the workspace
- [ ] `e2e/harmony/root-components.e2e.ts:1195` env peer dependencies hoisting when the env is in the workspace › pnpm isolated linker › should install react to the root of the component
- [ ] `e2e/harmony/root-components.e2e.ts:1273` create with root components on › should create the runtime component directory for the created component
- [ ] `e2e/harmony/root-components.e2e.ts:1290` custom root components directory › set a valid custom location › should create the root component directory at the specified location

### `e2e/harmony/scope-cmd.e2e.ts`

- [ ] `e2e/harmony/scope-cmd.e2e.ts:28` bit scope command › bit scope fork › should show the forked components from the scope
- [ ] `e2e/harmony/scope-cmd.e2e.ts:33` bit scope command › bit scope fork › bit show should show the original component in the fork section
- [x] `e2e/harmony/scope-cmd.e2e.ts:46` bit scope command › bit scope rename › should rename the scope — `harmony::scope_rename::scope_rename_changes_the_workspace_default_and_all_matching_new_components`
- [x] `e2e/harmony/scope-cmd.e2e.ts:51` bit scope command › bit scope rename › should delete the old link to node_modules — `harmony::scope_rename::scope_rename_changes_the_workspace_default_and_all_matching_new_components`
- [x] `e2e/harmony/scope-cmd.e2e.ts:55` bit scope command › bit scope rename › should create a new link to node_modules — `harmony::scope_rename::scope_rename_changes_the_workspace_default_and_all_matching_new_components`
- [x] `e2e/harmony/scope-cmd.e2e.ts:59` bit scope command › bit scope rename › should compile the renamed components — `harmony::scope_rename::scope_rename_changes_the_workspace_default_and_all_matching_new_components`
- [x] `e2e/harmony/scope-cmd.e2e.ts:71` bit scope command › bit scope rename --refactor › should change the package name in the component files — `harmony::scope_rename::refactor::mixed_exported_and_new_scope_refactoring_rewrites_the_chain_and_aspect_key`
- [x] `e2e/harmony/scope-cmd.e2e.ts:76` bit scope command › bit scope rename --refactor › should also change the aspect-id in the workspace.jsonc — `harmony::scope_rename::refactor::scope_refactoring_updates_an_actual_configured_aspect_key`
- [x] `e2e/harmony/scope-cmd.e2e.ts:90` bit scope command › bit scope rename, some components are exported some are new › should deprecate the exported one (comp3) — `harmony::scope_rename::refactor::mixed_exported_and_new_scope_refactoring_rewrites_the_chain_and_aspect_key`
- [x] `e2e/harmony/scope-cmd.e2e.ts:97` bit scope command › bit scope rename, some components are exported some are new › should rename the new ones — `harmony::scope_rename::refactor::mixed_exported_and_new_scope_refactoring_rewrites_the_chain_and_aspect_key`
- [x] `e2e/harmony/scope-cmd.e2e.ts:107` bit scope command › bit scope rename, some components are exported some are new › bit status should not have issues — `harmony::scope_rename::refactor::mixed_exported_and_new_scope_refactoring_rewrites_the_chain_and_aspect_key`
- [x] `e2e/harmony/scope-cmd.e2e.ts:110` bit scope command › bit scope rename, some components are exported some are new › bit status should show 3 new components and one modified (comp3 due to deprecation) — `harmony::scope_rename::refactor::mixed_exported_and_new_scope_refactoring_rewrites_the_chain_and_aspect_key`
- [x] `e2e/harmony/scope-cmd.e2e.ts:126` bit scope command › bit scope rename-owner › should rename the default-scope in workspace.jsonc — `harmony::scope_rename::owner_rename_keeps_component_directories_across_multiple_scopes`
- [x] `e2e/harmony/scope-cmd.e2e.ts:129` bit scope command › bit scope rename-owner › should rename the scope of the components — `harmony::scope_rename::owner_rename_keeps_component_directories_across_multiple_scopes`
- [x] `e2e/harmony/scope-cmd.e2e.ts:134` bit scope command › bit scope rename-owner › should delete the old link to node_modules — `harmony::scope_rename::owner_rename_keeps_component_directories_across_multiple_scopes`
- [x] `e2e/harmony/scope-cmd.e2e.ts:140` bit scope command › bit scope rename-owner › should create a new link to node_modules — `harmony::scope_rename::owner_rename_keeps_component_directories_across_multiple_scopes`
- [x] `e2e/harmony/scope-cmd.e2e.ts:146` bit scope command › bit scope rename-owner › should compile the renamed components — `harmony::scope_rename::owner_rename_keeps_component_directories_across_multiple_scopes`
- [ ] `e2e/harmony/scope-cmd.e2e.ts:167` bit scope command › bit scope fork when the paths of two components conflicting › should not throw an error about a component is nested in another component dir

### `e2e/harmony/scope-trust.e2e.ts`

- [ ] `e2e/harmony/scope-trust.e2e.ts:106` does not load the env from a scope outside the trust list
- [ ] `e2e/harmony/scope-trust.e2e.ts:110` surfaces a refusal message naming the scope that isn't on the trust list
- [ ] `e2e/harmony/scope-trust.e2e.ts:194` imports successfully (no error about untrusted scopes)
- [ ] `e2e/harmony/scope-trust.e2e.ts:199` loads the env from the trusted scope

### `e2e/harmony/scripts.e2e.ts`

- [ ] `e2e/harmony/scripts.e2e.ts:38` script command › custom env with scripts defined › bit script --list › should list all available scripts
- [ ] `e2e/harmony/scripts.e2e.ts:41` script command › custom env with scripts defined › bit script --list › should show the environment id
- [ ] `e2e/harmony/scripts.e2e.ts:44` script command › custom env with scripts defined › bit script --list › should show the script names
- [ ] `e2e/harmony/scripts.e2e.ts:48` script command › custom env with scripts defined › bit script --list › should show the script commands
- [ ] `e2e/harmony/scripts.e2e.ts:59` script command › custom env with scripts defined › bit script test-script › should run the script successfully
- [ ] `e2e/harmony/scripts.e2e.ts:62` script command › custom env with scripts defined › bit script test-script › should show the script output
- [ ] `e2e/harmony/scripts.e2e.ts:69` script command › custom env with scripts defined › bit script test-script › should mention the env in the output
- [ ] `e2e/harmony/scripts.e2e.ts:79` script command › custom env with scripts defined › bit script async-script › should run the async script successfully
- [ ] `e2e/harmony/scripts.e2e.ts:82` script command › custom env with scripts defined › bit script async-script › should show the async script output
- [ ] `e2e/harmony/scripts.e2e.ts:85` script command › custom env with scripts defined › bit script async-script › should show the component count in the context
- [ ] `e2e/harmony/scripts.e2e.ts:88` script command › custom env with scripts defined › bit script async-script › should show success message
- [ ] `e2e/harmony/scripts.e2e.ts:98` script command › custom env with scripts defined › bit env get should show scripts › should show scripts section
- [ ] `e2e/harmony/scripts.e2e.ts:101` script command › custom env with scripts defined › bit env get should show scripts › should list the scripts
- [ ] `e2e/harmony/scripts.e2e.ts:108` script command › custom env with scripts defined › running non-existent script › should throw an error
- [ ] `e2e/harmony/scripts.e2e.ts:127` script command › environment without scripts config › bit script --list without config › should show config warning
- [ ] `e2e/harmony/scripts.e2e.ts:163` script command › env version mismatch › bit script --list with version mismatch › should not list scripts from env with different version
- [ ] `e2e/harmony/scripts.e2e.ts:173` script command › env version mismatch › bit script test-script with version mismatch › should not run scripts

### `e2e/harmony/set-default-owner-and-scope.e2e.ts`

- [ ] `e2e/harmony/set-default-owner-and-scope.e2e.ts:40` set default owner and scope › author components › should create link with default owner as prefix
- [ ] `e2e/harmony/set-default-owner-and-scope.e2e.ts:53` set default owner and scope › author components › after export › should export the component to correct scope
- [ ] `e2e/harmony/set-default-owner-and-scope.e2e.ts:64` set default owner and scope › author components › after export › validate models data › should store scope name with the format owner.scope in the models
- [ ] `e2e/harmony/set-default-owner-and-scope.e2e.ts:68` set default owner and scope › author components › after export › validate models data › should store the default owner as the bindingPrefix in the models
- [ ] `e2e/harmony/set-default-owner-and-scope.e2e.ts:79` set default owner and scope › author components › after export › post import › should create links for the imported components
- [ ] `e2e/harmony/set-default-owner-and-scope.e2e.ts:96` set default owner and scope › author components › after export › post import › pack component › should create package.json with correct name
- [ ] `e2e/harmony/set-default-owner-and-scope.e2e.ts:99` set default owner and scope › author components › after export › post import › pack component › should have the component id in package.json

### `e2e/harmony/show-harmony.e2e.ts`

- [ ] `e2e/harmony/show-harmony.e2e.ts:24` bit show command › running bit show --remote on an empty workspace › should show the remote component successfully
- [ ] `e2e/harmony/show-harmony.e2e.ts:27` bit show command › running bit show --remote on an empty workspace › should show Harmony data such as the env
- [ ] `e2e/harmony/show-harmony.e2e.ts:31` bit show command › running bit show --remote on an empty workspace › should not import any object to the local scope

### `e2e/harmony/snap.e2e.ts`

- [ ] `e2e/harmony/snap.e2e.ts:28` bit snap command › snap before tag › should snap successfully
- [ ] `e2e/harmony/snap.e2e.ts:31` bit snap command › snap before tag › should save the snap head in the component object
- [ ] `e2e/harmony/snap.e2e.ts:37` bit snap command › snap before tag › should save the snap hash as a version in .bitmap file
- [ ] `e2e/harmony/snap.e2e.ts:42` bit snap command › snap before tag › bit status should show the snap as staged
- [ ] `e2e/harmony/snap.e2e.ts:52` bit snap command › snap before tag › then tag › should tag successfully
- [ ] `e2e/harmony/snap.e2e.ts:55` bit snap command › snap before tag › then tag › should change the snap head to the newly created version
- [ ] `e2e/harmony/snap.e2e.ts:66` bit snap command › snap before tag › then tag › then snap and tag again › should tag the next version
- [ ] `e2e/harmony/snap.e2e.ts:69` bit snap command › snap before tag › then tag › then snap and tag again › should change the snap head to the newly created version
- [ ] `e2e/harmony/snap.e2e.ts:83` bit snap command › components with dependencies › should save the dependencies successfully with their snaps as versions
- [ ] `e2e/harmony/snap.e2e.ts:88` bit snap command › components with dependencies › bit status should show them in the "snapped" section
- [ ] `e2e/harmony/snap.e2e.ts:97` bit snap command › components with dependencies › tagging the components › --all flag should include the snapped components
- [ ] `e2e/harmony/snap.e2e.ts:101` bit snap command › components with dependencies › tagging the components › --snapped flag should include the snapped components
- [ ] `e2e/harmony/snap.e2e.ts:123` bit snap command › untag a snap › untag the head snap › should change the head to the first snap
- [ ] `e2e/harmony/snap.e2e.ts:127` bit snap command › untag a snap › untag the head snap › should remove the snap from the state.versions array
- [ ] `e2e/harmony/snap.e2e.ts:156` bit snap command › local and remote do not have the same head › when the local is behind the remote › import only objects › should write the head of the remote component
- [ ] `e2e/harmony/snap.e2e.ts:165` bit snap command › local and remote do not have the same head › when the local is behind the remote › import only objects › should not change the version/snap in .bitmap
- [ ] `e2e/harmony/snap.e2e.ts:168` bit snap command › local and remote do not have the same head › when the local is behind the remote › import only objects › bit status should show pending updates
- [ ] `e2e/harmony/snap.e2e.ts:180` bit snap command › local and remote do not have the same head › when the local is behind the remote › import (and merge) › should write the head of the remote component
- [ ] `e2e/harmony/snap.e2e.ts:189` bit snap command › local and remote do not have the same head › when the local is behind the remote › import (and merge) › should change the version/snap in .bitmap
- [ ] `e2e/harmony/snap.e2e.ts:192` bit snap command › local and remote do not have the same head › when the local is behind the remote › import (and merge) › bit status should be clean
- [ ] `e2e/harmony/snap.e2e.ts:208` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › should prevent exporting the component
- [ ] `e2e/harmony/snap.e2e.ts:218` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › importing with --object flag › should not change the head in the Component object
- [ ] `e2e/harmony/snap.e2e.ts:222` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › importing with --object flag › should write the head of the remote component
- [ ] `e2e/harmony/snap.e2e.ts:231` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › importing with --object flag › bit status should show the component as pending merge
- [ ] `e2e/harmony/snap.e2e.ts:244` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › import without any flag › should stop the process and throw a descriptive error suggesting to use --merge flag
- [ ] `e2e/harmony/snap.e2e.ts:266` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=ours flag › without --no-snap flag › should succeed and indicate that the files were not changed
- [ ] `e2e/harmony/snap.e2e.ts:269` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=ours flag › without --no-snap flag › should indicate that a component was snapped
- [ ] `e2e/harmony/snap.e2e.ts:272` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=ours flag › without --no-snap flag › should not change the files on the filesystem
- [ ] `e2e/harmony/snap.e2e.ts:276` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=ours flag › without --no-snap flag › should generate a snap-merge snap with two parents, the local and the remote
- [ ] `e2e/harmony/snap.e2e.ts:282` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=ours flag › without --no-snap flag › should add a descriptive message about the merge
- [ ] `e2e/harmony/snap.e2e.ts:287` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=ours flag › without --no-snap flag › should update bitmap snap
- [ ] `e2e/harmony/snap.e2e.ts:298` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=ours flag › with --no-snap flag › should succeed and indicate that the files were not changed
- [ ] `e2e/harmony/snap.e2e.ts:301` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=ours flag › with --no-snap flag › should not show a message about merge-snapped components
- [ ] `e2e/harmony/snap.e2e.ts:304` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=ours flag › with --no-snap flag › should not change the files on the filesystem
- [ ] `e2e/harmony/snap.e2e.ts:308` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=ours flag › with --no-snap flag › should not generate a snap-merge snap with two parents
- [ ] `e2e/harmony/snap.e2e.ts:312` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=ours flag › with --no-snap flag › should leave the components in a state of resolved but not snapped
- [ ] `e2e/harmony/snap.e2e.ts:318` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=ours flag › with --no-snap flag › should not update bitmap
- [ ] `e2e/harmony/snap.e2e.ts:326` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=ours flag › with --no-snap flag › generating merge-snap by merge --resolve flag › should resolve successfully
- [ ] `e2e/harmony/snap.e2e.ts:329` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=ours flag › with --no-snap flag › generating merge-snap by merge --resolve flag › bit status should not show the component as during merge state
- [ ] `e2e/harmony/snap.e2e.ts:337` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=ours flag › with --no-snap flag › generating merge-snap by merge --resolve flag › should generate a snap-merge snap with two parents, the local and the remote
- [ ] `e2e/harmony/snap.e2e.ts:341` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=ours flag › with --no-snap flag › generating merge-snap by merge --resolve flag › should update bitmap snap
- [ ] `e2e/harmony/snap.e2e.ts:355` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=theirs flag › should succeed and indicate that the files were updated
- [ ] `e2e/harmony/snap.e2e.ts:358` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=theirs flag › should change the files on the filesystem according to the remote version
- [ ] `e2e/harmony/snap.e2e.ts:362` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=theirs flag › should generate a snap-merge snap with two parents, the local and the remote
- [ ] `e2e/harmony/snap.e2e.ts:368` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=theirs flag › should add a descriptive message about the merge
- [ ] `e2e/harmony/snap.e2e.ts:373` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=theirs flag › should update bitmap snap
- [ ] `e2e/harmony/snap.e2e.ts:387` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=manual flag › should succeed and indicate that the files were left in a conflict state
- [ ] `e2e/harmony/snap.e2e.ts:390` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=manual flag › should change the files on the filesystem and mark the conflicts properly
- [ ] `e2e/harmony/snap.e2e.ts:398` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=manual flag › should not change bitmap version
- [ ] `e2e/harmony/snap.e2e.ts:401` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=manual flag › should not generate a new merge-snap
- [ ] `e2e/harmony/snap.e2e.ts:405` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=manual flag › bit status should show it as component with conflict and modified but not as pending update
- [ ] `e2e/harmony/snap.e2e.ts:412` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=manual flag › should block checking out the component
- [ ] `e2e/harmony/snap.e2e.ts:424` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=manual flag › tagging or snapping the component › should allow tagging the component successfully and add two parents to the Version object
- [ ] `e2e/harmony/snap.e2e.ts:433` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=manual flag › tagging or snapping the component › should include the component when running bit tag --all
- [ ] `e2e/harmony/snap.e2e.ts:442` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=manual flag › tagging or snapping the component › should allow snapping the component successfully and add two parents to the Version object
- [ ] `e2e/harmony/snap.e2e.ts:456` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=manual flag › removing the component › bit status should not show the component
- [ ] `e2e/harmony/snap.e2e.ts:468` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=manual flag › un-tagging the component › bit status should not show the component as a component with conflicts but as modified
- [ ] `e2e/harmony/snap.e2e.ts:483` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=manual flag › resolving the merge › should resolve the conflicts successfully
- [ ] `e2e/harmony/snap.e2e.ts:486` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=manual flag › resolving the merge › bit status should not show the component as if it has conflicts
- [ ] `e2e/harmony/snap.e2e.ts:494` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=manual flag › resolving the merge › should generate a snap-merge snap with two parents, the local and the remote
- [ ] `e2e/harmony/snap.e2e.ts:500` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=manual flag › resolving the merge › should update bitmap snap
- [ ] `e2e/harmony/snap.e2e.ts:511` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=manual flag › aborting the merge › should abort the merge successfully
- [ ] `e2e/harmony/snap.e2e.ts:514` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=manual flag › aborting the merge › bit status should show the same state as before the merge
- [ ] `e2e/harmony/snap.e2e.ts:522` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=manual flag › aborting the merge › should not change the version in .bitmap
- [ ] `e2e/harmony/snap.e2e.ts:525` bit snap command › local and remote do not have the same head › when the local is diverged from the remote › merge with merge=manual flag › aborting the merge › should reset the changes the merge done on the filesystem
- [ ] `e2e/harmony/snap.e2e.ts:547` bit snap command › bit checkout and bit diff for snaps › snap, change and then snap › bit diff should show the differences
- [ ] `e2e/harmony/snap.e2e.ts:561` bit snap command › bit checkout and bit diff for snaps › snap, change and then snap › bit checkout › should checkout to the first snap
- [ ] `e2e/harmony/snap.e2e.ts:568` bit snap command › bit checkout and bit diff for snaps › snap, change and then snap › bit checkout › bit checkout head › should checkout to the latest (second) snap
- [ ] `e2e/harmony/snap.e2e.ts:595` bit snap command › auto snap › should auto snap the dependencies and the nested dependencies
- [ ] `e2e/harmony/snap.e2e.ts:598` bit snap command › auto snap › should update the dependencies and the flattenedDependencies of the dependent with the new versions
- [ ] `e2e/harmony/snap.e2e.ts:609` bit snap command › auto snap › should update the dependencies and the flattenedDependencies of the dependent of the dependent with the new versions
- [ ] `e2e/harmony/snap.e2e.ts:626` bit snap command › auto snap › bit-status should show them all as staged and not modified
- [ ] `e2e/harmony/snap.e2e.ts:643` bit snap command › auto snap › importing the component to another scope › should use the updated dependencies and print the results from the latest versions
- [ ] `e2e/harmony/snap.e2e.ts:667` bit snap command › tag after tag › should not fetch previous version files for performance reasons, only the latest
- [ ] `e2e/harmony/snap.e2e.ts:692` bit snap command › merge tags › should prevent exporting the component
- [ ] `e2e/harmony/snap.e2e.ts:703` bit snap command › merge tags › bit status should suggest running either "bit reset" or "bit merge"
- [ ] `e2e/harmony/snap.e2e.ts:720` bit snap command › merge tags › bit reset a diverge component › reset all local versions › should change the head to point to the parent of the untagged version not to the remote head
- [ ] `e2e/harmony/snap.e2e.ts:726` bit snap command › merge tags › bit reset a diverge component › reset all local versions › bit status after untag should show the component not only as modified but also as outdated
- [ ] `e2e/harmony/snap.e2e.ts:738` bit snap command › merge tags › bit reset a diverge component › reset only head › should change the head to point to the parent of the head and not to the remote head
- [ ] `e2e/harmony/snap.e2e.ts:757` bit snap command › snap with --unmodified after soft-remove › should indicate that the component was removed successfully
- [ ] `e2e/harmony/snap.e2e.ts:760` bit snap command › snap with --unmodified after soft-remove › should not show the component as changed (because the new snap isnt relevant for a deleted component

### `e2e/harmony/stash.e2e.ts`

- [x] `e2e/harmony/stash.e2e.ts:25` bit stash command › basic stash › should change the code to the last tag — `native/cli/tests/e2e/harmony/stash.rs::basic_save_and_load_restore_sources_without_advancing_heads`
- [x] `e2e/harmony/stash.e2e.ts:29` bit stash command › basic stash › should create a stash-file — `native/cli/tests/e2e/harmony/stash.rs::basic_save_and_load_restore_sources_without_advancing_heads`
- [x] `e2e/harmony/stash.e2e.ts:33` bit stash command › basic stash › should checkout-reset the component — `native/cli/tests/e2e/harmony/stash.rs::basic_save_and_load_restore_sources_without_advancing_heads`
- [x] `e2e/harmony/stash.e2e.ts:41` bit stash command › basic stash › stash load › should return the code that was stashed before — `native/cli/tests/e2e/harmony/stash.rs::basic_save_and_load_restore_sources_without_advancing_heads`
- [x] `e2e/harmony/stash.e2e.ts:45` bit stash command › basic stash › stash load › bit status should show the component as modified — `native/cli/tests/e2e/harmony/stash.rs::basic_save_and_load_restore_sources_without_advancing_heads`
- [x] `e2e/harmony/stash.e2e.ts:49` bit stash command › basic stash › stash load › should delete the stash file — `native/cli/tests/e2e/harmony/stash.rs::basic_save_and_load_restore_sources_without_advancing_heads`
- [x] `e2e/harmony/stash.e2e.ts:66` bit stash command › stash and local have conflicting modification › should save the file with conflicts markers — `native/cli/tests/e2e/harmony/stash.rs::manual_load_preserves_the_published_conflict_labels`
- [x] `e2e/harmony/stash.e2e.ts:85` bit stash command › stash the modification from 0.0.1 then tag 0.0.2 › should use 0.0.1 as the "base-version", find the modification from 0.0.1 and apply them on top of 0.0.2 — `native/cli/tests/e2e/harmony/stash.rs::stash_parent_remains_the_merge_base_after_a_new_tag`
- [x] `e2e/harmony/stash.e2e.ts:103` bit stash command › stash and local have modification with a shared base - 0.0.1 › should use 0.0.1 as the "base-version", find the modification from 0.0.1 and apply them on the local modifications — `native/cli/tests/e2e/harmony/stash.rs::independent_local_edits_merge_using_the_saved_parent`
- [x] `e2e/harmony/stash.e2e.ts:118` bit stash command › stash new components along with modified › should stash both of them — `native/cli/tests/e2e/harmony/stash.rs::included_new_components_are_removed_and_restored_at_the_saved_root`
- [x] `e2e/harmony/stash.e2e.ts:122` bit stash command › stash new components along with modified › should remove the new component from .bitmap — `native/cli/tests/e2e/harmony/stash.rs::included_new_components_are_removed_and_restored_at_the_saved_root`
- [x] `e2e/harmony/stash.e2e.ts:131` bit stash command › stash new components along with modified › stash load them › should re-create the new component — `native/cli/tests/e2e/harmony/stash.rs::included_new_components_are_removed_and_restored_at_the_saved_root`
- [x] `e2e/harmony/stash.e2e.ts:135` bit stash command › stash new components along with modified › stash load them › should re-create it with its rootDir, which is what its files are loaded from — `native/cli/tests/e2e/harmony/stash.rs::included_new_components_are_removed_and_restored_at_the_saved_root`

### `e2e/harmony/status-harmony.e2e.ts`

- [x] `e2e/harmony/status-harmony.e2e.ts:24` status command on Harmony › main filename is not index and dists are missing › should not show an issue of missing-packages — `harmony::status_harmony::a_linked_package_is_not_missing`
- [x] `e2e/harmony/status-harmony.e2e.ts:40` status command on Harmony › dists dir is deleted after caching the components › should show an issue of missing-dists — `harmony::status_harmony::deleted_dists_after_the_cache_are_missing`
- [x] `e2e/harmony/status-harmony.e2e.ts:43` status command on Harmony › dists dir is deleted after caching the components › should exit with non zero exit-code if --strict flag is used — `harmony::status_harmony::deleted_dists_after_the_cache_are_missing`
- [x] `e2e/harmony/status-harmony.e2e.ts:63` status command on Harmony › package dir is deleted from node-modules › should show an issue of missing-links-from-node-modules-to-src — `harmony::status_harmony::a_deleted_package_dir_is_a_missing_link`
- [x] `e2e/harmony/status-harmony.e2e.ts:74` status command on Harmony › components that are both: new and auto-tag-pending › should be shown in the newComponents section only and not in the autoTagPendingComponents — `harmony::status_harmony::new_components_are_not_auto_tag_pending`
- [x] `e2e/harmony/status-harmony.e2e.ts:89` status command on Harmony › components that imports itself › should not add itself as a dependency — `harmony::status_harmony::known_failures::a_component_importing_itself_is_not_its_own_dependency` (known failure)
- [x] `e2e/harmony/status-harmony.e2e.ts:101` status command on Harmony › status --quick flag › should show new and modified components — `harmony::status_harmony::quick_status_shows_new_and_modified`
- [x] `e2e/harmony/status-harmony.e2e.ts:109` status command on Harmony › status --quick flag › should return new and modified in json format — `harmony::status_harmony::quick_status_json_lists_new_and_modified`
- [x] `e2e/harmony/status-harmony.e2e.ts:125` status command on Harmony › deleting a dependency from the filesystem when the record is still in bitmap › bit status should not throw — `harmony::status_harmony::a_deleted_dependency_directory_does_not_throw`
- [x] `e2e/harmony/status-harmony.e2e.ts:146` status command on Harmony › when a component is created and added without its dependencies › Should show missing dependencies — `harmony::status_harmony::missing_dependency_files_are_shown`
- [x] `e2e/harmony/status-harmony.e2e.ts:165` status command on Harmony › dynamic import › status should not show the component as missing packages — `harmony::status_harmony::a_dynamic_import_is_not_a_missing_package`
- [x] `e2e/harmony/status-harmony.e2e.ts:178` status command on Harmony › import from the index file › should show an ImportFromDirectory issue — `harmony::status_harmony::importing_the_index_directory_is_an_issue`

### `e2e/harmony/tag-harmony.e2e.ts`

- [ ] `e2e/harmony/tag-harmony.e2e.ts:33` tag components on Harmony › workspace with standard components › should import successfully with the schema prop
- [ ] `e2e/harmony/tag-harmony.e2e.ts:38` tag components on Harmony › workspace with standard components › bit status should work and not show modified
- [ ] `e2e/harmony/tag-harmony.e2e.ts:46` tag components on Harmony › workspace with standard components › tag without build after full tag › should not save the builder data from the previous version
- [ ] `e2e/harmony/tag-harmony.e2e.ts:52` tag components on Harmony › workspace with standard components › tag without build after full tag › should be able to export successfully
- [ ] `e2e/harmony/tag-harmony.e2e.ts:65` tag components on Harmony › tag on Harmony › should not show the component as modified
- [ ] `e2e/harmony/tag-harmony.e2e.ts:71` tag components on Harmony › tag on Harmony › should not show the dependency with an older version
- [ ] `e2e/harmony/tag-harmony.e2e.ts:77` tag components on Harmony › tag on Harmony › should not save the build data twice
- [ ] `e2e/harmony/tag-harmony.e2e.ts:88` tag components on Harmony › tag on Harmony › auto-tag › should save the artifacts/dists to the auto-tagged components
- [x] `e2e/harmony/tag-harmony.e2e.ts:103` tag components on Harmony › soft tag › should add a property of nextVersion in .bitmap file — `commands::tag::soft::soft_tag_then_persist_matches_node`
- [x] `e2e/harmony/tag-harmony.e2e.ts:111` tag components on Harmony › soft tag › bit status should show the new components as soft tagged — `commands::tag::soft::soft_tag_then_persist_matches_node`
- [x] `e2e/harmony/tag-harmony.e2e.ts:119` tag components on Harmony › soft tag › tagging with --persist flag › should tag and remove the nextVersion property in .bitmap file — `commands::tag::soft::soft_tag_then_persist_matches_node`
- [x] `e2e/harmony/tag-harmony.e2e.ts:128` tag components on Harmony › soft tag › tagging with --persist flag › bit status should not show as soft-tagged — `commands::tag::soft::soft_tag_then_persist_matches_node`
- [ ] `e2e/harmony/tag-harmony.e2e.ts:137` tag components on Harmony › soft tag › tagging with --persist flag › modify a component that has dependents and soft-tag it › should save the nextVersion data into potential auto-tag bitmap entries
- [x] `e2e/harmony/tag-harmony.e2e.ts:148` tag components on Harmony › soft tag › soft tag with specific version and message › should save the version and the message into the .bitmap file — `commands::tag::soft::exact_soft_tag_then_persist_matches_node`
- [ ] `e2e/harmony/tag-harmony.e2e.ts:164` tag components on Harmony › soft tag › soft tag with specific version attached to a component-id › should save the version into the .bitmap file
- [x] `e2e/harmony/tag-harmony.e2e.ts:177` tag components on Harmony › soft tag › soft tag after soft tag › should show the output according to the new soft-tag — `commands::tag::soft::repeated_soft_tag_replaces_pending_version_and_message`
- [x] `e2e/harmony/tag-harmony.e2e.ts:181` tag components on Harmony › soft tag › soft tag after soft tag › should save the version and the message into the .bitmap file — `commands::tag::soft::repeated_soft_tag_replaces_pending_version_and_message`
- [ ] `e2e/harmony/tag-harmony.e2e.ts:194` tag components on Harmony › soft tag › untag › should remove the nextVersion from the .bitmap file
- [ ] `e2e/harmony/tag-harmony.e2e.ts:218` tag components on Harmony › tag scope › without version › should bump each component by patch
- [ ] `e2e/harmony/tag-harmony.e2e.ts:230` tag components on Harmony › tag scope › without version and --minor flag › should bump each component by patch
- [ ] `e2e/harmony/tag-harmony.e2e.ts:255` tag components on Harmony › with failing tests › should fail without --skip-tests
- [ ] `e2e/harmony/tag-harmony.e2e.ts:262` tag components on Harmony › with failing tests › should succeed with --skip-tests
- [ ] `e2e/harmony/tag-harmony.e2e.ts:266` tag components on Harmony › with failing tests › should succeed with --ignore-build-errors
- [ ] `e2e/harmony/tag-harmony.e2e.ts:270` tag components on Harmony › with failing tests › should not throw with --build --loose when only test failures occur and set buildStatus to succeed
- [ ] `e2e/harmony/tag-harmony.e2e.ts:294` tag components on Harmony › modified one component, the rest are auto-tag pending › tag with specific version › should set the specified version to the modified component and bumped by patch the auto-tagged
- [ ] `e2e/harmony/tag-harmony.e2e.ts:306` tag components on Harmony › modified one component, the rest are auto-tag pending › tag with --scope flag › should set all components versions to the scope flag
- [ ] `e2e/harmony/tag-harmony.e2e.ts:319` tag components on Harmony › modified one component, the rest are auto-tag pending › auto-tag with pre-release › should auto-tag dependents according to the pre-release version
- [ ] `e2e/harmony/tag-harmony.e2e.ts:331` tag components on Harmony › modified one component, the rest are auto-tag pending › with --auto-tag-increment › should bump the auto-tagged dependents by the given level rather than by patch
- [ ] `e2e/harmony/tag-harmony.e2e.ts:344` tag components on Harmony › modified one component, the rest are auto-tag pending › with --auto-tag-increment different than the modified level › should bump the modified and the auto-tagged by their own levels
- [ ] `e2e/harmony/tag-harmony.e2e.ts:357` tag components on Harmony › modified one component, the rest are auto-tag pending › --auto-tag-increment along with --skip-auto-tag › should throw an error
- [ ] `e2e/harmony/tag-harmony.e2e.ts:368` tag components on Harmony › modified one component, the rest are auto-tag pending › --auto-tag-increment with a pre-release level and --prerelease-id › should use the prerelease identifier for the auto-tagged dependents
- [ ] `e2e/harmony/tag-harmony.e2e.ts:389` tag components on Harmony › using --incremented-by flag › increment the default (patch) › should set the specified version to the modified component and bumped by patch the auto-tagged
- [ ] `e2e/harmony/tag-harmony.e2e.ts:402` tag components on Harmony › using --incremented-by flag › increment the default (minor) › should set the specified version to the modified component and bumped by patch the auto-tagged
- [ ] `e2e/harmony/tag-harmony.e2e.ts:416` tag components on Harmony › using --incremented-by flag › auto-tag › should set the specified version to the modified component and bumped by patch the auto-tagged
- [ ] `e2e/harmony/tag-harmony.e2e.ts:431` tag components on Harmony › tag pre-release › should tag all components according to the pre-release version
- [ ] `e2e/harmony/tag-harmony.e2e.ts:439` tag components on Harmony › tag pre-release › increment pre-release › should use the last pre-release identifier and increment it
- [ ] `e2e/harmony/tag-harmony.e2e.ts:452` tag components on Harmony › invalid --auto-tag-increment level › should throw an error
- [ ] `e2e/harmony/tag-harmony.e2e.ts:464` tag components on Harmony › invalid pre-release after normal tag › should throw an error
- [ ] `e2e/harmony/tag-harmony.e2e.ts:467` tag components on Harmony › invalid pre-release after normal tag › should not create a new version
- [ ] `e2e/harmony/tag-harmony.e2e.ts:473` tag components on Harmony › invalid pre-release after normal tag › should update package.json on the workspace with the new tag
- [x] `e2e/harmony/tag-harmony.e2e.ts:488` tag components on Harmony › soft-tag pre-release › should save the pre-release name in the .bitmap file — `commands::tag::soft::soft_prerelease_matches_node_and_persist_delegates`
- [ ] `e2e/harmony/tag-harmony.e2e.ts:498` tag components on Harmony › soft-tag pre-release › persist the soft-tag › should use the data in the .bitmap file and tag as a pre-release version
- [ ] `e2e/harmony/tag-harmony.e2e.ts:511` tag components on Harmony › soft tag --minor with auto-tag › should not bump the auto-tagged with minor but with patch
- [ ] `e2e/harmony/tag-harmony.e2e.ts:529` tag components on Harmony › with tiny cache › should not throw
- [ ] `e2e/harmony/tag-harmony.e2e.ts:542` tag components on Harmony › tagging a snapped component by specifying the id › should tag successfully without needing to add --unmodified
- [ ] `e2e/harmony/tag-harmony.e2e.ts:559` tag components on Harmony › tag with versions file › should tag components according to the versions file
- [ ] `e2e/harmony/tag-harmony.e2e.ts:565` tag components on Harmony › tag with versions file › should show correct output with versions from file
- [ ] `e2e/harmony/tag-harmony.e2e.ts:590` tag components on Harmony › maintain two main branches 1.x and 2.x, tagging the older branch 1.x with a patch › should keep the head as 2.x and not change it to 1.0.1
- [ ] `e2e/harmony/tag-harmony.e2e.ts:594` tag components on Harmony › maintain two main branches 1.x and 2.x, tagging the older branch 1.x with a patch › should update the .bitmap according to the patch version and not the head
- [ ] `e2e/harmony/tag-harmony.e2e.ts:604` tag components on Harmony › maintain two main branches 1.x and 2.x, tagging the older branch 1.x with a patch › importing the component to a new workspace › should import the latest: 2.x and not the patch 1.01
- [ ] `e2e/harmony/tag-harmony.e2e.ts:637` tag components on Harmony › export with detached-head when head was not exported yet › should have exported both head (2.0.0) and detached-head (2.0.1) to the remote
- [ ] `e2e/harmony/tag-harmony.e2e.ts:642` tag components on Harmony › export with detached-head when head was not exported yet › should have the version object for 2.0.0 on the remote
- [ ] `e2e/harmony/tag-harmony.e2e.ts:645` tag components on Harmony › export with detached-head when head was not exported yet › should have the version object for 2.0.1 on the remote
- [ ] `e2e/harmony/tag-harmony.e2e.ts:653` tag components on Harmony › export with detached-head when head was not exported yet › importing the component to a new workspace › should successfully import without errors
- [ ] `e2e/harmony/tag-harmony.e2e.ts:656` tag components on Harmony › export with detached-head when head was not exported yet › importing the component to a new workspace › should have version 2.0.0 available (the head)
- [ ] `e2e/harmony/tag-harmony.e2e.ts:660` tag components on Harmony › export with detached-head when head was not exported yet › importing the component to a new workspace › should have the version object for 2.0.0
- [ ] `e2e/harmony/tag-harmony.e2e.ts:705` tag components on Harmony › export with detached-head when head and its parent were not exported yet › should have exported all versions: 2.0.0, snap, 2.0.1 (head), and 2.0.2 (detached-head)
- [ ] `e2e/harmony/tag-harmony.e2e.ts:713` tag components on Harmony › export with detached-head when head and its parent were not exported yet › should have the version object for 2.0.0 on the remote
- [ ] `e2e/harmony/tag-harmony.e2e.ts:716` tag components on Harmony › export with detached-head when head and its parent were not exported yet › should have the version object for the snap on the remote
- [ ] `e2e/harmony/tag-harmony.e2e.ts:719` tag components on Harmony › export with detached-head when head and its parent were not exported yet › should have the version object for 2.0.1 on the remote
- [ ] `e2e/harmony/tag-harmony.e2e.ts:722` tag components on Harmony › export with detached-head when head and its parent were not exported yet › should have the version object for 2.0.2 on the remote
- [ ] `e2e/harmony/tag-harmony.e2e.ts:730` tag components on Harmony › export with detached-head when head and its parent were not exported yet › importing the component to a new workspace › should successfully import without errors
- [ ] `e2e/harmony/tag-harmony.e2e.ts:733` tag components on Harmony › export with detached-head when head and its parent were not exported yet › importing the component to a new workspace › should have all versions in the component metadata
- [ ] `e2e/harmony/tag-harmony.e2e.ts:739` tag components on Harmony › export with detached-head when head and its parent were not exported yet › importing the component to a new workspace › should have the version object for 2.0.1 (the head that was imported)
- [ ] `e2e/harmony/tag-harmony.e2e.ts:742` tag components on Harmony › export with detached-head when head and its parent were not exported yet › importing the component to a new workspace › should be able to import the snap directly by hash
- [ ] `e2e/harmony/tag-harmony.e2e.ts:777` tag components on Harmony › export with --detach-head after merging a lane › should have exported the unexported main head (2.0.0)
- [ ] `e2e/harmony/tag-harmony.e2e.ts:781` tag components on Harmony › export with --detach-head after merging a lane › should have the version object for 2.0.0 on the remote
- [ ] `e2e/harmony/tag-harmony.e2e.ts:784` tag components on Harmony › export with --detach-head after merging a lane › should have the lane snaps on the remote (they were already exported on the lane)

### `e2e/harmony/test-harmony.e2e.ts`

- [ ] `e2e/harmony/test-harmony.e2e.ts:19` test command on Harmony › component with an empty test file › --junit should show the error
- [ ] `e2e/harmony/test-harmony.e2e.ts:36` test command on Harmony › passing test-file paths instead of a component pattern › should throw a descriptive error when the file is not a test file of the component
- [ ] `e2e/harmony/test-harmony.e2e.ts:41` test command on Harmony › passing test-file paths instead of a component pattern › should throw when the file does not belong to any component
- [ ] `e2e/harmony/test-harmony.e2e.ts:46` test command on Harmony › passing test-file paths instead of a component pattern › should throw when mixing test-file paths with component patterns

### `e2e/harmony/track-directories-harmony.e2e.ts`

- [ ] `e2e/harmony/track-directories-harmony.e2e.ts:25` track directories functionality › add a directory as authored › should add the directory as rootDir in bitmap file
- [ ] `e2e/harmony/track-directories-harmony.e2e.ts:38` track directories functionality › add a directory as authored › creating another file in the same directory › bit status should still show the component as new
- [ ] `e2e/harmony/track-directories-harmony.e2e.ts:41` track directories functionality › add a directory as authored › creating another file in the same directory › should add the new file
- [ ] `e2e/harmony/track-directories-harmony.e2e.ts:53` track directories functionality › add a directory as authored › creating another file in the same directory › rename a non-main file › should update the renamed file
- [ ] `e2e/harmony/track-directories-harmony.e2e.ts:69` track directories functionality › add a directory as authored › creating another file in the same directory and running bit-status from an inner directory › bit status should still show the component as new
- [ ] `e2e/harmony/track-directories-harmony.e2e.ts:72` track directories functionality › add a directory as authored › creating another file in the same directory and running bit-status from an inner directory › bit status should update bitmap and add the new file
- [ ] `e2e/harmony/track-directories-harmony.e2e.ts:87` track directories functionality › add a directory as authored › rename the file which is a main file › bit status should indicate the missing of the mainFile
- [ ] `e2e/harmony/track-directories-harmony.e2e.ts:96` track directories functionality › add a directory as authored › tagging the component › should save the files with relativePaths relative to the rootDir
- [ ] `e2e/harmony/track-directories-harmony.e2e.ts:109` track directories functionality › add a directory as authored › tagging the component › then adding a new file to the directory › bit status should show the component as modified
- [ ] `e2e/harmony/track-directories-harmony.e2e.ts:112` track directories functionality › add a directory as authored › tagging the component › then adding a new file to the directory › bit status should update bitmap and add the new file
- [ ] `e2e/harmony/track-directories-harmony.e2e.ts:124` track directories functionality › add a directory as authored › adding a file outside of that directory › should throw an error
- [ ] `e2e/harmony/track-directories-harmony.e2e.ts:137` track directories functionality › add a directory as authored › adding a parent directory › should add the files in that directory successfully
- [ ] `e2e/harmony/track-directories-harmony.e2e.ts:140` track directories functionality › add a directory as authored › adding a parent directory › should change the rootDir to the newly added dir
- [ ] `e2e/harmony/track-directories-harmony.e2e.ts:146` track directories functionality › add a directory as authored › adding a parent directory › should change the files according to the new rootDir
- [ ] `e2e/harmony/track-directories-harmony.e2e.ts:161` track directories functionality › add a directory as authored › importing the component › should not change the rootDir
- [ ] `e2e/harmony/track-directories-harmony.e2e.ts:176` track directories functionality › add multiple directories › should add rootDir property for each one of the directories
- [ ] `e2e/harmony/track-directories-harmony.e2e.ts:198` track directories functionality › adding files to sub-directories › the files on the sub-dir should be auto-tracked

### `e2e/harmony/tsconfig-env-mismatch.e2e.ts`

- [ ] `e2e/harmony/tsconfig-env-mismatch.e2e.ts:198` tsconfig env mismatch between check-types and build › component with permissive tsconfig imported by env with strict tsconfig › bit check-types should pass without strict mode errors
- [ ] `e2e/harmony/tsconfig-env-mismatch.e2e.ts:206` tsconfig env mismatch between check-types and build › component with permissive tsconfig imported by env with strict tsconfig › bit build should pass with each component using its own tsconfig

### `e2e/harmony/typescript-tsserver.e2e.ts`

- [ ] `e2e/harmony/typescript-tsserver.e2e.ts:38` TsServer component › tsserver › should provide an API for quickInfo
- [ ] `e2e/harmony/typescript-tsserver.e2e.ts:42` TsServer component › tsserver › should provide an API for TypeDefinition
- [ ] `e2e/harmony/typescript-tsserver.e2e.ts:46` TsServer component › tsserver › should provide an API for References

### `e2e/harmony/ui-start.e2e.ts`

- [ ] `e2e/harmony/ui-start.e2e.ts:58` scope UI, on a bare scope › should start without writing errors to stderr
- [ ] `e2e/harmony/ui-start.e2e.ts:64` scope UI, on a bare scope › should serve a document with a react root
- [ ] `e2e/harmony/ui-start.e2e.ts:68` scope UI, on a bare scope › should serve every asset the document references
- [ ] `e2e/harmony/ui-start.e2e.ts:80` scope UI, on a bare scope › should serve a document for a deep client-side route
- [ ] `e2e/harmony/ui-start.e2e.ts:131` scope UI, on a bare scope › should render the scope name into the markup, not just the document title
- [ ] `e2e/harmony/ui-start.e2e.ts:162` workspace UI › should start without writing errors to stderr
- [ ] `e2e/harmony/ui-start.e2e.ts:166` workspace UI › should serve a document with a react root
- [ ] `e2e/harmony/ui-start.e2e.ts:170` workspace UI › should serve its own entry, not another root's
- [ ] `e2e/harmony/ui-start.e2e.ts:181` workspace UI › should serve every asset the document references
- [ ] `e2e/harmony/ui-start.e2e.ts:193` workspace UI › should serve a document for a deep client-side route
- [ ] `e2e/harmony/ui-start.e2e.ts:199` workspace UI › should answer graphql queries

### `e2e/harmony/uninstall-cmd.e2e.ts`

- [ ] `e2e/harmony/uninstall-cmd.e2e.ts:23` uninstall command › root policies removed › should remove packages from node_modules that were uninstalled
- [ ] `e2e/harmony/uninstall-cmd.e2e.ts:27` uninstall command › root policies removed › should not remove packages from node_modules that were not uninstalled

### `e2e/harmony/untag-harmony.e2e.ts`

- [ ] `e2e/harmony/untag-harmony.e2e.ts:29` untag components on Harmony › when an old version is missing from the scope › should untag successfully with no errors
- [ ] `e2e/harmony/untag-harmony.e2e.ts:42` untag components on Harmony › untagging multiple versions › should show the component as new only, not as staged nor snapped
- [ ] `e2e/harmony/untag-harmony.e2e.ts:57` untag components on Harmony › untagging multiple versions when the new head is exported › bit status should be clean
- [ ] `e2e/harmony/untag-harmony.e2e.ts:60` untag components on Harmony › untagging multiple versions when the new head is exported › bitmap should show a version, not a hash

### `e2e/harmony/update-cmd.e2e.ts`

- [ ] `e2e/harmony/update-cmd.e2e.ts:44` update command › updates policies to latest versions › policies added by the user › should update the version range
- [ ] `e2e/harmony/update-cmd.e2e.ts:49` update command › updates policies to latest versions › policies added by the user › should update the root dependency version in node_modules
- [ ] `e2e/harmony/update-cmd.e2e.ts:52` update command › updates policies to latest versions › policies added by the user › should update the version range in the variant
- [ ] `e2e/harmony/update-cmd.e2e.ts:59` update command › updates policies to latest versions › policies added by the user › should update the variant dependency in node_modules
- [ ] `e2e/harmony/update-cmd.e2e.ts:62` update command › updates policies to latest versions › policies added by the user › should update the version range in component.json
- [ ] `e2e/harmony/update-cmd.e2e.ts:67` update command › updates policies to latest versions › policies added by the user › should update the component dependency in node_modules
- [ ] `e2e/harmony/update-cmd.e2e.ts:98` update command › updates policies to latest versions › select by patterns › should update the version range of the selected package
- [ ] `e2e/harmony/update-cmd.e2e.ts:103` update command › updates policies to latest versions › select by patterns › should not update the version ranges of the packages that were not selected
- [ ] `e2e/harmony/update-cmd.e2e.ts:109` update command › updates policies to latest versions › select by patterns › should preserve a comment attached to a dependency inside the policy
- [ ] `e2e/harmony/update-cmd.e2e.ts:120` update command › updates policies to latest versions › policies added by deps set › should update the version range
- [ ] `e2e/harmony/update-cmd.e2e.ts:134` update command › updates policies to compatible versions › policies added by deps set › should update the version range
- [ ] `e2e/harmony/update-cmd.e2e.ts:147` update command › updates policies to compatible versions › policies added by deps set. savePrefix is present › should update the version range
- [ ] `e2e/harmony/update-cmd.e2e.ts:212` update command › with save prefix specified › should add an updated version of the dependency from the model to the workspace policies
- [ ] `e2e/harmony/update-cmd.e2e.ts:217` update command › with save prefix specified › should add an updated version of the dependency from the model to the bitmap
- [ ] `e2e/harmony/update-cmd.e2e.ts:223` update command › with save prefix specified › should not update extensions from the model
- [ ] `e2e/harmony/update-cmd.e2e.ts:230` update command › with save prefix specified › should not update peer dependencies from the model
- [ ] `e2e/harmony/update-cmd.e2e.ts:247` update command › with save prefix not specified › should add an updated version of the dependency from the model to the bitmap
- [ ] `e2e/harmony/update-cmd.e2e.ts:253` update command › with save prefix not specified › should not update extensions from the model
- [ ] `e2e/harmony/update-cmd.e2e.ts:260` update command › with save prefix not specified › should not update peer dependencies from the model
- [ ] `e2e/harmony/update-cmd.e2e.ts:297` update command › should update dependency
- [ ] `e2e/harmony/update-cmd.e2e.ts:348` update command › should not update component that is available locally in the workspace

### `e2e/harmony/updates-from-main-and-lane.e2e.ts`

- [ ] `e2e/harmony/updates-from-main-and-lane.e2e.ts:34` updates from main and lane › updates are available from both main and lane › by default should only show updates from the current lane
- [ ] `e2e/harmony/updates-from-main-and-lane.e2e.ts:41` updates from main and lane › updates are available from both main and lane › with --lanes flag, should show updates from main
- [ ] `e2e/harmony/updates-from-main-and-lane.e2e.ts:48` updates from main and lane › updates are available from both main and lane › should show only one snap pending for comp2
- [ ] `e2e/harmony/updates-from-main-and-lane.e2e.ts:58` updates from main and lane › updates are available from both main and lane › bit checkout head › should update only components from the current lane
- [ ] `e2e/harmony/updates-from-main-and-lane.e2e.ts:71` updates from main and lane › updates are available from both main and lane › bit lane merge main › should update not only components belong to the main but also components that are available on the workspace and have updates from main

### `e2e/harmony/use.e2e.ts`

- [ ] `e2e/harmony/use.e2e.ts:18` bit use command › when the aspect is new › should not throw an error

### `e2e/harmony/validate.e2e.ts`

- [ ] `e2e/harmony/validate.e2e.ts:23` validate command › validating components without errors › should pass all validation checks
- [ ] `e2e/harmony/validate.e2e.ts:30` validate command › validating components without errors › with the deprecated --continue-on-error flag, should show a deprecation warning and still run successfully
- [ ] `e2e/harmony/validate.e2e.ts:43` validate command › validating components with type errors › should continue to run all checks by default
- [ ] `e2e/harmony/validate.e2e.ts:50` validate command › validating components with type errors › with --fail-fast, should stop at the first failure and not run subsequent checks
- [ ] `e2e/harmony/validate.e2e.ts:66` validate command › validating components with lint errors › should continue to run all checks by default and show the lint error details
- [ ] `e2e/harmony/validate.e2e.ts:74` validate command › validating components with lint errors › with --fail-fast, should stop at linting and not run testing
- [ ] `e2e/harmony/validate.e2e.ts:82` validate command › validating components with lint errors › with --skip-tasks flag › should pass when skipping the lint task
- [ ] `e2e/harmony/validate.e2e.ts:87` validate command › validating components with lint errors › with --skip-tasks flag › should support comma-separated skip-tasks
- [ ] `e2e/harmony/validate.e2e.ts:93` validate command › validating components with lint errors › with --skip-tasks flag › should show warning when all tasks are skipped
- [ ] `e2e/harmony/validate.e2e.ts:97` validate command › validating components with lint errors › with --skip-tasks flag › should error on invalid skip-tasks value
- [ ] `e2e/harmony/validate.e2e.ts:110` validate command › validating with --unmodified flag › should validate no components by default when all components are unmodified
- [ ] `e2e/harmony/validate.e2e.ts:114` validate command › validating with --unmodified flag › should validate all components with --unmodified
- [ ] `e2e/harmony/validate.e2e.ts:119` validate command › validating with --unmodified flag › should still support the deprecated --all flag and show a deprecation warning
- [ ] `e2e/harmony/validate.e2e.ts:132` validate command › validating with component pattern › should validate only matching components
- [ ] `e2e/harmony/validate.e2e.ts:143` validate command › validating with no components › should show no components message

### `e2e/harmony/workspace-config.e2e.ts`

- [ ] `e2e/harmony/workspace-config.e2e.ts:18` workspace config (workspace.jsonc) › adding a non-component key › any command should throw a descriptive error
- [ ] `e2e/harmony/workspace-config.e2e.ts:30` workspace config (workspace.jsonc) › adding a non-existing component to a variant › any command should throw a ComponentNotFound error with specific suggestions for the workspace.jsonc file
- [ ] `e2e/harmony/workspace-config.e2e.ts:57` workspace config (workspace.jsonc) › comment preservation in workspace.jsonc › when changing defaultScope using workspace config API › should preserve comments above the workspace aspect
- [ ] `e2e/harmony/workspace-config.e2e.ts:60` workspace config (workspace.jsonc) › comment preservation in workspace.jsonc › when changing defaultScope using workspace config API › should preserve comments inside the workspace aspect object
- [ ] `e2e/harmony/workspace-config.e2e.ts:64` workspace config (workspace.jsonc) › comment preservation in workspace.jsonc › when changing defaultScope using workspace config API › should update the defaultScope value
- [ ] `e2e/harmony/workspace-config.e2e.ts:67` workspace config (workspace.jsonc) › comment preservation in workspace.jsonc › when changing defaultScope using workspace config API › should not lose any other properties

### `e2e/performance/filesystem-read.e2e.ts`

- [ ] `e2e/performance/filesystem-read.e2e.ts:71` Filesystem read count › basic commands › bit --help › should not exceed a reasonable file-count number
- [ ] `e2e/performance/filesystem-read.e2e.ts:86` Filesystem read count › basic commands › bit --help › should take reasonable time to run bit --help
- [ ] `e2e/performance/filesystem-read.e2e.ts:102` Filesystem read count › basic commands › bit status › should not exceed a reasonable logical-module count
- [ ] `e2e/performance/filesystem-read.e2e.ts:142` Filesystem read count › basic commands › bit status › should take less than 2 seconds

### `e2e/typescript/typescript.e2e.ts`

- [ ] `e2e/typescript/typescript.e2e.ts:44` typescript › react style => .tsx extension › should be able to parse .tsx syntax successfully and recognize the dependencies
- [ ] `e2e/typescript/typescript.e2e.ts:71` typescript › auto recognizing @types packages › should find the @types in the package.json file and automatically add it to the dependencies
- [ ] `e2e/typescript/typescript.e2e.ts:88` typescript › auto recognizing @types packages › when the types package set to be ignored in the overrides › should not show the @types package anymore

<!-- e2e-port-plan:end -->

- Native stash checkout edge qualification: `native/cli/tests/e2e/harmony/stash/checkout_edges.rs::embedded_scope_restores_new_components_without_creating_model_heads` and `existing_new_identity_is_skipped_without_replacing_its_root_or_sources` compare exact released CLI output, bitmap/history, restored Sources and embedded-scope index preservation.
