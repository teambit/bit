# 25. Cleanup before merging into master

[← back to bundle-plan index](../bundle-plan.md)

A running checklist of hygiene/scaffolding items to resolve before `bit-bundle3` merges into
`master` — distinct from [14-known-gaps.md](14-known-gaps.md), which tracks functional gaps in the
bundle itself. Append to this list as items are found; don't try to front-load it. Each item should
be something actually verified on the branch, not a guess — see `CLAUDE.local.md`.

1. **`e2e_test` is commented out of `build_and_test`.** `.circleci/config.yml`, right before
   `setup_bundle_simulation`: `# temporarily disabled to focus CI cycles on the esbuild-bundle jobs
below - it's green, not what's being iterated on right now. re-enable by uncommenting (upstream
also skips it on master pushes now, hence the filter).` It still runs nightly against master (see
   the `nightly` workflow's comment "replaces the former per-master-push `e2e_test` run in
   `build_and_test`"), so master isn't uncovered, but every branch/PR push has lost this signal for
   non-bundle-related changes while this branch is active. Decide before merge: re-enable it in
   `build_and_test` (accepting the extra CI time), or confirm the nightly-on-master + the
   esbuild-bundle e2e jobs are an intentional, permanent replacement upstream too.

2. **Decide the fate of `bundle_deploy` / `run_bundle_deploy`.** As of 2026-08-30
   (see [24-installing-via-bvm.md](24-installing-via-bvm.md)), there are now two ways to get a bvm
   pre-release build: the manual `bundle_deploy` workflow (arbitrary `bundle_version` override, any
   `bit-bundle*` branch, triggered by hand) and the automatic `bundle_push_build` /
   `bundle_publish_to_gcloud` pair now wired into `build_and_test` on every `bit-bundle*` push. Once
   this branch is the only `bit-bundle*` branch in flight, confirm whether the manual workflow is
   still worth keeping (e.g. for pinning an arbitrary version rather than "whatever's on the branch
   right now") or whether it should be removed in favor of the automatic one.
