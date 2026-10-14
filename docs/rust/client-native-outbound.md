# Native client export

With `BIT_RUST_CLIENT_VCS=on`, ordinary `bit export` uses the retained Rust
workspace engine when every selected component is already scoped, staged on
main, and its original scope has a configured `file://` or `http(s)://` remote.
The supported CLI forms are staged default selection, explicit IDs, unique
slash-free short IDs, and `--origin-directly`. Multiple original scopes are
transferred in one operation. Unsupported flags, unscoped components, lanes,
unconfigured or hub-resolved remotes, and histories that require canonical
rewriting continue through the existing command. File remotes configured with
`groupName` also use the canonical command so their pending files retain its
ownership and atomic-write policy.

Rust freezes and validates the local object closure, groups objects by remote,
pushes compressed bytes directly, invokes remote `ExportValidate`, cleans
pending directories after push or validation failure, and retries
`ExportPersist` at most three times per remote. A persist failure leaves
unpersisted pending objects for the existing `export --resume` command. After
all remotes acknowledge, Rust publishes the local models, remote refs, bitmap,
staged state, and history as one aggregate plan. Node renders the public CLI
report and error; it does not carry object bodies or decide remote action
ordering. HTTP actions use the server's `/api/scope/action` endpoint. File
remote actions invoke the installed canonical scope API in a separate Node
process. A registered in-process `ExportPersist.onPutHook` makes file export
fall back before any remote side effect, preserving that hook's lifecycle.

The differential fixture is
`scripts/rust-object-import/cold-export-qualification.cjs`. It compares public
output, exits, workspace and remote state, pending bytes, action ordering,
and native request ownership for file and HTTP remotes in Node, native,
missing-helper, and crashed-helper modes. It covers ordinary and multi-scope
success, short IDs, validation and persist failures, partial remote persistence,
resume, and lane fallback. `cold-export-benchmark.cjs` accepts only a complete,
marker-verified qualification report for the exact helper, addon, and private
CLI binaries being timed.
